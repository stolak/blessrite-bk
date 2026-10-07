import prisma from "../utils/prisma";
import { Prisma, Status } from "@prisma/client";

export interface FacilityData {
  id: string;
  name: string;
  description: string | null;
  status: Status;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  CreatedBy?: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
  _count?: { inventoryTransactions: number };
}

export interface ListFacilitiesParams {
  q?: string;
  status?: Status | "All";
  page?: number;
  limit?: number;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const includeList = {
  CreatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  _count: { select: { inventoryTransactions: true } },
} satisfies Prisma.FacilityInclude;

const includeDetail = {
  CreatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  _count: { select: { inventoryTransactions: true } },
} satisfies Prisma.FacilityInclude;

export class FacilityService {
  private prisma = prisma;

  async createFacility(input: {
    name: string;
    description?: string | null;
    status?: Status;
    createdById?: string | null;
  }): Promise<FacilityData> {
    const name = input.name.trim();
    if (!name) throw new Error("name is required");

    return await this.prisma.facility.create({
      data: {
        name,
        description: input.description === undefined || input.description === null ? null : String(input.description),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.createdById !== undefined ? { createdById: input.createdById } : {}),
      },
      include: includeDetail,
    });
  }

  async listFacilities(params: ListFacilitiesParams = {}): Promise<{
    facilities: FacilityData[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.FacilityWhereInput = {};

    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [{ name: { contains: q } }, { description: { contains: q } }];
    }

    const [total, rows] = await Promise.all([
      this.prisma.facility.count({ where }),
      this.prisma.facility.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take: limit,
        include: includeList,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return { facilities: rows, pagination: { page, limit, total, totalPages } };
  }

  async getFacilityById(id: string): Promise<FacilityData | null> {
    return await this.prisma.facility.findUnique({
      where: { id },
      include: includeDetail,
    });
  }

  async updateFacility(
    id: string,
    input: {
      name?: string;
      description?: string | null;
      status?: Status;
    }
  ): Promise<FacilityData> {
    if (input.name !== undefined && !input.name.trim()) {
      throw new Error("name cannot be empty");
    }

    const existing = await this.getFacilityById(id);
    if (!existing) throw new Error("Facility not found");

    return await this.prisma.facility.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description === null ? null : String(input.description) }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedAt: new Date(),
      },
      include: includeDetail,
    });
  }

  async deleteFacility(id: string): Promise<FacilityData> {
    const existing = await this.getFacilityById(id);
    if (!existing) throw new Error("Facility not found");

    const inventoryTransactionCount = await this.prisma.inventoryTransaction.count({
      where: { facilityId: id },
    });
    if (inventoryTransactionCount > 0) {
      throw new Error(
        `Cannot delete facility because it is referenced by inventory transactions (${inventoryTransactionCount})`
      );
    }

    return await this.prisma.facility.delete({
      where: { id },
      include: includeDetail,
    });
  }
}

export const facilityService = new FacilityService();
