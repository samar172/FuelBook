import { Router } from 'express';
import { prisma } from '../lib/db';
import { requireAuth, requirePermission } from '../middleware/auth';
import { tankerReceiptSchema } from '../schemas';
import { AppError } from '../middleware/error';

const router = Router();
router.use(requireAuth);

const requirePump = (req: any) => {
  if (!req.user.pumpId) throw new AppError(400, 'No pump assigned to user');
  return req.user.pumpId as string;
};

router.get('/', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const { tankId, from, to } = req.query;
    const where: any = { pumpId };
    if (tankId) where.tankId = tankId;
    if (from || to) {
      where.receivedAt = {};
      if (from) where.receivedAt.gte = new Date(String(from));
      if (to) where.receivedAt.lte = new Date(String(to));
    }
    const list = await prisma.tankerReceipt.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      include: { tank: true },
      take: 100,
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
});

router.post('/', requirePermission('canEditTankerReceipts'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const data = tankerReceiptSchema.parse(req.body);
    const { shiftReportId } = req.body as { shiftReportId?: string };
    const receipt = await prisma.tankerReceipt.create({
      data: {
        pumpId,
        shiftReportId: shiftReportId || null,
        tankId: data.tankId,
        receivedMl: data.receivedMl,
        ratePaise: data.ratePaise || null,
        totalCostPaise: data.totalCostPaise || null,
        billNo: data.billNo,
        vendorName: data.vendorName,
        receivedAt: data.receivedAt ? new Date(data.receivedAt) : new Date(),
        notes: data.notes,
      },
    });
    res.status(201).json(receipt);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', requirePermission('canEditTankerReceipts'), async (req, res, next) => {
  try {
    await prisma.tankerReceipt.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

export default router;
