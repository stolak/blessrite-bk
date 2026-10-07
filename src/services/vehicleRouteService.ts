import prisma from "../utils/prisma";
import { isPrismaKnownErrorWithCode } from "../utils/assessmentHttp";
import { Prisma } from "@prisma/client";

const include = {
  vehicle: {
    select: {
      id: true,
      vehicleNumber: true,
      vehicleType: true,
      vehicleMake: true,
      status: true,
      driver: { select: { id: true, name: true, StaffNumber: true } },
    },
  },
  route: { select: { id: true, name: true, description: true, homeToSchoolCost: true, schoolToHomeCost: true, roundTripCost: true, status: true } },
} satisfies Prisma.VehicleRouteInclude;

export type VehicleRouteData = Prisma.VehicleRouteGetPayload<{ include: typeof include }>;

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export class VehicleRouteService {
  private prisma = prisma;

  private async assertRefs(vehicleId: string, routeId: string): Promise<void> {
    const [vehicle, route] = await Promise.all([
      this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } }),
      this.prisma.route.findUnique({ where: { id: routeId }, select: { id: true } }),
    ]);
    if (!vehicle) throw new Error("Invalid vehicleId");
    if (!route) throw new Error("Invalid routeId");
  }

  async create(input: { vehicleId: string; routeId: string }): Promise<VehicleRouteData> {
    const vehicleId = input.vehicleId.trim();
    const routeId = input.routeId.trim();
    if (!vehicleId || !routeId) throw new Error("vehicleId and routeId are required");

    await this.assertRefs(vehicleId, routeId);

    try {
      return await this.prisma.vehicleRoute.create({
        data: { vehicleId, routeId },
        include,
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Vehicle is already assigned to this route");
      }
      throw e;
    }
  }

  async createMany(input: {
    vehicleId: string;
    routeIds: string[];
  }): Promise<{ vehicleRoutes: VehicleRouteData[]; count: number }> {
    const vehicleId = input.vehicleId.trim();
    if (!vehicleId) throw new Error("vehicleId is required");
    if (!Array.isArray(input.routeIds) || input.routeIds.length === 0) {
      throw new Error("routeIds must be a non-empty array");
    }

    const routeIds = input.routeIds.map((id, index) => {
      if (typeof id !== "string" || !id.trim()) {
        throw new Error(`routeIds[${index}] must be a non-empty string`);
      }
      return id.trim();
    });

    const uniqueRouteIds = [...new Set(routeIds)];
    if (uniqueRouteIds.length !== routeIds.length) {
      throw new Error("Duplicate routeId in request");
    }

    const [vehicle, routes] = await Promise.all([
      this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } }),
      this.prisma.route.findMany({
        where: { id: { in: uniqueRouteIds } },
        select: { id: true },
      }),
    ]);
    if (!vehicle) throw new Error("Invalid vehicleId");
    if (routes.length !== uniqueRouteIds.length) {
      throw new Error("Invalid routeId in routeIds");
    }

    try {
      const rows = await this.prisma.$transaction(
        uniqueRouteIds.map((routeId) =>
          this.prisma.vehicleRoute.upsert({
            where: {
              vehicleId_routeId: { vehicleId, routeId },
            },
            create: { vehicleId, routeId },
            update: {},
            include,
          })
        )
      );
      return { vehicleRoutes: rows, count: rows.length };
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Vehicle is already assigned to one of the routes");
      }
      throw e;
    }
  }

  async list(params: {
    vehicleId?: string;
    routeId?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    vehicleRoutes: VehicleRouteData[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.VehicleRouteWhereInput = {};
    if (params.vehicleId?.trim()) where.vehicleId = params.vehicleId.trim();
    if (params.routeId?.trim()) where.routeId = params.routeId.trim();

    const [total, rows] = await Promise.all([
      this.prisma.vehicleRoute.count({ where }),
      this.prisma.vehicleRoute.findMany({
        where,
        include,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return {
      vehicleRoutes: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getById(id: string): Promise<VehicleRouteData | null> {
    return this.prisma.vehicleRoute.findUnique({ where: { id }, include });
  }

  async delete(id: string): Promise<VehicleRouteData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Vehicle route assignment not found");

    try {
      return await this.prisma.vehicleRoute.delete({ where: { id }, include });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Vehicle route assignment not found");
      }
      throw e;
    }
  }
}

export const vehicleRouteService = new VehicleRouteService();
