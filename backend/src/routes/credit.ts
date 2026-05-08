import { Router } from 'express';
import { prisma } from '../lib/db';
import { requireAuth, requirePermission } from '../middleware/auth';
import { createCreditCustomerSchema } from '../schemas';
import { AppError } from '../middleware/error';

const router = Router();
router.use(requireAuth);

const requirePump = (req: any) => {
  if (!req.user.pumpId) throw new AppError(400, 'No pump assigned to user');
  return req.user.pumpId as string;
};

router.get('/customers', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const customers = await prisma.creditCustomer.findMany({
      where: { pumpId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    res.json(customers);
  } catch (e) {
    next(e);
  }
});

router.get('/customers/:id', async (req, res, next) => {
  try {
    const customer = await prisma.creditCustomer.findUniqueOrThrow({
      where: { id: req.params.id },
    });
    res.json(customer);
  } catch (e) {
    next(e);
  }
});

router.get('/customers/:id/ledger', async (req, res, next) => {
  try {
    const [customer, sales, receipts] = await Promise.all([
      prisma.creditCustomer.findUniqueOrThrow({ where: { id: req.params.id } }),
      prisma.creditSale.findMany({
        where: { customerId: req.params.id },
        include: { shiftReport: true },
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
    const data = createCreditCustomerSchema.parse(req.body);
    const customer = await prisma.creditCustomer.create({
      data: { pumpId, ...data },
    });
    res.status(201).json(customer);
  } catch (e) {
    next(e);
  }
});

router.patch('/customers/:id', requirePermission('canManageCreditCustomers'), async (req, res, next) => {
  try {
    const customer = await prisma.creditCustomer.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(customer);
  } catch (e) {
    next(e);
  }
});

export default router;
