import prisma from "../utils/prisma";
import { isPrismaKnownErrorWithCode, parseDecimalNonNegative } from "../utils/assessmentHttp";
import { Prisma, Status } from "@prisma/client";

const include = {
  vehicleRoutes: {
    select: {
      id: true,
      vehicleId: true,
      vehicle: {
        select: {
          id: true,
          vehicleNumber: true,
          vehicleType: true,
          vehicleMake: true,
          status: true,
        },
      },
    },
  },
  routeBustops: {
    select: {
      id: true,
      bustopId: true,
      stopOrder: true,
      bustop: {
        select: {
          id: true,
          name: true,
          latitude: true,
          longitude: true,
          status: true,
        },
      },
    },
    orderBy: { stopOrder: "asc" as const },
  },
  _count: {
    select: {
      vehicleRoutes: true,
      routeBustops: true,
      studentTransports: true,
      vehicleTripRoutes: true,
    },
  },
} satisfies Prisma.RouteInclude;

type Row = Prisma.RouteGetPayload<{ include: typeof include }>;

export interface RouteData {
  id: string;
  name: string;
  description: string | null;
  homeToSchoolCost: string | null;
  schoolToHomeCost: string | null;
  roundTripCost: string | null;
  status: Status;
  createdAt: Date;
  updatedAt: Date;
  vehicleRoutes: Row["vehicleRoutes"];
  routeBustops: Row["routeBustops"];
  _count: Row["_count"];
}

function decimalToString(value: Prisma.Decimal | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.toString();
}

function mapRow(row: Row): RouteData {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    homeToSchoolCost: decimalToString(row.homeToSchoolCost),
    schoolToHomeCost: decimalToString(row.schoolToHomeCost),
    roundTripCost: decimalToString(row.roundTripCost),
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    vehicleRoutes: row.vehicleRoutes,
    routeBustops: row.routeBustops,
    _count: row._count,
  };
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseOptionalCost(
  value: string | number | null | undefined,
  fieldName: string
): Prisma.Decimal | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return parseDecimalNonNegative(value, fieldName);
}

export class RouteService {
  private prisma = prisma;

  async create(input: {
    name: string;
    description?: string | null;
    homeToSchoolCost?: string | number | null;
    schoolToHomeCost?: string | number | null;
    roundTripCost?: string | number | null;
    status?: Status;
  }): Promise<RouteData> {
    const name = input.name.trim();
    if (!name) throw new Error("name is required");

    const homeToSchoolCost = parseOptionalCost(input.homeToSchoolCost, "homeToSchoolCost");
    const schoolToHomeCost = parseOptionalCost(input.schoolToHomeCost, "schoolToHomeCost");
    const roundTripCost = parseOptionalCost(input.roundTripCost, "roundTripCost");

    try {
      const row = await this.prisma.route.create({
        data: {
          name,
          description:
            input.description === undefined || input.description === null
              ? null
              : String(input.description).trim() || null,
          ...(homeToSchoolCost !== undefined ? { homeToSchoolCost } : {}),
          ...(schoolToHomeCost !== undefined ? { schoolToHomeCost } : {}),
          ...(roundTripCost !== undefined ? { roundTripCost } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Route name already exists");
      }
      throw e;
    }
  }

  async list(params: {
    q?: string;
    status?: Status | "All";
    page?: number;
    limit?: number;
  } = {}): Promise<{
    routes: RouteData[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.RouteWhereInput = {};
    if (params.status === undefined) where.status = Status.Active;
    else if (params.status !== "All") where.status = params.status;
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [{ name: { contains: q } }, { description: { contains: q } }];
    }

    const [total, rows] = await Promise.all([
      this.prisma.route.count({ where }),
      this.prisma.route.findMany({
        where,
        include,
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
    ]);

    return {
      routes: rows.map(mapRow),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getById(id: string): Promise<RouteData | null> {
    const row = await this.prisma.route.findUnique({ where: { id }, include });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: {
      name?: string;
      description?: string | null;
      homeToSchoolCost?: string | number | null;
      schoolToHomeCost?: string | number | null;
      roundTripCost?: string | number | null;
      status?: Status;
    }
  ): Promise<RouteData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Route not found");

    if (input.name !== undefined && !input.name.trim()) {
      throw new Error("name cannot be empty");
    }

    const homeToSchoolCost = parseOptionalCost(input.homeToSchoolCost, "homeToSchoolCost");
    const schoolToHomeCost = parseOptionalCost(input.schoolToHomeCost, "schoolToHomeCost");
    const roundTripCost = parseOptionalCost(input.roundTripCost, "roundTripCost");

    try {
      const row = await this.prisma.route.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined
            ? {
                description:
                  input.description === null ? null : String(input.description).trim() || null,
              }
            : {}),
          ...(homeToSchoolCost !== undefined ? { homeToSchoolCost } : {}),
          ...(schoolToHomeCost !== undefined ? { schoolToHomeCost } : {}),
          ...(roundTripCost !== undefined ? { roundTripCost } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Route not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Route name already exists");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<RouteData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Route not found");

    const [assignmentCount, bustopCount, transportCount, tripCount] = await Promise.all([
      this.prisma.vehicleRoute.count({ where: { routeId: id } }),
      this.prisma.routeBustop.count({ where: { routeId: id } }),
      this.prisma.studentTransport.count({ where: { routeId: id } }),
      this.prisma.vehicleTripRoute.count({ where: { routeId: id } }),
    ]);
    if (assignmentCount > 0 || bustopCount > 0 || transportCount > 0 || tripCount > 0) {
      throw new Error(
        `Cannot delete route because it is referenced by vehicles (${assignmentCount}), bustops (${bustopCount}), student transports (${transportCount}), or trips (${tripCount})`
      );
    }

    try {
      const row = await this.prisma.route.delete({ where: { id }, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Route not found");
      }
      throw e;
    }
  }
}

export const routeService = new RouteService();
