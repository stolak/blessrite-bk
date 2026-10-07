import prisma from "../utils/prisma";
import { Prisma } from "@prisma/client";

export interface CreateAuditLogInput {
  action: string;
  entityType: string;
  entityId?: string;
  performedById?: string;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  description?: string;
  status?: string;
}

export interface ListAuditLogsParams {
  performedById?: string;
  action?: string;
  entityType?: string;
  status?: string;
  createdAtFrom?: Date;
  createdAtTo?: Date;
  page?: number;
  limit?: number;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const performedBySelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} satisfies Prisma.UserSelect;

export class AuditService {
  private prisma = prisma;

  async createAuditLog(data: CreateAuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        performedById: data.performedById,
        oldValues: data.oldValues as Prisma.InputJsonValue | undefined,
        newValues: data.newValues as Prisma.InputJsonValue | undefined,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        requestId: data.requestId,
        description: data.description,
        status: data.status || "SUCCESS",
      },
    });
  }

  async listAuditLogs(params: ListAuditLogsParams) {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (params.performedById?.trim()) {
      where.performedById = params.performedById.trim();
    }
    if (params.action?.trim()) {
      where.action = params.action.trim();
    }
    if (params.entityType?.trim()) {
      where.entityType = params.entityType.trim();
    }
    if (params.status?.trim()) {
      where.status = params.status.trim();
    }

    if (params.createdAtFrom || params.createdAtTo) {
      where.createdAt = {};
      if (params.createdAtFrom) {
        where.createdAt.gte = params.createdAtFrom;
      }
      if (params.createdAtTo) {
        where.createdAt.lte = params.createdAtTo;
      }
    }

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          performedBy: { select: performedBySelect },
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return {
      auditLogs: rows,
      pagination: { page, limit, total, totalPages },
    };
  }
}

export const auditService = new AuditService();
