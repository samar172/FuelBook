// Daily price revision & stock revaluation.
//
// Oil companies revise pump rates daily (typically 6 am). The litres already in
// the tanks are then worth more or less than they cost — a real revaluation gain
// or loss the dealer tracks, recorded here as a PriceRevision alongside the new
// FuelRate row.
//
// Money is BigInt PAISE, volumes BigInt MILLILITRES, rates PAISE PER LITRE; the
// express BigInt serializer turns them into JSON strings. BigInt division
// TRUNCATES, so every derived amount divides by 1000n LAST (see services/pricing).
import { Router } from 'express';
import { prisma } from '../lib/db';
import { requireAuth, requirePermission } from '../middleware/auth';
import { AppError } from '../middleware/error';
import { createPriceRevisionSchema, pricingFuelTypeEnum } from '../schemas/pricing';
import {
  FUEL_TYPES,
  FuelType,
  avgCostPaisePerLitre,
  endOfDay,
  latestRateByFuel,
  loadRateHistory,
  loadStockByFuel,
  parsePricingRange,
  rateAsOf,
  soldMlOf,
  stockGainLoss,
  utcDateKey,
  valueOfMlAtRate,
} from '../services/pricing';

const router = Router();
router.use(requireAuth);

const requirePump = (req: any) => {
  if (!req.user.pumpId) throw new AppError(400, 'No pump assigned to user');
  return req.user.pumpId as string;
};

// ?fuelType= is optional; anything present must be a real fuel type.
const optionalFuelType = (req: any): FuelType | undefined => {
  const raw = String(req.query.fuelType || '').trim();
  if (!raw) return undefined;
  const parsed = pricingFuelTypeEnum.safeParse(raw);
  if (!parsed.success) throw new AppError(400, `Unknown fuel type '${raw}'`);
  return parsed.data as FuelType;
};

const rangeOf = (req: any) => {
  const { from, to } = parsePricingRange(
    String(req.query.from || ''),
    String(req.query.to || ''),
  );
  if (from > to) throw new AppError(400, 'from must be before to');
  return { from, to, toEnd: endOfDay(to) };
};

// ===================== 1. CURRENT RATES, COST AND MARGIN =====================

// The headline numbers a dealer looks at: what we sell at, what those litres
// cost us, and the margin per litre between the two.
router.get('/rates', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const [rates, stockByFuel] = await Promise.all([
      loadRateHistory(pumpId),
      loadStockByFuel(pumpId),
    ]);
    const current = latestRateByFuel(rates);

    const fuels = FUEL_TYPES.map((fuelType) => {
      const rate = current[fuelType] || null;
      const stock = stockByFuel[fuelType];
      const avgCost = avgCostPaisePerLitre(stock.valuePaise, stock.quantityMl);
      // Margin only means something when we know both sides of it.
      const marginPaisePerLitre =
        rate && avgCost !== null ? rate.ratePaise - avgCost : null;
      return {
        fuelType,
        currentRatePaise: rate ? rate.ratePaise : null,
        effectiveFrom: rate ? rate.effectiveFrom : null,
        rateId: rate ? rate.id : null,
        stockMl: stock.quantityMl,
        stockValuePaise: stock.valuePaise,
        avgCostPaisePerLitre: avgCost,
        marginPaisePerLitre,
        // Value of the stock on hand if sold at today's rate.
        stockAtRatePaise: rate ? valueOfMlAtRate(stock.quantityMl, rate.ratePaise) : null,
        tankCount: stock.tankCount,
        // Litres counted from the last shift's closing stock because the tank has
        // no running cost basis yet: they carry no value, so they dilute nothing
        // but they do make avgCost less complete.
        estimatedStockTankCount: stock.estimatedTankIds.length,
        costBasisComplete: stock.estimatedTankIds.length === 0,
      };
    });

    res.json({
      fuels,
      // Newest-first rate history across all fuels, for the history panel.
      history: rates.slice(0, 50),
      asOf: new Date(),
    });
  } catch (e) {
    next(e);
  }
});

// ===================== 2. RECORD A REVISION =====================

router.post('/revisions', requirePermission('canEditFuelRates'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const body = createPriceRevisionSchema.parse(req.body);
    const fuelType = body.fuelType as FuelType;
    const newRatePaise = body.newRatePaise;

    if (newRatePaise < 0n) throw new AppError(400, 'A fuel rate cannot be negative');
    if (newRatePaise === 0n) throw new AppError(400, 'A fuel rate must be greater than zero');

    const effectiveAt = body.effectiveAt ? new Date(body.effectiveAt) : new Date();
    if (Number.isNaN(effectiveAt.getTime())) throw new AppError(400, 'Invalid effectiveAt');

    // Old rate = the rate in force at the moment the revision takes effect.
    const rates = await loadRateHistory(pumpId, fuelType);
    const previous = rateAsOf(rates, fuelType, effectiveAt);
    if (!previous) {
      throw new AppError(
        400,
        'No existing rate for this fuel, so there is nothing to revise. Set the opening rate under Fuel Rates first.',
      );
    }
    const oldRatePaise = previous.ratePaise;
    if (oldRatePaise === newRatePaise) {
      throw new AppError(
        400,
        'The new rate is the same as the current rate — nothing to revise.',
      );
    }

    // Stock on hand for this fuel at this moment.
    const stockByFuel = await loadStockByFuel(pumpId);
    const stock = stockByFuel[fuelType];
    const stockAtRevisionMl = stock.quantityMl;

    // stockGainLoss = stockMl * (newRate - oldRate) / 1000  — one truncating
    // division, applied last. Negative when the rate is cut.
    const stockGainLossPaise = stockGainLoss(stockAtRevisionMl, oldRatePaise, newRatePaise);

    // One transaction: the new price takes effect and the revaluation is recorded
    // together, or neither happens.
    const result = await prisma.$transaction(async (tx) => {
      const rate = await tx.fuelRate.create({
        data: {
          pumpId,
          fuelType,
          ratePaise: newRatePaise,
          effectiveFrom: effectiveAt,
          createdBy: req.user!.userId,
        },
      });
      const revision = await tx.priceRevision.create({
        data: {
          pumpId,
          fuelType,
          oldRatePaise,
          newRatePaise,
          effectiveAt,
          stockAtRevisionMl,
          stockGainLossPaise,
          // Accounting is wired centrally later.
          journalEntryId: null,
          createdById: req.user!.userId,
        },
      });
      return { rate, revision };
    });

    res.status(201).json({
      revision: result.revision,
      fuelRate: result.rate,
      deltaPaisePerLitre: newRatePaise - oldRatePaise,
      stockMl: stockAtRevisionMl,
      stockGainLossPaise,
      // A revaluation of litres in the tank, not cash received.
      kind: stockGainLossPaise >= 0n ? 'REVALUATION_GAIN' : 'REVALUATION_LOSS',
      // Transparency about where the stock figure came from.
      stockSource: stock.estimatedTankIds.length === 0 ? 'INVENTORY_STATE' : 'MIXED',
      estimatedFromClosingStockTankIds: stock.estimatedTankIds,
      note:
        stock.estimatedTankIds.length > 0
          ? `${stock.estimatedTankIds.length} tank(s) had no running inventory state; their quantity was taken from the latest shift closing stock.`
          : undefined,
    });
  } catch (e) {
    next(e);
  }
});

// ===================== 3. REVISION HISTORY =====================

router.get('/revisions', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const { from, to, toEnd } = rangeOf(req);
    const fuelType = optionalFuelType(req);

    const revisions = await prisma.priceRevision.findMany({
      where: {
        pumpId,
        effectiveAt: { gte: from, lte: toEnd },
        ...(fuelType ? { fuelType } : {}),
      },
      orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
    });

    let netGainLossPaise = 0n;
    let gainPaise = 0n;
    let lossPaise = 0n;
    for (const r of revisions) {
      netGainLossPaise += r.stockGainLossPaise;
      if (r.stockGainLossPaise >= 0n) gainPaise += r.stockGainLossPaise;
      else lossPaise += r.stockGainLossPaise;
    }

    res.json({
      range: { from: utcDateKey(from), to: utcDateKey(to) },
      fuelType: fuelType || null,
      revisions: revisions.map((r) => ({
        ...r,
        deltaPaisePerLitre: r.newRatePaise - r.oldRatePaise,
      })),
      totals: {
        count: revisions.length,
        netGainLossPaise,
        gainPaise,
        lossPaise,
      },
    });
  } catch (e) {
    next(e);
  }
});

// ===================== 4. REVALUATION SUMMARY =====================

// How much of the period's profit came from price movement rather than volume.
router.get('/revaluation-summary', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const { from, to, toEnd } = rangeOf(req);

    const revisions = await prisma.priceRevision.findMany({
      where: { pumpId, effectiveAt: { gte: from, lte: toEnd } },
      orderBy: [{ effectiveAt: 'asc' }, { createdAt: 'asc' }],
    });

    // Opening rate = the rate in force when the period began, which may predate
    // the first revision inside it.
    const allRates = await loadRateHistory(pumpId);

    const fuels = FUEL_TYPES.map((fuelType) => {
      const rows = revisions.filter((r) => r.fuelType === fuelType);
      let netGainLossPaise = 0n;
      let gainPaise = 0n;
      let lossPaise = 0n;
      for (const r of rows) {
        netGainLossPaise += r.stockGainLossPaise;
        if (r.stockGainLossPaise >= 0n) gainPaise += r.stockGainLossPaise;
        else lossPaise += r.stockGainLossPaise;
      }

      const openingRate = rateAsOf(allRates, fuelType, from);
      const openingRatePaise = openingRate
        ? openingRate.ratePaise
        : rows.length > 0
          ? rows[0].oldRatePaise
          : null;
      const closingRate = rateAsOf(allRates, fuelType, toEnd);
      const closingRatePaise = closingRate
        ? closingRate.ratePaise
        : rows.length > 0
          ? rows[rows.length - 1].newRatePaise
          : null;

      // High/low across every rate the fuel stood at during the period: the
      // opening level plus each revised-to level.
      const levels: bigint[] = [];
      if (openingRatePaise !== null) levels.push(openingRatePaise);
      for (const r of rows) levels.push(r.newRatePaise);
      let highRatePaise: bigint | null = null;
      let lowRatePaise: bigint | null = null;
      for (const v of levels) {
        if (highRatePaise === null || v > highRatePaise) highRatePaise = v;
        if (lowRatePaise === null || v < lowRatePaise) lowRatePaise = v;
      }

      return {
        fuelType,
        revisionCount: rows.length,
        increases: rows.filter((r) => r.newRatePaise > r.oldRatePaise).length,
        decreases: rows.filter((r) => r.newRatePaise < r.oldRatePaise).length,
        netGainLossPaise,
        gainPaise,
        lossPaise,
        openingRatePaise,
        closingRatePaise,
        netRateChangePaise:
          openingRatePaise !== null && closingRatePaise !== null
            ? closingRatePaise - openingRatePaise
            : null,
        highRatePaise,
        lowRatePaise,
      };
    });

    let netGainLossPaise = 0n;
    for (const f of fuels) netGainLossPaise += f.netGainLossPaise;

    res.json({
      range: { from: utcDateKey(from), to: utcDateKey(to) },
      fuels,
      totals: { revisionCount: revisions.length, netGainLossPaise },
    });
  } catch (e) {
    next(e);
  }
});

// ===================== 5. MARGIN TREND =====================

// Per day per fuel: selling rate, average cost, margin per litre and litres sold.
// Shaped for charting.
router.get('/margin-trend', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const { from, to } = rangeOf(req);

    const [allRates, stockByFuel, readings] = await Promise.all([
      loadRateHistory(pumpId),
      loadStockByFuel(pumpId),
      prisma.nozzleReading.findMany({
        where: { shiftReport: { pumpId, reportDate: { gte: from, lte: to } } },
        select: {
          openingReadingMl: true,
          closingReadingMl: true,
          testingMl: true,
          nozzle: { select: { fuelType: true } },
          shiftReport: { select: { reportDate: true } },
        },
      }),
    ]);

    // Litres sold per day per fuel, keyed by the NOZZLE's fuel type.
    const soldByDayFuel = new Map<string, bigint>();
    for (const r of readings) {
      const key = `${utcDateKey(r.shiftReport.reportDate)}|${r.nozzle.fuelType}`;
      soldByDayFuel.set(key, (soldByDayFuel.get(key) || 0n) + soldMlOf(r));
    }

    // TankInventoryState holds only the CURRENT cost basis — the schema keeps no
    // history of it — so the same weighted-average cost is applied to every day
    // in the range. The response flags this so a chart can label it honestly.
    const costByFuel: Record<string, bigint | null> = {};
    for (const f of FUEL_TYPES) {
      costByFuel[f] = avgCostPaisePerLitre(stockByFuel[f].valuePaise, stockByFuel[f].quantityMl);
    }

    const days: {
      date: string;
      fuels: {
        fuelType: FuelType;
        ratePaise: bigint | null;
        avgCostPaisePerLitre: bigint | null;
        marginPaisePerLitre: bigint | null;
        soldMl: bigint;
      }[];
    }[] = [];

    for (const d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      const date = utcDateKey(d);
      // The rate in force at the end of that day is the rate the day sold at.
      const at = endOfDay(d);
      days.push({
        date,
        fuels: FUEL_TYPES.map((fuelType) => {
          const rate = rateAsOf(allRates, fuelType, at);
          const ratePaise = rate ? rate.ratePaise : null;
          const cost = costByFuel[fuelType];
          return {
            fuelType,
            ratePaise,
            avgCostPaisePerLitre: cost,
            marginPaisePerLitre: ratePaise !== null && cost !== null ? ratePaise - cost : null,
            soldMl: soldByDayFuel.get(`${date}|${fuelType}`) || 0n,
          };
        }),
      });
    }

    res.json({
      range: { from: utcDateKey(from), to: utcDateKey(to) },
      // 'CURRENT_SNAPSHOT': cost is today's weighted average, not a historical one.
      costBasis: 'CURRENT_SNAPSHOT',
      days,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
