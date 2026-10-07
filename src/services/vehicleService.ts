import prisma from "../utils/prisma";
import { isPrismaKnownErrorWithCode } from "../utils/assessmentHttp";
import { Prisma, Status, VehicleMake, VehicleType } from "@prisma/client";
import { resolveStaffId } from "../utils/staffContext";

const include = {
  driver: {
    select: { id: true, StaffNumber: true, name: true, email: true, status: true },
  },
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
  vehicleRoutes: {
    select: {
      id: true,
      routeId: true,
      route: { select: { id: true, name: true, description: true, homeToSchoolCost: true, schoolToHomeCost: true, roundTripCost: true, status: true } },
      createdAt: true,
    },
  },
  _count: { select: { vehicleRoutes: true, vehicleTrips: true } },
} satisfies Prisma.VehicleInclude;

type Row = Prisma.VehicleGetPayload<{ include: typeof include }>;

export interface VehicleData {
  id: string;
  vehicleNumber: string;
  vehicleType: VehicleType;
  vehicleMake: VehicleMake | null;
  capacity: number;
  driverId: string | null;
  driver: Row["driver"];
  status: Status;
  remarks: string | null;
  createdById: string;
  userId: string | null;
  user: Row["user"];
  createdAt: Date;
  updatedAt: Date;
  vehicleRoutes: Row["vehicleRoutes"];
  _count: Row["_count"];
}

function mapRow(row: Row): VehicleData {
  return {
    id: row.id,
    vehicleNumber: row.vehicleNumber,
    vehicleType: row.vehicleType,
    vehicleMake: row.vehicleMake,
    capacity: row.capacity,
    driverId: row.driverId,
    driver: row.driver,
    status: row.status,
    remarks: row.remarks,
    createdById: row.createdById,
    userId: row.userId,
    user: row.user,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    vehicleRoutes: row.vehicleRoutes,
    _count: row._count,
  };
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function trimRemarks(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export class VehicleService {
  private prisma = prisma;

  private async assertDriver(driverId: string): Promise<void> {
    const driver = await this.prisma.staff.findUnique({
      where: { id: driverId },
      select: { id: true },
    });
    if (!driver) throw new Error("Invalid driverId");
  }

  private async assertUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new Error("Invalid userId");
  }

  async create(input: {
    vehicleNumber: string;
    vehicleType?: VehicleType;
    vehicleMake?: VehicleMake | null;
    capacity?: number;
    driverId?: string | null;
    status?: Status;
    remarks?: string | null;
    createdById: string;
    userId?: string | null;
  }): Promise<VehicleData> {
    const vehicleNumber = input.vehicleNumber.trim();
    const createdById = input.createdById.trim();
    const driverId =
      input.driverId === undefined || input.driverId === null
        ? null
        : String(input.driverId).trim() || null;
    const userId = input.userId?.trim() || null;

    if (!vehicleNumber) throw new Error("vehicleNumber is required");
    if (!createdById) throw new Error("createdById is required");
    if (input.capacity !== undefined && (!Number.isInteger(input.capacity) || input.capacity < 1)) {
      throw new Error("capacity must be a positive integer");
    }

    if (driverId) await this.assertDriver(driverId);
    if (userId) await this.assertUser(userId);

    try {
      const row = await this.prisma.vehicle.create({
        data: {
          vehicleNumber,
          driverId,
          createdById,
          ...(input.vehicleType !== undefined ? { vehicleType: input.vehicleType } : {}),
          ...(input.vehicleMake !== undefined ? { vehicleMake: input.vehicleMake } : {}),
          ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          remarks: trimRemarks(input.remarks),
          userId,
        },
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Vehicle number already exists");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Invalid driverId or userId");
      }
      throw e;
    }
  }

  async list(params: {
    q?: string;
    status?: Status | "All";
    vehicleType?: VehicleType;
    vehicleMake?: VehicleMake;
    driverId?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    vehicles: VehicleData[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.VehicleWhereInput = {};
    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }
    if (params.vehicleType) where.vehicleType = params.vehicleType;
    if (params.vehicleMake) where.vehicleMake = params.vehicleMake;
    if (params.driverId?.trim()) where.driverId = params.driverId.trim();
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [{ vehicleNumber: { contains: q } }, { remarks: { contains: q } }];
    }

    const [total, rows] = await Promise.all([
      this.prisma.vehicle.count({ where }),
      this.prisma.vehicle.findMany({
        where,
        include,
        orderBy: { vehicleNumber: "asc" },
        skip,
        take: limit,
      }),
    ]);

    return {
      vehicles: rows.map(mapRow),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getById(id: string): Promise<VehicleData | null> {
    const row = await this.prisma.vehicle.findUnique({ where: { id }, include });
    return row ? mapRow(row) : null;
  }

  /**
   * Lists vehicles assigned to the staff profile linked to the authenticated user
   * (Vehicle.driverId = Staff.id where Staff.userId = userId).
   */
  async listForAuthenticatedStaff(
    userId: string,
    params: {
      q?: string;
      status?: Status | "All";
      vehicleType?: VehicleType;
      vehicleMake?: VehicleMake;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    staffId: string;
    vehicles: VehicleData[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const staffId = await resolveStaffId(userId);
    const result = await this.list({
      ...params,
      driverId: staffId,
    });
    return { staffId, ...result };
  }

  async update(
    id: string,
    input: {
      vehicleNumber?: string;
      vehicleType?: VehicleType;
      vehicleMake?: VehicleMake | null;
      capacity?: number;
      driverId?: string | null;
      status?: Status;
      remarks?: string | null;
      userId?: string | null;
    }
  ): Promise<VehicleData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Vehicle not found");

    if (input.vehicleNumber !== undefined && !input.vehicleNumber.trim()) {
      throw new Error("vehicleNumber cannot be empty");
    }
    if (input.capacity !== undefined && (!Number.isInteger(input.capacity) || input.capacity < 1)) {
      throw new Error("capacity must be a positive integer");
    }

    let driverId: string | null | undefined = undefined;
    if (input.driverId !== undefined) {
      driverId =
        input.driverId === null ? null : String(input.driverId).trim() || null;
      if (driverId) await this.assertDriver(driverId);
    }

    if (input.userId !== undefined && input.userId !== null && input.userId.trim()) {
      await this.assertUser(input.userId.trim());
    }

    try {
      const row = await this.prisma.vehicle.update({
        where: { id },
        data: {
          ...(input.vehicleNumber !== undefined
            ? { vehicleNumber: input.vehicleNumber.trim() }
            : {}),
          ...(input.vehicleType !== undefined ? { vehicleType: input.vehicleType } : {}),
          ...(input.vehicleMake !== undefined ? { vehicleMake: input.vehicleMake } : {}),
          ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
          ...(driverId !== undefined ? { driverId } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.remarks !== undefined ? { remarks: trimRemarks(input.remarks) } : {}),
          ...(input.userId !== undefined
            ? { userId: input.userId === null ? null : input.userId.trim() || null }
            : {}),
        },
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Vehicle not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Vehicle number already exists");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Invalid driverId or userId");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<VehicleData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Vehicle not found");

    const [assignmentCount, tripCount] = await Promise.all([
      this.prisma.vehicleRoute.count({ where: { vehicleId: id } }),
      this.prisma.vehicleTrip.count({ where: { vehicleId: id } }),
    ]);
    if (assignmentCount > 0 || tripCount > 0) {
      throw new Error(
        `Cannot delete vehicle because it is assigned to routes (${assignmentCount}) or has trips (${tripCount})`
      );
    }

    try {
      const row = await this.prisma.vehicle.delete({ where: { id }, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Vehicle not found");
      }
      throw e;
    }
  }
}

export const vehicleService = new VehicleService();
