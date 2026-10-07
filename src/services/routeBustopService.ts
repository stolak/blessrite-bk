import prisma from "../utils/prisma";
import { isPrismaKnownErrorWithCode } from "../utils/assessmentHttp";
import { Prisma } from "@prisma/client";

const include = {
  route: { select: { id: true, name: true, homeToSchoolCost: true, schoolToHomeCost: true, roundTripCost: true, status: true } },
  bustop: {
    select: {
      id: true,
      name: true,
      description: true,
      latitude: true,
      longitude: true,
      status: true,
    },
  },
} satisfies Prisma.RouteBustopInclude;

export type RouteBustopData = Prisma.RouteBustopGetPayload<{ include: typeof include }>;

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export class RouteBustopService {
  private prisma = prisma;

  private async assertRefs(routeId: string, bustopId: string): Promise<void> {
    const [route, bustop] = await Promise.all([
      this.prisma.route.findUnique({ where: { id: routeId }, select: { id: true } }),
      this.prisma.bustop.findUnique({ where: { id: bustopId }, select: { id: true } }),
    ]);
    if (!route) throw new Error("Invalid routeId");
    if (!bustop) throw new Error("Invalid bustopId");
  }

  async create(input: {
    routeId: string;
    bustopId: string;
    stopOrder?: number;
  }): Promise<RouteBustopData> {
    const routeId = input.routeId.trim();
    const bustopId = input.bustopId.trim();
    if (!routeId || !bustopId) throw new Error("routeId and bustopId are required");
    if (
      input.stopOrder !== undefined &&
      (!Number.isInteger(input.stopOrder) || input.stopOrder < 0)
    ) {
      throw new Error("stopOrder must be a non-negative integer");
    }

    await this.assertRefs(routeId, bustopId);

    try {
      return await this.prisma.routeBustop.create({
        data: {
          routeId,
          bustopId,
          ...(input.stopOrder !== undefined ? { stopOrder: input.stopOrder } : {}),
        },
        include,
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Bustop is already assigned to this route");
      }
      throw e;
    }
  }

  async createMany(input: {
    routeId: string;
    bustops: { bustopId: string; stopOrder?: number }[];
  }): Promise<{ routeBustops: RouteBustopData[]; count: number }> {
    const routeId = input.routeId.trim();
    if (!routeId) throw new Error("routeId is required");
    if (!Array.isArray(input.bustops) || input.bustops.length === 0) {
      throw new Error("bustops must be a non-empty array");
    }

    const bustops = input.bustops.map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        throw new Error(`bustops[${index}] must be an object`);
      }
      if (typeof entry.bustopId !== "string" || !entry.bustopId.trim()) {
        throw new Error(`bustops[${index}].bustopId is required`);
      }
      if (
        entry.stopOrder !== undefined &&
        (!Number.isInteger(entry.stopOrder) || entry.stopOrder < 0)
      ) {
        throw new Error(`bustops[${index}].stopOrder must be a non-negative integer`);
      }
      return {
        bustopId: entry.bustopId.trim(),
        stopOrder: entry.stopOrder,
      };
    });

    const bustopIds = bustops.map((b) => b.bustopId);
    if (new Set(bustopIds).size !== bustopIds.length) {
      throw new Error("Duplicate bustopId in request");
    }

    const [route, found] = await Promise.all([
      this.prisma.route.findUnique({ where: { id: routeId }, select: { id: true } }),
      this.prisma.bustop.findMany({
        where: { id: { in: bustopIds } },
        select: { id: true },
      }),
    ]);
    if (!route) throw new Error("Invalid routeId");
    if (found.length !== bustopIds.length) throw new Error("Invalid bustopId in bustops");

    const rows = await this.prisma.$transaction(
      bustops.map((entry) =>
        this.prisma.routeBustop.upsert({
          where: {
            routeId_bustopId: { routeId, bustopId: entry.bustopId },
          },
          create: {
            routeId,
            bustopId: entry.bustopId,
            ...(entry.stopOrder !== undefined ? { stopOrder: entry.stopOrder } : {}),
          },
          update: {
            ...(entry.stopOrder !== undefined ? { stopOrder: entry.stopOrder } : {}),
          },
          include,
        })
      )
    );

    return { routeBustops: rows, count: rows.length };
  }

  async list(params: {
    routeId?: string;
    bustopId?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.RouteBustopWhereInput = {};
    if (params.routeId?.trim()) where.routeId = params.routeId.trim();
    if (params.bustopId?.trim()) where.bustopId = params.bustopId.trim();

    const [total, rows] = await Promise.all([
      this.prisma.routeBustop.count({ where }),
      this.prisma.routeBustop.findMany({
        where,
        include,
        orderBy: [{ routeId: "asc" }, { stopOrder: "asc" }],
        skip,
        take: limit,
      }),
    ]);

    return {
      routeBustops: rows,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async getById(id: string): Promise<RouteBustopData | null> {
    return this.prisma.routeBustop.findUnique({ where: { id }, include });
  }

  async update(
    id: string,
    input: { stopOrder?: number }
  ): Promise<RouteBustopData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Route bustop assignment not found");
    if (input.stopOrder === undefined) {
      throw new Error("stopOrder is required for update");
    }
    if (!Number.isInteger(input.stopOrder) || input.stopOrder < 0) {
      throw new Error("stopOrder must be a non-negative integer");
    }

    try {
      return await this.prisma.routeBustop.update({
        where: { id },
        data: { stopOrder: input.stopOrder },
        include,
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Route bustop assignment not found");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<RouteBustopData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Route bustop assignment not found");

    try {
      return await this.prisma.routeBustop.delete({ where: { id }, include });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Route bustop assignment not found");
      }
      throw e;
    }
  }
}

export const routeBustopService = new RouteBustopService();
