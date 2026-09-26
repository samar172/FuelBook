// Wet stock control & statutory logs: dip charts, per-shift dip/density readings,
// Weights & Measures nozzle tests, wet-stock variance and tanker decantation with
// transit-loss claims. This is how a pump proves its fuel is accounted for.
//
// No ledger postings happen here — journalEntryId stays null and the accounting
// entries are wired centrally when a shift is locked.
import { Router } from 'express';
import { prisma } from '../lib/db';
import { requireAuth, requirePermission } from '../middleware/auth';
import {
  dipChartBulkSchema,
  dipReadingsBulkSchema,
  measureTestsBulkSchema,
  decantationSchema,
} from '../schemas/wetstock';
import {
  ChartPoint,
  DEFAULT_VARIANCE_TOLERANCE_PCT,
  DENSITY_NOTE,
  EVAPORATION_NOTE,
  absBig,
  densityAt15C,
  interpolateVolume,
  pctOf,
  toleranceForMeasure,
  valueOfMl,
} from '../services/wetstock';
import { AppError } from '../middleware/error';
import { ShiftStatus } from '@prisma/client';

const router = Router();
router.use(requireAuth);

const requirePump = (req: any) => {
  if (!req.user.pumpId) throw new AppError(400, 'No pump assigned to user');
  return req.user.pumpId as string;
};

// Every id that arrives in a URL or body is re-checked against the caller's pump:
// a client must never be able to read or write another pump's tank, nozzle, shift
// or tanker load by guessing an id.
async function findOwnTank(req: any, tankId: string) {
  const pumpId = requirePump(req);
  const tank = await prisma.tank.findFirst({ where: { id: tankId, pumpId } });
  if (!tank) throw new AppError(404, 'Tank not found');
  return tank;
}

async function findOwnShift(req: any, shiftId: string) {
  const pumpId = requirePump(req);
  const shift = await prisma.shiftReport.findFirst({ where: { id: shiftId, pumpId } });
  if (!shift) throw new AppError(404, 'Shift not found');
  return shift;
}

async function findEditableShift(req: any, shiftId: string) {
  const shift = await findOwnShift(req, shiftId);
  if (shift.status === ShiftStatus.LOCKED) {
    throw new AppError(403, 'Shift is locked and cannot be edited');
  }
  return shift;
}

async function findOwnReceipt(req: any, receiptId: string) {
  const pumpId = requirePump(req);
  const receipt = await prisma.tankerReceipt.findFirst({ where: { id: receiptId, pumpId } });
  if (!receipt) throw new AppError(404, 'Tanker receipt not found');
  return receipt;
}

// Employee references on a log entry must be this pump's employees.
async function assertOwnEmployee(pumpId: string, employeeId: string | null | undefined) {
  if (!employeeId) return;
  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, pumpId },
    select: { id: true },
  });
  if (!emp) throw new AppError(400, 'Unknown employee');
}

const loadChart = async (tankId: string): Promise<ChartPoint[]> => {
  const points = await prisma.tankDipChartPoint.findMany({
    where: { tankId },
    orderBy: { dipMm: 'asc' },
    select: { dipMm: true, volumeMl: true },
  });
  return points;
};

const parseDate = (v: unknown, label: string) => {
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new AppError(400, `Invalid ${label} date`);
  return d;
};

// ===================== DIP CHART (tank calibration table) =====================

router.get('/tanks/:tankId/dip-chart', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const tank = await findOwnTank(req, req.params.tankId);
    const points = await loadChart(tank.id);
    res.json({
      tank: { id: tank.id, name: tank.name, fuelType: tank.fuelType, capacityMl: tank.capacityMl },
      points,
      minDipMm: points.length ? points[0].dipMm : null,
      maxDipMm: points.length ? points[points.length - 1].dipMm : null,
    });
  } catch (e) {
    next(e);
  }
});

// Bulk replace: the calibration chart is a single document from the OMC, so it is
// replaced wholesale rather than patched row by row.
router.put('/tanks/:tankId/dip-chart', requirePermission('canEditStock'), async (req, res, next) => {
  try {
    const tank = await findOwnTank(req, req.params.tankId);
    const { points } = dipChartBulkSchema.parse(req.body);

    // A chart that isn't strictly ascending in dip and non-decreasing in volume is
    // physically impossible — reject it loudly rather than interpolate nonsense.
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      if (cur.dipMm === prev.dipMm) {
        throw new AppError(400, `Duplicate dip ${cur.dipMm} mm in the chart (row ${i + 1})`);
      }
      if (cur.dipMm < prev.dipMm) {
        throw new AppError(
          400,
          `Dip values must ascend: ${cur.dipMm} mm comes after ${prev.dipMm} mm (row ${i + 1})`
        );
      }
      if (cur.volumeMl < prev.volumeMl) {
        throw new AppError(
          400,
          `Volume cannot fall as the dip rises: row ${i + 1} (${cur.dipMm} mm) holds less than ${prev.dipMm} mm`
        );
      }
    }
    const over = points.find((p) => p.volumeMl > tank.capacityMl);
    if (over) {
      throw new AppError(
        400,
        `Dip ${over.dipMm} mm maps to more than the tank's capacity — check the units (the chart is in litres)`
      );
    }

    const saved = await prisma.$transaction(async (tx) => {
      await tx.tankDipChartPoint.deleteMany({ where: { tankId: tank.id } });
      if (points.length) {
        await tx.tankDipChartPoint.createMany({
          data: points.map((p) => ({ tankId: tank.id, dipMm: p.dipMm, volumeMl: p.volumeMl })),
        });
      }
      return tx.tankDipChartPoint.findMany({
        where: { tankId: tank.id },
        orderBy: { dipMm: 'asc' },
        select: { dipMm: true, volumeMl: true },
      });
    });
    res.json({ tankId: tank.id, points: saved, count: saved.length });
  } catch (e) {
    next(e);
  }
});

// Convert a dip to a volume by linear interpolation between the nearest points.
router.get(
  '/tanks/:tankId/dip-to-volume',
  requirePermission('canViewReports'),
  async (req, res, next) => {
    try {
      const tank = await findOwnTank(req, req.params.tankId);
      const raw = req.query.dipMm;
      if (raw === undefined || String(raw).trim() === '') {
        throw new AppError(400, 'dipMm is required');
      }
      const dipMm = Math.round(Number(raw));
      if (!Number.isFinite(dipMm) || dipMm < 0) throw new AppError(400, 'dipMm must be a non-negative number');

      const chart = await loadChart(tank.id);
      if (chart.length === 0) {
        throw new AppError(400, `No dip chart loaded for tank ${tank.name}`);
      }
      if (chart.length === 1) {
        if (chart[0].dipMm !== dipMm) {
          throw new AppError(
            400,
            `The chart for ${tank.name} has only one point (${chart[0].dipMm} mm) — add more before converting`
          );
        }
        return res.json({ tankId: tank.id, dipMm, volumeMl: chart[0].volumeMl, exact: true });
      }
      const hit = interpolateVolume(chart, dipMm);
      if (!hit) {
        throw new AppError(
          400,
          `Dip ${dipMm} mm is outside the chart for ${tank.name} (${chart[0].dipMm}–${chart[chart.length - 1].dipMm} mm)`
        );
      }
      res.json({ tankId: tank.id, dipMm, volumeMl: hit.volumeMl, exact: hit.exact });
    } catch (e) {
      next(e);
    }
  }
);

// ===================== PER-SHIFT DIP & DENSITY LOG =====================

router.get(
  '/shifts/:shiftId/dip-readings',
  requirePermission('canViewReports'),
  async (req, res, next) => {
    try {
      const shift = await findOwnShift(req, req.params.shiftId);
      const [readings, tanks, chartCounts] = await Promise.all([
        prisma.tankDipReading.findMany({
          where: { shiftReportId: shift.id },
          include: { tank: true, recordedBy: true },
          orderBy: { tank: { name: 'asc' } },
        }),
        prisma.tank.findMany({
          where: { pumpId: shift.pumpId, isActive: true },
          orderBy: { name: 'asc' },
        }),
        prisma.tankDipChartPoint.groupBy({
          by: ['tankId'],
          where: { tank: { pumpId: shift.pumpId } },
          _count: { _all: true },
        }),
      ]);
      const chartRows = new Map(chartCounts.map((c) => [c.tankId, c._count._all]));
      res.json({
        shift,
        readings,
        tanks: tanks.map((t) => ({ ...t, chartPoints: chartRows.get(t.id) ?? 0 })),
        densityNote: DENSITY_NOTE,
      });
    } catch (e) {
      next(e);
    }
  }
);

// Bulk upsert, one row per tank. volumeFromChartMl is auto-filled from the tank's
// chart when one exists (and the caller didn't send an explicit override), and the
// 15 °C density is derived from the observed density and temperature.
router.put(
  '/shifts/:shiftId/dip-readings',
  requirePermission('canEditStock'),
  async (req, res, next) => {
    try {
      const shift = await findEditableShift(req, req.params.shiftId);
      const { readings } = dipReadingsBulkSchema.parse(req.body);

      const tanks = await prisma.tank.findMany({ where: { pumpId: shift.pumpId } });
      const tankById = new Map(tanks.map((t) => [t.id, t]));
      const charts = new Map<string, ChartPoint[]>();

      const rows: {
        tankId: string;
        dipMm: number;
        volumeFromChartMl: bigint | null;
        densityKgM3: number | null;
        temperatureC: number | null;
        densityAt15CKgM3: number | null;
        observedAt?: Date;
        recordedById: string | null;
        notes: string | null;
      }[] = [];

      for (const r of readings) {
        const tank = tankById.get(r.tankId);
        if (!tank) throw new AppError(400, `Unknown tank ${r.tankId}`);
        await assertOwnEmployee(shift.pumpId, r.recordedById);

        let volumeFromChartMl: bigint | null = r.volumeFromChartMl ?? null;
        if (volumeFromChartMl === null) {
          if (!charts.has(tank.id)) charts.set(tank.id, await loadChart(tank.id));
          const chart = charts.get(tank.id)!;
          if (chart.length >= 1) {
            const hit = interpolateVolume(chart, r.dipMm);
            if (!hit) {
              throw new AppError(
                400,
                `Dip ${r.dipMm} mm is outside the chart for ${tank.name} (${chart[0].dipMm}–${chart[chart.length - 1].dipMm} mm)`
              );
            }
            volumeFromChartMl = hit.volumeMl;
          }
          // No chart loaded: the dip is still recorded, the volume just stays blank.
        }
        if (volumeFromChartMl !== null && volumeFromChartMl > tank.capacityMl) {
          throw new AppError(400, `Dip ${r.dipMm} mm exceeds the capacity of tank ${tank.name}`);
        }

        rows.push({
          tankId: tank.id,
          dipMm: r.dipMm,
          volumeFromChartMl,
          densityKgM3: r.densityKgM3 ?? null,
          temperatureC: r.temperatureC ?? null,
          // Simplified linear approximation of the ASTM 54B table — see services/wetstock.
          densityAt15CKgM3: densityAt15C(r.densityKgM3 ?? null, r.temperatureC ?? null),
          ...(r.observedAt ? { observedAt: new Date(r.observedAt) } : {}),
          recordedById: r.recordedById ?? null,
          notes: r.notes ?? null,
        });
      }

      const saved = await prisma.$transaction(async (tx) => {
        for (const row of rows) {
          const { tankId, ...data } = row;
          await tx.tankDipReading.upsert({
            where: { shiftReportId_tankId: { shiftReportId: shift.id, tankId } },
            update: data,
            create: { shiftReportId: shift.id, tankId, ...data },
          });
        }
        return tx.tankDipReading.findMany({
          where: { shiftReportId: shift.id },
          include: { tank: true, recordedBy: true },
          orderBy: { tank: { name: 'asc' } },
        });
      });
      res.json({ readings: saved, densityNote: DENSITY_NOTE });
    } catch (e) {
      next(e);
    }
  }
);

// ===================== WEIGHTS & MEASURES NOZZLE TESTS =====================

router.get(
  '/shifts/:shiftId/measure-tests',
  requirePermission('canViewReports'),
  async (req, res, next) => {
    try {
      const shift = await findOwnShift(req, req.params.shiftId);
      const [tests, nozzles] = await Promise.all([
        prisma.measureTest.findMany({
          where: { shiftReportId: shift.id },
          include: { nozzle: true, testedBy: true },
          orderBy: [{ nozzle: { code: 'asc' } }, { testedAt: 'asc' }],
        }),
        prisma.nozzle.findMany({
          where: { pumpId: shift.pumpId, isActive: true },
          orderBy: { code: 'asc' },
        }),
      ]);
      const failed = tests.filter((t) => !t.withinTolerance);
      res.json({
        shift,
        tests: tests.map((t) => ({ ...t, toleranceMl: toleranceForMeasure(t.measureMl) })),
        nozzles,
        failedCount: failed.length,
      });
    } catch (e) {
      next(e);
    }
  }
);

// Bulk replace for the shift: a nozzle may be tested more than once, so there is
// no natural key to upsert on — the submitted set becomes the shift's test log.
router.put(
  '/shifts/:shiftId/measure-tests',
  requirePermission('canEditStock'),
  async (req, res, next) => {
    try {
      const shift = await findEditableShift(req, req.params.shiftId);
      const { tests } = measureTestsBulkSchema.parse(req.body);

      const nozzles = await prisma.nozzle.findMany({ where: { pumpId: shift.pumpId } });
      const nozzleById = new Map(nozzles.map((n) => [n.id, n]));

      const rows = [] as {
        nozzleId: string;
        measureMl: bigint;
        deliveredMl: bigint;
        varianceMl: bigint;
        withinTolerance: boolean;
        testedAt?: Date;
        testedById: string | null;
        notes: string | null;
      }[];

      for (const t of tests) {
        if (!nozzleById.has(t.nozzleId)) throw new AppError(400, `Unknown nozzle ${t.nozzleId}`);
        await assertOwnEmployee(shift.pumpId, t.testedById);
        if (t.measureMl <= 0n) throw new AppError(400, 'Measure size must be greater than zero');

        // varianceMl is delivered minus measure: negative means a short delivery,
        // which is the direction that gets a dealer prosecuted.
        const varianceMl = t.deliveredMl - t.measureMl;
        const toleranceMl = toleranceForMeasure(t.measureMl);
        rows.push({
          nozzleId: t.nozzleId,
          measureMl: t.measureMl,
          deliveredMl: t.deliveredMl,
          varianceMl,
          withinTolerance: absBig(varianceMl) <= toleranceMl,
          ...(t.testedAt ? { testedAt: new Date(t.testedAt) } : {}),
          testedById: t.testedById ?? null,
          notes: t.notes ?? null,
        });
      }

      const saved = await prisma.$transaction(async (tx) => {
        await tx.measureTest.deleteMany({ where: { shiftReportId: shift.id } });
        for (const row of rows) {
          await tx.measureTest.create({ data: { shiftReportId: shift.id, ...row } });
        }
        return tx.measureTest.findMany({
          where: { shiftReportId: shift.id },
          include: { nozzle: true, testedBy: true },
          orderBy: [{ nozzle: { code: 'asc' } }, { testedAt: 'asc' }],
        });
      });

      const failed = saved.filter((t) => !t.withinTolerance);
      res.json({
        tests: saved.map((t) => ({ ...t, toleranceMl: toleranceForMeasure(t.measureMl) })),
        failedCount: failed.length,
        // Surfaced so the UI can shout: an out-of-tolerance nozzle must be sealed
        // and recalibrated before it dispenses again.
        failures: failed.map((t) => ({
          nozzleCode: t.nozzle.code,
          varianceMl: t.varianceMl,
          toleranceMl: toleranceForMeasure(t.measureMl),
        })),
      });
    } catch (e) {
      next(e);
    }
  }
);

// ===================== WET-STOCK VARIANCE =====================
// Book stock  = opening stock + tanker receipts − metered sales
// Measured    = the dip reading's chart volume
// Variance    = measured − book  (see EVAPORATION_NOTE for the sign convention)

router.get('/variance', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const { from, to, tankId } = req.query;
    const tolerancePct =
      req.query.tolerancePct === undefined || String(req.query.tolerancePct).trim() === ''
        ? DEFAULT_VARIANCE_TOLERANCE_PCT
        : Number(req.query.tolerancePct);
    if (!Number.isFinite(tolerancePct) || tolerancePct < 0) {
      throw new AppError(400, 'tolerancePct must be a non-negative number');
    }

    let tank = null;
    if (tankId) tank = await findOwnTank(req, String(tankId));

    const where: any = { pumpId };
    if (from || to) {
      where.reportDate = {};
      if (from) where.reportDate.gte = parseDate(from, 'from');
      if (to) where.reportDate.lte = parseDate(to, 'to');
    }

    const shifts = await prisma.shiftReport.findMany({
      where,
      orderBy: [{ reportDate: 'asc' }, { shiftType: 'asc' }],
      take: 400,
      select: { id: true, reportDate: true, shiftType: true, status: true },
    });
    const shiftIds = shifts.map((s) => s.id);

    const [tanks, nozzles, stockEntries, receipts, nozzleReadings, dipReadings] = await Promise.all([
      prisma.tank.findMany({
        where: { pumpId, ...(tank ? { id: tank.id } : {}) },
        orderBy: { name: 'asc' },
      }),
      prisma.nozzle.findMany({ where: { pumpId }, select: { id: true, tankId: true, code: true } }),
      shiftIds.length
        ? prisma.stockEntry.findMany({ where: { shiftReportId: { in: shiftIds } } })
        : Promise.resolve([]),
      shiftIds.length
        ? prisma.tankerReceipt.findMany({ where: { shiftReportId: { in: shiftIds } } })
        : Promise.resolve([]),
      shiftIds.length
        ? prisma.nozzleReading.findMany({ where: { shiftReportId: { in: shiftIds } } })
        : Promise.resolve([]),
      shiftIds.length
        ? prisma.tankDipReading.findMany({ where: { shiftReportId: { in: shiftIds } } })
        : Promise.resolve([]),
    ]);

    const nozzleTank = new Map(nozzles.map((n) => [n.id, n.tankId]));
    const key = (shiftId: string, tId: string) => `${shiftId}|${tId}`;

    const openingByKey = new Map<string, bigint>();
    const bookClosingByKey = new Map<string, bigint>();
    for (const s of stockEntries) {
      openingByKey.set(key(s.shiftReportId, s.tankId), s.openingStockMl);
      bookClosingByKey.set(key(s.shiftReportId, s.tankId), s.closingStockMl);
    }

    const receiptsByKey = new Map<string, bigint>();
    for (const r of receipts) {
      if (!r.shiftReportId) continue;
      const k = key(r.shiftReportId, r.tankId);
      receiptsByKey.set(k, (receiptsByKey.get(k) ?? 0n) + r.receivedMl);
    }

    // Metered sales: closing − opening on the totaliser, less the test volume that
    // was poured back into the tank (so it never left the wet stock).
    const salesByKey = new Map<string, bigint>();
    for (const nr of nozzleReadings) {
      const tId = nozzleTank.get(nr.nozzleId);
      if (!tId) continue;
      const dispensed = nr.closingReadingMl - nr.openingReadingMl - nr.testingMl;
      const k = key(nr.shiftReportId, tId);
      salesByKey.set(k, (salesByKey.get(k) ?? 0n) + dispensed);
    }

    const dipByKey = new Map<string, (typeof dipReadings)[number]>();
    for (const d of dipReadings) dipByKey.set(key(d.shiftReportId, d.tankId), d);

    const rows = [] as any[];
    for (const s of shifts) {
      for (const t of tanks) {
        const k = key(s.id, t.id);
        const hasAnything =
          openingByKey.has(k) || receiptsByKey.has(k) || salesByKey.has(k) || dipByKey.has(k);
        if (!hasAnything) continue;

        const openingMl = openingByKey.get(k) ?? 0n;
        const receiptsMl = receiptsByKey.get(k) ?? 0n;
        const salesMl = salesByKey.get(k) ?? 0n;
        const bookClosingMl = openingMl + receiptsMl - salesMl;

        const dip = dipByKey.get(k);
        const measuredMl = dip?.volumeFromChartMl ?? null;
        const varianceMl = measuredMl === null ? null : measuredMl - bookClosingMl;
        // Throughput is what moved through the tank; receipts stand in when there
        // were no sales (a delivery-only shift) so the percentage stays meaningful.
        const throughputMl = salesMl > 0n ? salesMl : receiptsMl;
        const variancePct = varianceMl === null ? null : pctOf(varianceMl, throughputMl);

        rows.push({
          shiftReportId: s.id,
          reportDate: s.reportDate,
          shiftType: s.shiftType,
          status: s.status,
          tankId: t.id,
          tankName: t.name,
          fuelType: t.fuelType,
          openingMl,
          receiptsMl,
          salesMl,
          bookClosingMl,
          // The closing stock the shift itself recorded, for cross-checking.
          recordedClosingMl: bookClosingByKey.get(k) ?? null,
          measuredMl,
          dipMm: dip?.dipMm ?? null,
          densityKgM3: dip?.densityKgM3 ?? null,
          densityAt15CKgM3: dip?.densityAt15CKgM3 ?? null,
          throughputMl,
          varianceMl,
          variancePct,
          hasDip: Boolean(dip),
          flagged: variancePct !== null && Math.abs(variancePct) > tolerancePct,
        });
      }
    }

    const measured = rows.filter((r) => r.varianceMl !== null);
    const totalVarianceMl = measured.reduce((a, r) => a + (r.varianceMl as bigint), 0n);
    const totalThroughputMl = measured.reduce((a, r) => a + (r.throughputMl as bigint), 0n);

    res.json({
      rows,
      tolerancePct,
      totals: {
        shiftsCovered: new Set(rows.map((r) => r.shiftReportId)).size,
        rowsWithDip: measured.length,
        rowsWithoutDip: rows.length - measured.length,
        flaggedCount: rows.filter((r) => r.flagged).length,
        totalVarianceMl,
        totalThroughputMl,
        totalVariancePct: pctOf(totalVarianceMl, totalThroughputMl),
      },
      tanks: tanks.map((t) => ({ id: t.id, name: t.name, fuelType: t.fuelType })),
      note: EVAPORATION_NOTE,
    });
  } catch (e) {
    next(e);
  }
});

// ===================== TANKER DECANTATION & TRANSIT LOSS =====================

// A load losing more than this fraction of its invoice quantity is worth a claim
// conversation with the OMC; 0.3% is the rule of thumb dealers use.
const CLAIM_FLAG_PCT = 0.3;

const decorateReceipt = (r: any) => {
  const lossPct =
    r.transitLossMl !== null && r.invoiceQtyMl
      ? pctOf(r.transitLossMl as bigint, r.invoiceQtyMl as bigint)
      : null;
  return {
    ...r,
    lossPct,
    // Both are reasons to hold the tanker and call the supply location.
    sealBroken: r.sealIntact === false,
    lossFlagged: lossPct !== null && lossPct > CLAIM_FLAG_PCT,
    decanted: r.dipBeforeMm !== null && r.dipAfterMm !== null,
  };
};

router.get('/decantation', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const { from, to, tankId } = req.query;
    if (tankId) await findOwnTank(req, String(tankId));

    const where: any = { pumpId, ...(tankId ? { tankId: String(tankId) } : {}) };
    if (from || to) {
      where.receivedAt = {};
      if (from) where.receivedAt.gte = parseDate(from, 'from');
      if (to) {
        // `to` is a day, so include the whole of it.
        const end = parseDate(to, 'to');
        end.setUTCHours(23, 59, 59, 999);
        where.receivedAt.lte = end;
      }
    }

    const receipts = await prisma.tankerReceipt.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      take: 300,
      include: { tank: true, shiftReport: { select: { id: true, reportDate: true, shiftType: true } } },
    });
    const rows = receipts.map(decorateReceipt);

    const totalInvoiceMl = rows.reduce((a, r) => a + (r.invoiceQtyMl ?? 0n), 0n);
    const totalLossMl = rows.reduce((a, r) => a + (r.transitLossMl ?? 0n), 0n);
    const totalClaimPaise = rows.reduce((a, r) => a + (r.claimAmountPaise ?? 0n), 0n);

    res.json({
      rows,
      claimFlagPct: CLAIM_FLAG_PCT,
      totals: {
        loads: rows.length,
        decantedLoads: rows.filter((r) => r.decanted).length,
        brokenSeals: rows.filter((r) => r.sealBroken).length,
        flaggedLosses: rows.filter((r) => r.lossFlagged).length,
        claimsRaised: rows.filter((r) => r.claimRaised).length,
        totalInvoiceMl,
        totalLossMl,
        totalClaimPaise,
      },
    });
  } catch (e) {
    next(e);
  }
});

// Record the decantation of one load. receivedByDipMl comes from the tank's dip
// chart (volume after − volume before) whenever the chart can answer both dips.
router.patch(
  '/decantation/:tankerReceiptId',
  requirePermission('canEditTankerReceipts'),
  async (req, res, next) => {
    try {
      const receipt = await findOwnReceipt(req, req.params.tankerReceiptId);
      const body = decantationSchema.parse(req.body);
      const pumpId = receipt.pumpId;
      await assertOwnEmployee(pumpId, body.decantedById);

      // Undefined means "leave alone"; null means "clear".
      const pick = <T>(sent: T | undefined, current: T): T => (sent === undefined ? current : sent);

      const invoiceQtyMl = pick(body.invoiceQtyMl ?? undefined, receipt.invoiceQtyMl);
      const dipBeforeMm = pick(body.dipBeforeMm, receipt.dipBeforeMm);
      const dipAfterMm = pick(body.dipAfterMm, receipt.dipAfterMm);

      if (dipBeforeMm !== null && dipAfterMm !== null && dipAfterMm < dipBeforeMm) {
        throw new AppError(400, 'The dip after decanting cannot be lower than the dip before');
      }

      let receivedByDipMl: bigint | null = null;
      if (dipBeforeMm !== null && dipAfterMm !== null) {
        const chart = await loadChart(receipt.tankId);
        if (chart.length >= 2) {
          const before = interpolateVolume(chart, dipBeforeMm);
          const after = interpolateVolume(chart, dipAfterMm);
          if (!before || !after) {
            throw new AppError(
              400,
              `A dip is outside the tank's chart (${chart[0].dipMm}–${chart[chart.length - 1].dipMm} mm)`
            );
          }
          receivedByDipMl = after.volumeMl - before.volumeMl;
        }
        // Without a chart the dips are still recorded; the dip-measured quantity
        // simply cannot be derived, so transit loss stays unknown too.
      }

      const transitLossMl =
        invoiceQtyMl !== null && receivedByDipMl !== null ? invoiceQtyMl - receivedByDipMl : null;

      // Value the shortfall at the load's own rate; an explicit amount from the
      // caller wins, because the OMC may settle a different figure.
      let claimAmountPaise: bigint | null =
        body.claimAmountPaise !== undefined ? body.claimAmountPaise : null;
      if (body.claimAmountPaise === undefined) {
        claimAmountPaise =
          transitLossMl !== null && transitLossMl > 0n
            ? valueOfMl(transitLossMl, receipt.ratePaise)
            : null;
      }

      const updated = await prisma.tankerReceipt.update({
        where: { id: receipt.id },
        data: {
          invoiceQtyMl,
          dipBeforeMm,
          dipAfterMm,
          receivedByDipMl,
          transitLossMl,
          densityAtLoading: pick(body.densityAtLoading, receipt.densityAtLoading),
          densityAtReceipt: pick(body.densityAtReceipt, receipt.densityAtReceipt),
          temperatureC: pick(body.temperatureC, receipt.temperatureC),
          sealIntact: pick(body.sealIntact, receipt.sealIntact),
          decantedAt:
            body.decantedAt === undefined
              ? receipt.decantedAt
              : body.decantedAt === null
                ? null
                : new Date(body.decantedAt),
          decantedById: pick(body.decantedById, receipt.decantedById),
          claimRaised: pick(body.claimRaised, receipt.claimRaised),
          claimAmountPaise,
          notes: pick(body.notes, receipt.notes),
        },
        include: {
          tank: true,
          shiftReport: { select: { id: true, reportDate: true, shiftType: true } },
        },
      });
      res.json(decorateReceipt(updated));
    } catch (e) {
      next(e);
    }
  }
);

export default router;
