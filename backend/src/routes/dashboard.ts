// Dashboard + reports endpoints — owner's daily reconciliation view

import { Router } from 'express';
import { prisma } from '../lib/db';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/error';
import { FuelType } from '@prisma/client';

const router = Router();
router.use(requireAuth);

const requirePump = (req: any) => {
  if (!req.user.pumpId) throw new AppError(400, 'No pump assigned to user');
  return req.user.pumpId as string;
};

// Today's full money-flow view for the owner
router.get('/today', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const shifts = await prisma.shiftReport.findMany({
      where: { pumpId, reportDate: today },
      include: {
        nozzleReadings: true,
        stockEntries: { include: { tank: true } },
        paymentCollections: { include: { channel: true } },
        outstandingReceipts: true,
        creditSales: true,
        expenseEntries: true,
      },
    });

    // Aggregate the day across both shifts (DAY + NIGHT)
    let totalSalesPaise = 0n;
    let totalCreditIssuedPaise = 0n;
    let totalCashFromCreditSalesPaise = 0n;
    let totalOutstandingReceivedPaise = 0n;
    let totalCollectionsPaise = 0n;
    let totalExpensesPaise = 0n;
    let openingCashPaise = 0n;
    let closingCashPaise = 0n;
    const fuelSales: Record<FuelType, { qtyMl: bigint; amtPaise: bigint }> = {
      HSD: { qtyMl: 0n, amtPaise: 0n },
      MS: { qtyMl: 0n, amtPaise: 0n },
      MS_POWER: { qtyMl: 0n, amtPaise: 0n },
      CNG: { qtyMl: 0n, amtPaise: 0n },
    };
    const collectionsByChannel: Record<string, { name: string; amount: bigint }> = {};

    // Sort to get DAY first then NIGHT
    const sorted = shifts.sort((a, b) => (a.shiftType === 'DAY' ? -1 : 1));
    if (sorted.length > 0) {
      openingCashPaise = sorted[0].openingCashPaise;
      closingCashPaise = sorted[sorted.length - 1].closingCashPaise;
    }

    for (const s of sorted) {
      totalSalesPaise += s.totalSalesPaise;
      totalCreditIssuedPaise += s.totalCreditIssuedPaise;
      totalCashFromCreditSalesPaise += s.totalCashFromCreditSalesPaise;
      totalOutstandingReceivedPaise += s.totalOutstandingReceivedPaise;
      totalCollectionsPaise += s.totalCollectionsPaise;
      totalExpensesPaise += s.totalExpensesPaise;

      // fuel sale by type
      // recompute from nozzleReadings with current rate
      // (already computed in totalSalesPaise but we want per-fuel split)
      const meterByFuel: Record<FuelType, bigint> = {
        HSD: 0n,
        MS: 0n,
        MS_POWER: 0n,
        CNG: 0n,
      };
      for (const r of s.nozzleReadings) {
        const sale = r.closingReadingMl - r.openingReadingMl - r.testingMl;
        meterByFuel[r.fuelType] += sale > 0n ? sale : 0n;
      }
      // Pull rates
      const rates = await prisma.fuelRate.findMany({
        where: { pumpId },
        orderBy: { effectiveFrom: 'desc' },
      });
      const ratePerFuel: Partial<Record<FuelType, bigint>> = {};
      for (const r of rates) if (!ratePerFuel[r.fuelType]) ratePerFuel[r.fuelType] = r.ratePaise;
      for (const f of Object.keys(meterByFuel) as FuelType[]) {
        const qty = meterByFuel[f];
        const rate = ratePerFuel[f] ?? 0n;
        fuelSales[f].qtyMl += qty;
        fuelSales[f].amtPaise += (qty * rate) / 1000n;
      }

      // collections by channel
      for (const pc of s.paymentCollections) {
        const k = pc.channelId;
        if (!collectionsByChannel[k]) {
          collectionsByChannel[k] = { name: pc.channel.name, amount: 0n };
        }
        collectionsByChannel[k].amount += pc.amountPaise;
      }
    }

    // Stock summary (current = latest closing per tank from any shift today, else from db)
    const tanks = await prisma.tank.findMany({ where: { pumpId, isActive: true } });
    const stock = tanks.map((t) => {
      let currentMl = 0n;
      const latestEntry = sorted
        .flatMap((s) => s.stockEntries.filter((e) => e.tankId === t.id))
        .pop();
      if (latestEntry) currentMl = latestEntry.closingStockMl;
      return {
        tankId: t.id,
        name: t.name,
        fuelType: t.fuelType,
        capacityMl: t.capacityMl,
        currentMl,
      };
    });

    // Outstanding total across customers
    const customers = await prisma.creditCustomer.aggregate({
      where: { pumpId, isActive: true },
      _sum: { currentBalancePaise: true },
    });

    res.json({
      date: today.toISOString().slice(0, 10),
      shiftsCount: shifts.length,
      cashFlow: {
        openingCashPaise,
        totalSalesPaise,
        totalCreditIssuedPaise,
        totalCashFromCreditSalesPaise,
        totalOutstandingReceivedPaise,
        totalCollectionsPaise,
        totalExpensesPaise,
        closingCashPaise,
        // Where the money went
        moneyInExpected: totalSalesPaise - totalCreditIssuedPaise + totalOutstandingReceivedPaise,
        moneyInCollected: totalCollectionsPaise,
        difference: totalCollectionsPaise - (totalSalesPaise - totalCreditIssuedPaise + totalOutstandingReceivedPaise),
      },
      fuelSales,
      collectionsByChannel: Object.values(collectionsByChannel),
      stock,
      totalCustomerOutstandingPaise: customers._sum.currentBalancePaise || 0n,
      shifts: sorted.map((s) => ({
        id: s.id,
        shiftType: s.shiftType,
        status: s.status,
        totalSalesPaise: s.totalSalesPaise,
        closingCashPaise: s.closingCashPaise,
        discrepancyMl: s.discrepancyMl,
        discrepancyFlag: s.discrepancyFlag,
      })),
    });
  } catch (e) {
    next(e);
  }
});

// 7-day sales chart
router.get('/sales-trend', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const days = parseInt(String(req.query.days || '7'), 10);
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days + 1);

    const shifts = await prisma.shiftReport.findMany({
      where: { pumpId, reportDate: { gte: start, lte: end } },
      orderBy: { reportDate: 'asc' },
    });

    const byDate: Record<string, { sales: bigint; expenses: bigint; collections: bigint }> = {};
    // pre-fill every day in range so the chart has continuous bars
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      byDate[d.toISOString().slice(0, 10)] = { sales: 0n, expenses: 0n, collections: 0n };
    }
    for (const s of shifts) {
      const key = s.reportDate.toISOString().slice(0, 10);
      if (!byDate[key]) byDate[key] = { sales: 0n, expenses: 0n, collections: 0n };
      byDate[key].sales += s.totalSalesPaise;
      byDate[key].expenses += s.totalExpensesPaise;
      byDate[key].collections += s.totalCollectionsPaise;
    }
    res.json(byDate);
  } catch (e) {
    next(e);
  }
});

// Date-range aggregates — drives the /reports page
router.get('/range', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const { from, to } = parseRange(req);

    const shifts = await prisma.shiftReport.findMany({
      where: { pumpId, reportDate: { gte: from, lte: to } },
      orderBy: { reportDate: 'asc' },
      include: {
        nozzleReadings: true,
        paymentCollections: { include: { channel: true } },
      },
    });

    const rates = await prisma.fuelRate.findMany({
      where: { pumpId },
      orderBy: { effectiveFrom: 'desc' },
    });
    const ratePerFuel: Partial<Record<FuelType, bigint>> = {};
    for (const r of rates) if (!ratePerFuel[r.fuelType]) ratePerFuel[r.fuelType] = r.ratePaise;

    const byDate: Record<
      string,
      {
        salesPaise: bigint;
        creditIssuedPaise: bigint;
        outstandingReceivedPaise: bigint;
        collectionsPaise: bigint;
        expensesPaise: bigint;
        shifts: number;
      }
    > = {};
    for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      byDate[d.toISOString().slice(0, 10)] = {
        salesPaise: 0n,
        creditIssuedPaise: 0n,
        outstandingReceivedPaise: 0n,
        collectionsPaise: 0n,
        expensesPaise: 0n,
        shifts: 0,
      };
    }

    let salesPaise = 0n;
    let creditIssuedPaise = 0n;
    let outstandingReceivedPaise = 0n;
    let collectionsPaise = 0n;
    let expensesPaise = 0n;
    let discrepancyShifts = 0;

    const fuelMix: Record<FuelType, { qtyMl: bigint; amtPaise: bigint }> = {
      HSD: { qtyMl: 0n, amtPaise: 0n },
      MS: { qtyMl: 0n, amtPaise: 0n },
      MS_POWER: { qtyMl: 0n, amtPaise: 0n },
      CNG: { qtyMl: 0n, amtPaise: 0n },
    };
    const channelMap: Record<string, { channelId: string; name: string; amountPaise: bigint }> = {};

    for (const s of shifts) {
      const key = s.reportDate.toISOString().slice(0, 10);
      const row = byDate[key];
      if (row) {
        row.salesPaise += s.totalSalesPaise;
        row.creditIssuedPaise += s.totalCreditIssuedPaise;
        row.outstandingReceivedPaise += s.totalOutstandingReceivedPaise;
        row.collectionsPaise += s.totalCollectionsPaise;
        row.expensesPaise += s.totalExpensesPaise;
        row.shifts += 1;
      }
      salesPaise += s.totalSalesPaise;
      creditIssuedPaise += s.totalCreditIssuedPaise;
      outstandingReceivedPaise += s.totalOutstandingReceivedPaise;
      collectionsPaise += s.totalCollectionsPaise;
      expensesPaise += s.totalExpensesPaise;
      if (s.discrepancyFlag) discrepancyShifts += 1;

      for (const r of s.nozzleReadings) {
        const sold = r.closingReadingMl - r.openingReadingMl - r.testingMl;
        const qty = sold > 0n ? sold : 0n;
        const rate = ratePerFuel[r.fuelType] ?? 0n;
        fuelMix[r.fuelType].qtyMl += qty;
        fuelMix[r.fuelType].amtPaise += (qty * rate) / 1000n;
      }

      for (const pc of s.paymentCollections) {
        const k = pc.channelId;
        if (!channelMap[k]) channelMap[k] = { channelId: k, name: pc.channel.name, amountPaise: 0n };
        channelMap[k].amountPaise += pc.amountPaise;
      }
    }

    res.json({
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      totals: {
        salesPaise,
        creditIssuedPaise,
        outstandingReceivedPaise,
        collectionsPaise,
        expensesPaise,
        netCashPaise: salesPaise - creditIssuedPaise + outstandingReceivedPaise - expensesPaise,
        shiftsCount: shifts.length,
        discrepancyShifts,
      },
      byDate: Object.entries(byDate).map(([date, v]) => ({ date, ...v })),
      fuelMix,
      collectionsByChannel: Object.values(channelMap).sort((a, b) =>
        a.amountPaise > b.amountPaise ? -1 : 1,
      ),
    });
  } catch (e) {
    next(e);
  }
});

// Expense breakdown by category for a date range
router.get('/expense-breakdown', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const { from, to } = parseRange(req);

    const entries = await prisma.expenseEntry.findMany({
      where: {
        shiftReport: { pumpId, reportDate: { gte: from, lte: to } },
      },
      include: { category: true },
    });

    const byCategory: Record<
      string,
      { categoryId: string; name: string; amountPaise: bigint; count: number }
    > = {};
    let total = 0n;
    for (const e of entries) {
      const k = e.categoryId;
      if (!byCategory[k]) {
        byCategory[k] = { categoryId: k, name: e.category.name, amountPaise: 0n, count: 0 };
      }
      byCategory[k].amountPaise += e.dayExpensePaise;
      byCategory[k].count += 1;
      total += e.dayExpensePaise;
    }
    res.json({
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      totalPaise: total,
      byCategory: Object.values(byCategory).sort((a, b) =>
        a.amountPaise > b.amountPaise ? -1 : 1,
      ),
    });
  } catch (e) {
    next(e);
  }
});

// FIFO aging of customer outstanding balances
router.get('/customer-aging', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const customers = await prisma.creditCustomer.findMany({
      where: { pumpId, isActive: true, currentBalancePaise: { gt: 0n } },
      include: {
        // Only count LOCKED shifts — that's when customer balances actually change.
        creditSales: {
          where: { shiftReport: { status: 'LOCKED' } },
          orderBy: { saleAt: 'asc' },
        },
        outstandingReceipts: {
          where: { shiftReport: { status: 'LOCKED' } },
          orderBy: { receivedAt: 'asc' },
        },
      },
    });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const buckets = { d0_30: 0n, d31_60: 0n, d61_90: 0n, d90_plus: 0n };
    const rows: Array<{
      customerId: string;
      name: string;
      vehicleNo: string | null;
      phone: string | null;
      balancePaise: bigint;
      oldestUnpaidAt: string | null;
      ageDays: number;
      bucket: keyof typeof buckets;
    }> = [];

    for (const c of customers) {
      // FIFO: apply each receipt to the oldest unpaid credit sale
      const open: { date: Date; remaining: bigint }[] = c.creditSales
        .filter((s) => s.amountCreditPaise > 0n)
        .map((s) => ({ date: s.saleAt, remaining: s.amountCreditPaise }));
      let payments = c.outstandingReceipts.reduce((sum, r) => sum + r.amountPaise, 0n);
      while (payments > 0n && open.length > 0) {
        const head = open[0];
        if (head.remaining <= payments) {
          payments -= head.remaining;
          open.shift();
        } else {
          head.remaining -= payments;
          payments = 0n;
        }
      }

      // What's left becomes the aging
      let oldestUnpaidAt: Date | null = null;
      let custBalance = 0n;
      for (const slice of open) {
        custBalance += slice.remaining;
        if (!oldestUnpaidAt || slice.date < oldestUnpaidAt) oldestUnpaidAt = slice.date;
        const ageDays = Math.floor(
          (today.getTime() - slice.date.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (ageDays <= 30) buckets.d0_30 += slice.remaining;
        else if (ageDays <= 60) buckets.d31_60 += slice.remaining;
        else if (ageDays <= 90) buckets.d61_90 += slice.remaining;
        else buckets.d90_plus += slice.remaining;
      }

      // Surface what we computed; if FIFO ended up clean but balance!=0, fall back to currentBalance
      const balancePaise = custBalance > 0n ? custBalance : c.currentBalancePaise;
      const ageDays = oldestUnpaidAt
        ? Math.floor((today.getTime() - oldestUnpaidAt.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      const bucket =
        ageDays <= 30
          ? 'd0_30'
          : ageDays <= 60
            ? 'd31_60'
            : ageDays <= 90
              ? 'd61_90'
              : 'd90_plus';

      rows.push({
        customerId: c.id,
        name: c.name,
        vehicleNo: c.vehicleNo,
        phone: c.phone,
        balancePaise,
        oldestUnpaidAt: oldestUnpaidAt ? oldestUnpaidAt.toISOString() : null,
        ageDays,
        bucket,
      });
    }

    rows.sort((a, b) => (a.balancePaise > b.balancePaise ? -1 : 1));

    res.json({
      buckets,
      totalPaise: rows.reduce((s, r) => s + r.balancePaise, 0n),
      customers: rows,
    });
  } catch (e) {
    next(e);
  }
});

// Top credit customers by current balance — for the dashboard widget
router.get('/top-credit-customers', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const limit = Math.min(parseInt(String(req.query.limit || '5'), 10) || 5, 20);
    const customers = await prisma.creditCustomer.findMany({
      where: { pumpId, isActive: true, currentBalancePaise: { gt: 0n } },
      orderBy: { currentBalancePaise: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        vehicleNo: true,
        currentBalancePaise: true,
        creditLimitPaise: true,
      },
    });
    res.json(customers);
  } catch (e) {
    next(e);
  }
});

function parseRange(req: any): { from: Date; to: Date } {
  const fromStr = String(req.query.from || '');
  const toStr = String(req.query.to || '');
  const to = toStr ? new Date(toStr + 'T00:00:00Z') : new Date();
  to.setUTCHours(0, 0, 0, 0);
  let from: Date;
  if (fromStr) {
    from = new Date(fromStr + 'T00:00:00Z');
  } else {
    from = new Date(to);
    from.setUTCDate(from.getUTCDate() - 29); // default 30-day window
  }
  if (from > to) throw new AppError(400, 'from must be before to');
  return { from, to };
}

export default router;
