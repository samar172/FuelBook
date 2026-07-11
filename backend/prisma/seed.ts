import 'dotenv/config';
import { PrismaClient, FuelType, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const L = (litres: number) => BigInt(Math.round(litres * 1000));
const RUPEES = (rupees: number) => BigInt(Math.round(rupees * 100));

async function main() {
  console.log('[seed] starting…');

  // --- Business ---
  const business = await prisma.business.upsert({
    where: { id: 'seed-business' },
    update: {},
    create: { id: 'seed-business', name: 'Shree Hari Petrol Pump Business' },
  });
  console.log('[seed] business:', business.name);

  // --- Pump ---
  const pump = await prisma.pump.upsert({
    where: { businessId_code: { businessId: business.id, code: 'SHP' } },
    update: {},
    create: {
      businessId: business.id,
      name: 'Shree Hari Petrol Pump',
      code: 'SHP',
      address: 'NH-21, Main Bazaar',
      city: 'Jaipur',
      state: 'Rajasthan',
    },
  });
  console.log('[seed] pump:', pump.name);

  // --- Tanks (5: HSD-1, HSD-2, HSD-3, MS, MS POWER) ---
  const tankSpecs: Array<{ name: string; fuelType: FuelType; capacityL: number }> = [
    { name: 'HSD-1', fuelType: 'HSD', capacityL: 12000 },
    { name: 'HSD-2', fuelType: 'HSD', capacityL: 12000 },
    { name: 'HSD-3', fuelType: 'HSD', capacityL: 12000 },
    { name: 'MS', fuelType: 'MS', capacityL: 12000 },
    { name: 'MS POWER', fuelType: 'MS_POWER', capacityL: 8000 },
  ];
  const tanks = [];
  for (const t of tankSpecs) {
    const tank = await prisma.tank.upsert({
      where: { pumpId_name: { pumpId: pump.id, name: t.name } },
      update: {},
      create: { pumpId: pump.id, name: t.name, fuelType: t.fuelType, capacityMl: L(t.capacityL) },
    });
    tanks.push(tank);
  }
  console.log('[seed] tanks:', tanks.length);

  // --- Nozzles (10: 6 HSD + 2 MS + 2 MS_POWER) ---
  const hsdTank = tanks.find((t) => t.name === 'HSD-1')!;
  const hsdTank2 = tanks.find((t) => t.name === 'HSD-2')!;
  const hsdTank3 = tanks.find((t) => t.name === 'HSD-3')!;
  const msTank = tanks.find((t) => t.fuelType === 'MS')!;
  const msPowerTank = tanks.find((t) => t.fuelType === 'MS_POWER')!;
  const nozzleSpecs = [
    { code: 'No-1', tank: hsdTank },
    { code: 'No-2', tank: hsdTank },
    { code: 'No-3', tank: hsdTank2 },
    { code: 'No-4', tank: hsdTank2 },
    { code: 'No-5', tank: hsdTank3 },
    { code: 'No-6', tank: hsdTank3 },
    { code: 'No-7', tank: msTank },
    { code: 'No-8', tank: msTank },
    { code: 'No-9', tank: msPowerTank },
    { code: 'No-10', tank: msPowerTank },
  ];
  for (const n of nozzleSpecs) {
    await prisma.nozzle.upsert({
      where: { pumpId_code: { pumpId: pump.id, code: n.code } },
      update: {},
      create: { pumpId: pump.id, tankId: n.tank.id, code: n.code, fuelType: n.tank.fuelType },
    });
  }
  console.log('[seed] nozzles: 10');

  // --- Owner user ---
  const ownerPin = await bcrypt.hash('1234', 10);
  await prisma.user.upsert({
    where: { phone: '9000000001' },
    update: {},
    create: {
      businessId: business.id,
      pumpId: pump.id,
      name: 'Owner',
      phone: '9000000001',
      pinHash: ownerPin,
      role: Role.OWNER,
    },
  });
  console.log('[seed] owner user: phone=9000000001 pin=1234');

  // Sample manager with full default permissions
  const managerPin = await bcrypt.hash('5678', 10);
  const manager = await prisma.user.upsert({
    where: { phone: '9000000002' },
    update: {},
    create: {
      pumpId: pump.id,
      name: 'Manager',
      phone: '9000000002',
      pinHash: managerPin,
      role: Role.MANAGER,
    },
  });
  await prisma.userPermission.upsert({
    where: { userId: manager.id },
    update: {},
    create: { userId: manager.id },
  });
  console.log('[seed] manager user: phone=9000000002 pin=5678');

  // --- Initial fuel rates ---
  const now = new Date();
  const ratesData: Array<{ fuelType: FuelType; rupees: number }> = [
    { fuelType: 'HSD', rupees: 92.5 },
    { fuelType: 'MS', rupees: 105.7 },
    { fuelType: 'MS_POWER', rupees: 113.2 },
    { fuelType: 'CNG', rupees: 80.0 },
  ];
  for (const r of ratesData) {
    const exists = await prisma.fuelRate.findFirst({
      where: { pumpId: pump.id, fuelType: r.fuelType },
    });
    if (!exists) {
      await prisma.fuelRate.create({
        data: {
          pumpId: pump.id,
          fuelType: r.fuelType,
          ratePaise: RUPEES(r.rupees),
          effectiveFrom: now,
          createdBy: 'seed',
        },
      });
    }
  }
  console.log('[seed] fuel rates set');

  // --- Payment channels (matching Excel) ---
  const channels = [
    { name: 'Cash', kind: 'CASH', sortOrder: 0 },
    { name: 'HDFC POS', kind: 'CARD', sortOrder: 10 },
    { name: 'Paytm', kind: 'UPI', sortOrder: 20 },
    { name: 'PhonePe', kind: 'UPI', sortOrder: 30 },
    { name: 'DT Plus', kind: 'WALLET', sortOrder: 40 },
    { name: 'HP Pay', kind: 'WALLET', sortOrder: 50 },
    { name: 'SBI Bank Deposit', kind: 'BANK_DEPOSIT', sortOrder: 60 },
  ];
  for (const c of channels) {
    await prisma.paymentChannel.upsert({
      where: { pumpId_name: { pumpId: pump.id, name: c.name } },
      update: {},
      create: { pumpId: pump.id, ...c },
    });
  }
  console.log('[seed] payment channels: 7');

  // --- Time slots (configurable; defaults match Excel "Before 12 / After 12") ---
  const slots = [
    { name: 'Before 12', sortOrder: 0 },
    { name: 'After 12', sortOrder: 10 },
    { name: 'Full Shift', sortOrder: 20 },
  ];
  for (const s of slots) {
    await prisma.paymentTimeSlot.upsert({
      where: { pumpId_name: { pumpId: pump.id, name: s.name } },
      update: {},
      create: { pumpId: pump.id, ...s },
    });
  }
  console.log('[seed] time slots: 3');

  // --- Expense categories (from the Excel) ---
  const expenseCategories = [
    { name: 'OM PRAKASH JI DHARNIA', isRecurring: true, sortOrder: 10 },
    { name: 'VIJAY SINGH JI JRD', isRecurring: true, sortOrder: 20 },
    { name: 'DDC', isRecurring: true, sortOrder: 30 },
    { name: 'PUMP EXP', isRecurring: false, sortOrder: 40 },
    { name: 'DIPANSU STAFF', isRecurring: true, sortOrder: 50 },
    { name: 'DENSITY', isRecurring: false, sortOrder: 60 },
    { name: 'STAFF SALARY ADVANCE', isRecurring: true, sortOrder: 70 },
    { name: 'ELECTRICITY', isRecurring: false, sortOrder: 80 },
    { name: 'MAINTENANCE', isRecurring: false, sortOrder: 90 },
    { name: 'MISCELLANEOUS', isRecurring: false, sortOrder: 100 },
  ];
  for (const c of expenseCategories) {
    await prisma.expenseCategory.upsert({
      where: { pumpId_name: { pumpId: pump.id, name: c.name } },
      update: {},
      create: { pumpId: pump.id, ...c },
    });
  }
  console.log('[seed] expense categories:', expenseCategories.length);

  // --- Sample credit customer (Vijay) ---
  await prisma.creditCustomer.upsert({
    where: { id: 'seed-vijay' },
    update: {},
    create: {
      id: 'seed-vijay',
      pumpId: pump.id,
      name: 'Vijay Singh',
      phone: '9876543210',
      vehicleNo: 'RJ14-XX-1234',
      creditLimitPaise: RUPEES(50000),
      currentBalancePaise: 0n,
    },
  });
  console.log('[seed] sample credit customer: Vijay Singh');

  console.log('[seed] done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
