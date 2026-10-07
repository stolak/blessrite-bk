import prisma from "../utils/prisma";
import { isPrismaKnownErrorWithCode, parseDecimalNonNegative } from "../utils/assessmentHttp";
import { Prisma, Status } from "@prisma/client";

const include = {
  routeBustops: {
    select: {
      id: true,
      routeId: true,
      stopOrder: true,
      route: { select: { id: true, name: true, homeToSchoolCost: true, schoolToHomeCost: true, roundTripCost: true, status: true } },
    },
    orderBy: { stopOrder: "asc" as const },
  },
  _count: { select: { routeBustops: true, studentTransports: true } },
} satisfies Prisma.BustopInclude;

type Row = Prisma.BustopGetPayload<{ include: typeof include }>;

export interface BustopData {
  id: string;
  name: string;
  description: string | null;
  latitude: string | null;
  longitude: string | null;
  status: Status;
  createdAt: Date;
  updatedAt: Date;
  routeBustops: Row["routeBustops"];
  _count: Row["_count"];
}

function mapRow(row: Row): BustopData {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    latitude: row.latitude?.toString() ?? null,
    longitude: row.longitude?.toString() ?? null,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    routeBustops: row.routeBustops,
    _count: row._count,
  };
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseOptionalCoordinate(
  value: string | number | null | undefined,
  fieldName: string
): Prisma.Decimal | null {
  if (value === undefined || value === null || value === "") return null;
  return parseDecimalNonNegative(value, fieldName);
}

export class BustopService {
  private prisma = prisma;

  async create(input: {
    name: string;
    description?: string | null;
    latitude?: string | number | null;
    longitude?: string | number | null;
    status?: Status;
  }): Promise<BustopData> {
    const name = input.name.trim();
    if (!name) throw new Error("name is required");

    try {
      const row = await this.prisma.bustop.create({
        data: {
          name,
          description:
            input.description === undefined || input.description === null
              ? null
              : String(input.description).trim() || null,
          latitude: parseOptionalCoordinate(input.latitude, "latitude"),
          longitude: parseOptionalCoordinate(input.longitude, "longitude"),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Bustop name already exists");
      }
      throw e;
    }
  }

  async list(params: {
    q?: string;
    status?: Status | "All";
    page?: number;
    limit?: number;
  } = {}) {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.BustopWhereInput = {};
    if (params.status === undefined) where.status = Status.Active;
    else if (params.status !== "All") where.status = params.status;
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [{ name: { contains: q } }, { description: { contains: q } }];
    }

    const [total, rows] = await Promise.all([
      this.prisma.bustop.count({ where }),
      this.prisma.bustop.findMany({
        where,
        include,
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
    ]);

    return {
      bustops: rows.map(mapRow),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async getById(id: string): Promise<BustopData | null> {
    const row = await this.prisma.bustop.findUnique({ where: { id }, include });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: {
      name?: string;
      description?: string | null;
      latitude?: string | number | null;
      longitude?: string | number | null;
      status?: Status;
    }
  ): Promise<BustopData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Bustop not found");
    if (input.name !== undefined && !input.name.trim()) {
      throw new Error("name cannot be empty");
    }

    try {
      const row = await this.prisma.bustop.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined
            ? {
                description:
                  input.description === null ? null : String(input.description).trim() || null,
              }
            : {}),
          ...(input.latitude !== undefined
            ? { latitude: parseOptionalCoordinate(input.latitude, "latitude") }
            : {}),
          ...(input.longitude !== undefined
            ? { longitude: parseOptionalCoordinate(input.longitude, "longitude") }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") throw new Error("Bustop not found");
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Bustop name already exists");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<BustopData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Bustop not found");

    const [routeCount, transportCount] = await Promise.all([
      this.prisma.routeBustop.count({ where: { bustopId: id } }),
      this.prisma.studentTransport.count({ where: { bustopId: id } }),
    ]);
    if (routeCount > 0 || transportCount > 0) {
      throw new Error(
        `Cannot delete bustop because it is referenced by routes (${routeCount}) or student transports (${transportCount})`
      );
    }

    try {
      const row = await this.prisma.bustop.delete({ where: { id }, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") throw new Error("Bustop not found");
      throw e;
    }
  }
}

export const bustopService = new BustopService();
