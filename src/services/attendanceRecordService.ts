import prisma from "../utils/prisma";
import { AttendanceStatus, Prisma } from "@prisma/client";
import { isPrismaKnownErrorWithCode, parseDecimalNonNegative } from "../utils/assessmentHttp";
import { activePeriodService } from "./activePeriodService";

const include = {
  session: { select: { id: true, name: true, status: true } },
  term: { select: { id: true, name: true, status: true } },
  student: {
    select: { id: true, admissionNumber: true, firstName: true, lastName: true, status: true },
  },
  markedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.AttendanceRecordInclude;

type Row = Prisma.AttendanceRecordGetPayload<{ include: typeof include }>;

export interface AttendanceRecordData {
  id: string;
  sessionId: string;
  session: Row["session"];
  termId: string;
  term: Row["term"];
  studentId: string;
  student: Row["student"];
  status: AttendanceStatus;
  attendanceDate: Date;
  checkInTime: Date;
  checkOutTime: Date | null;
  markedById: string;
  markedBy: Row["markedBy"];
  latitude: string | null;
  longitude: string | null;
  remarks: string | null;
  createdAt: Date;
}

export interface AttendanceRecordInput {
  studentId: string;
  status?: AttendanceStatus;
  checkInTime: Date | string;
  checkOutTime?: Date | string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  remarks?: string | null;
}

export interface AttendanceByDateStudentEntry {
  id: string;
  studentId: string;
  admissionNumber: string;
  studentName: string;
  status: AttendanceStatus;
  checkInTime: Date;
  checkOutTime: Date | null;
  remarks: string | null;
}

export interface AttendanceByDateReportEntry {
  attendanceDate: string;
  students: AttendanceByDateStudentEntry[];
}

export interface AttendanceStudentSummaryEntry {
  studentId: string;
  admissionNumber: string;
  studentName: string;
  studentStatus: Row["student"]["status"];
  classId: string | null;
  totalAttendance: number;
  totalPresent: number;
  totalAbsent: number;
}

export interface AttendanceStudentSummaryReport {
  schoolOpenedDays: number;
  students: AttendanceStudentSummaryEntry[];
}

export interface StudentAttendanceRecordEntry {
  id: string;
  attendanceDate: string;
  status: AttendanceStatus;
  checkInTime: Date;
  checkOutTime: Date | null;
  remarks: string | null;
}

export interface StudentAttendanceReport {
  schoolOpenedDays: number;
  student: {
    studentId: string;
    admissionNumber: string;
    studentName: string;
    studentStatus: Row["student"]["status"];
    classId: string | null;
  };
  totalAttendance: number;
  attendance: StudentAttendanceRecordEntry[];
}

export interface AttendanceReportParams {
  sessionId: string;
  termId: string;
  classId?: string;
  subclassId?: string;
  status?: AttendanceStatus;
  fromDate?: string;
  toDate?: string;
}

export interface ClassDateAttendanceEntry {
  studentId: string;
  admissionNumber: string;
  studentName: string;
  studentStatus: Row["student"]["status"];
  classId: string | null;
  subclassId: string | null;
  attendance: {
    id: string;
    status: AttendanceStatus;
    checkInTime: Date;
    checkOutTime: Date | null;
    remarks: string | null;
    markedById: string;
  } | null;
}

export interface ClassDateAttendanceReport {
  classId: string;
  subclassId: string | null;
  attendanceDate: string;
  students: ClassDateAttendanceEntry[];
}

function mapRow(row: Row): AttendanceRecordData {
  return {
    id: row.id,
    sessionId: row.sessionId,
    session: row.session,
    termId: row.termId,
    term: row.term,
    studentId: row.studentId,
    student: row.student,
    status: row.status,
    attendanceDate: row.attendanceDate,
    checkInTime: row.checkInTime,
    checkOutTime: row.checkOutTime,
    markedById: row.markedById,
    markedBy: row.markedBy,
    latitude: row.latitude?.toString() ?? null,
    longitude: row.longitude?.toString() ?? null,
    remarks: row.remarks,
    createdAt: row.createdAt,
  };
}

function parseDateTime(value: Date | string, fieldName: string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return parsed;
}

function parseDateOnly(value: Date | string, fieldName: string): Date {
  const parsed = parseDateTime(value, fieldName);
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function parseOptionalCoordinate(
  value: string | number | null | undefined,
  fieldName: string
): Prisma.Decimal | null {
  if (value === undefined || value === null || value === "") return null;
  return parseDecimalNonNegative(value, fieldName);
}

function trimRemarks(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function studentFullName(student: { firstName: string; lastName: string }): string {
  return `${student.firstName} ${student.lastName}`;
}

function buildRecordData(
  input: AttendanceRecordInput,
  context: {
    sessionId: string;
    termId: string;
    attendanceDate: Date;
    markedById: string;
  }
) {
  const checkOutTime =
    input.checkOutTime === undefined || input.checkOutTime === null
      ? null
      : parseDateTime(input.checkOutTime, "checkOutTime");

  return {
    sessionId: context.sessionId,
    termId: context.termId,
    studentId: input.studentId.trim(),
    status: input.status ?? AttendanceStatus.Present,
    attendanceDate: context.attendanceDate,
    checkInTime: parseDateTime(input.checkInTime, "checkInTime"),
    checkOutTime,
    markedById: context.markedById,
    latitude: parseOptionalCoordinate(input.latitude, "latitude"),
    longitude: parseOptionalCoordinate(input.longitude, "longitude"),
    remarks: trimRemarks(input.remarks),
  };
}

export class AttendanceRecordService {
  private prisma = prisma;

  private async assertNoDuplicateAttendance(
    studentId: string,
    attendanceDate: Date,
    excludeId?: string
  ): Promise<void> {
    const existing = await this.prisma.attendanceRecord.findFirst({
      where: {
        studentId,
        attendanceDate,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new Error("Attendance already exists for this student on the attendance date");
    }
  }

  private async assertRefs(input: {
    sessionId: string;
    termId: string;
    studentId: string;
    markedById: string;
  }): Promise<void> {
    const [session, term, student, marker] = await Promise.all([
      this.prisma.session.findUnique({ where: { id: input.sessionId }, select: { id: true } }),
      this.prisma.term.findUnique({ where: { id: input.termId }, select: { id: true } }),
      this.prisma.student.findUnique({ where: { id: input.studentId }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { id: input.markedById }, select: { id: true } }),
    ]);

    if (!session) throw new Error("Invalid sessionId");
    if (!term) throw new Error("Invalid termId");
    if (!student) throw new Error("Invalid studentId");
    if (!marker) throw new Error("Invalid markedBy user");
  }

  private async assertRefsForMany(
    sessionId: string,
    termId: string,
    markedById: string,
    studentIds: string[]
  ): Promise<void> {
    const uniqueStudentIds = [...new Set(studentIds)];
    const [session, term, marker, students] = await Promise.all([
      this.prisma.session.findUnique({ where: { id: sessionId }, select: { id: true } }),
      this.prisma.term.findUnique({ where: { id: termId }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { id: markedById }, select: { id: true } }),
      this.prisma.student.findMany({
        where: { id: { in: uniqueStudentIds } },
        select: { id: true },
      }),
    ]);

    if (!session) throw new Error("Invalid sessionId");
    if (!term) throw new Error("Invalid termId");
    if (!marker) throw new Error("Invalid markedBy user");
    if (students.length !== uniqueStudentIds.length) {
      throw new Error("Invalid studentId in records");
    }
  }

  private buildReportWhere(params: AttendanceReportParams): Prisma.AttendanceRecordWhereInput {
    const sessionId = params.sessionId.trim();
    const termId = params.termId.trim();
    const classId = params.classId?.trim();
    const subclassId = params.subclassId?.trim();

    if (!sessionId || !termId) {
      throw new Error("sessionId and termId are required");
    }

    const where: Prisma.AttendanceRecordWhereInput = {
      sessionId,
      termId,
    };

    if (params.status) where.status = params.status;

    const attendanceDate: Prisma.DateTimeFilter = {};
    if (params.fromDate?.trim()) {
      attendanceDate.gte = parseDateOnly(params.fromDate.trim(), "fromDate");
    }
    if (params.toDate?.trim()) {
      attendanceDate.lte = parseDateOnly(params.toDate.trim(), "toDate");
    }
    if (Object.keys(attendanceDate).length > 0) {
      where.attendanceDate = attendanceDate;
    }

    if (classId || subclassId) {
      where.student = {
        ...(classId ? { classId } : {}),
        ...(subclassId ? { subClassId: subclassId } : {}),
      };
    }

    return where;
  }

  private mapByDateStudentEntry(row: Row): AttendanceByDateStudentEntry {
    return {
      id: row.id,
      studentId: row.studentId,
      admissionNumber: row.student.admissionNumber,
      studentName: studentFullName(row.student),
      status: row.status,
      checkInTime: row.checkInTime,
      checkOutTime: row.checkOutTime,
      remarks: row.remarks,
    };
  }

  async getClassDateAttendanceReport(params: {
    classId: string;
    subclassId?: string;
    attendanceDate: string;
  }): Promise<ClassDateAttendanceReport> {
    const classId = params.classId.trim();
    const subclassId = params.subclassId?.trim();
    if (!classId) throw new Error("classId is required");
    if (!params.attendanceDate?.trim()) throw new Error("attendanceDate is required");

    const attendanceDate = parseDateOnly(params.attendanceDate.trim(), "attendanceDate");

    const [cls, subClass] = await Promise.all([
      this.prisma.schoolClass.findUnique({ where: { id: classId }, select: { id: true } }),
      subclassId
        ? this.prisma.subClass.findUnique({
            where: { id: subclassId },
            select: { id: true, classId: true },
          })
        : Promise.resolve(null),
    ]);
    if (!cls) throw new Error("Invalid classId");
    if (subclassId) {
      if (!subClass) throw new Error("Invalid subclassId");
      if (subClass.classId && subClass.classId !== classId) {
        throw new Error("subclassId does not belong to the specified classId");
      }
    }

    const students = await this.prisma.student.findMany({
      where: {
        classId,
        ...(subclassId ? { subClassId: subclassId } : {}),
        status: "Active",
      },
      select: {
        id: true,
        admissionNumber: true,
        firstName: true,
        lastName: true,
        status: true,
        classId: true,
        subClassId: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const studentIds = students.map((student) => student.id);
    const attendanceRows =
      studentIds.length > 0
        ? await this.prisma.attendanceRecord.findMany({
            where: {
              studentId: { in: studentIds },
              attendanceDate,
            },
            select: {
              id: true,
              studentId: true,
              status: true,
              checkInTime: true,
              checkOutTime: true,
              remarks: true,
              markedById: true,
            },
          })
        : [];

    const attendanceByStudentId = new Map(
      attendanceRows.map((row) => [row.studentId, row] as const)
    );

    return {
      classId,
      subclassId: subclassId ?? null,
      attendanceDate: formatDateOnly(attendanceDate),
      students: students.map((student) => {
        const attendance = attendanceByStudentId.get(student.id);
        return {
          studentId: student.id,
          admissionNumber: student.admissionNumber,
          studentName: studentFullName(student),
          studentStatus: student.status,
          classId: student.classId,
          subclassId: student.subClassId,
          attendance: attendance
            ? {
                id: attendance.id,
                status: attendance.status,
                checkInTime: attendance.checkInTime,
                checkOutTime: attendance.checkOutTime,
                remarks: attendance.remarks,
                markedById: attendance.markedById,
              }
            : null,
        };
      }),
    };
  }

  async getReportByDate(params: AttendanceReportParams): Promise<AttendanceByDateReportEntry[]> {
    const rows = await this.prisma.attendanceRecord.findMany({
      where: this.buildReportWhere(params),
      include,
      orderBy: [
        { attendanceDate: "desc" },
        { student: { lastName: "asc" } },
        { student: { firstName: "asc" } },
      ],
    });

    const byDate = new Map<string, AttendanceByDateStudentEntry[]>();
    const dateOrder: string[] = [];

    for (const row of rows) {
      const attendanceDate = formatDateOnly(row.attendanceDate);
      if (!byDate.has(attendanceDate)) {
        byDate.set(attendanceDate, []);
        dateOrder.push(attendanceDate);
      }
      byDate.get(attendanceDate)!.push(this.mapByDateStudentEntry(row));
    }

    return dateOrder.map((attendanceDate) => ({
      attendanceDate,
      students: byDate.get(attendanceDate)!,
    }));
  }

  async getReportByStudentSummary(
    params: AttendanceReportParams
  ): Promise<AttendanceStudentSummaryReport> {
    // Ignore status filter so present/absent breakdown and school-open days stay complete.
    const reportWhere = this.buildReportWhere({ ...params, status: undefined });
    console.log(reportWhere);
    const [openDateGroups, rows] = await Promise.all([
      this.prisma.attendanceRecord.groupBy({
        by: ["attendanceDate"],
        where: reportWhere,
      }),
      this.prisma.attendanceRecord.findMany({
        where: reportWhere,
        select: {
          studentId: true,
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
        },
        orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
      }),
    ]);
    const schoolOpenedDays = openDateGroups.length;
    const summaryByStudentId = new Map<string, AttendanceStudentSummaryEntry>();
    const studentOrder: string[] = [];

    for (const row of rows) {
      let entry = summaryByStudentId.get(row.studentId);
      if (!entry) {
        entry = {
          studentId: row.student.id,
          admissionNumber: row.student.admissionNumber,
          studentName: studentFullName(row.student),
          studentStatus: row.student.status,
          classId: row.student.classId,
          totalAttendance: 0,
          totalPresent: 0,
          totalAbsent: 0,
        };
        summaryByStudentId.set(row.studentId, entry);
        studentOrder.push(row.studentId);
      }
      entry.totalAttendance += 1;
      if (row.status === AttendanceStatus.Present || row.status === AttendanceStatus.Late) {
        entry.totalPresent += 1;
      }
    }

    return {
      schoolOpenedDays,
      students: studentOrder.map((studentId) => {
        const entry = summaryByStudentId.get(studentId)!;
        // Absent days = school open days minus present days (no Absent record required).
        entry.totalAbsent = Math.max(0, schoolOpenedDays - entry.totalPresent);
        return entry;
      }),
    };
  }

  async getStudentAttendanceReport(
    params: AttendanceReportParams & { studentId: string }
  ): Promise<StudentAttendanceReport> {
    const studentId = params.studentId.trim();
    if (!studentId) throw new Error("studentId is required");

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        admissionNumber: true,
        firstName: true,
        lastName: true,
        status: true,
        classId: true,
      },
    });
    if (!student) throw new Error("Invalid studentId");

    // School-open days = distinct attendance dates in the period (ignore student/status filters).
    const schoolOpenWhere = this.buildReportWhere({
      sessionId: params.sessionId,
      termId: params.termId,
      classId: params.classId,
      subclassId: params.subclassId,
      fromDate: params.fromDate,
      toDate: params.toDate,
    });

    const studentWhere: Prisma.AttendanceRecordWhereInput = {
      ...this.buildReportWhere(params),
      studentId,
    };

    const [openDateGroups, rows] = await Promise.all([
      this.prisma.attendanceRecord.groupBy({
        by: ["attendanceDate"],
        where: schoolOpenWhere,
      }),
      this.prisma.attendanceRecord.findMany({
        where: studentWhere,
        select: {
          id: true,
          attendanceDate: true,
          status: true,
          checkInTime: true,
          checkOutTime: true,
          remarks: true,
        },
        orderBy: { attendanceDate: "desc" },
      }),
    ]);

    return {
      schoolOpenedDays: openDateGroups.length,
      student: {
        studentId: student.id,
        admissionNumber: student.admissionNumber,
        studentName: studentFullName(student),
        studentStatus: student.status,
        classId: student.classId,
      },
      totalAttendance: rows.length,
      attendance: rows.map((row) => ({
        id: row.id,
        attendanceDate: formatDateOnly(row.attendanceDate),
        status: row.status,
        checkInTime: row.checkInTime,
        checkOutTime: row.checkOutTime,
        remarks: row.remarks,
      })),
    };
  }

  async create(input: {
    sessionId: string;
    termId: string;
    studentId: string;
    status?: AttendanceStatus;
    attendanceDate: Date | string;
    checkInTime: Date | string;
    checkOutTime?: Date | string | null;
    markedById: string;
    latitude?: string | number | null;
    longitude?: string | number | null;
    remarks?: string | null;
  }): Promise<AttendanceRecordData> {
    const sessionId = input.sessionId.trim();
    const termId = input.termId.trim();
    const studentId = input.studentId.trim();
    const markedById = input.markedById.trim();

    if (!sessionId || !termId || !studentId || !markedById) {
      throw new Error("sessionId, termId, studentId, and markedById are required");
    }

    await this.assertRefs({ sessionId, termId, studentId, markedById });

    const attendanceDate = parseDateOnly(input.attendanceDate, "attendanceDate");
    await this.assertNoDuplicateAttendance(studentId, attendanceDate);

    const data = buildRecordData(
      {
        studentId,
        status: input.status,
        checkInTime: input.checkInTime,
        checkOutTime: input.checkOutTime,
        latitude: input.latitude,
        longitude: input.longitude,
        remarks: input.remarks,
      },
      { sessionId, termId, attendanceDate, markedById }
    );

    try {
      const row = await this.prisma.attendanceRecord.create({ data, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Attendance already exists for this student on the attendance date");
      }
      throw e;
    }
  }

  private async resolveSessionTermForAttendanceDate(
    attendanceDate: Date,
    sessionId?: string,
    termId?: string
  ): Promise<{ sessionId: string; termId: string }> {
    const providedSessionId = sessionId?.trim() || "";
    const providedTermId = termId?.trim() || "";

    if (providedSessionId && providedTermId) {
      return { sessionId: providedSessionId, termId: providedTermId };
    }

    const activePeriod = await activePeriodService.getActivePeriod();
    if (!activePeriod) {
      throw new Error("No active period configured; sessionId and termId are required");
    }

    const periodStart = parseDateOnly(activePeriod.startDate, "activePeriod.startDate");
    const periodEnd = parseDateOnly(activePeriod.endDate, "activePeriod.endDate");
    if (attendanceDate < periodStart || attendanceDate > periodEnd) {
      throw new Error(
        "attendanceDate is outside the active period startDate and endDate; provide sessionId and termId explicitly"
      );
    }

    return {
      sessionId: providedSessionId || activePeriod.sessionId,
      termId: providedTermId || activePeriod.termId,
    };
  }

  async createMany(input: {
    sessionId?: string;
    termId?: string;
    attendanceDate?: Date | string;
    markedById: string;
    records: AttendanceRecordInput[];
  }): Promise<{ attendanceRecords: AttendanceRecordData[]; count: number }> {
    const markedById = input.markedById.trim();
    if (!markedById) {
      throw new Error("markedById is required");
    }
    if (!Array.isArray(input.records) || input.records.length === 0) {
      throw new Error("records must be a non-empty array");
    }

    const records = input.records.map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        throw new Error(`records[${index}] must be an object`);
      }
      const studentId = entry.studentId;
      if (typeof studentId !== "string" || !studentId.trim()) {
        throw new Error(`records[${index}].studentId is required`);
      }
      if (entry.checkInTime === undefined || entry.checkInTime === null) {
        throw new Error(`records[${index}].checkInTime is required`);
      }
      return { ...entry, studentId: studentId.trim() };
    });

    const studentIds = records.map((record) => record.studentId);
    const duplicateStudentIds = studentIds.filter((id, index) => studentIds.indexOf(id) !== index);
    if (duplicateStudentIds.length > 0) {
      throw new Error(
        `Duplicate studentId in records: ${[...new Set(duplicateStudentIds)].join(", ")}`
      );
    }

    const attendanceDate = parseDateOnly(input.attendanceDate ?? new Date(), "attendanceDate");
    const { sessionId, termId } = await this.resolveSessionTermForAttendanceDate(
      attendanceDate,
      input.sessionId,
      input.termId
    );

    await this.assertRefsForMany(sessionId, termId, markedById, studentIds);

    const context = { sessionId, termId, attendanceDate, markedById };

    try {
      const rows = await this.prisma.$transaction(
        records.map((record) => {
          const data = buildRecordData(record, context);
          return this.prisma.attendanceRecord.upsert({
            where: {
              studentId_attendanceDate: {
                studentId: data.studentId,
                attendanceDate: data.attendanceDate,
              },
            },
            create: data,
            update: {
              sessionId: data.sessionId,
              termId: data.termId,
              status: data.status,
              checkInTime: data.checkInTime,
              checkOutTime: data.checkOutTime,
              markedById: data.markedById,
              latitude: data.latitude,
              longitude: data.longitude,
              remarks: data.remarks,
            },
            include,
          });
        })
      );

      return { attendanceRecords: rows.map(mapRow), count: rows.length };
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Duplicate attendance record in request");
      }
      throw e;
    }
  }

  async list(params: {
    sessionId?: string;
    termId?: string;
    studentId?: string;
    status?: AttendanceStatus;
    attendanceDate?: string;
    markedById?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.AttendanceRecordWhereInput = {};
    if (params.sessionId?.trim()) where.sessionId = params.sessionId.trim();
    if (params.termId?.trim()) where.termId = params.termId.trim();
    if (params.studentId?.trim()) where.studentId = params.studentId.trim();
    if (params.status) where.status = params.status;
    if (params.markedById?.trim()) where.markedById = params.markedById.trim();
    if (params.attendanceDate?.trim()) {
      where.attendanceDate = parseDateOnly(params.attendanceDate.trim(), "attendanceDate");
    }

    const [total, rows] = await Promise.all([
      this.prisma.attendanceRecord.count({ where }),
      this.prisma.attendanceRecord.findMany({
        where,
        include,
        orderBy: [
          { attendanceDate: "desc" },
          { student: { lastName: "asc" } },
          { student: { firstName: "asc" } },
        ],
        skip,
        take: limit,
      }),
    ]);

    return {
      attendanceRecords: rows.map(mapRow),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getById(id: string): Promise<AttendanceRecordData | null> {
    const row = await this.prisma.attendanceRecord.findUnique({ where: { id }, include });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: {
      status?: AttendanceStatus;
      attendanceDate?: Date | string;
      checkInTime?: Date | string;
      checkOutTime?: Date | string | null;
      latitude?: string | number | null;
      longitude?: string | number | null;
      remarks?: string | null;
      markedById?: string;
    }
  ): Promise<AttendanceRecordData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Attendance record not found");

    const data: Prisma.AttendanceRecordUpdateInput = {};
    if (input.status !== undefined) data.status = input.status;
    if (input.attendanceDate !== undefined) {
      data.attendanceDate = parseDateOnly(input.attendanceDate, "attendanceDate");
    }
    if (input.checkInTime !== undefined) {
      data.checkInTime = parseDateTime(input.checkInTime, "checkInTime");
    }
    if (input.checkOutTime !== undefined) {
      data.checkOutTime =
        input.checkOutTime === null ? null : parseDateTime(input.checkOutTime, "checkOutTime");
    }
    if (input.latitude !== undefined) {
      data.latitude = parseOptionalCoordinate(input.latitude, "latitude");
    }
    if (input.longitude !== undefined) {
      data.longitude = parseOptionalCoordinate(input.longitude, "longitude");
    }
    if (input.remarks !== undefined) {
      data.remarks = trimRemarks(input.remarks);
    }
    if (input.markedById !== undefined) {
      const markedById = input.markedById.trim();
      if (!markedById) throw new Error("markedById must be a non-empty string");
      const marker = await this.prisma.user.findUnique({
        where: { id: markedById },
        select: { id: true },
      });
      if (!marker) throw new Error("Invalid markedBy user");
      data.markedBy = { connect: { id: markedById } };
    }

    if (Object.keys(data).length === 0) {
      throw new Error("At least one field must be provided for update");
    }

    const nextAttendanceDate =
      input.attendanceDate !== undefined
        ? parseDateOnly(input.attendanceDate, "attendanceDate")
        : existing.attendanceDate;
    await this.assertNoDuplicateAttendance(existing.studentId, nextAttendanceDate, id);

    try {
      const row = await this.prisma.attendanceRecord.update({ where: { id }, data, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Attendance record not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Attendance already exists for this student on the attendance date");
      }
      throw e;
    }
  }

  async delete(id: string): Promise<AttendanceRecordData> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Attendance record not found");

    try {
      const row = await this.prisma.attendanceRecord.delete({ where: { id }, include });
      return mapRow(row);
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Attendance record not found");
      }
      throw e;
    }
  }
}

export const attendanceRecordService = new AttendanceRecordService();
