import prisma from "../utils/prisma";
import { isPrismaKnownErrorWithCode, parseDecimalNonNegative } from "../utils/assessmentHttp";
import {
  Direction,
  Prisma,
  Status,
  StudentStatus,
  StudentTransportationRegisterStatus,
  TransportSubscriptionType,
  VehicleTripStatus,
} from "@prisma/client";
import { resolveParentGuardianEmail } from "../utils/studentContext";

const include = {
  student: {
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      lastName: true,
      status: true,
    },
  },
  bustop: { select: { id: true, name: true, latitude: true, longitude: true } },
  vehicleTrip: {
    select: {
      id: true,
      label: true,
      vehicleId: true,
      driverId: true,
      startTime: true,
      endTime: true,
      status: true,
      tripDirection: true,
      latitude: true,
      longitude: true,
      vehicle: {
        select: {
          id: true,
          vehicleNumber: true,
          vehicleType: true,
          vehicleMake: true,
          status: true,
        },
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
    },
  },
} satisfies Prisma.StudentTransportationRegisterInclude;

type Row = Prisma.StudentTransportationRegisterGetPayload<{ include: typeof include }>;

export interface StudentTransportationRegisterData {
  id: string;
  studentId: string;
  student: Row["student"];
  nearestBustopId: string;
  bustop: Row["bustop"];
  vehicleTripId: string;
  vehicleTrip: Row["vehicleTrip"];
  startTime: Date | null;
  endTime: Date | null;
  direction: Direction;
  status: StudentTransportationRegisterStatus;
  pickUpLatitude: string | null;
  pickUpLongitude: string | null;
  dropOffLatitude: string | null;
  dropOffLongitude: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapRow(row: Row): StudentTransportationRegisterData {
  return {
    id: row.id,
    studentId: row.studentId,
    student: row.student,
    nearestBustopId: row.nearestBustopId,
    bustop: row.bustop,
    vehicleTripId: row.vehicleTripId,
    vehicleTrip: row.vehicleTrip,
    startTime: row.startTime,
    endTime: row.endTime,
    direction: row.direction,
    status: row.status,
    pickUpLatitude: row.pickUpLatitude?.toString() ?? null,
    pickUpLongitude: row.pickUpLongitude?.toString() ?? null,
    dropOffLatitude: row.dropOffLatitude?.toString() ?? null,
    dropOffLongitude: row.dropOffLongitude?.toString() ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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

function deriveRegisterStatus(input: {
  tripStatus: VehicleTripStatus;
  endTime: Date | null;
}): StudentTransportationRegisterStatus {
  if (input.endTime) return StudentTransportationRegisterStatus.DroppedOff;
  if (input.tripStatus === VehicleTripStatus.InProgress) {
    return StudentTransportationRegisterStatus.OnTransit;
  }
  return StudentTransportationRegisterStatus.Boarding;
}

function assertSubscriptionAllowsDirection(
  subscriptionType: TransportSubscriptionType,
  tripDirection: Direction
): void {
  if (tripDirection === Direction.HomeToSchool) {
    if (
      subscriptionType !== TransportSubscriptionType.RoundTrip &&
      subscriptionType !== TransportSubscriptionType.OneWaySchool
    ) {
      throw new Error(
        "Student cannot be registered for HomeToSchool trip (requires RoundTrip or OneWaySchool subscription)"
      );
    }
    return;
  }

  if (
    subscriptionType !== TransportSubscriptionType.RoundTrip &&
    subscriptionType !== TransportSubscriptionType.OneWayHome
  ) {
    throw new Error(
      "Student cannot be registered for SchoolToHome trip (requires RoundTrip or OneWayHome subscription)"
    );
  }
}

export class StudentTransportationRegisterService {
  private prisma = prisma;

  /** Resolves bustop and direction from the student's latest active transport subscription and trip. */
  private async resolveRegistrationContext(input: {
    studentId: string;
    vehicleTripId: string;
  }): Promise<{
    nearestBustopId: string;
    direction: Direction;
    tripStatus: VehicleTripStatus;
  }> {
    const [student, vehicleTrip, subscription] = await Promise.all([
      this.prisma.student.findUnique({ where: { id: input.studentId }, select: { id: true } }),
      this.prisma.vehicleTrip.findUnique({
        where: { id: input.vehicleTripId },
        select: {
          id: true,
          tripDirection: true,
          status: true,
          vehicleTripRoutes: { select: { routeId: true } },
        },
      }),
      this.prisma.studentTransport.findFirst({
        where: { studentId: input.studentId, status: Status.Active },
        orderBy: { updatedAt: "desc" },
        select: { bustopId: true, routeId: true, subscriptionType: true },
      }),
    ]);

    if (!student) throw new Error("Invalid studentId");
    if (!vehicleTrip) throw new Error("Invalid vehicleTripId");
    if (!subscription) throw new Error("Student has no active transport subscription");

    assertSubscriptionAllowsDirection(subscription.subscriptionType, vehicleTrip.tripDirection);

    const tripRouteIds = vehicleTrip.vehicleTripRoutes.map((tripRoute) => tripRoute.routeId);
    if (!tripRouteIds.includes(subscription.routeId)) {
      throw new Error("Student transport route does not match any vehicle trip route");
    }

    const routeBustop = await this.prisma.routeBustop.findUnique({
      where: {
        routeId_bustopId: { routeId: subscription.routeId, bustopId: subscription.bustopId },
      },
      select: { id: true },
    });
    if (!routeBustop) {
      throw new Error("Student bustop is not assigned to the vehicle trip route");
    }

    return {
      nearestBustopId: subscription.bustopId,
      direction: vehicleTrip.tripDirection,
      tripStatus: vehicleTrip.status,
    };
  }

  async create(input: {
    studentId: string;
    vehicleTripId: string;
    startTime?: Date | string | null;
    endTime?: Date | string | null;
    pickUpLatitude?: string | number | null;
    pickUpLongitude?: string | number | null;
    dropOffLatitude?: string | number | null;
    dropOffLongitude?: string | number | null;
  }): Promise<StudentTransportationRegisterData> {
    const studentId = input.studentId.trim();
    const vehicleTripId = input.vehicleTripId.trim();

    if (!studentId || !vehicleTripId) {
      throw new Error("studentId and vehicleTripId are required");
    }

    const { nearestBustopId, direction, tripStatus } = await this.resolveRegistrationContext({
      studentId,
      vehicleTripId,
    });

    if (
      tripStatus === VehicleTripStatus.Completed ||
      tripStatus === VehicleTripStatus.Cancelled
    ) {
      throw new Error("Cannot register for a trip that is Completed or Cancelled");
    }

    if (direction === Direction.HomeToSchool && tripStatus === VehicleTripStatus.Pending) {
      throw new Error("HomeToSchool trip must have started before a student can register");
    }

    const tripStarted = tripStatus === VehicleTripStatus.InProgress;
    if (tripStarted && (input.startTime === undefined || input.startTime === null)) {
      throw new Error("startTime is required because the vehicle trip has already started");
    }

    const existingRegistration = await this.prisma.studentTransportationRegister.findUnique({
      where: {
        studentId_vehicleTripId: { studentId, vehicleTripId },
      },
      select: { id: true },
    });
    if (existingRegistration) {
      throw new Error("Student is already registered for this vehicle trip");
    }

    const startTime =
      input.startTime === undefined || input.startTime === null
        ? null
        : parseDateTime(input.startTime, "startTime");
    const endTime =
      input.endTime === undefined || input.endTime === null
        ? null
        : parseDateTime(input.endTime, "endTime");
    if (startTime && endTime && endTime < startTime) {
      throw new Error("endTime must be greater than or equal to startTime");
    }

    try {
      const row = await this.prisma.studentTransportationRegister.create({
        data: {
          studentId,
          nearestBustopId,
          vehicleTripId,
          startTime,
          endTime,
          direction,
          status: deriveRegisterStatus({ tripStatus, endTime }),
          pickUpLatitude: parseOptionalCoordinate(input.pickUpLatitude, "pickUpLatitude"),
          pickUpLongitude: parseOptionalCoordinate(input.pickUpLongitude, "pickUpLongitude"),
          dropOffLatitude: parseOptionalCoordinate(input.dropOffLatitude, "dropOffLatitude"),
          dropOffLongitude: parseOptionalCoordinate(input.dropOffLongitude, "dropOffLongitude"),
        },
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Student is already registered for this vehicle trip");
      }
      throw e;
    }
  }

  /**
   * Bulk registration for SchoolToHome trips only.
   * Shared optional startTime/coords apply to every student in the batch.
   */
  async createMany(input: {
    vehicleTripId: string;
    studentIds: string[];
    startTime?: Date | string | null;
    endTime?: Date | string | null;
    pickUpLatitude?: string | number | null;
    pickUpLongitude?: string | number | null;
    dropOffLatitude?: string | number | null;
    dropOffLongitude?: string | number | null;
  }): Promise<{ studentTransportationRegisters: StudentTransportationRegisterData[]; count: number }> {
    const vehicleTripId = input.vehicleTripId.trim();
    if (!vehicleTripId) throw new Error("vehicleTripId is required");
    if (!Array.isArray(input.studentIds) || input.studentIds.length === 0) {
      throw new Error("studentIds must be a non-empty array");
    }

    const studentIds = input.studentIds.map((id, index) => {
      if (typeof id !== "string" || !id.trim()) {
        throw new Error(`studentIds[${index}] must be a non-empty string`);
      }
      return id.trim();
    });
    const uniqueStudentIds = [...new Set(studentIds)];
    if (uniqueStudentIds.length !== studentIds.length) {
      throw new Error("Duplicate studentId in studentIds");
    }

    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: vehicleTripId },
      select: { id: true, tripDirection: true, status: true },
    });
    if (!trip) throw new Error("Invalid vehicleTripId");

    if (trip.tripDirection !== Direction.SchoolToHome) {
      throw new Error("Bulk registration is only allowed for SchoolToHome trips");
    }

    if (
      trip.status === VehicleTripStatus.Completed ||
      trip.status === VehicleTripStatus.Cancelled
    ) {
      throw new Error("Cannot register for a trip that is Completed or Cancelled");
    }

    if (
      trip.status === VehicleTripStatus.InProgress &&
      (input.startTime === undefined || input.startTime === null)
    ) {
      throw new Error("startTime is required because the vehicle trip has already started");
    }

    const startTime =
      input.startTime === undefined || input.startTime === null
        ? null
        : parseDateTime(input.startTime, "startTime");
    const endTime =
      input.endTime === undefined || input.endTime === null
        ? null
        : parseDateTime(input.endTime, "endTime");
    if (startTime && endTime && endTime < startTime) {
      throw new Error("endTime must be greater than or equal to startTime");
    }

    const pickUpLatitude = parseOptionalCoordinate(input.pickUpLatitude, "pickUpLatitude");
    const pickUpLongitude = parseOptionalCoordinate(input.pickUpLongitude, "pickUpLongitude");
    const dropOffLatitude = parseOptionalCoordinate(input.dropOffLatitude, "dropOffLatitude");
    const dropOffLongitude = parseOptionalCoordinate(input.dropOffLongitude, "dropOffLongitude");

    const existing = await this.prisma.studentTransportationRegister.findMany({
      where: {
        vehicleTripId,
        studentId: { in: uniqueStudentIds },
      },
      select: { studentId: true },
    });
    if (existing.length > 0) {
      throw new Error(
        `Student is already registered for this vehicle trip (${existing.map((r) => r.studentId).join(", ")})`
      );
    }

    const contexts = await Promise.all(
      uniqueStudentIds.map(async (studentId) => {
        const ctx = await this.resolveRegistrationContext({ studentId, vehicleTripId });
        return { studentId, ...ctx };
      })
    );

    try {
      const rows = await this.prisma.$transaction(
        contexts.map((ctx) =>
          this.prisma.studentTransportationRegister.create({
            data: {
              studentId: ctx.studentId,
              nearestBustopId: ctx.nearestBustopId,
              vehicleTripId,
              startTime,
              endTime,
              direction: Direction.SchoolToHome,
              status: deriveRegisterStatus({ tripStatus: trip.status, endTime }),
              pickUpLatitude,
              pickUpLongitude,
              dropOffLatitude,
              dropOffLongitude,
            },
            include,
          })
        )
      );

      return {
        studentTransportationRegisters: rows.map(mapRow),
        count: rows.length,
      };
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Student is already registered for this vehicle trip");
      }
      throw e;
    }
  }

  async list(
    params: {
      studentId?: string;
      nearestBustopId?: string;
      vehicleTripId?: string;
      direction?: Direction;
      status?: StudentTransportationRegisterStatus;
      fromDate?: string;
      toDate?: string;
      page?: number;
      limit?: number;
    } = {}
  ) {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.StudentTransportationRegisterWhereInput = {};
    if (params.studentId?.trim()) where.studentId = params.studentId.trim();
    if (params.nearestBustopId?.trim()) where.nearestBustopId = params.nearestBustopId.trim();
    if (params.vehicleTripId?.trim()) where.vehicleTripId = params.vehicleTripId.trim();
    if (params.direction !== undefined) where.direction = params.direction;
    if (params.status !== undefined) where.status = params.status;

    const dateFilter: Prisma.DateTimeFilter = {};
    if (params.fromDate?.trim()) dateFilter.gte = parseDateTime(params.fromDate.trim(), "fromDate");
    if (params.toDate?.trim()) dateFilter.lte = parseDateTime(params.toDate.trim(), "toDate");
    if (Object.keys(dateFilter).length > 0) {
      where.OR = [{ startTime: dateFilter }, { createdAt: dateFilter }];
    }

    const [total, rows] = await Promise.all([
      this.prisma.studentTransportationRegister.count({ where }),
      this.prisma.studentTransportationRegister.findMany({
        where,
        include,
        orderBy: [{ startTime: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
    ]);

    return {
      studentTransportationRegisters: rows.map(mapRow),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /**
   * Registers for children linked to the authenticated parent (guardianEmail).
   * Ordered by trip status: Pending → InProgress → Completed → Cancelled,
   * then by createdAt descending within each status.
   * Date range filters by register createdAt; defaults to 7 days ago → 1 day ahead.
   */
  async listForAuthenticatedParent(
    userId: string,
    params: { fromDate?: string; toDate?: string } = {}
  ): Promise<{
    guardianEmail: string;
    studentIds: string[];
    studentTransportationRegisters: StudentTransportationRegisterData[];
  }> {
    const guardianEmail = await resolveParentGuardianEmail(userId);

    const children = await this.prisma.student.findMany({
      where: { guardianEmail, status: StudentStatus.Active },
      select: { id: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    const studentIds = children.map((child) => child.id);
    if (studentIds.length === 0) {
      return { guardianEmail, studentIds, studentTransportationRegisters: [] };
    }

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

    const rows = await this.prisma.studentTransportationRegister.findMany({
      where: {
        studentId: { in: studentIds },
        createdAt: { gte: fromDate, lte: toDate },
      },
      include,
      orderBy: [{ createdAt: "desc" }],
    });

    const tripStatusOrder: Record<VehicleTripStatus, number> = {
      [VehicleTripStatus.Pending]: 0,
      [VehicleTripStatus.InProgress]: 1,
      [VehicleTripStatus.Completed]: 2,
      [VehicleTripStatus.Cancelled]: 3,
    };
    rows.sort((a, b) => {
      const statusDiff =
        tripStatusOrder[a.vehicleTrip.status] - tripStatusOrder[b.vehicleTrip.status];
      if (statusDiff !== 0) return statusDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return {
      guardianEmail,
      studentIds,
      studentTransportationRegisters: rows.map(mapRow),
    };
  }

  async getById(id: string): Promise<StudentTransportationRegisterData | null> {
    const row = await this.prisma.studentTransportationRegister.findUnique({
      where: { id },
      include,
    });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: {
      endTime?: Date | string | null;
      direction?: Direction;
      pickUpLatitude?: string | number | null;
      pickUpLongitude?: string | number | null;
      dropOffLatitude?: string | number | null;
      dropOffLongitude?: string | number | null;
    }
  ): Promise<StudentTransportationRegisterData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Student transportation register not found");

    if (
      input.endTime === undefined &&
      input.direction === undefined &&
      input.pickUpLatitude === undefined &&
      input.pickUpLongitude === undefined &&
      input.dropOffLatitude === undefined &&
      input.dropOffLongitude === undefined
    ) {
      throw new Error(
        "At least one of endTime, direction, pickUpLatitude, pickUpLongitude, dropOffLatitude, or dropOffLongitude must be provided"
      );
    }

    const endTime =
      input.endTime === undefined
        ? undefined
        : input.endTime === null
          ? null
          : parseDateTime(input.endTime, "endTime");
    if (endTime && existing.startTime && endTime < existing.startTime) {
      throw new Error("endTime must be greater than or equal to startTime");
    }

    const nextEndTime = endTime !== undefined ? endTime : existing.endTime;
    const nextStatus = deriveRegisterStatus({
      tripStatus: existing.vehicleTrip.status,
      endTime: nextEndTime,
    });

    try {
      const row = await this.prisma.studentTransportationRegister.update({
        where: { id },
        data: {
          ...(endTime !== undefined ? { endTime } : {}),
          status: nextStatus,
          ...(input.direction !== undefined ? { direction: input.direction } : {}),
          ...(input.pickUpLatitude !== undefined
            ? { pickUpLatitude: parseOptionalCoordinate(input.pickUpLatitude, "pickUpLatitude") }
            : {}),
          ...(input.pickUpLongitude !== undefined
            ? { pickUpLongitude: parseOptionalCoordinate(input.pickUpLongitude, "pickUpLongitude") }
            : {}),
          ...(input.dropOffLatitude !== undefined
            ? { dropOffLatitude: parseOptionalCoordinate(input.dropOffLatitude, "dropOffLatitude") }
            : {}),
          ...(input.dropOffLongitude !== undefined
            ? {
                dropOffLongitude: parseOptionalCoordinate(
                  input.dropOffLongitude,
                  "dropOffLongitude"
                ),
              }
            : {}),
        },
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Student transportation register not found");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<StudentTransportationRegisterData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Student transportation register not found");

    try {
      const row = await this.prisma.studentTransportationRegister.delete({
        where: { id },
        include,
      });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Student transportation register not found");
      }
      throw e;
    }
  }
}

export const studentTransportationRegisterService = new StudentTransportationRegisterService();
