import { Prisma } from '@prisma/client';
import { prisma } from '../lib/db';

export async function logAudit(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  before?: unknown,
  after?: unknown,
  ipAddress?: string,
  tx?: Prisma.TransactionClient
) {
  const client = tx || prisma;
  await client.auditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId,
      beforeJson: before ? (JSON.parse(JSON.stringify(before, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) as Prisma.InputJsonValue) : undefined,
      afterJson: after ? (JSON.parse(JSON.stringify(after, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) as Prisma.InputJsonValue) : undefined,
      ipAddress,
    },
  });
}
