// NON-FUEL RETAIL: lubricants, AdBlue, accessories and services.
//
// Fuel margins in India are thin and administered; lubes are where a pump makes
// money. Unlike fuel these lines ARE under GST, so every sale carries a tax
// split (see services/products.ts for the formulas and their rounding).
//
// Two invariants hold everywhere in this file:
//   1. Every query is scoped to the caller's pump, and every product / movement /
//      customer id is verified to belong to that pump before it is used.
//   2. Stock is never updated outside the transaction that writes the movement,
//      and ProductStockState is maintained on a weighted-average cost basis.
//
// This route deliberately does NOT touch the ledger services: accounting for
// non-fuel retail is posted in a central pass elsewhere.

import { Router } from 'express';
import { Prisma, ProductCategory, ProductMovementKind } from '@prisma/client';
import { prisma } from '../lib/db';
import { requireAuth, requirePermission } from '../middleware/auth';
import { AppError } from '../middleware/error';
import {
  createProductSchema,
  updateProductSchema,
  createMovementSchema,
} from '../schemas/products';
import {
  applyStockDelta,
  averageCostOf,
  directionOf,
  marginPct,
  replayCosts,
  splitGst,
  stripDirectionTag,
  unitAverageCost,
  type MovementKind,
  type ReplayMovement,
} from '../services/products';

const router = Router();
router.use(requireAuth);

const requirePump = (req: any) => {
  if (!req.user.pumpId) throw new AppError(400, 'No pump assigned to user');
  return req.user.pumpId as string;
};

// Every product lookup goes through here: a caller must never be able to read,
// edit or move stock for a product belonging to another pump by guessing an id.
async function findOwnProduct(req: any, productId: string) {
  const pumpId = requirePump(req);
  const product = await prisma.product.findFirst({
    where: { id: productId, pumpId },
    include: { state: true },
  });
  if (!product) throw new AppError(404, 'Product not found');
  return product;
}

const CATEGORIES = ['LUBRICANT', 'ADBLUE', 'ACCESSORY', 'SERVICE', 'OTHER'] as const;
const KINDS = ['PURCHASE', 'SALE', 'ADJUSTMENT', 'RETURN'] as const;

const str = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? undefined : s;
};

function oneOf<T extends string>(v: unknown, allowed: readonly T[], label: string): T | undefined {
  const s = str(v);
  if (!s) return undefined;
  if (!(allowed as readonly string[]).includes(s)) {
    throw new AppError(400, `Invalid ${label}: ${s}`);
  }
  return s as T;
}

// Movements are timestamped, so the window has to cover the whole closing day.
function parseRange(req: any): { from: Date; to: Date } {
  const fromStr = str(req.query.from);
  const toStr = str(req.query.to);
  const to = toStr ? new Date(toStr + 'T00:00:00Z') : new Date();
  if (Number.isNaN(to.getTime())) throw new AppError(400, 'Invalid "to" date');
  to.setUTCHours(23, 59, 59, 999);
  let from: Date;
  if (fromStr) {
    from = new Date(fromStr + 'T00:00:00Z');
    if (Number.isNaN(from.getTime())) throw new AppError(400, 'Invalid "from" date');
  } else {
    from = new Date(to);
    from.setUTCDate(from.getUTCDate() - 29); // default 30-day window
  }
  from.setUTCHours(0, 0, 0, 0);
  if (from > to) throw new AppError(400, 'from must be before to');
  return { from, to };
}

// A service line has nothing to stock: selling one does not deplete anything, so
// it is exempt from the stock checks and carries no cost of goods.
const isStockless = (p: { unit: string; category: ProductCategory }) =>
  p.unit === 'SERVICE' || p.category === ProductCategory.SERVICE;

type StateRow = { quantity: number; valuePaise: bigint } | null | undefined;

const shapeProduct = (p: any) => {
  const state: StateRow = p.state;
  const quantity = state?.quantity ?? 0;
  const valuePaise = state?.valuePaise ?? 0n;
  const { state: _state, ...rest } = p;
  return {
    ...rest,
    stockQuantity: quantity,
    stockValuePaise: valuePaise,
    avgCostPaise: unitAverageCost(quantity, valuePaise),
    belowReorder: p.reorderLevelQty > 0 && quantity <= p.reorderLevelQty,
    stockUpdatedAt: state ? (p.state.updatedAt ?? null) : null,
  };
};

const shapeMovement = (m: any) => ({
  ...m,
  reference: stripDirectionTag(m.reference),
  direction: directionOf(m.kind as MovementKind, m.direction),
  // Sales are stored gross (what the customer pays); the taxable base is the
  // remainder after GST. See splitGst().
  taxablePaise: m.totalPaise - m.gstPaise,
  grossPaise: m.totalPaise,
});

// ===================== CATALOG =====================

router.get('/', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const category = oneOf(req.query.category, CATEGORIES, 'category');
    const activeParam = str(req.query.active);
    const lowStockOnly = str(req.query.lowStockOnly) === 'true';
    const search = str(req.query.search);

    const products = await prisma.product.findMany({
      where: {
        pumpId,
        ...(category ? { category: category as ProductCategory } : {}),
        ...(activeParam === 'true' ? { isActive: true } : {}),
        ...(activeParam === 'false' ? { isActive: false } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
                { sku: { contains: search, mode: Prisma.QueryMode.insensitive } },
                { hsnCode: { contains: search, mode: Prisma.QueryMode.insensitive } },
              ],
            }
          : {}),
      },
      include: { state: true },
      orderBy: [{ isActive: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    });

    const shaped = products.map(shapeProduct);
    res.json(lowStockOnly ? shaped.filter((p) => p.belowReorder) : shaped);
  } catch (e) {
    next(e);
  }
});

// ===================== REPORTS =====================
// Declared before "/:id" so a report path is never swallowed as a product id.

/**
 * Margin per product and per category: what an owner needs to know which lube to
 * push. Revenue is NET of GST (the tax is the government's, not margin) and COGS
 * is at the weighted-average cost that applied at the moment of each sale, which
 * is why the history is replayed rather than valued at today's average.
 * Customer RETURNs net off quantity, revenue and COGS alike.
 */
router.get('/reports/margin', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const { from, to } = parseRange(req);
    const category = oneOf(req.query.category, CATEGORIES, 'category');

    const products = await prisma.product.findMany({
      where: { pumpId, ...(category ? { category: category as ProductCategory } : {}) },
      include: {
        state: true,
        // The full history, because average cost at the time of a sale depends on
        // every purchase before it — including ones outside the report window.
        movements: { orderBy: { occurredAt: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });

    const perProduct = products.map((p) => {
      const { rows } = replayCosts(p.movements as unknown as ReplayMovement[]);
      let quantitySold = 0;
      let revenueNetPaise = 0n;
      let gstPaise = 0n;
      let grossPaise = 0n;
      let cogsPaise = 0n;

      for (const row of rows) {
        const m = row.movement;
        if (m.occurredAt < from || m.occurredAt > to) continue;
        const net = m.totalPaise - m.gstPaise;
        if (m.kind === 'SALE') {
          quantitySold += m.quantity;
          revenueNetPaise += net;
          gstPaise += m.gstPaise;
          grossPaise += m.totalPaise;
          cogsPaise += row.costPaise;
        } else if (m.kind === 'RETURN' && row.direction === 'IN') {
          // Goods back from a customer reverse a sale.
          quantitySold -= m.quantity;
          revenueNetPaise -= net;
          gstPaise -= m.gstPaise;
          grossPaise -= m.totalPaise;
          cogsPaise -= row.costPaise;
        }
      }

      const marginPaise = revenueNetPaise - cogsPaise;
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        unit: p.unit,
        gstRateBp: p.gstRateBp,
        quantitySold,
        revenueNetPaise,
        gstPaise,
        grossPaise,
        cogsPaise,
        marginPaise,
        marginPct: marginPct(revenueNetPaise, cogsPaise),
        stockQuantity: p.state?.quantity ?? 0,
        stockValuePaise: p.state?.valuePaise ?? 0n,
      };
    });

    // Sort by margin contribution: the biggest earner first.
    const rankedProducts = [...perProduct].sort((a, b) =>
      a.marginPaise === b.marginPaise ? 0 : a.marginPaise > b.marginPaise ? -1 : 1,
    );

    const byCategory = new Map<
      string,
      {
        category: string;
        quantitySold: number;
        revenueNetPaise: bigint;
        gstPaise: bigint;
        cogsPaise: bigint;
        marginPaise: bigint;
        productCount: number;
      }
    >();
    for (const p of perProduct) {
      const cur =
        byCategory.get(p.category) ??
        {
          category: p.category,
          quantitySold: 0,
          revenueNetPaise: 0n,
          gstPaise: 0n,
          cogsPaise: 0n,
          marginPaise: 0n,
          productCount: 0,
        };
      cur.quantitySold += p.quantitySold;
      cur.revenueNetPaise += p.revenueNetPaise;
      cur.gstPaise += p.gstPaise;
      cur.cogsPaise += p.cogsPaise;
      cur.marginPaise += p.marginPaise;
      cur.productCount += 1;
      byCategory.set(p.category, cur);
    }

    const categories = [...byCategory.values()]
      .map((c) => ({ ...c, marginPct: marginPct(c.revenueNetPaise, c.cogsPaise) }))
      .sort((a, b) => (a.marginPaise === b.marginPaise ? 0 : a.marginPaise > b.marginPaise ? -1 : 1));

    const totals = perProduct.reduce(
      (acc, p) => ({
        quantitySold: acc.quantitySold + p.quantitySold,
        revenueNetPaise: acc.revenueNetPaise + p.revenueNetPaise,
        gstPaise: acc.gstPaise + p.gstPaise,
        grossPaise: acc.grossPaise + p.grossPaise,
        cogsPaise: acc.cogsPaise + p.cogsPaise,
        marginPaise: acc.marginPaise + p.marginPaise,
      }),
      {
        quantitySold: 0,
        revenueNetPaise: 0n,
        gstPaise: 0n,
        grossPaise: 0n,
        cogsPaise: 0n,
        marginPaise: 0n,
      },
    );

    res.json({
      from,
      to,
      products: rankedProducts,
      categories,
      totals: { ...totals, marginPct: marginPct(totals.revenueNetPaise, totals.cogsPaise) },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/reports/stock', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const category = oneOf(req.query.category, CATEGORIES, 'category');
    const activeParam = str(req.query.active);

    const products = await prisma.product.findMany({
      where: {
        pumpId,
        ...(category ? { category: category as ProductCategory } : {}),
        ...(activeParam === 'false' ? { isActive: false } : {}),
        ...(activeParam === 'true' || activeParam === undefined ? { isActive: true } : {}),
      },
      include: { state: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    const rows = products.map((p) => {
      const quantity = p.state?.quantity ?? 0;
      const valuePaise = p.state?.valuePaise ?? 0n;
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        unit: p.unit,
        packSizeMl: p.packSizeMl,
        quantity,
        valuePaise,
        avgCostPaise: unitAverageCost(quantity, valuePaise),
        sellingPricePaise: p.sellingPricePaise,
        reorderLevelQty: p.reorderLevelQty,
        belowReorder: p.reorderLevelQty > 0 && quantity <= p.reorderLevelQty,
        isActive: p.isActive,
      };
    });

    const totalValuePaise = rows.reduce((acc, r) => acc + r.valuePaise, 0n);
    res.json({
      rows,
      totals: {
        productCount: rows.length,
        totalValuePaise,
        belowReorderCount: rows.filter((r) => r.belowReorder).length,
        outOfStockCount: rows.filter((r) => r.quantity <= 0).length,
      },
    });
  } catch (e) {
    next(e);
  }
});

/** Purchases vs sales vs adjustments vs returns, per day or per month. */
router.get(
  '/reports/movement-summary',
  requirePermission('canViewReports'),
  async (req, res, next) => {
    try {
      const pumpId = requirePump(req);
      const { from, to } = parseRange(req);
      const groupBy = oneOf(req.query.groupBy, ['day', 'month'] as const, 'groupBy') || 'day';

      const movements = await prisma.productMovement.findMany({
        where: { product: { pumpId }, occurredAt: { gte: from, lte: to } },
        orderBy: { occurredAt: 'asc' },
      });

      type Bucket = {
        period: string;
        purchaseQty: number;
        purchasePaise: bigint;
        saleQty: number;
        saleGrossPaise: bigint;
        saleNetPaise: bigint;
        saleGstPaise: bigint;
        adjustmentInQty: number;
        adjustmentOutQty: number;
        adjustmentPaise: bigint;
        returnInQty: number;
        returnOutQty: number;
        returnPaise: bigint;
      };
      const blank = (period: string): Bucket => ({
        period,
        purchaseQty: 0,
        purchasePaise: 0n,
        saleQty: 0,
        saleGrossPaise: 0n,
        saleNetPaise: 0n,
        saleGstPaise: 0n,
        adjustmentInQty: 0,
        adjustmentOutQty: 0,
        adjustmentPaise: 0n,
        returnInQty: 0,
        returnOutQty: 0,
        returnPaise: 0n,
      });

      const buckets = new Map<string, Bucket>();
      for (const m of movements) {
        const iso = m.occurredAt.toISOString();
        const period = groupBy === 'month' ? iso.slice(0, 7) : iso.slice(0, 10);
        const b = buckets.get(period) ?? blank(period);
        const net = m.totalPaise - m.gstPaise;
        const direction = directionOf(m.kind as MovementKind, m.direction);
        if (m.kind === 'PURCHASE') {
          b.purchaseQty += m.quantity;
          b.purchasePaise += net;
        } else if (m.kind === 'SALE') {
          b.saleQty += m.quantity;
          b.saleGrossPaise += m.totalPaise;
          b.saleNetPaise += net;
          b.saleGstPaise += m.gstPaise;
        } else if (m.kind === 'ADJUSTMENT') {
          if (direction === 'IN') b.adjustmentInQty += m.quantity;
          else b.adjustmentOutQty += m.quantity;
          b.adjustmentPaise += net;
        } else {
          if (direction === 'IN') b.returnInQty += m.quantity;
          else b.returnOutQty += m.quantity;
          b.returnPaise += net;
        }
        buckets.set(period, b);
      }

      const periods = [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period));
      const totals = periods.reduce((acc, p) => {
        acc.purchaseQty += p.purchaseQty;
        acc.purchasePaise += p.purchasePaise;
        acc.saleQty += p.saleQty;
        acc.saleGrossPaise += p.saleGrossPaise;
        acc.saleNetPaise += p.saleNetPaise;
        acc.saleGstPaise += p.saleGstPaise;
        acc.adjustmentInQty += p.adjustmentInQty;
        acc.adjustmentOutQty += p.adjustmentOutQty;
        acc.adjustmentPaise += p.adjustmentPaise;
        acc.returnInQty += p.returnInQty;
        acc.returnOutQty += p.returnOutQty;
        acc.returnPaise += p.returnPaise;
        return acc;
      }, blank('total'));

      res.json({ from, to, groupBy, periods, totals });
    } catch (e) {
      next(e);
    }
  },
);

/** Recent movements across the whole catalog, for the counter's history view. */
router.get('/movements', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const { from, to } = parseRange(req);
    const kind = oneOf(req.query.kind, KINDS, 'kind');
    const limitRaw = Number(str(req.query.limit) || '200');
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 500) : 200;

    const movements = await prisma.productMovement.findMany({
      where: {
        product: { pumpId },
        occurredAt: { gte: from, lte: to },
        ...(kind ? { kind: kind as ProductMovementKind } : {}),
      },
      include: { product: { select: { id: true, sku: true, name: true, unit: true } } },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });

    res.json(movements.map(shapeMovement));
  } catch (e) {
    next(e);
  }
});

// ===================== CATALOG (cont.) =====================

router.get('/:id', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const product = await findOwnProduct(req, req.params.id);
    const [movementCount, recent] = await Promise.all([
      prisma.productMovement.count({ where: { productId: product.id } }),
      prisma.productMovement.findMany({
        where: { productId: product.id },
        orderBy: { occurredAt: 'desc' },
        take: 20,
      }),
    ]);
    res.json({
      ...shapeProduct(product),
      movementCount,
      recentMovements: recent.map(shapeMovement),
    });
  } catch (e) {
    next(e);
  }
});

router.post('/', requirePermission('canManagePump'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const data = createProductSchema.parse(req.body);

    const duplicate = await prisma.product.findFirst({ where: { pumpId, sku: data.sku } });
    if (duplicate) {
      throw new AppError(409, `SKU ${data.sku} is already used by "${duplicate.name}"`);
    }

    const product = await prisma.product.create({
      data: {
        pumpId,
        sku: data.sku,
        name: data.name,
        category: data.category,
        unit: data.unit,
        packSizeMl: data.packSizeMl ?? null,
        purchasePricePaise: data.purchasePricePaise ?? 0n,
        sellingPricePaise: data.sellingPricePaise ?? 0n,
        gstRateBp: data.gstRateBp,
        hsnCode: data.hsnCode ?? null,
        reorderLevelQty: data.reorderLevelQty,
        isActive: data.isActive,
        // Start the cost basis at zero so stock always has a state row to update.
        state: { create: { quantity: 0, valuePaise: 0n } },
      },
      include: { state: true },
    });
    res.status(201).json(shapeProduct(product));
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', requirePermission('canManagePump'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const existing = await findOwnProduct(req, req.params.id);
    const data = updateProductSchema.parse(req.body);

    if (data.sku && data.sku !== existing.sku) {
      const duplicate = await prisma.product.findFirst({
        where: { pumpId, sku: data.sku, id: { not: existing.id } },
      });
      if (duplicate) {
        throw new AppError(409, `SKU ${data.sku} is already used by "${duplicate.name}"`);
      }
    }

    const product = await prisma.product.update({
      where: { id: existing.id },
      data,
      include: { state: true },
    });
    res.json(shapeProduct(product));
  } catch (e) {
    next(e);
  }
});

// Retire a product. Movements are the audit trail of stock and margin, so a
// product that has ever moved is deactivated rather than deleted; only a product
// that was never used is actually removed.
router.delete('/:id', requirePermission('canManagePump'), async (req, res, next) => {
  try {
    const existing = await findOwnProduct(req, req.params.id);
    const movementCount = await prisma.productMovement.count({
      where: { productId: existing.id },
    });

    if (movementCount === 0) {
      await prisma.product.delete({ where: { id: existing.id } });
      res.json({ deleted: true, productId: existing.id });
      return;
    }

    const product = await prisma.product.update({
      where: { id: existing.id },
      data: { isActive: false },
      include: { state: true },
    });
    res.json({
      deleted: false,
      deactivated: true,
      movementCount,
      product: shapeProduct(product),
    });
  } catch (e) {
    next(e);
  }
});

// ===================== MOVEMENTS =====================

router.get('/:id/movements', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const product = await findOwnProduct(req, req.params.id);
    const kind = oneOf(req.query.kind, KINDS, 'kind');
    const hasRange = Boolean(str(req.query.from) || str(req.query.to));
    const range = hasRange ? parseRange(req) : null;

    const movements = await prisma.productMovement.findMany({
      where: {
        productId: product.id,
        ...(range ? { occurredAt: { gte: range.from, lte: range.to } } : {}),
        ...(kind ? { kind: kind as ProductMovementKind } : {}),
      },
      orderBy: { occurredAt: 'desc' },
    });

    res.json(movements.map(shapeMovement));
  } catch (e) {
    next(e);
  }
});

/**
 * Record a movement. Counter staff (canEditExpenses) may do this; changing the
 * catalog itself needs canManagePump.
 *
 * Direction: `quantity` is always stored POSITIVE. PURCHASE is IN and SALE is
 * OUT by kind alone; ADJUSTMENT must state `direction`, and RETURN defaults to IN
 * (goods back from a customer) with `direction: 'OUT'` meaning a return to the
 * supplier. An OUT-direction ADJUSTMENT / RETURN is tagged in `reference` — see
 * services/products.ts, which owns that convention.
 *
 * Stock and the movement are written in ONE transaction, and the stock value
 * follows a weighted average: an IN adds the taxable amount it cost, an OUT
 * releases quantity x (value / quantity) at the average then current. Neither
 * quantity nor value is ever allowed below zero.
 */
router.post('/:id/movements', requirePermission('canEditExpenses'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const product = await findOwnProduct(req, req.params.id);
    const body = createMovementSchema.parse(req.body);

    if (!product.isActive) {
      throw new AppError(400, `"${product.name}" is inactive — reactivate it before moving stock`);
    }

    // Resolve the direction. ADJUSTMENT is ambiguous by nature, so it must be said.
    let direction: 'IN' | 'OUT';
    if (body.kind === 'PURCHASE') direction = 'IN';
    else if (body.kind === 'SALE') direction = 'OUT';
    else if (body.kind === 'ADJUSTMENT') {
      if (!body.direction) {
        throw new AppError(400, "An ADJUSTMENT needs direction: 'IN' (found) or 'OUT' (lost)");
      }
      direction = body.direction;
    } else {
      direction = body.direction ?? 'IN'; // RETURN from a customer by default
    }

    // A credit customer on a lube sale is INFORMATIONAL ONLY.
    //
    // We deliberately do NOT touch CreditCustomer.currentBalancePaise here. Fuel
    // credit owns that column (credit sales and outstanding receipts keep it in
    // step), and adding a lube sale to it from this route would double-count the
    // receivable and corrupt the ageing report. The link exists so the counter can
    // see who took the oil; collecting for it is a fuel-credit / cash matter.
    let customerId: string | null = null;
    if (body.customerId) {
      const customer = await prisma.creditCustomer.findFirst({
        where: { id: body.customerId, pumpId },
        select: { id: true },
      });
      if (!customer) throw new AppError(404, 'Credit customer not found');
      customerId = customer.id;
    }

    let shiftReportId: string | null = null;
    if (body.shiftReportId) {
      const shift = await prisma.shiftReport.findFirst({
        where: { id: body.shiftReportId, pumpId },
        select: { id: true },
      });
      if (!shift) throw new AppError(404, 'Shift report not found');
      shiftReportId = shift.id;
    }

    const stockless = isStockless(product);

    const movement = await prisma.$transaction(async (tx) => {
      // Read the state INSIDE the transaction so two counters recording at once
      // cannot both compute an average from the same stale numbers.
      const state =
        (await tx.productStockState.findUnique({ where: { productId: product.id } })) ??
        (await tx.productStockState.create({
          data: { productId: product.id, quantity: 0, valuePaise: 0n },
        }));

      const priceDefault =
        body.kind === 'SALE' ? product.sellingPricePaise : product.purchasePricePaise;
      const unitPricePaise = body.unitPricePaise ?? priceDefault;
      const lineAmount = BigInt(body.quantity) * unitPricePaise;

      // GST: only a supply is taxed. A sale is (a lube sale is taxable), and so is
      // a purchase (its GST is input tax credit, kept out of the cost of goods) and
      // a return, which reverses one. An internal stock ADJUSTMENT is not a supply
      // at all, so it carries no tax.
      const taxed = body.kind !== 'ADJUSTMENT';
      const split = taxed
        ? splitGst(lineAmount, product.gstRateBp, body.priceIsGstInclusive)
        : { taxablePaise: lineAmount, gstPaise: 0n, grossPaise: lineAmount };

      if (direction === 'OUT' && !stockless) {
        if (body.quantity > state.quantity) {
          throw new AppError(
            400,
            `Only ${state.quantity} ${product.unit.toLowerCase()} of "${product.name}" in stock — cannot ${body.kind === 'SALE' ? 'sell' : 'remove'} ${body.quantity}`,
          );
        }
      }

      // Value moved. Mirrors services/products.ts replayCosts() exactly, so the
      // margin report and the live stock state can never disagree.
      let valueMoved: bigint;
      if (direction === 'IN') {
        valueMoved =
          body.kind === 'RETURN' && state.quantity > 0
            ? averageCostOf(body.quantity, state.quantity, state.valuePaise)
            : split.taxablePaise > 0n
              ? split.taxablePaise
              : 0n;
      } else {
        valueMoved = stockless
          ? 0n
          : averageCostOf(body.quantity, state.quantity, state.valuePaise);
      }

      const next = stockless
        ? { quantity: state.quantity, valuePaise: state.valuePaise }
        : applyStockDelta(
            { quantity: state.quantity, valuePaise: state.valuePaise },
            direction,
            body.quantity,
            valueMoved,
          );

      const created = await tx.productMovement.create({
        data: {
          productId: product.id,
          shiftReportId,
          kind: body.kind as ProductMovementKind,
          quantity: body.quantity,
          unitPricePaise,
          // totalPaise is always the GROSS amount (taxable + GST); the taxable
          // base is totalPaise - gstPaise whichever way the price was quoted.
          totalPaise: split.grossPaise,
          gstPaise: split.gstPaise,
          customerId,
          direction,
          reference: stripDirectionTag(body.reference),
          ...(body.occurredAt ? { occurredAt: body.occurredAt } : {}),
          recordedById: (req as any).user.userId,
          notes: body.notes ?? null,
        },
      });

      if (!stockless) {
        await tx.productStockState.update({
          where: { productId: product.id },
          data: { quantity: next.quantity, valuePaise: next.valuePaise },
        });
      }

      return { created, next, valueMoved, split };
    });

    res.status(201).json({
      ...shapeMovement(movement.created),
      taxablePaise: movement.split.taxablePaise,
      gstPaise: movement.split.gstPaise,
      grossPaise: movement.split.grossPaise,
      priceIsGstInclusive: body.priceIsGstInclusive,
      costOfGoodsPaise: direction === 'OUT' ? movement.valueMoved : 0n,
      marginPaise:
        body.kind === 'SALE'
          ? movement.split.taxablePaise - movement.valueMoved
          : null,
      stock: {
        quantity: movement.next.quantity,
        valuePaise: movement.next.valuePaise,
        avgCostPaise: unitAverageCost(movement.next.quantity, movement.next.valuePaise),
      },
      stockless,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
