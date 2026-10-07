import prisma from "../utils/prisma";
import { isPrismaKnownErrorWithCode, parseDecimalNonNegative } from "../utils/assessmentHttp";
import {
  Direction,
  Prisma,
  Status,
  StudentTransportationRegisterStatus,
  TransportSubscriptionType,
  VehicleTripStatus,
} from "@prisma/client";
import { resolveStaffId } from "../utils/staffContext";

const include = {
  vehicle: {
    select: { id: true, vehicleNumber: true, vehicleType: true, vehicleMake: true, status: true },
  },
  vehicleTripRoutes: {
    select: {
      id: true,
      routeId: true,
      route: { select: { id: true, name: true, homeToSchoolCost: true, schoolToHomeCost: true, roundTripCost: true, status: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  driver: { select: { id: true, StaffNumber: true, name: true, email: true } },
  tripSupportStaffs: {
    select: {
      id: true,
      staffId: true,
      staff: {
        select: {
          id: true,
          StaffNumber: true,
          name: true,
          email: true,
          position: true,
          status: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
  _count: {
    select: {
      studentTransportationRegisters: true,
      tripSupportStaffs: true,
    },
  },
} satisfies Prisma.VehicleTripInclude;

type Row = Prisma.VehicleTripGetPayload<{ include: typeof include }>;

export interface VehicleTripRouteData {
  id: string;
  routeId: string;
  route: Row["vehicleTripRoutes"][number]["route"];
}

export interface VehicleTripData {
  id: string;
  label: string | null;
  vehicleId: string;
  vehicle: Row["vehicle"];
  routeIds: string[];
  routes: VehicleTripRouteData[];
  driverId: string;
  driver: Row["driver"];
  supportStaffs: Row["tripSupportStaffs"];
  startTime: Date | null;
  endTime: Date | null;
  latitude: string | null;
  longitude: string | null;
  tripDirection: Direction;
  status: VehicleTripStatus;
  createdAt: Date;
  updatedAt: Date;
  _count: Row["_count"];
}

function mapRow(row: Row): VehicleTripData {
  return {
    id: row.id,
    label: row.label,
    vehicleId: row.vehicleId,
    vehicle: row.vehicle,
    routeIds: row.vehicleTripRoutes.map((tripRoute) => tripRoute.routeId),
    routes: row.vehicleTripRoutes.map((tripRoute) => ({
      id: tripRoute.id,
      routeId: tripRoute.routeId,
      route: tripRoute.route,
    })),
    driverId: row.driverId,
    driver: row.driver,
    supportStaffs: row.tripSupportStaffs,
    startTime: row.startTime,
    endTime: row.endTime,
    latitude: row.latitude?.toString() ?? null,
    longitude: row.longitude?.toString() ?? null,
    tripDirection: row.tripDirection,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    _count: row._count,
  };
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseDateTime(value: Date | string, fieldName: string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid ${fieldName}`);
  return parsed;
}

function parseOptionalCoordinate(
  value: string | number | null | undefined,
  fieldName: string
): Prisma.Decimal | null {
  if (value === undefined || value === null || value === "") return null;
  return parseDecimalNonNegative(value, fieldName);
}

function parseOptionalLabel(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error("label must be a string or null");
  }

  const label = value.trim();
  if (!label) throw new Error("label must be a non-empty string when provided");
  if (label.length > 100) throw new Error("label must not exceed 100 characters");
  return label;
}

function parseRouteIds(routeIds: string[]): string[] {
  if (!Array.isArray(routeIds) || routeIds.length === 0) {
    throw new Error("routeIds must be a non-empty array");
  }

  const normalized = routeIds.map((id, index) => {
    if (typeof id !== "string" || !id.trim()) {
      throw new Error(`routeIds[${index}] must be a non-empty string`);
    }
    return id.trim();
  });

  const uniqueRouteIds = [...new Set(normalized)];
  if (uniqueRouteIds.length !== normalized.length) {
    throw new Error("Duplicate routeId in routeIds");
  }

  return uniqueRouteIds;
}

const ACTIVE_TRIP_STATUSES: VehicleTripStatus[] = [
  VehicleTripStatus.Pending,
  VehicleTripStatus.InProgress,
];

function isActiveTripStatus(status: VehicleTripStatus): boolean {
  return ACTIVE_TRIP_STATUSES.includes(status);
}

export class VehicleTripService {
  private prisma = prisma;

  private async assertRefs(input: {
    vehicleId: string;
    routeIds: string[];
    driverId: string;
  }): Promise<void> {
    const [vehicle, driver, routes] = await Promise.all([
      this.prisma.vehicle.findUnique({ where: { id: input.vehicleId }, select: { id: true } }),
      this.prisma.staff.findUnique({ where: { id: input.driverId }, select: { id: true } }),
      this.prisma.route.findMany({
        where: { id: { in: input.routeIds } },
        select: { id: true },
      }),
    ]);
    if (!vehicle) throw new Error("Invalid vehicleId");
    if (!driver) throw new Error("Invalid driverId");
    if (routes.length !== input.routeIds.length) {
      throw new Error("Invalid routeId in routeIds");
    }
  }

  /** Pending and InProgress count as active; a vehicle may have only one. */
  private async assertNoActiveTripForVehicle(
    vehicleId: string,
    excludeTripId?: string
  ): Promise<void> {
    const active = await this.prisma.vehicleTrip.findFirst({
      where: {
        vehicleId,
        status: { in: ACTIVE_TRIP_STATUSES },
        ...(excludeTripId ? { id: { not: excludeTripId } } : {}),
      },
      select: { id: true, status: true },
    });
    if (active) {
      throw new Error(
        "Vehicle already has an active trip (Pending or InProgress). Complete or cancel it before starting a new one"
      );
    }
  }

  private async replaceTripRoutes(vehicleTripId: string, routeIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.vehicleTripRoute.deleteMany({ where: { vehicleTripId } }),
      ...routeIds.map((routeId) =>
        this.prisma.vehicleTripRoute.create({
          data: { vehicleTripId, routeId },
        })
      ),
    ]);
  }

  async create(input: {
    label?: string | null;
    vehicleId: string;
    routeIds: string[];
    driverId?: string | null;
    authenticatedUserId?: string | null;
    startTime?: Date | string | null;
    endTime?: Date | string | null;
    latitude?: string | number | null;
    longitude?: string | number | null;
    tripDirection?: Direction;
    status?: VehicleTripStatus;
  }): Promise<VehicleTripData> {
    const vehicleId = input.vehicleId.trim();
    const routeIds = parseRouteIds(input.routeIds);
    if (!vehicleId) {
      throw new Error("vehicleId and routeIds are required");
    }

    let driverId =
      input.driverId === undefined || input.driverId === null ? "" : String(input.driverId).trim();

    if (!driverId) {
      const userId = input.authenticatedUserId?.trim();
      if (!userId) {
        throw new Error("Unauthorized");
      }
      driverId = await resolveStaffId(userId);
    }

    await this.assertRefs({ vehicleId, routeIds, driverId });

    const status = input.status ?? VehicleTripStatus.Pending;
    if (isActiveTripStatus(status)) {
      await this.assertNoActiveTripForVehicle(vehicleId);
    }

    const startTime =
      input.startTime === undefined || input.startTime === null
        ? null
        : parseDateTime(input.startTime, "startTime");
    const endTime =
      input.endTime === undefined || input.endTime === null
        ? null
        : parseDateTime(input.endTime, "endTime");
    const label = parseOptionalLabel(input.label) ?? null;
    if (startTime && endTime && startTime > endTime) {
      throw new Error("startTime cannot be greater than endTime");
    }

    const row = await this.prisma.vehicleTrip.create({
      data: {
        label,
        vehicleId,
        driverId,
        startTime,
        endTime,
        latitude: parseOptionalCoordinate(input.latitude, "latitude"),
        longitude: parseOptionalCoordinate(input.longitude, "longitude"),
        ...(input.tripDirection !== undefined ? { tripDirection: input.tripDirection } : {}),
        status,
        vehicleTripRoutes: {
          create: routeIds.map((routeId) => ({ routeId })),
        },
      },
      include,
    });
    return mapRow(row);
  }

  async list(
    params: {
      label?: string;
      vehicleId?: string;
      routeId?: string;
      driverId?: string;
      status?: VehicleTripStatus;
      tripDirection?: Direction;
      fromDate?: string;
      toDate?: string;
      page?: number;
      limit?: number;
    } = {}
  ) {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.VehicleTripWhereInput = {};
    if (params.label?.trim()) {
      where.label = { contains: params.label.trim() };
    }
    if (params.vehicleId?.trim()) where.vehicleId = params.vehicleId.trim();
    if (params.routeId?.trim()) {
      where.vehicleTripRoutes = { some: { routeId: params.routeId.trim() } };
    }
    if (params.driverId?.trim()) where.driverId = params.driverId.trim();
    if (params.status !== undefined) where.status = params.status;
    if (params.tripDirection !== undefined) where.tripDirection = params.tripDirection;

    const dateFilter: Prisma.DateTimeFilter = {};
    if (params.fromDate?.trim()) dateFilter.gte = parseDateTime(params.fromDate.trim(), "fromDate");
    if (params.toDate?.trim()) dateFilter.lte = parseDateTime(params.toDate.trim(), "toDate");
    if (Object.keys(dateFilter).length > 0) {
      where.OR = [{ startTime: dateFilter }, { createdAt: dateFilter }];
    }

    const [total, rows] = await Promise.all([
      this.prisma.vehicleTrip.count({ where }),
      this.prisma.vehicleTrip.findMany({
        where,
        include,
        orderBy: [{ startTime: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
    ]);

    return {
      vehicleTrips: rows.map(mapRow),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async listForAuthenticatedStaff(
    userId: string,
    params: { fromDate?: string; toDate?: string } = {}
  ): Promise<{ staffId: string; vehicleTrips: VehicleTripData[] }> {
    const staffId = await resolveStaffId(userId);
    const now = new Date();
    const fromDate = params.fromDate?.trim()
      ? parseDateTime(params.fromDate.trim(), "fromDate")
      : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const toDate = params.toDate?.trim()
      ? parseDateTime(params.toDate.trim(), "toDate")
      : new Date(now.getTime() + 24 * 60 * 60 * 1000);
    if (fromDate > toDate) {
      throw new Error("fromDate cannot be greater than toDate");
    }

    const rows = await this.prisma.vehicleTrip.findMany({
      where: {
        createdAt: { gte: fromDate, lte: toDate },
        OR: [
          { driverId: staffId },
          { tripSupportStaffs: { some: { staffId } } },
        ],
      },
      include,
      orderBy: [{ startTime: "desc" }, { createdAt: "desc" }],
    });

    const statusOrder: Record<VehicleTripStatus, number> = {
      [VehicleTripStatus.Pending]: 0,
      [VehicleTripStatus.InProgress]: 1,
      [VehicleTripStatus.Completed]: 2,
      [VehicleTripStatus.Cancelled]: 3,
    };
    rows.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

    return { staffId, vehicleTrips: rows.map(mapRow) };
  }

  async getById(id: string): Promise<VehicleTripData | null> {
    const row = await this.prisma.vehicleTrip.findUnique({ where: { id }, include });
    return row ? mapRow(row) : null;
  }

  async addSupportStaff(vehicleTripId: string, staffId: string): Promise<VehicleTripData> {
    const tripId = vehicleTripId.trim();
    const normalizedStaffId = staffId.trim();
    if (!tripId) throw new Error("vehicleTripId is required");
    if (!normalizedStaffId) throw new Error("staffId is required");

    const [trip, staff] = await Promise.all([
      this.prisma.vehicleTrip.findUnique({ where: { id: tripId }, select: { id: true } }),
      this.prisma.staff.findUnique({ where: { id: normalizedStaffId }, select: { id: true } }),
    ]);
    if (!trip) throw new Error("Vehicle trip not found");
    if (!staff) throw new Error("Staff not found");

    try {
      await this.prisma.tripSupportStaff.create({
        data: { vehicleTripId: tripId, staffId: normalizedStaffId },
      });
    } catch (error) {
      if (isPrismaKnownErrorWithCode(error) && error.code === "P2002") {
        throw new Error("Staff is already assigned to this vehicle trip");
      }
      throw error;
    }

    const updated = await this.getById(tripId);
    if (!updated) throw new Error("Vehicle trip not found");
    return updated;
  }

  async removeSupportStaff(vehicleTripId: string, staffId: string): Promise<VehicleTripData> {
    const tripId = vehicleTripId.trim();
    const normalizedStaffId = staffId.trim();
    if (!tripId) throw new Error("vehicleTripId is required");
    if (!normalizedStaffId) throw new Error("staffId is required");

    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: { id: true },
    });
    if (!trip) throw new Error("Vehicle trip not found");

    const assignment = await this.prisma.tripSupportStaff.findUnique({
      where: {
        staffId_vehicleTripId: {
          staffId: normalizedStaffId,
          vehicleTripId: tripId,
        },
      },
      select: { id: true },
    });
    if (!assignment) throw new Error("Support staff assignment not found");

    await this.prisma.tripSupportStaff.delete({ where: { id: assignment.id } });

    const updated = await this.getById(tripId);
    if (!updated) throw new Error("Vehicle trip not found");
    return updated;
  }

  async update(
    id: string,
    input: {
      label?: string | null;
      startTime?: Date | string | null;
      endTime?: Date | string | null;
      latitude?: string | number | null;
      longitude?: string | number | null;
      driverId?: string;
      routeIds?: string[];
      tripDirection?: Direction;
      status?: VehicleTripStatus;
    }
  ): Promise<VehicleTripData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Vehicle trip not found");
    const label = parseOptionalLabel(input.label);

    if (input.driverId !== undefined) {
      if (!input.driverId.trim()) throw new Error("driverId cannot be empty");
      const driver = await this.prisma.staff.findUnique({
        where: { id: input.driverId.trim() },
        select: { id: true },
      });
      if (!driver) throw new Error("Invalid driverId");
    }

    let nextRouteIds: string[] | undefined;
    if (input.routeIds !== undefined) {
      nextRouteIds = parseRouteIds(input.routeIds);
      const routes = await this.prisma.route.findMany({
        where: { id: { in: nextRouteIds } },
        select: { id: true },
      });
      if (routes.length !== nextRouteIds.length) {
        throw new Error("Invalid routeId in routeIds");
      }
    }

    const transitioningToInProgress =
      input.status === VehicleTripStatus.InProgress &&
      existing.status !== VehicleTripStatus.InProgress;

    if (transitioningToInProgress) {
      if (input.startTime === undefined || input.startTime === null) {
        throw new Error("startTime is required when status is changing to InProgress");
      }
    }

    // startTime may be updated freely while already InProgress; null is only allowed otherwise
    if (
      input.startTime === null &&
      (existing.status === VehicleTripStatus.InProgress ||
        input.status === VehicleTripStatus.InProgress)
    ) {
      throw new Error("startTime cannot be null while status is InProgress");
    }

    const startTime =
      input.startTime === undefined
        ? undefined
        : input.startTime === null
          ? null
          : parseDateTime(input.startTime, "startTime");
    const endTime =
      input.endTime === undefined
        ? undefined
        : input.endTime === null
          ? null
          : parseDateTime(input.endTime, "endTime");

    const effectiveStart = startTime !== undefined ? startTime : existing.startTime;
    const effectiveEnd = endTime !== undefined ? endTime : existing.endTime;
    if (effectiveStart && effectiveEnd && effectiveStart > effectiveEnd) {
      throw new Error("startTime cannot be greater than endTime");
    }

    let nextStatus = input.status ?? existing.status;
    if (effectiveEnd !== null) {
      nextStatus =
        existing._count.studentTransportationRegisters > 0
          ? VehicleTripStatus.Completed
          : VehicleTripStatus.Cancelled;
    }

    if (isActiveTripStatus(nextStatus)) {
      await this.assertNoActiveTripForVehicle(existing.vehicleId, id);
    }

    const nextLatitude =
      input.latitude !== undefined
        ? parseOptionalCoordinate(input.latitude, "latitude")
        : undefined;
    const nextLongitude =
      input.longitude !== undefined
        ? parseOptionalCoordinate(input.longitude, "longitude")
        : undefined;

    try {
      if (nextRouteIds !== undefined) {
        await this.replaceTripRoutes(id, nextRouteIds);
      }

      const row = await this.prisma.vehicleTrip.update({
        where: { id },
        data: {
          ...(label !== undefined ? { label } : {}),
          ...(startTime !== undefined ? { startTime } : {}),
          ...(endTime !== undefined ? { endTime } : {}),
          ...(nextLatitude !== undefined ? { latitude: nextLatitude } : {}),
          ...(nextLongitude !== undefined ? { longitude: nextLongitude } : {}),
          ...(input.driverId !== undefined ? { driverId: input.driverId.trim() } : {}),
          ...(input.tripDirection !== undefined ? { tripDirection: input.tripDirection } : {}),
          ...(input.status !== undefined || effectiveEnd !== null ? { status: nextStatus } : {}),
        },
        include,
      });

      if (transitioningToInProgress && effectiveStart) {
        const pickUpLatitude =
          nextLatitude !== undefined
            ? nextLatitude
            : existing.latitude !== null
              ? new Prisma.Decimal(existing.latitude)
              : null;
        const pickUpLongitude =
          nextLongitude !== undefined
            ? nextLongitude
            : existing.longitude !== null
              ? new Prisma.Decimal(existing.longitude)
              : null;

        await this.prisma.studentTransportationRegister.updateMany({
          where: { vehicleTripId: id },
          data: {
            startTime: effectiveStart,
            status: StudentTransportationRegisterStatus.OnTransit,
            ...(pickUpLatitude !== null ? { pickUpLatitude } : {}),
            ...(pickUpLongitude !== null ? { pickUpLongitude } : {}),
          },
        });
      }

      if (effectiveEnd) {
        await this.prisma.studentTransportationRegister.updateMany({
          where: { vehicleTripId: id },
          data: {
            endTime: effectiveEnd,
            status: StudentTransportationRegisterStatus.DroppedOff,
          },
        });
      }

      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Vehicle trip not found");
      }
      throw e;
    }
  }

  async listEligibleStudents(vehicleTripId: string) {
    const tripId = vehicleTripId.trim();
    if (!tripId) throw new Error("vehicleTripId is required");

    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        label: true,
        tripDirection: true,
        status: true,
        vehicleTripRoutes: { select: { routeId: true } },
      },
    });
    if (!trip) throw new Error("Vehicle trip not found");

    const routeIds = trip.vehicleTripRoutes.map((tripRoute) => tripRoute.routeId);
    if (routeIds.length === 0) {
      return {
        vehicleTripId: trip.id,
        label: trip.label,
        tripDirection: trip.tripDirection,
        status: trip.status,
        students: [],
      };
    }

    const routeBustops = await this.prisma.routeBustop.findMany({
      where: { routeId: { in: routeIds } },
      select: { routeId: true, bustopId: true },
    });
    const bustopIds = [...new Set(routeBustops.map((row) => row.bustopId))];
    if (bustopIds.length === 0) {
      return {
        vehicleTripId: trip.id,
        label: trip.label,
        tripDirection: trip.tripDirection,
        status: trip.status,
        students: [],
      };
    }

    const allowedSubscriptionTypes =
      trip.tripDirection === Direction.HomeToSchool
        ? [TransportSubscriptionType.RoundTrip, TransportSubscriptionType.OneWaySchool]
        : [TransportSubscriptionType.RoundTrip, TransportSubscriptionType.OneWayHome];

    const [transports, registrations] = await Promise.all([
      this.prisma.studentTransport.findMany({
        where: {
          status: Status.Active,
          bustopId: { in: bustopIds },
          routeId: { in: routeIds },
          subscriptionType: { in: allowedSubscriptionTypes },
        },
        select: {
          id: true,
          studentId: true,
          routeId: true,
          bustopId: true,
          subscriptionType: true,
          status: true,
          student: {
            select: {
              id: true,
              admissionNumber: true,
              firstName: true,
              lastName: true,
              status: true,
              classId: true,
            },
          },
          route: { select: { id: true, name: true, homeToSchoolCost: true, schoolToHomeCost: true, roundTripCost: true, status: true } },
          bustop: {
            select: { id: true, name: true, latitude: true, longitude: true, status: true },
          },
        },
        orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
      }),
      this.prisma.studentTransportationRegister.findMany({
        where: { vehicleTripId: tripId },
        select: { studentId: true, id: true },
      }),
    ]);

    // Keep only students whose bustop is actually on their subscribed route within the trip routes
    const routeBustopKeys = new Set(
      routeBustops.map((row) => `${row.routeId}:${row.bustopId}`)
    );
    const registeredByStudentId = new Map(
      registrations.map((row) => [row.studentId, row.id] as const)
    );

    const students = transports
      .filter((row) => routeBustopKeys.has(`${row.routeId}:${row.bustopId}`))
      .map((row) => ({
        studentId: row.studentId,
        student: row.student,
        studentTransportId: row.id,
        subscriptionType: row.subscriptionType,
        routeId: row.routeId,
        route: row.route,
        nearestBustopId: row.bustopId,
        nearestBustop: {
          id: row.bustop.id,
          name: row.bustop.name,
          latitude: row.bustop.latitude?.toString() ?? null,
          longitude: row.bustop.longitude?.toString() ?? null,
          status: row.bustop.status,
        },
        alreadyRegistered: registeredByStudentId.has(row.studentId),
        registrationId: registeredByStudentId.get(row.studentId) ?? null,
      }));

    return {
      vehicleTripId: trip.id,
      label: trip.label,
      tripDirection: trip.tripDirection,
      status: trip.status,
      students,
    };
  }

  async delete(id: string): Promise<VehicleTripData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Vehicle trip not found");

    const registerCount = await this.prisma.studentTransportationRegister.count({
      where: { vehicleTripId: id },
    });
    if (registerCount > 0) {
      throw new Error(
        `Cannot delete vehicle trip because it has student transportation registers (${registerCount})`
      );
    }
    if (existing._count.tripSupportStaffs > 0) {
      throw new Error(
        `Cannot delete vehicle trip because it has support staff assignments (${existing._count.tripSupportStaffs})`
      );
    }

    try {
      const row = await this.prisma.vehicleTrip.delete({ where: { id }, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Vehicle trip not found");
      }
      throw e;
    }
  }
}

export const vehicleTripService = new VehicleTripService();
