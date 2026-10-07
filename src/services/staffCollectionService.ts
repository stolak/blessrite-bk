import prisma from "../utils/prisma";
import { activePeriodService } from "./activePeriodService";
import { resolveStoreIdForIssuer } from "./resolveStoreForIssuer";
import { InventoryTransactionStatus, InventoryTransactionType, Prisma } from "@prisma/client";
import { generateReferenceNo } from "../utils/referenceNo";

export interface StaffCollectionData {
  id: string;
  itemId: string;
  transactionType: InventoryTransactionType;
  qtyOut: any;
  outCost: any;
  status: InventoryTransactionStatus;
  referenceNo: string | null;
  notes: string | null;
  staffId: string | null;
  termId: string | null;
  sessionId: string | null;
  transactionDate: Date;
  createdById: string;
  storeId: string | null;
  createdAt: Date;
  updatedAt: Date;
  item?: { name: string } | null;
  store?: { id: string; name: string } | null;
  staff?: { id: string; StaffNumber: string; name: string; email: string } | null;
  createdBy?: { firstName: string | null; lastName: string | null } | null;
}

export interface ListStaffCollectionsParams {
  q?: string;
  itemId?: string;
  staffId?: string;
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

const staffCollectionInclude = {
  item: { select: { name: true } },
  staff: { select: { id: true, StaffNumber: true, name: true, email: true } },
  createdBy: { select: { firstName: true, lastName: true } },
  store: { select: { id: true, name: true } },
} satisfies Prisma.InventoryTransactionInclude;

export class StaffCollectionService {
  private prisma = prisma;

  private buildStaffCollectionWhere(params: ListStaffCollectionsParams): Prisma.InventoryTransactionWhereInput {
    return {
      transactionType: InventoryTransactionType.staff_collection,
      ...(params.itemId ? { itemId: params.itemId } : {}),
      ...(params.staffId ? { staffId: params.staffId } : {}),
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
        ? { OR: [{ referenceNo: { contains: params.q } }, { notes: { contains: params.q } }] }
        : {}),
    };
  }

  private async assertItemExists(itemId: string) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: itemId }, select: { id: true } });
    if (!item) throw new Error("Invalid itemId");
  }

  private async assertStaffExists(staffId: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id: staffId }, select: { id: true } });
    if (!staff) throw new Error("Invalid staffId");
  }

  private async getActivePeriodIdsOrNull(): Promise<{ sessionId: string | null; termId: string | null }> {
    const ap = await activePeriodService.getActivePeriod();
    if (!ap) return { sessionId: null, termId: null };
    return { sessionId: ap.sessionId ?? null, termId: ap.termId ?? null };
  }

  async createStaffCollection(input: {
    itemId: string;
    qtyOut: string | number;
    outCost?: string | number;
    referenceNo?: string | null;
    notes?: string | null;
    staffId?: string | null;
    transactionDate?: Date;
    createdById: string;
    storeId?: string | null;
  }): Promise<StaffCollectionData> {
    await this.assertItemExists(input.itemId);
    const staffIdNormalized = input.staffId ?? null;
    if (staffIdNormalized) await this.assertStaffExists(staffIdNormalized);

    const storeId = await resolveStoreIdForIssuer(input.storeId, input.createdById);

    const active = await this.getActivePeriodIdsOrNull();
    const finalReferenceNo =
      input.referenceNo === undefined || input.referenceNo === null || input.referenceNo.trim() === ""
        ? generateReferenceNo("SFC")
        : input.referenceNo;

    return await this.prisma.inventoryTransaction.create({
      data: {
        itemId: input.itemId,
        transactionType: InventoryTransactionType.staff_collection,
        qtyOut: input.qtyOut as any,
        outCost: (input.outCost ?? 0) as any,
        status: InventoryTransactionStatus.completed,
        referenceNo: finalReferenceNo,
        notes: input.notes ?? null,
        staffId: staffIdNormalized,
        sessionId: active.sessionId,
        termId: active.termId,
        transactionDate: input.transactionDate ?? new Date(),
        createdById: input.createdById,
        storeId,
      },
      include: staffCollectionInclude,
    });
  }

  async createBulkStaffCollections(input: {
    staffId?: string | null;
    referenceNo?: string | null;
    notes?: string | null;
    transactionDate?: Date;
    createdById: string;
    storeId?: string | null;
    items: Array<{ itemId: string; qtyOut: string | number; outCost?: string | number }>;
  }): Promise<StaffCollectionData[]> {
    if (!input.items.length) throw new Error("items must not be empty");

    const staffIdNormalized = input.staffId ?? null;
    if (staffIdNormalized) await this.assertStaffExists(staffIdNormalized);

    const storeId = await resolveStoreIdForIssuer(input.storeId, input.createdById);

    const itemIds = [...new Set(input.items.map((i) => i.itemId))];
    const existingItems = await this.prisma.inventoryItem.findMany({ where: { id: { in: itemIds } }, select: { id: true } });
    const existingSet = new Set(existingItems.map((i) => i.id));
    const missing = itemIds.filter((id) => !existingSet.has(id));
    if (missing.length) throw new Error(`Invalid itemId(s): ${missing.join(", ")}`);

    const active = await this.getActivePeriodIdsOrNull();
    const finalReferenceNo =
      input.referenceNo === undefined || input.referenceNo === null || input.referenceNo.trim() === ""
        ? generateReferenceNo("SFC")
        : input.referenceNo;
    const txDate = input.transactionDate ?? new Date();

    return await this.prisma.$transaction(
      input.items.map((it) =>
        this.prisma.inventoryTransaction.create({
          data: {
            itemId: it.itemId,
            transactionType: InventoryTransactionType.staff_collection,
            qtyOut: it.qtyOut as any,
            outCost: (it.outCost ?? 0) as any,
            status: InventoryTransactionStatus.completed,
            referenceNo: finalReferenceNo,
            notes: input.notes ?? null,
            staffId: staffIdNormalized,
            sessionId: active.sessionId,
            termId: active.termId,
            transactionDate: txDate,
            createdById: input.createdById,
            storeId,
          },
          include: staffCollectionInclude,
        })
      )
    );
  }

  async listStaffCollections(params: ListStaffCollectionsParams = {}): Promise<{
    staffCollections: StaffCollectionData[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where = this.buildStaffCollectionWhere(params);

    const [total, rows] = await Promise.all([
      this.prisma.inventoryTransaction.count({ where }),
      this.prisma.inventoryTransaction.findMany({
        where,
        orderBy: { transactionDate: "desc" },
        skip,
        take: limit,
        include: staffCollectionInclude,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return { staffCollections: rows, pagination: { page, limit, total, totalPages } };
  }

  async getStaffCollectionById(id: string): Promise<StaffCollectionData | null> {
    return await this.prisma.inventoryTransaction.findFirst({
      where: { id, transactionType: InventoryTransactionType.staff_collection },
      include: staffCollectionInclude,
    });
  }

  async updateStaffCollection(
    id: string,
    input: {
      itemId?: string;
      staffId?: string | null;
      qtyOut?: string | number;
      outCost?: string | number;
      referenceNo?: string | null;
      notes?: string | null;
      transactionDate?: Date;
    }
  ): Promise<StaffCollectionData> {
    if (input.itemId !== undefined) await this.assertItemExists(input.itemId);
    if (input.staffId !== undefined && input.staffId) await this.assertStaffExists(input.staffId);

    const existing = await this.getStaffCollectionById(id);
    if (!existing) throw new Error("Staff collection not found");

    const active = await this.getActivePeriodIdsOrNull();

    return await this.prisma.inventoryTransaction.update({
      where: { id },
      data: {
        ...(input.itemId !== undefined ? { itemId: input.itemId } : {}),
        ...(input.staffId !== undefined ? { staffId: input.staffId } : {}),
        ...(input.qtyOut !== undefined ? { qtyOut: input.qtyOut as any } : {}),
        ...(input.outCost !== undefined ? { outCost: input.outCost as any } : {}),
        ...(input.referenceNo !== undefined ? { referenceNo: input.referenceNo } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        sessionId: active.sessionId,
        termId: active.termId,
        ...(input.transactionDate !== undefined ? { transactionDate: input.transactionDate } : {}),
        transactionType: InventoryTransactionType.staff_collection,
        status: InventoryTransactionStatus.completed,
        updatedAt: new Date(),
      },
      include: staffCollectionInclude,
    });
  }

  async updateBulkStaffCollections(input: {
    updates: Array<{
      id: string;
      itemId?: string;
      staffId?: string | null;
      qtyOut?: string | number;
      outCost?: string | number;
      referenceNo?: string | null;
      notes?: string | null;
      transactionDate?: Date;
    }>;
  }): Promise<StaffCollectionData[]> {
    if (!input.updates.length) throw new Error("updates must not be empty");

    const ids = [...new Set(input.updates.map((u) => u.id))];
    const existing = await this.prisma.inventoryTransaction.findMany({
      where: { id: { in: ids }, transactionType: InventoryTransactionType.staff_collection },
      select: { id: true },
    });
    const existingSet = new Set(existing.map((r) => r.id));
    const missing = ids.filter((id) => !existingSet.has(id));
    if (missing.length) throw new Error(`Staff collection not found: ${missing.join(", ")}`);

    const itemIds = [...new Set(input.updates.map((u) => u.itemId).filter((v): v is string => !!v))];
    if (itemIds.length) {
      const found = await this.prisma.inventoryItem.findMany({ where: { id: { in: itemIds } }, select: { id: true } });
      const foundSet = new Set(found.map((r) => r.id));
      const missingItemIds = itemIds.filter((id) => !foundSet.has(id));
      if (missingItemIds.length) throw new Error(`Invalid itemId(s): ${missingItemIds.join(", ")}`);
    }

    const staffIds = [...new Set(input.updates.map((u) => u.staffId).filter((v): v is string => !!v))];
    if (staffIds.length) {
      const found = await this.prisma.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true } });
      const foundSet = new Set(found.map((r) => r.id));
      const missingStaffIds = staffIds.filter((id) => !foundSet.has(id));
      if (missingStaffIds.length) throw new Error(`Invalid staffId(s): ${missingStaffIds.join(", ")}`);
    }

    const active = await this.getActivePeriodIdsOrNull();

    return await this.prisma.$transaction(async (tx) => {
      const out: StaffCollectionData[] = [];
      for (const u of input.updates) {
        const row = await tx.inventoryTransaction.update({
          where: { id: u.id },
          data: {
            ...(u.itemId !== undefined ? { itemId: u.itemId } : {}),
            ...(u.staffId !== undefined ? { staffId: u.staffId } : {}),
            ...(u.qtyOut !== undefined ? { qtyOut: u.qtyOut as any } : {}),
            ...(u.outCost !== undefined ? { outCost: u.outCost as any } : {}),
            ...(u.referenceNo !== undefined ? { referenceNo: u.referenceNo } : {}),
            ...(u.notes !== undefined ? { notes: u.notes } : {}),
            sessionId: active.sessionId,
            termId: active.termId,
            ...(u.transactionDate !== undefined ? { transactionDate: u.transactionDate } : {}),
            transactionType: InventoryTransactionType.staff_collection,
            status: InventoryTransactionStatus.completed,
            updatedAt: new Date(),
          },
          include: staffCollectionInclude,
        });
        out.push(row);
      }
      return out;
    });
  }

  async deleteStaffCollection(id: string): Promise<StaffCollectionData> {
    const existing = await this.getStaffCollectionById(id);
    if (!existing) throw new Error("Staff collection not found");
    return await this.prisma.inventoryTransaction.delete({
      where: { id },
      include: staffCollectionInclude,
    });
  }

  async deleteBulkStaffCollections(input: { ids: string[] }): Promise<StaffCollectionData[]> {
    if (!input.ids.length) throw new Error("ids must not be empty");
    const ids = [...new Set(input.ids)];

    const existing = await this.prisma.inventoryTransaction.findMany({
      where: { id: { in: ids }, transactionType: InventoryTransactionType.staff_collection },
      include: staffCollectionInclude,
    });
    const existingSet = new Set(existing.map((r) => r.id));
    const missing = ids.filter((id) => !existingSet.has(id));
    if (missing.length) throw new Error(`Staff collection not found: ${missing.join(", ")}`);

    await this.prisma.$transaction(ids.map((id) => this.prisma.inventoryTransaction.delete({ where: { id } })));
    return existing;
  }

  async summarizeStaffCollectionsByItem(params: ListStaffCollectionsParams = {}): Promise<{
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
    const where = this.buildStaffCollectionWhere(params);

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
}

export const staffCollectionService = new StaffCollectionService();

