import { Router } from 'express';
import { prisma } from '../lib/db';
import { requireAuth, requirePermission } from '../middleware/auth';
import {
  createCreditCustomerSchema,
  updateCreditCustomerSchema,
  createVehicleSchema,
  updateVehicleSchema,
} from '../schemas';
import { AppError } from '../middleware/error';

const router = Router();
router.use(requireAuth);

const requirePump = (req: any) => {
  if (!req.user.pumpId) throw new AppError(400, 'No pump assigned to user');
  return req.user.pumpId as string;
};

// Every customer lookup goes through here: a caller must never be able to read or
// edit a customer belonging to another pump by guessing an id.
async function findOwnCustomer(req: any, customerId: string) {
  const pumpId = requirePump(req);
  const customer = await prisma.creditCustomer.findFirst({
    where: { id: customerId, pumpId },
  });
  if (!customer) throw new AppError(404, 'Customer not found');
  return customer;
}

async function findOwnVehicle(req: any, vehicleId: string) {
  const pumpId = requirePump(req);
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, customer: { pumpId } },
  });
  if (!vehicle) throw new AppError(404, 'Vehicle not found');
  return vehicle;
}

// Keeps "one primary vehicle per customer" true: clears the flag on the others.
async function clearOtherPrimaries(tx: any, customerId: string, keepVehicleId: string) {
  await tx.vehicle.updateMany({
    where: { customerId, id: { not: keepVehicleId }, isPrimary: true },
    data: { isPrimary: false },
  });
}

const vehicleOrder = [{ isPrimary: 'desc' as const }, { vehicleNo: 'asc' as const }];

router.get('/customers', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const customers = await prisma.creditCustomer.findMany({
      where: { pumpId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        vehicles: { where: { isActive: true }, orderBy: vehicleOrder },
        _count: { select: { vehicles: { where: { isActive: true } } } },
      },
    });
    res.json(customers);
  } catch (e) {
    next(e);
  }
});

router.get('/customers/:id', async (req, res, next) => {
  try {
    await findOwnCustomer(req, req.params.id);
    const customer = await prisma.creditCustomer.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { vehicles: { orderBy: vehicleOrder } },
    });
    res.json(customer);
  } catch (e) {
    next(e);
  }
});

router.get('/customers/:id/ledger', async (req, res, next) => {
  try {
    await findOwnCustomer(req, req.params.id);
    const [customer, sales, receipts] = await Promise.all([
      prisma.creditCustomer.findUniqueOrThrow({
        where: { id: req.params.id },
        include: { vehicles: { orderBy: vehicleOrder } },
      }),
      prisma.creditSale.findMany({
        where: { customerId: req.params.id },
        include: { shiftReport: true, vehicle: true },
        orderBy: { saleAt: 'desc' },
      }),
      prisma.outstandingReceipt.findMany({
        where: { customerId: req.params.id },
        include: { shiftReport: true },
        orderBy: { receivedAt: 'desc' },
      }),
    ]);
    res.json({ customer, sales, receipts });
  } catch (e) {
    next(e);
  }
});

router.post('/customers', requirePermission('canManageCreditCustomers'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const { vehicleNo, ...data } = createCreditCustomerSchema.parse(req.body);
    const customer = await prisma.creditCustomer.create({
      data: {
        pumpId,
        ...data,
        // A vehicle number given at creation becomes the customer's primary vehicle.
        ...(vehicleNo
          ? { vehicles: { create: { vehicleNo: vehicleNo.toUpperCase(), isPrimary: true } } }
          : {}),
      },
      include: { vehicles: { orderBy: vehicleOrder } },
    });
    res.status(201).json(customer);
  } catch (e) {
    next(e);
  }
});

router.patch(
  '/customers/:id',
  requirePermission('canManageCreditCustomers'),
  async (req, res, next) => {
    try {
      const existing = await findOwnCustomer(req, req.params.id);
      const data = updateCreditCustomerSchema.parse(req.body);
      const customer = await prisma.creditCustomer.update({
        where: { id: existing.id },
        data,
        include: { vehicles: { orderBy: vehicleOrder } },
      });
      res.json(customer);
    } catch (e) {
      next(e);
    }
  },
);

// ===================== VEHICLES =====================

router.get('/customers/:id/vehicles', async (req, res, next) => {
  try {
    const customer = await findOwnCustomer(req, req.params.id);
    const includeInactive = String(req.query.includeInactive || '') === 'true';
    const vehicles = await prisma.vehicle.findMany({
      where: { customerId: customer.id, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: vehicleOrder,
    });
    res.json(vehicles);
  } catch (e) {
    next(e);
  }
});

router.post(
  '/customers/:id/vehicles',
  requirePermission('canManageCreditCustomers'),
  async (req, res, next) => {
    try {
      const customer = await findOwnCustomer(req, req.params.id);
      const data = createVehicleSchema.parse(req.body);

      const duplicate = await prisma.vehicle.findFirst({
        where: { customerId: customer.id, vehicleNo: data.vehicleNo },
      });
      if (duplicate) {
        throw new AppError(409, `${data.vehicleNo} is already registered for this customer`);
      }

      // First vehicle is automatically the primary one.
      const existingCount = await prisma.vehicle.count({
        where: { customerId: customer.id, isActive: true },
      });
      const isPrimary = data.isPrimary || existingCount === 0;

      const vehicle = await prisma.$transaction(async (tx) => {
        const created = await tx.vehicle.create({
          data: { ...data, isPrimary, customerId: customer.id },
        });
        if (isPrimary) await clearOtherPrimaries(tx, customer.id, created.id);
        return created;
      });
      res.status(201).json(vehicle);
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  '/vehicles/:id',
  requirePermission('canManageCreditCustomers'),
  async (req, res, next) => {
    try {
      const existing = await findOwnVehicle(req, req.params.id);
      const data = updateVehicleSchema.parse(req.body);

      if (data.vehicleNo && data.vehicleNo !== existing.vehicleNo) {
        const duplicate = await prisma.vehicle.findFirst({
          where: {
            customerId: existing.customerId,
            vehicleNo: data.vehicleNo,
            id: { not: existing.id },
          },
        });
        if (duplicate) {
          throw new AppError(409, `${data.vehicleNo} is already registered for this customer`);
        }
      }

      const vehicle = await prisma.$transaction(async (tx) => {
        const updated = await tx.vehicle.update({ where: { id: existing.id }, data });
        if (data.isPrimary === true) {
          await clearOtherPrimaries(tx, existing.customerId, updated.id);
        }
        return updated;
      });
      res.json(vehicle);
    } catch (e) {
      next(e);
    }
  },
);

// Retire a vehicle. Past credit sales keep pointing at it, so this deactivates
// rather than deletes unless the vehicle was never used.
router.delete(
  '/vehicles/:id',
  requirePermission('canManageCreditCustomers'),
  async (req, res, next) => {
    try {
      const existing = await findOwnVehicle(req, req.params.id);
      const salesCount = await prisma.creditSale.count({ where: { vehicleId: existing.id } });

      if (salesCount === 0) {
        await prisma.vehicle.delete({ where: { id: existing.id } });
        res.json({ deleted: true, vehicleId: existing.id });
        return;
      }

      const vehicle = await prisma.vehicle.update({
        where: { id: existing.id },
        data: { isActive: false, isPrimary: false },
      });
      res.json({ deleted: false, deactivated: true, salesCount, vehicle });
    } catch (e) {
      next(e);
    }
  },
);

export default router;
