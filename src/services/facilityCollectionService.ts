import prisma from "../utils/prisma";
import { activePeriodService } from "./activePeriodService";
import { resolveStoreIdForIssuer } from "./resolveStoreForIssuer";
import { InventoryTransactionStatus, InventoryTransactionType, Prisma } from "@prisma/client";
import { generateReferenceNo } from "../utils/referenceNo";

export interface FacilityCollectionTransactionData {
  id: string;
  itemId: string;
  transactionType: InventoryTransactionType;
  qtyOut: unknown;
  status: InventoryTransactionStatus;
  referenceNo: string | null;
  notes: string | null;
  termId: string | null;
  sessionId: string | null;
  facilityId: string | null;
  staffId: string | null;
  hostelId: string | null;
  transactionDate: Date;
  createdById: string;
  storeId: string | null;
  createdAt: Date;
  updatedAt: Date;
  item?: { name: string } | null;
  store?: { id: string; name: string } | null;
  createdBy?: { firstName: string | null; lastName: string | null } | null;
  facility?: { id: string; name: string } | null;
  staff?: { id: string; StaffNumber: string; name: string; email: string } | null;
  hostel?: { id: string; name: string } | null;
}

export interface ListFacilityCollectionsParams {
  q?: string;
  itemId?: string;
  facilityId?: string;
  staffId?: string;
  hostelId?: string;
  sessionId?: string;
  termId?: string;
  status?: InventoryTransactionStatus;
  transactionDateFrom?: Date;
  transactionDateTo?: Date;
  page?: number;
  limit?: number;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const collectionInclude = {
  item: { select: { name: true } },
  createdBy: { select: { firstName: true, lastName: true } },
  store: { select: { id: true, name: true } },
  facility: { select: { id: true, name: true } },
  staff: { select: { id: true, StaffNumber: true, name: true, email: true } },
  hostel: { select: { id: true, name: true } },
} satisfies Prisma.InventoryTransactionInclude;

export class FacilityCollectionService {
  private prisma = prisma;

  private buildWhere(params: ListFacilityCollectionsParams): Prisma.InventoryTransactionWhereInput {
    return {
      transactionType: InventoryTransactionType.facility_collection,
      ...(params.itemId ? { itemId: params.itemId } : {}),
      ...(params.facilityId ? { facilityId: params.facilityId } : {}),
      ...(params.staffId ? { staffId: params.staffId } : {}),
      ...(params.hostelId ? { hostelId: params.hostelId } : {}),
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
      ...(params.q ? { OR: [{ referenceNo: { contains: params.q } }, { notes: { contains: params.q } }] } : {}),
    };
  }

  private async assertItemExists(itemId: string) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: itemId }, select: { id: true } });
    if (!item) throw new Error("Invalid itemId");
  }

  private async assertFacilityExists(facilityId: string) {
    const row = await this.prisma.facility.findUnique({ where: { id: facilityId }, select: { id: true } });
    if (!row) throw new Error("Invalid facilityId");
  }

  private async assertStaffExists(staffId: string) {
    const row = await this.prisma.staff.findUnique({ where: { id: staffId }, select: { id: true } });
    if (!row) throw new Error("Invalid staffId");
  }

  private async assertHostelExists(hostelId: string) {
    const row = await this.prisma.hostel.findUnique({ where: { id: hostelId }, select: { id: true } });
    if (!row) throw new Error("Invalid hostelId");
  }

  private async getActivePeriodIdsOrNull(): Promise<{ sessionId: string | null; termId: string | null }> {
    const ap = await activePeriodService.getActivePeriod();
    if (!ap) return { sessionId: null, termId: null };
    return { sessionId: ap.sessionId ?? null, termId: ap.termId ?? null };
  }

  async createFacilityCollection(input: {
    itemId: string;
    qtyOut: string | number;
    notes: string;
    facilityId: string;
    staffId?: string | null;
    hostelId?: string | null;
    referenceNo?: string | null;
    transactionDate?: Date;
    createdById: string;
    storeId?: string | null;
  }): Promise<FacilityCollectionTransactionData> {
    await this.assertItemExists(input.itemId);
    await this.assertFacilityExists(input.facilityId);
    if (input.staffId) await this.assertStaffExists(input.staffId);
    if (input.hostelId) await this.assertHostelExists(input.hostelId);

    const storeId = await resolveStoreIdForIssuer(input.storeId, input.createdById);
    const active = await this.getActivePeriodIdsOrNull();
    const finalReferenceNo =
      input.referenceNo === undefined || input.referenceNo === null || input.referenceNo.trim() === ""
        ? generateReferenceNo("FCOL")
        : input.referenceNo.trim();

    return await this.prisma.inventoryTransaction.create({
      data: {
        itemId: input.itemId,
        transactionType: InventoryTransactionType.facility_collection,
        qtyOut: input.qtyOut as any,
        status: InventoryTransactionStatus.completed,
        referenceNo: finalReferenceNo,
        notes: input.notes.trim(),
        sessionId: active.sessionId,
        termId: active.termId,
        facilityId: input.facilityId,
        staffId: input.staffId ?? null,
        hostelId: input.hostelId ?? null,
        transactionDate: input.transactionDate ?? new Date(),
        createdById: input.createdById,
        storeId,
      },
      include: collectionInclude,
    });
  }

  async createBulkFacilityCollections(input: {
    notes: string;
    facilityId: string;
    staffId?: string | null;
    hostelId?: string | null;
    referenceNo?: string | null;
    transactionDate?: Date;
    createdById: string;
    storeId?: string | null;
    items: Array<{ itemId: string; qtyOut: string | number }>;
  }): Promise<FacilityCollectionTransactionData[]> {
    if (!input.items.length) throw new Error("items must not be empty");

    await this.assertFacilityExists(input.facilityId);
    if (input.staffId) await this.assertStaffExists(input.staffId);
    if (input.hostelId) await this.assertHostelExists(input.hostelId);

    const storeId = await resolveStoreIdForIssuer(input.storeId, input.createdById);

    const itemIds = [...new Set(input.items.map((i) => i.itemId))];
    const existingItems = await this.prisma.inventoryItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true },
    });
    const existingSet = new Set(existingItems.map((i) => i.id));
    const missing = itemIds.filter((id) => !existingSet.has(id));
    if (missing.length) throw new Error(`Invalid itemId(s): ${missing.join(", ")}`);

    const active = await this.getActivePeriodIdsOrNull();
    const finalReferenceNo =
      input.referenceNo === undefined || input.referenceNo === null || input.referenceNo.trim() === ""
        ? generateReferenceNo("FCOL")
        : input.referenceNo.trim();
    const txDate = input.transactionDate ?? new Date();

    return await this.prisma.$transaction(
      input.items.map((it) =>
        this.prisma.inventoryTransaction.create({
          data: {
            itemId: it.itemId,
            transactionType: InventoryTransactionType.facility_collection,
            qtyOut: it.qtyOut as any,
            status: InventoryTransactionStatus.completed,
            referenceNo: finalReferenceNo,
            notes: input.notes.trim(),
            sessionId: active.sessionId,
            termId: active.termId,
            facilityId: input.facilityId,
            staffId: input.staffId ?? null,
            hostelId: input.hostelId ?? null,
            transactionDate: txDate,
            createdById: input.createdById,
            storeId,
          },
          include: collectionInclude,
        })
      )
    );
  }

  async listFacilityCollections(params: ListFacilityCollectionsParams = {}): Promise<{
    facilityCollections: FacilityCollectionTransactionData[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where = this.buildWhere(params);

    const [total, rows] = await Promise.all([
      this.prisma.inventoryTransaction.count({ where }),
      this.prisma.inventoryTransaction.findMany({
        where,
        orderBy: { transactionDate: "desc" },
        skip,
        take: limit,
        include: collectionInclude,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return { facilityCollections: rows, pagination: { page, limit, total, totalPages } };
  }

  async getFacilityCollectionById(id: string): Promise<FacilityCollectionTransactionData | null> {
    return await this.prisma.inventoryTransaction.findFirst({
      where: { id, transactionType: InventoryTransactionType.facility_collection },
      include: collectionInclude,
    });
  }

  async updateFacilityCollection(
    id: string,
    input: {
      itemId?: string;
      qtyOut?: string | number;
      referenceNo?: string | null;
      notes?: string;
      facilityId?: string;
      staffId?: string | null;
      hostelId?: string | null;
      transactionDate?: Date;
    }
  ): Promise<FacilityCollectionTransactionData> {
    if (input.itemId !== undefined) await this.assertItemExists(input.itemId);
    if (input.facilityId !== undefined) await this.assertFacilityExists(input.facilityId);
    if (input.staffId) await this.assertStaffExists(input.staffId);
    if (input.hostelId) await this.assertHostelExists(input.hostelId);

    const existing = await this.getFacilityCollectionById(id);
    if (!existing) throw new Error("Facility collection not found");

    if (input.notes !== undefined && input.notes.trim() === "") {
      throw new Error("notes cannot be empty");
    }

    const active = await this.getActivePeriodIdsOrNull();

    return await this.prisma.inventoryTransaction.update({
      where: { id },
      data: {
        ...(input.itemId !== undefined ? { itemId: input.itemId } : {}),
        ...(input.qtyOut !== undefined ? { qtyOut: input.qtyOut as any } : {}),
        ...(input.referenceNo !== undefined
          ? {
              referenceNo:
                input.referenceNo === null
                  ? null
                  : String(input.referenceNo).trim() === ""
                    ? generateReferenceNo("FCOL")
                    : String(input.referenceNo).trim(),
            }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes.trim() } : {}),
        ...(input.facilityId !== undefined ? { facilityId: input.facilityId } : {}),
        ...(input.staffId !== undefined ? { staffId: input.staffId } : {}),
        ...(input.hostelId !== undefined ? { hostelId: input.hostelId } : {}),
        sessionId: active.sessionId,
        termId: active.termId,
        ...(input.transactionDate !== undefined ? { transactionDate: input.transactionDate } : {}),
        transactionType: InventoryTransactionType.facility_collection,
        status: InventoryTransactionStatus.completed,
        updatedAt: new Date(),
      },
      include: collectionInclude,
    });
  }

  async updateBulkFacilityCollections(input: {
    updates: Array<{
      id: string;
      itemId?: string;
      qtyOut?: string | number;
      referenceNo?: string | null;
      notes?: string;
      facilityId?: string;
      staffId?: string | null;
      hostelId?: string | null;
      transactionDate?: Date;
    }>;
  }): Promise<FacilityCollectionTransactionData[]> {
    if (!input.updates.length) throw new Error("updates must not be empty");

    const ids = [...new Set(input.updates.map((u) => u.id))];
    const existing = await this.prisma.inventoryTransaction.findMany({
      where: { id: { in: ids }, transactionType: InventoryTransactionType.facility_collection },
      select: { id: true },
    });
    const existingSet = new Set(existing.map((r) => r.id));
    const missing = ids.filter((id) => !existingSet.has(id));
    if (missing.length) throw new Error(`Facility collection not found: ${missing.join(", ")}`);

    const itemIds = [...new Set(input.updates.map((u) => u.itemId).filter((v): v is string => !!v))];
    if (itemIds.length) {
      const found = await this.prisma.inventoryItem.findMany({ where: { id: { in: itemIds } }, select: { id: true } });
      const foundSet = new Set(found.map((r) => r.id));
      const missingItemIds = itemIds.filter((id) => !foundSet.has(id));
      if (missingItemIds.length) throw new Error(`Invalid itemId(s): ${missingItemIds.join(", ")}`);
    }

    const facilityIds = [...new Set(input.updates.map((u) => u.facilityId).filter((v): v is string => !!v))];
    if (facilityIds.length) {
      const found = await this.prisma.facility.findMany({ where: { id: { in: facilityIds } }, select: { id: true } });
      const foundSet = new Set(found.map((r) => r.id));
      const missingFacilityIds = facilityIds.filter((id) => !foundSet.has(id));
      if (missingFacilityIds.length) throw new Error(`Invalid facilityId(s): ${missingFacilityIds.join(", ")}`);
    }

    const staffIds = [...new Set(input.updates.map((u) => u.staffId).filter((v): v is string => !!v))];
    if (staffIds.length) {
      const found = await this.prisma.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true } });
      const foundSet = new Set(found.map((r) => r.id));
      const missingStaffIds = staffIds.filter((id) => !foundSet.has(id));
      if (missingStaffIds.length) throw new Error(`Invalid staffId(s): ${missingStaffIds.join(", ")}`);
    }

    const hostelIds = [...new Set(input.updates.map((u) => u.hostelId).filter((v): v is string => !!v))];
    if (hostelIds.length) {
      const found = await this.prisma.hostel.findMany({ where: { id: { in: hostelIds } }, select: { id: true } });
      const foundSet = new Set(found.map((r) => r.id));
      const missingHostelIds = hostelIds.filter((id) => !foundSet.has(id));
      if (missingHostelIds.length) throw new Error(`Invalid hostelId(s): ${missingHostelIds.join(", ")}`);
    }

    const active = await this.getActivePeriodIdsOrNull();

    return await this.prisma.$transaction(async (tx) => {
      const out: FacilityCollectionTransactionData[] = [];
      for (const u of input.updates) {
        if (u.notes !== undefined && u.notes.trim() === "") {
          throw new Error("notes cannot be empty");
        }
        const row = await tx.inventoryTransaction.update({
          where: { id: u.id },
          data: {
            ...(u.itemId !== undefined ? { itemId: u.itemId } : {}),
            ...(u.qtyOut !== undefined ? { qtyOut: u.qtyOut as any } : {}),
            ...(u.referenceNo !== undefined
              ? {
                  referenceNo:
                    u.referenceNo === null
                      ? null
                      : String(u.referenceNo).trim() === ""
                        ? generateReferenceNo("FCOL")
                        : String(u.referenceNo).trim(),
                }
              : {}),
            ...(u.notes !== undefined ? { notes: u.notes.trim() } : {}),
            ...(u.facilityId !== undefined ? { facilityId: u.facilityId } : {}),
            ...(u.staffId !== undefined ? { staffId: u.staffId } : {}),
            ...(u.hostelId !== undefined ? { hostelId: u.hostelId } : {}),
            sessionId: active.sessionId,
            termId: active.termId,
            ...(u.transactionDate !== undefined ? { transactionDate: u.transactionDate } : {}),
            transactionType: InventoryTransactionType.facility_collection,
            status: InventoryTransactionStatus.completed,
            updatedAt: new Date(),
          },
          include: collectionInclude,
        });
        out.push(row);
      }
      return out;
    });
  }

  async deleteFacilityCollection(id: string): Promise<FacilityCollectionTransactionData> {
    const existing = await this.getFacilityCollectionById(id);
    if (!existing) throw new Error("Facility collection not found");
    return await this.prisma.inventoryTransaction.delete({
      where: { id },
      include: collectionInclude,
    });
  }

  async deleteBulkFacilityCollections(input: { ids: string[] }): Promise<FacilityCollectionTransactionData[]> {
    if (!input.ids.length) throw new Error("ids must not be empty");
    const ids = [...new Set(input.ids)];

    const existing = await this.prisma.inventoryTransaction.findMany({
      where: { id: { in: ids }, transactionType: InventoryTransactionType.facility_collection },
      include: collectionInclude,
    });
    const existingSet = new Set(existing.map((r) => r.id));
    const missing = ids.filter((id) => !existingSet.has(id));
    if (missing.length) throw new Error(`Facility collection not found: ${missing.join(", ")}`);

    await this.prisma.$transaction(ids.map((id) => this.prisma.inventoryTransaction.delete({ where: { id } })));
    return existing;
  }

  async summarizeFacilityCollectionsByItem(params: ListFacilityCollectionsParams = {}): Promise<{
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
    const where = this.buildWhere(params);

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

export const facilityCollectionService = new FacilityCollectionService();
