import prisma from "../utils/prisma";
import { activePeriodService } from "./activePeriodService";
import { resolveStoreIdForIssuer } from "./resolveStoreForIssuer";
import {
  InventoryTransactionStatus,
  InventoryTransactionType,
  Prisma,
  StudentStatus,
} from "@prisma/client";
import { generateReferenceNo } from "../utils/referenceNo";

export interface StudentCollectionData {
  id: string;
  itemId: string;
  transactionType: InventoryTransactionType;
  qtyOut: any;
  status: InventoryTransactionStatus;
  referenceNo: string | null;
  notes: string | null;
  studentId: string | null;
  classId: string | null;
  termId: string | null;
  sessionId: string | null;
  subclassId: string | null;
  transactionDate: Date;
  createdById: string;
  storeId: string | null;
  createdAt: Date;
  updatedAt: Date;
  item?: { name: string } | null;
  store?: { id: string; name: string } | null;
  student?: {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
  } | null;
  createdBy?: { firstName: string | null; lastName: string | null } | null;
}

export interface StudentItemsReceivedReportParams {
  itemIds: string[];
  classId?: string;
  subclassId?: string;
  sessionId?: string;
  termId?: string;
}

export interface StudentItemsReceivedReportRow {
  studentInfo: {
    id: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    admissionNumber: string;
  };
  items: Array<{
    itemId: string;
    itemName: string;
    qtyReceived: number;
  }>;
}

export interface ListStudentCollectionsParams {
  q?: string;
  itemId?: string;
  studentId?: string;
  classId?: string;
  subclassId?: string;
  sessionId?: string;
  termId?: string;
  status?: InventoryTransactionStatus;
  /** Inclusive lower bound on transactionDate */
  transactionDateFrom?: Date;
  /** Inclusive upper bound on transactionDate */
  transactionDateTo?: Date;
  page?: number;
  limit?: number;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export class StudentCollectionService {
  private prisma = prisma;

  private buildStudentCollectionWhere(params: ListStudentCollectionsParams): Prisma.InventoryTransactionWhereInput {
    return {
      transactionType: InventoryTransactionType.student_collection,
      ...(params.itemId ? { itemId: params.itemId } : {}),
      ...(params.studentId ? { studentId: params.studentId } : {}),
      ...(params.classId ? { classId: params.classId } : {}),
      ...(params.subclassId ? { subclassId: params.subclassId } : {}),
      ...(params.sessionId ? { sessionId: params.sessionId } : {}),
      ...(params.termId ? { termId: params.termId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.transactionDateFrom !== undefined || params.transactionDateTo !== undefined
        ? {
            transactionDate: {
              ...(params.transactionDateFrom !== undefined ? { gte: params.transactionDateFrom } : {}),
              ...(params.transactionDateTo !== undefined ? { lte: params.transactionDateTo } : {}),
            },
          }
        : {}),
      ...(params.q
        ? {
            OR: [{ referenceNo: { contains: params.q } }, { notes: { contains: params.q } }],
          }
        : {}),
    };
  }

  private async assertItemExists(itemId: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: itemId },
      select: { id: true },
    });
    if (!item) throw new Error("Invalid itemId");
  }

  private async getStudentClassAndSubClass(studentId: string): Promise<{
    studentId: string;
    classId: string | null;
    subclassId: string | null;
  }> {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, classId: true, subClassId: true },
    });
    if (!student) throw new Error("Invalid studentId");
    return {
      studentId: student.id,
      classId: student.classId ?? null,
      subclassId: student.subClassId ?? null,
    };
  }

  private async getActivePeriodIdsOrNull(): Promise<{
    sessionId: string | null;
    termId: string | null;
  }> {
    const ap = await activePeriodService.getActivePeriod();
    if (!ap) return { sessionId: null, termId: null };
    return { sessionId: ap.sessionId ?? null, termId: ap.termId ?? null };
  }

  async createStudentCollection(input: {
    itemId: string;
    qtyOut: string | number;
    referenceNo?: string | null;
    notes?: string | null;
    studentId?: string | null;
    storeId?: string | null;
    transactionDate?: Date;
    createdById: string;
  }): Promise<StudentCollectionData> {
    await this.assertItemExists(input.itemId);

    const storeId = await resolveStoreIdForIssuer(input.storeId, input.createdById);

    const studentIdNormalized = input.studentId ?? null;
    const studentDerived = studentIdNormalized
      ? await this.getStudentClassAndSubClass(studentIdNormalized)
      : null;
    const active = await this.getActivePeriodIdsOrNull();

    const finalReferenceNo =
      input.referenceNo === undefined ||
      input.referenceNo === null ||
      input.referenceNo.trim() === ""
        ? generateReferenceNo("SC")
        : input.referenceNo;

    return await this.prisma.inventoryTransaction.create({
      data: {
        itemId: input.itemId,
        transactionType: InventoryTransactionType.student_collection,
        qtyOut: input.qtyOut as any,
        status: InventoryTransactionStatus.completed,
        referenceNo: finalReferenceNo,
        notes: input.notes ?? null,
        studentId: studentDerived?.studentId ?? null,
        classId: studentDerived?.classId ?? null,
        subclassId: studentDerived?.subclassId ?? null,
        sessionId: active.sessionId,
        termId: active.termId,
        storeId,
        transactionDate: input.transactionDate ?? new Date(),
        createdById: input.createdById,
      },
      include: {
        item: { select: { name: true } },
        store: { select: { id: true, name: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async createBulkStudentCollections(input: {
    referenceNo?: string | null;
    notes?: string | null;
    transactionDate?: Date;
    createdById: string;
    studentId?: string | null;
    storeId?: string | null;
    items: Array<{ itemId: string; qtyOut: string | number }>;
  }): Promise<StudentCollectionData[]> {
    if (!input.items.length) throw new Error("items must not be empty");

    const storeId = await resolveStoreIdForIssuer(input.storeId, input.createdById);

    const itemIds = [...new Set(input.items.map((i) => i.itemId))];
    const existingItems = await this.prisma.inventoryItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true },
    });
    const existingSet = new Set(existingItems.map((i) => i.id));
    const missing = itemIds.filter((id) => !existingSet.has(id));
    if (missing.length) {
      throw new Error(`Invalid itemId(s): ${missing.join(", ")}`);
    }

    const studentIdNormalized = input.studentId ?? null;
    const studentDerived = studentIdNormalized
      ? await this.getStudentClassAndSubClass(studentIdNormalized)
      : null;
    const active = await this.getActivePeriodIdsOrNull();

    const finalReferenceNo =
      input.referenceNo === undefined ||
      input.referenceNo === null ||
      input.referenceNo.trim() === ""
        ? generateReferenceNo("SC")
        : input.referenceNo;

    const txDate = input.transactionDate ?? new Date();

    const created = await this.prisma.$transaction(
      input.items.map((it) =>
        this.prisma.inventoryTransaction.create({
          data: {
            itemId: it.itemId,
            transactionType: InventoryTransactionType.student_collection,
            qtyOut: it.qtyOut as any,
            status: InventoryTransactionStatus.completed,
            referenceNo: finalReferenceNo,
            notes: input.notes ?? null,
            studentId: studentDerived?.studentId ?? null,
            classId: studentDerived?.classId ?? null,
            subclassId: studentDerived?.subclassId ?? null,
            sessionId: active.sessionId,
            termId: active.termId,
            storeId,
            transactionDate: txDate,
            createdById: input.createdById,
          },
          include: {
            item: { select: { name: true } },
            store: { select: { id: true, name: true } },
            createdBy: { select: { firstName: true, lastName: true } },
          },
        })
      )
    );

    return created;
  }

  async listStudentCollections(params: ListStudentCollectionsParams = {}): Promise<{
    studentCollections: StudentCollectionData[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where = this.buildStudentCollectionWhere(params);
    const [total, rows] = await Promise.all([
      this.prisma.inventoryTransaction.count({ where }),
      this.prisma.inventoryTransaction.findMany({
        where,
        orderBy: { transactionDate: "desc" },
        skip,
        take: limit,
        include: {
          item: { select: { name: true } },
          store: { select: { id: true, name: true } },
          student: {
            select: {
              id: true,
              admissionNumber: true,
              firstName: true,
              lastName: true,
            },
          },
          createdBy: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return { studentCollections: rows, pagination: { page, limit, total, totalPages } };
  }

  async summarizeStudentCollectionsByItem(params: ListStudentCollectionsParams = {}): Promise<{
    summary: Array<{
      itemId: string;
      totalQtyOut: string;
      item: {
        id: string;
        name: string;
        category: { id: string; name: string } | null;
        subCategory: { id: string; name: string } | null;
        brand: { id: string; name: string } | null;
      } | null;
    }>;
  }> {
    const where = this.buildStudentCollectionWhere(params);

    const grouped = await this.prisma.inventoryTransaction.groupBy({
      by: ["itemId"],
      where,
      _sum: { qtyOut: true },
    });

    const itemIds = grouped.map((g) => g.itemId);
    const items = itemIds.length
      ? await this.prisma.inventoryItem.findMany({
          where: { id: { in: itemIds } },
          select: {
            id: true,
            name: true,
            category: { select: { id: true, name: true } },
            subCategory: { select: { id: true, name: true } },
            brand: { select: { id: true, name: true } },
          },
        })
      : [];
    const itemById = new Map(items.map((i) => [i.id, i]));

    const summary = grouped.map((g) => ({
      itemId: g.itemId,
      totalQtyOut: (g._sum.qtyOut ?? new Prisma.Decimal(0)).toString(),
      item: itemById.get(g.itemId) ?? null,
    }));

    // Sort by Category -> SubCategory -> Brand -> Item name (nulls last).
    summary.sort((a, b) => {
      const ac = a.item?.category?.name ?? "\uFFFF";
      const bc = b.item?.category?.name ?? "\uFFFF";
      if (ac !== bc) return ac.localeCompare(bc);

      const asc = a.item?.subCategory?.name ?? "\uFFFF";
      const bsc = b.item?.subCategory?.name ?? "\uFFFF";
      if (asc !== bsc) return asc.localeCompare(bsc);

      const ab = a.item?.brand?.name ?? "\uFFFF";
      const bb = b.item?.brand?.name ?? "\uFFFF";
      if (ab !== bb) return ab.localeCompare(bb);

      const an = a.item?.name ?? "\uFFFF";
      const bn = b.item?.name ?? "\uFFFF";
      return an.localeCompare(bn);
    });

    return { summary };
  }

  /**
   * Per-student quantities received (sum of qtyOut on completed student_collection rows)
   * for the requested items. Students are scoped by Active status and optional class/subClass;
   * transactions may be further filtered by session, term, and class/subClass on the row.
   */
  async getStudentItemsReceivedReport(
    params: StudentItemsReceivedReportParams
  ): Promise<StudentItemsReceivedReportRow[]> {
    const itemIds = [...new Set(params.itemIds.map((id) => id.trim()).filter(Boolean))];
    if (!itemIds.length) {
      throw new Error("itemIds must not be empty");
    }

    const catalogItems = await this.prisma.inventoryItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, name: true },
    });
    const itemById = new Map(catalogItems.map((i) => [i.id, i]));
    const missingItems = itemIds.filter((id) => !itemById.has(id));
    if (missingItems.length) {
      throw new Error(`Invalid itemId(s): ${missingItems.join(", ")}`);
    }

    const studentWhere: Prisma.StudentWhereInput = {
      status: StudentStatus.Active,
    };
    const classId = params.classId?.trim();
    const subclassId = params.subclassId?.trim();
    if (classId) studentWhere.classId = classId;
    if (subclassId) studentWhere.subClassId = subclassId;

    const students = await this.prisma.student.findMany({
      where: studentWhere,
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        admissionNumber: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { admissionNumber: "asc" }],
    });

    const txWhere: Prisma.InventoryTransactionWhereInput = {
      transactionType: InventoryTransactionType.student_collection,
      status: InventoryTransactionStatus.completed,
      itemId: { in: itemIds },
      studentId: { not: null },
      ...(params.sessionId?.trim() ? { sessionId: params.sessionId.trim() } : {}),
      ...(params.termId?.trim() ? { termId: params.termId.trim() } : {}),
      ...(classId ? { classId } : {}),
      ...(subclassId ? { subclassId } : {}),
    };

    const studentIds = students.map((s) => s.id);
    const grouped =
      studentIds.length > 0
        ? await this.prisma.inventoryTransaction.groupBy({
            by: ["studentId", "itemId"],
            where: {
              ...txWhere,
              studentId: { in: studentIds },
            },
            _sum: { qtyOut: true },
          })
        : [];

    const qtyByStudentItem = new Map<string, number>();
    for (const row of grouped) {
      if (!row.studentId) continue;
      const key = `${row.studentId}\t${row.itemId}`;
      qtyByStudentItem.set(
        key,
        Number((row._sum.qtyOut ?? new Prisma.Decimal(0)).toString())
      );
    }

    return students.map((student) => ({
      studentInfo: {
        id: student.id,
        firstName: student.firstName,
        middleName: student.middleName,
        lastName: student.lastName,
        admissionNumber: student.admissionNumber,
      },
      items: itemIds.map((itemId) => ({
        itemId,
        itemName: itemById.get(itemId)!.name,
        qtyReceived: qtyByStudentItem.get(`${student.id}\t${itemId}`) ?? 0,
      })),
    }));
  }

  async getStudentCollectionById(id: string): Promise<StudentCollectionData | null> {
    return await this.prisma.inventoryTransaction.findFirst({
      where: { id, transactionType: InventoryTransactionType.student_collection },
      include: {
        item: { select: { name: true } },
        store: { select: { id: true, name: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async updateStudentCollection(
    id: string,
    input: {
      itemId?: string;
      qtyOut?: string | number;
      referenceNo?: string | null;
      notes?: string | null;
      studentId?: string | null;
      transactionDate?: Date;
    }
  ): Promise<StudentCollectionData> {
    if (input.itemId !== undefined) await this.assertItemExists(input.itemId);

    const existing = await this.getStudentCollectionById(id);
    if (!existing) throw new Error("Student collection not found");

    const studentDerived =
      input.studentId !== undefined
        ? input.studentId
          ? await this.getStudentClassAndSubClass(input.studentId)
          : null
        : undefined;

    // Keep session/term in sync with the current active period on any update.
    const active = await this.getActivePeriodIdsOrNull();

    return await this.prisma.inventoryTransaction.update({
      where: { id },
      data: {
        ...(input.itemId !== undefined ? { itemId: input.itemId } : {}),
        ...(input.qtyOut !== undefined ? { qtyOut: input.qtyOut as any } : {}),
        ...(input.referenceNo !== undefined ? { referenceNo: input.referenceNo } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(studentDerived !== undefined
          ? {
              studentId: studentDerived?.studentId ?? null,
              classId: studentDerived?.classId ?? null,
              subclassId: studentDerived?.subclassId ?? null,
            }
          : {}),
        sessionId: active.sessionId,
        termId: active.termId,
        ...(input.transactionDate !== undefined ? { transactionDate: input.transactionDate } : {}),
        // locked fields
        transactionType: InventoryTransactionType.student_collection,
        status: InventoryTransactionStatus.completed,
        updatedAt: new Date(),
      },
      include: {
        item: { select: { name: true } },
        store: { select: { id: true, name: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async updateBulkStudentCollections(input: {
    updates: Array<{
      id: string;
      itemId?: string;
      qtyOut?: string | number;
      referenceNo?: string | null;
      notes?: string | null;
      studentId?: string | null;
      transactionDate?: Date;
    }>;
  }): Promise<StudentCollectionData[]> {
    if (!input.updates.length) throw new Error("updates must not be empty");

    const ids = [...new Set(input.updates.map((u) => u.id))];
    const existing = await this.prisma.inventoryTransaction.findMany({
      where: { id: { in: ids }, transactionType: InventoryTransactionType.student_collection },
      select: { id: true },
    });
    const existingSet = new Set(existing.map((r) => r.id));
    const missing = ids.filter((id) => !existingSet.has(id));
    if (missing.length) throw new Error(`Student collection not found: ${missing.join(", ")}`);

    const itemIds = [
      ...new Set(input.updates.map((u) => u.itemId).filter((v): v is string => !!v)),
    ];
    if (itemIds.length) {
      const found = await this.prisma.inventoryItem.findMany({
        where: { id: { in: itemIds } },
        select: { id: true },
      });
      const foundSet = new Set(found.map((r) => r.id));
      const missingItemIds = itemIds.filter((id) => !foundSet.has(id));
      if (missingItemIds.length) throw new Error(`Invalid itemId(s): ${missingItemIds.join(", ")}`);
    }

    const active = await this.getActivePeriodIdsOrNull();

    const updated = await this.prisma.$transaction(async (tx) => {
      const out: StudentCollectionData[] = [];
      for (const u of input.updates) {
        const studentDerived =
          u.studentId !== undefined
            ? u.studentId
              ? await this.getStudentClassAndSubClass(u.studentId)
              : null
            : undefined;

        const row = await tx.inventoryTransaction.update({
          where: { id: u.id },
          data: {
            ...(u.itemId !== undefined ? { itemId: u.itemId } : {}),
            ...(u.qtyOut !== undefined ? { qtyOut: u.qtyOut as any } : {}),
            ...(u.referenceNo !== undefined ? { referenceNo: u.referenceNo } : {}),
            ...(u.notes !== undefined ? { notes: u.notes } : {}),
            ...(studentDerived !== undefined
              ? {
                  studentId: studentDerived?.studentId ?? null,
                  classId: studentDerived?.classId ?? null,
                  subclassId: studentDerived?.subclassId ?? null,
                }
              : {}),
            sessionId: active.sessionId,
            termId: active.termId,
            ...(u.transactionDate !== undefined ? { transactionDate: u.transactionDate } : {}),
            // locked fields
            transactionType: InventoryTransactionType.student_collection,
            status: InventoryTransactionStatus.completed,
            updatedAt: new Date(),
          },
          include: {
            item: { select: { name: true } },
            store: { select: { id: true, name: true } },
            createdBy: { select: { firstName: true, lastName: true } },
          },
        });
        out.push(row);
      }
      return out;
    });

    return updated;
  }

  async deleteStudentCollection(id: string): Promise<StudentCollectionData> {
    const existing = await this.getStudentCollectionById(id);
    if (!existing) throw new Error("Student collection not found");

    return await this.prisma.inventoryTransaction.delete({
      where: { id },
      include: {
        item: { select: { name: true } },
        store: { select: { id: true, name: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async deleteBulkStudentCollections(input: { ids: string[] }): Promise<StudentCollectionData[]> {
    if (!input.ids.length) throw new Error("ids must not be empty");
    const ids = [...new Set(input.ids)];

    const existing = await this.prisma.inventoryTransaction.findMany({
      where: { id: { in: ids }, transactionType: InventoryTransactionType.student_collection },
      include: {
        item: { select: { name: true } },
        store: { select: { id: true, name: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
    const existingSet = new Set(existing.map((r) => r.id));
    const missing = ids.filter((id) => !existingSet.has(id));
    if (missing.length) throw new Error(`Student collection not found: ${missing.join(", ")}`);

    await this.prisma.$transaction(
      ids.map((id) => this.prisma.inventoryTransaction.delete({ where: { id } }))
    );

    return existing;
  }
}

export const studentCollectionService = new StudentCollectionService();
