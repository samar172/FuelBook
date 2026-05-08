// Excel exports — single shift report and date-range P&L.
// Money is paise BigInt; we convert to ₹ only at the cell boundary.

import { Router } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/db';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/error';
import { paiseToRupees, mlToLitres } from '../lib/money';
import { FuelType } from '@prisma/client';

const router = Router();
router.use(requireAuth);

const requirePump = (req: any) => {
  if (!req.user.pumpId) throw new AppError(400, 'No pump assigned to user');
  return req.user.pumpId as string;
};

const FUEL_LABELS: Record<FuelType, string> = {
  HSD: 'HSD (Diesel)',
  MS: 'MS (Petrol)',
  MS_POWER: 'MS Power',
  CNG: 'CNG',
};

// ---------- Single shift export ----------
router.get('/shifts/:id.xlsx', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const shift = await prisma.shiftReport.findFirst({
      where: { id: req.params.id, pumpId },
      include: {
        pump: true,
        nozzleReadings: { include: { nozzle: true } },
        stockEntries: { include: { tank: true } },
        paymentCollections: { include: { channel: true, timeSlot: true } },
        outstandingReceipts: { include: { customer: true } },
        creditSales: { include: { customer: true } },
        expenseEntries: { include: { category: true } },
        tankerReceipts: { include: { tank: true } },
      },
    });
    if (!shift) throw new AppError(404, 'Shift not found');

    const wb = new ExcelJS.Workbook();
    wb.creator = 'FuelBook';
    wb.created = new Date();

    const ws = wb.addWorksheet('Shift Report', {
      views: [{ state: 'frozen', ySplit: 4 }],
    });

    // Header
    const dateStr = shift.reportDate.toISOString().slice(0, 10);
    ws.mergeCells('A1:G1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `${shift.pump.name} — ${dateStr} — ${shift.shiftType} shift`;
    titleCell.font = { size: 16, bold: true };

    ws.mergeCells('A2:G2');
    ws.getCell('A2').value = `${shift.pump.address || ''} — ${shift.pump.city || ''} — Status: ${shift.status}`;
    ws.getCell('A2').font = { italic: true, color: { argb: 'FF666666' } };

    let row = 4;

    const sectionHeader = (label: string) => {
      ws.mergeCells(`A${row}:G${row}`);
      const c = ws.getCell(`A${row}`);
      c.value = label;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      c.alignment = { vertical: 'middle' };
      row += 1;
    };
    const colHeader = (cells: string[]) => {
      cells.forEach((v, i) => {
        const c = ws.getCell(row, i + 1);
        c.value = v;
        c.font = { bold: true };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        c.border = { bottom: { style: 'thin' } };
      });
      row += 1;
    };

    // Nozzle readings
    sectionHeader('NOZZLE READINGS');
    colHeader(['Nozzle', 'Fuel', 'Opening (L)', 'Closing (L)', 'Testing (L)', 'Sold (L)', '']);
    for (const r of shift.nozzleReadings) {
      const sold = r.closingReadingMl - r.openingReadingMl - r.testingMl;
      ws.getCell(row, 1).value = r.nozzle.code;
      ws.getCell(row, 2).value = FUEL_LABELS[r.fuelType];
      ws.getCell(row, 3).value = mlToLitres(r.openingReadingMl);
      ws.getCell(row, 4).value = mlToLitres(r.closingReadingMl);
      ws.getCell(row, 5).value = mlToLitres(r.testingMl);
      ws.getCell(row, 6).value = mlToLitres(sold);
      [3, 4, 5, 6].forEach((c) => (ws.getCell(row, c).numFmt = '#,##0.000'));
      row += 1;
    }
    row += 1;

    // Stock
    sectionHeader('STOCK (TANK)');
    colHeader(['Tank', 'Fuel', 'Opening (L)', 'Closing (L)', 'Used (L)', '', '']);
    for (const s of shift.stockEntries) {
      const used = s.openingStockMl - s.closingStockMl;
      ws.getCell(row, 1).value = s.tank.name;
      ws.getCell(row, 2).value = FUEL_LABELS[s.fuelType];
      ws.getCell(row, 3).value = mlToLitres(s.openingStockMl);
      ws.getCell(row, 4).value = mlToLitres(s.closingStockMl);
      ws.getCell(row, 5).value = mlToLitres(used);
      [3, 4, 5].forEach((c) => (ws.getCell(row, c).numFmt = '#,##0.000'));
      row += 1;
    }
    row += 1;

    // Tanker receipts
    if (shift.tankerReceipts.length) {
      sectionHeader('TANKER RECEIPTS');
      colHeader(['Tank', 'Vendor', 'Bill #', 'Qty (L)', 'Rate (₹/L)', 'Total (₹)', 'Received At']);
      for (const t of shift.tankerReceipts) {
        ws.getCell(row, 1).value = t.tank.name;
        ws.getCell(row, 2).value = t.vendorName || '';
        ws.getCell(row, 3).value = t.billNo || '';
        ws.getCell(row, 4).value = mlToLitres(t.receivedMl);
        ws.getCell(row, 5).value = t.ratePaise ? paiseToRupees(t.ratePaise) : '';
        ws.getCell(row, 6).value = t.totalCostPaise ? paiseToRupees(t.totalCostPaise) : '';
        ws.getCell(row, 7).value = t.receivedAt.toISOString().slice(0, 16).replace('T', ' ');
        ws.getCell(row, 4).numFmt = '#,##0.000';
        ws.getCell(row, 5).numFmt = '#,##0.00';
        ws.getCell(row, 6).numFmt = '#,##0.00';
        row += 1;
      }
      row += 1;
    }

    // Collections
    sectionHeader('COLLECTIONS');
    colHeader(['Channel', 'Time Slot', 'Amount (₹)', '', '', '', '']);
    for (const p of shift.paymentCollections) {
      ws.getCell(row, 1).value = p.channel.name;
      ws.getCell(row, 2).value = p.timeSlot?.name || '';
      ws.getCell(row, 3).value = paiseToRupees(p.amountPaise);
      ws.getCell(row, 3).numFmt = '#,##0.00';
      row += 1;
    }
    ws.getCell(row, 1).value = 'Total Collections';
    ws.getCell(row, 1).font = { bold: true };
    ws.getCell(row, 3).value = paiseToRupees(shift.totalCollectionsPaise);
    ws.getCell(row, 3).font = { bold: true };
    ws.getCell(row, 3).numFmt = '#,##0.00';
    row += 2;

    // Credit sales
    if (shift.creditSales.length) {
      sectionHeader('CREDIT SALES');
      colHeader(['Customer', 'Vehicle', 'Fuel', 'Qty (L)', 'Total (₹)', 'Paid Now (₹)', 'Credit (₹)']);
      for (const cs of shift.creditSales) {
        ws.getCell(row, 1).value = cs.customer.name;
        ws.getCell(row, 2).value = cs.vehicleNo || cs.customer.vehicleNo || '';
        ws.getCell(row, 3).value = FUEL_LABELS[cs.fuelType];
        ws.getCell(row, 4).value = mlToLitres(cs.quantityMl);
        ws.getCell(row, 5).value = paiseToRupees(cs.totalAmountPaise);
        ws.getCell(row, 6).value = paiseToRupees(cs.amountPaidPaise);
        ws.getCell(row, 7).value = paiseToRupees(cs.amountCreditPaise);
        ws.getCell(row, 4).numFmt = '#,##0.000';
        [5, 6, 7].forEach((c) => (ws.getCell(row, c).numFmt = '#,##0.00'));
        row += 1;
      }
      row += 1;
    }

    // Outstanding received
    if (shift.outstandingReceipts.length) {
      sectionHeader('OUTSTANDING RECEIVED');
      colHeader(['Customer', 'Reference', 'Amount (₹)', '', '', '', '']);
      for (const o of shift.outstandingReceipts) {
        ws.getCell(row, 1).value = o.customer?.name || o.customerNameRaw;
        ws.getCell(row, 2).value = o.reference || '';
        ws.getCell(row, 3).value = paiseToRupees(o.amountPaise);
        ws.getCell(row, 3).numFmt = '#,##0.00';
        row += 1;
      }
      row += 1;
    }

    // Expenses
    sectionHeader('EXPENSES');
    colHeader(['Category', 'Reference', 'Last Bill Date', 'Opening Bal (₹)', 'Today (₹)', 'Notes', '']);
    for (const e of shift.expenseEntries) {
      ws.getCell(row, 1).value = e.category.name;
      ws.getCell(row, 2).value = e.ref || '';
      ws.getCell(row, 3).value = e.lastBillDate ? e.lastBillDate.toISOString().slice(0, 10) : '';
      ws.getCell(row, 4).value = paiseToRupees(e.openingBalancePaise);
      ws.getCell(row, 5).value = paiseToRupees(e.dayExpensePaise);
      ws.getCell(row, 6).value = e.notes || '';
      ws.getCell(row, 4).numFmt = '#,##0.00';
      ws.getCell(row, 5).numFmt = '#,##0.00';
      row += 1;
    }
    ws.getCell(row, 1).value = 'Total Expenses';
    ws.getCell(row, 1).font = { bold: true };
    ws.getCell(row, 5).value = paiseToRupees(shift.totalExpensesPaise);
    ws.getCell(row, 5).font = { bold: true };
    ws.getCell(row, 5).numFmt = '#,##0.00';
    row += 2;

    // Reconciliation summary
    sectionHeader('RECONCILIATION');
    const summary: [string, number | string][] = [
      ['Opening Cash', paiseToRupees(shift.openingCashPaise)],
      ['Total Sales', paiseToRupees(shift.totalSalesPaise)],
      ['Credit Issued', paiseToRupees(shift.totalCreditIssuedPaise)],
      ['Cash from Credit Sales', paiseToRupees(shift.totalCashFromCreditSalesPaise)],
      ['Outstanding Received', paiseToRupees(shift.totalOutstandingReceivedPaise)],
      ['Total Collections', paiseToRupees(shift.totalCollectionsPaise)],
      ['Total Expenses', paiseToRupees(shift.totalExpensesPaise)],
      ['Closing Cash', paiseToRupees(shift.closingCashPaise)],
      ['Cash Flow Difference', paiseToRupees(shift.cashFlowDifferencePaise)],
      ['Meter (L)', mlToLitres(shift.totalSaleMlByMeter)],
      ['Stock (L)', mlToLitres(shift.totalSaleMlByStock)],
      ['Discrepancy (L)', mlToLitres(shift.discrepancyMl)],
    ];
    for (const [label, value] of summary) {
      ws.getCell(row, 1).value = label;
      ws.getCell(row, 1).font = { bold: true };
      ws.getCell(row, 2).value = value;
      ws.getCell(row, 2).numFmt = label.includes('(L)') ? '#,##0.000' : '#,##0.00';
      row += 1;
    }

    // Column widths
    [28, 20, 16, 14, 14, 14, 22].forEach((w, i) => (ws.getColumn(i + 1).width = w));

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${shift.pump.code}-${dateStr}-${shift.shiftType}.xlsx"`,
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    next(e);
  }
});

// ---------- Date-range export (P&L style) ----------
router.get('/range.xlsx', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const fromStr = String(req.query.from || '');
    const toStr = String(req.query.to || '');
    const to = toStr ? new Date(toStr + 'T00:00:00Z') : new Date();
    to.setUTCHours(0, 0, 0, 0);
    const from = fromStr
      ? new Date(fromStr + 'T00:00:00Z')
      : new Date(to.getTime() - 29 * 86400000);
    if (from > to) throw new AppError(400, 'from must be before to');

    const pump = await prisma.pump.findUnique({ where: { id: pumpId } });
    const shifts = await prisma.shiftReport.findMany({
      where: { pumpId, reportDate: { gte: from, lte: to } },
      orderBy: [{ reportDate: 'asc' }, { shiftType: 'asc' }],
      include: {
        paymentCollections: { include: { channel: true } },
        expenseEntries: { include: { category: true } },
        nozzleReadings: true,
      },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'FuelBook';

    // ===== Summary sheet =====
    const summary = wb.addWorksheet('Summary');
    summary.mergeCells('A1:F1');
    summary.getCell('A1').value = `${pump?.name || 'Pump'} — ${fromStr || from.toISOString().slice(0, 10)} to ${toStr || to.toISOString().slice(0, 10)}`;
    summary.getCell('A1').font = { size: 16, bold: true };

    let r = 3;
    const totals = {
      sales: 0n,
      creditIssued: 0n,
      outstandingReceived: 0n,
      collections: 0n,
      expenses: 0n,
    };
    for (const s of shifts) {
      totals.sales += s.totalSalesPaise;
      totals.creditIssued += s.totalCreditIssuedPaise;
      totals.outstandingReceived += s.totalOutstandingReceivedPaise;
      totals.collections += s.totalCollectionsPaise;
      totals.expenses += s.totalExpensesPaise;
    }
    const summaryRows: [string, number][] = [
      ['Total Sales', paiseToRupees(totals.sales)],
      ['Credit Issued (not collected)', paiseToRupees(totals.creditIssued)],
      ['Outstanding Received', paiseToRupees(totals.outstandingReceived)],
      ['Collections (cash + digital)', paiseToRupees(totals.collections)],
      ['Total Expenses', paiseToRupees(totals.expenses)],
      [
        'Net Cash Flow',
        paiseToRupees(
          totals.sales - totals.creditIssued + totals.outstandingReceived - totals.expenses,
        ),
      ],
    ];
    for (const [label, value] of summaryRows) {
      summary.getCell(r, 1).value = label;
      summary.getCell(r, 1).font = { bold: true };
      summary.getCell(r, 2).value = value;
      summary.getCell(r, 2).numFmt = '₹#,##0.00';
      r += 1;
    }
    summary.getColumn(1).width = 32;
    summary.getColumn(2).width = 18;

    // ===== Daily sheet =====
    const daily = wb.addWorksheet('Daily');
    daily.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Shift', key: 'shiftType', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Sales (₹)', key: 'sales', width: 14 },
      { header: 'Credit Issued (₹)', key: 'credit', width: 16 },
      { header: 'Outstanding Recv (₹)', key: 'outRecv', width: 18 },
      { header: 'Collections (₹)', key: 'collections', width: 16 },
      { header: 'Expenses (₹)', key: 'expenses', width: 14 },
      { header: 'Closing Cash (₹)', key: 'closing', width: 16 },
      { header: 'Discrepancy?', key: 'disc', width: 14 },
    ];
    daily.getRow(1).font = { bold: true };
    daily.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    };
    for (const s of shifts) {
      const row = daily.addRow({
        date: s.reportDate.toISOString().slice(0, 10),
        shiftType: s.shiftType,
        status: s.status,
        sales: paiseToRupees(s.totalSalesPaise),
        credit: paiseToRupees(s.totalCreditIssuedPaise),
        outRecv: paiseToRupees(s.totalOutstandingReceivedPaise),
        collections: paiseToRupees(s.totalCollectionsPaise),
        expenses: paiseToRupees(s.totalExpensesPaise),
        closing: paiseToRupees(s.closingCashPaise),
        disc: s.discrepancyFlag ? 'YES' : '',
      });
      ['sales', 'credit', 'outRecv', 'collections', 'expenses', 'closing'].forEach((k) => {
        row.getCell(k).numFmt = '#,##0.00';
      });
    }

    // ===== Expense breakdown =====
    const exp = wb.addWorksheet('Expenses by Category');
    const byCat: Record<string, { name: string; total: bigint; count: number }> = {};
    for (const s of shifts) {
      for (const e of s.expenseEntries) {
        const k = e.categoryId;
        if (!byCat[k]) byCat[k] = { name: e.category.name, total: 0n, count: 0 };
        byCat[k].total += e.dayExpensePaise;
        byCat[k].count += 1;
      }
    }
    exp.columns = [
      { header: 'Category', key: 'name', width: 32 },
      { header: 'Total (₹)', key: 'total', width: 16 },
      { header: 'Entries', key: 'count', width: 10 },
    ];
    exp.getRow(1).font = { bold: true };
    Object.values(byCat)
      .sort((a, b) => (a.total > b.total ? -1 : 1))
      .forEach((c) => {
        const row = exp.addRow({
          name: c.name,
          total: paiseToRupees(c.total),
          count: c.count,
        });
        row.getCell('total').numFmt = '#,##0.00';
      });

    // ===== Channel breakdown =====
    const ch = wb.addWorksheet('Collections by Channel');
    const byChannel: Record<string, { name: string; total: bigint }> = {};
    for (const s of shifts) {
      for (const p of s.paymentCollections) {
        const k = p.channelId;
        if (!byChannel[k]) byChannel[k] = { name: p.channel.name, total: 0n };
        byChannel[k].total += p.amountPaise;
      }
    }
    ch.columns = [
      { header: 'Channel', key: 'name', width: 28 },
      { header: 'Total (₹)', key: 'total', width: 16 },
    ];
    ch.getRow(1).font = { bold: true };
    Object.values(byChannel)
      .sort((a, b) => (a.total > b.total ? -1 : 1))
      .forEach((c) => {
        const row = ch.addRow({ name: c.name, total: paiseToRupees(c.total) });
        row.getCell('total').numFmt = '#,##0.00';
      });

    const fname = `fuelbook-${pump?.code || 'pump'}-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    next(e);
  }
});

export default router;
