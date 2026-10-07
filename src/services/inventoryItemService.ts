import prisma from "../utils/prisma";
import { InventoryTransactionStatus, InventoryTransactionType, Prisma } from "@prisma/client";
import { Status } from "@prisma/client";

export interface InventoryItemData {
  id: string;
  sku: string | null;
  name: string;
  categoryId: string | null;
  subCategoryId: string | null;
  brandId: string | null;
  uomId: string | null;
  barcode: string | null;
  costPrice: any;
  sellingPrice: any;
  lowStockThreshold: number;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  currentStock?: string;
  status?: Status;
}

export interface ListInventoryItemsParams {
  q?: string;
  categoryId?: string;
  subCategoryId?: string;
  brandId?: string;
  uomId?: string;
  createdById?: string;
  /** When set, `currentStock` is sum(qtyIn) − sum(qtyOut) for completed rows at this store only. */
  storeId?: string;
  status?: Status | "All";
  page?: number;
  limit?: number;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function endOfUtcDay(d: Date): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  return new Date(Date.UTC(y, m, day, 23, 59, 59, 999));
}

function startOfUtcMonthContaining(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** Default window: first day of current UTC month 00:00 through end of today UTC. */
function defaultMonthIntervalToToday(): { from: Date; to: Date } {
  const now = new Date();
  return { from: startOfUtcMonthContaining(now), to: endOfUtcDay(now) };
}

function decimalNetBalance(sumIn: Prisma.Decimal | null, sumOut: Prisma.Decimal | null): string {
  const qtyIn = sumIn ?? new Prisma.Decimal(0);
  const qtyOut = sumOut ?? new Prisma.Decimal(0);
  return qtyIn.minus(qtyOut).toString();
}

export interface InventoryItemTransactionLogParams {
  itemId: string;
  storeId?: string;
  transactionDateFrom?: Date;
  transactionDateTo?: Date;
}

export type InventoryItemTransactionLogRow = {
  id: string;
  transactionType: InventoryTransactionType;
  qtyIn: string;
  qtyOut: string;
  inCost: string;
  outCost: string;
  amountPaid: string;
  status: InventoryTransactionStatus;
  referenceNo: string | null;
  notes: string | null;
  transactionDate: Date;
  store: { id: string; name: string } | null;
  createdBy: { id: string; firstName: string | null; lastName: string | null };
};

export interface InventoryItemTransactionLogResult {
  item: { id: string; name: string; sku: string | null };
  transactionDateFrom: Date;
  transactionDateTo: Date;
  storeId: string | null;
  /** Sum(qtyIn) − sum(qtyOut) for completed rows with transactionDate strictly before `transactionDateFrom`. */
  balanceBeforeFromDate: string;
  transactions: InventoryItemTransactionLogRow[];
}

export interface ItemBalancesParams {
  categoryId?: string;
  subCategoryId?: string;
  storeId?: string;
}

export interface ItemBalanceRow {
  itemId: string;
  name: string;
  sku: string | null;
  category: { id: string; name: string } | null;
  subCategory: { id: string; name: string } | null;
  /** sum(qtyIn) − sum(qtyOut) for completed transactions; scoped by store when `storeId` was passed. */
  balance: string;
}

export interface InventoryBalanceMatrixParams {
  stores?: string[] | null;
  items?: string[] | null;
  categoryId?: string;
  subCategoryId?: string;
}

export type InventoryBalanceMatrixRow = {
  store: { id: string; name: string };
  items: Array<{
    item: {
      id: string;
      name: string;
      sku: string | null;
      barcode: string | null;
      category: { id: string; name: string } | null;
      subCategory: { id: string; name: string } | null;
    };
    /** sum(qtyIn) − sum(qtyOut) for completed transactions at this store */
    balance: string;
  }>;
};

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as any).code === "string";
}

export class InventoryItemService {
  private prisma = prisma;

  private async assertLookupsExist(input: {
    categoryId?: string | null;
    subCategoryId?: string | null;
    brandId?: string | null;
    uomId?: string | null;
  }) {
    const checks: Array<Promise<any>> = [];

    if (input.categoryId) {
      checks.push(
        this.prisma.category.findUnique({ where: { id: input.categoryId } }).then((row) => {
          if (!row) throw new Error("Invalid categoryId");
        })
      );
    }
    if (input.subCategoryId) {
      checks.push(
        this.prisma.subCategory.findUnique({ where: { id: input.subCategoryId } }).then((row) => {
          if (!row) throw new Error("Invalid subCategoryId");
        })
      );
    }
    if (input.brandId) {
      checks.push(
        this.prisma.brand.findUnique({ where: { id: input.brandId } }).then((row) => {
          if (!row) throw new Error("Invalid brandId");
        })
      );
    }
    if (input.uomId) {
      checks.push(
        this.prisma.uom.findUnique({ where: { id: input.uomId } }).then((row) => {
          if (!row) throw new Error("Invalid uomId");
        })
      );
    }

    await Promise.all(checks);
  }

  private async assertBarcodeUnique(barcode: string, excludeId?: string) {
    const existing = await this.prisma.inventoryItem.findFirst({
      where: {
        barcode,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new Error("Barcode already exists");
    }
  }

  async createInventoryItem(input: {
    sku?: string | null;
    name: string;
    categoryId?: string | null;
    subCategoryId?: string | null;
    brandId?: string | null;
    uomId?: string | null;
    barcode?: string | null;
    costPrice: string | number;
    sellingPrice: string | number;
    lowStockThreshold?: number;
    createdById: string;
  }): Promise<InventoryItemData> {
    try {
      await this.assertLookupsExist({
        categoryId: input.categoryId,
        subCategoryId: input.subCategoryId,
        brandId: input.brandId,
        uomId: input.uomId,
      });

      if (input.barcode) {
        await this.assertBarcodeUnique(input.barcode);
      }

      return await this.prisma.inventoryItem.create({
        data: {
          sku: input.sku ?? null,
          name: input.name,
          categoryId: input.categoryId ?? null,
          subCategoryId: input.subCategoryId ?? null,
          brandId: input.brandId ?? null,
          uomId: input.uomId ?? null,
          barcode: input.barcode ?? null,
          costPrice: input.costPrice as any,
          sellingPrice: input.sellingPrice as any,
          lowStockThreshold: input.lowStockThreshold ?? 0,
          createdById: input.createdById,
        },
      });
    } catch (e) {
      console.error(e);
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("SKU or barcode already exists");
      }
      throw e;
    }
  }

  async listInventoryItems(params: ListInventoryItemsParams = {}): Promise<{
    inventoryItems: InventoryItemData[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const storeId = params.storeId?.trim();
    if (storeId) {
      const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
      if (!store) throw new Error("Invalid storeId");
    }

    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.subCategoryId) where.subCategoryId = params.subCategoryId;
    if (params.brandId) where.brandId = params.brandId;
    if (params.uomId) where.uomId = params.uomId;
    if (params.createdById) where.createdById = params.createdById;

    // Default behavior: only Active unless explicitly overridden.
    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.q) {
      where.OR = [
        { name: { contains: params.q } },
        { sku: { contains: params.q } },
        { barcode: { contains: params.q } },
      ];
    }

    const finalWhere = Object.keys(where).length ? where : undefined;

    const [total, rows] = await Promise.all([
      this.prisma.inventoryItem.count({ where: finalWhere }),
      this.prisma.inventoryItem.findMany({
        where: finalWhere,
        orderBy: { name: "asc" },
        include: {category: {select: {name: true}}, subCategory: {select: {name: true}}, brand: {select: {name: true}}, uom: {select: {name: true}}, createdBy: {select: {firstName: true, lastName: true}}},
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    const itemIds = rows.map((r) => r.id);
    const stockAgg = itemIds.length
      ? await this.prisma.inventoryTransaction.groupBy({
          by: ["itemId"],
          where: {
            itemId: { in: itemIds },
            status: InventoryTransactionStatus.completed,
            ...(storeId ? { storeId } : {}),
          },
          _sum: { qtyIn: true, qtyOut: true },
        })
      : [];

    const stockByItemId = new Map<string, string>();
    for (const r of stockAgg) {
      stockByItemId.set(
        r.itemId,
        decimalNetBalance(r._sum.qtyIn ?? null, r._sum.qtyOut ?? null)
      );
    }

    // Keep behavior predictable if MySQL collation differs.
    const q = params.q?.toLowerCase();
    const filteredRows = q
      ? rows.filter((it) => {
          const name = it.name.toLowerCase();
          const sku = (it.sku ?? "").toLowerCase();
          const barcode = (it.barcode ?? "").toLowerCase();
          return name.includes(q) || sku.includes(q) || barcode.includes(q);
        })
      : rows;

    const inventoryItems = filteredRows.map((it) => ({
      ...it,
      currentStock: stockByItemId.get(it.id) ?? "0",
    }));

    return { inventoryItems, pagination: { page, limit, total, totalPages } };
  }

  async getInventoryItemById(id: string): Promise<InventoryItemData | null> {
    return await this.prisma.inventoryItem.findUnique({ where: { id } });
  }

  /**
   * Completed inventory transactions for an item in a date window. Defaults to current UTC month through today.
   * Opening balance uses completed rows only, strictly before the window start; scoped by store when `storeId` is set.
   */
  async getInventoryItemTransactionLog(
    params: InventoryItemTransactionLogParams
  ): Promise<InventoryItemTransactionLogResult> {
    const itemId = params.itemId.trim();
    if (!itemId) throw new Error("itemId is required");

    const storeId = params.storeId?.trim();
    if (storeId && storeId.length > 0) {
      const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
      if (!store) throw new Error("Invalid storeId");
    }

    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: itemId },
      select: { id: true, name: true, sku: true },
    });
    if (!item) throw new Error("Inventory item not found");

    let from: Date;
    let to: Date;
    if (params.transactionDateFrom !== undefined && params.transactionDateTo !== undefined) {
      from = params.transactionDateFrom;
      to = params.transactionDateTo;
    } else if (params.transactionDateFrom !== undefined) {
      from = params.transactionDateFrom;
      to = endOfUtcDay(new Date());
    } else if (params.transactionDateTo !== undefined) {
      const t = params.transactionDateTo;
      from = startOfUtcMonthContaining(t);
      to = endOfUtcDay(t);
    } else {
      ({ from, to } = defaultMonthIntervalToToday());
    }

    if (from.getTime() > to.getTime()) {
      throw new Error("transactionDateFrom must be before or equal to transactionDateTo");
    }

    const storeFilter = storeId && storeId.length > 0 ? { storeId } : {};

    const completed = InventoryTransactionStatus.completed;

    const [balanceAgg, rows] = await Promise.all([
      this.prisma.inventoryTransaction.aggregate({
        where: {
          itemId,
          status: completed,
          transactionDate: { lt: from },
          ...storeFilter,
        },
        _sum: { qtyIn: true, qtyOut: true },
      }),
      this.prisma.inventoryTransaction.findMany({
        where: {
          itemId,
          status: completed,
          transactionDate: { gte: from, lte: to },
          ...storeFilter,
        },
        orderBy: [{ transactionDate: "asc" }, { updatedAt: "asc" }, { createdAt: "asc" }],
        include: {
          store: { select: { id: true, name: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    const balanceBeforeFromDate = decimalNetBalance(balanceAgg._sum.qtyIn ?? null, balanceAgg._sum.qtyOut ?? null);

    const transactions: InventoryItemTransactionLogRow[] = rows.map((r) => ({
      id: r.id,
      transactionType: r.transactionType,
      qtyIn: r.qtyIn.toString(),
      qtyOut: r.qtyOut.toString(),
      inCost: r.inCost.toString(),
      outCost: r.outCost.toString(),
      amountPaid: r.amountPaid.toString(),
      status: r.status,
      referenceNo: r.referenceNo,
      notes: r.notes,
      transactionDate: r.transactionDate,
      store: r.store,
      createdBy: r.createdBy,
    }));

    return {
      item,
      transactionDateFrom: from,
      transactionDateTo: to,
      storeId: storeId && storeId.length > 0 ? storeId : null,
      balanceBeforeFromDate,
      transactions,
    };
  }

  /**
   * Current quantity balance per item (completed transactions only): sum(qtyIn) − sum(qtyOut).
   * Only **Active** catalog items are included; optional filters narrow which items participate.
   */
  async getItemBalancesGrouped(params: ItemBalancesParams = {}): Promise<{ balances: ItemBalanceRow[] }> {
    const categoryId = params.categoryId?.trim();
    const subCategoryId = params.subCategoryId?.trim();
    const storeId = params.storeId?.trim();

    if (storeId) {
      const st = await this.prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
      if (!st) throw new Error("Invalid storeId");
    }

    await this.assertLookupsExist({
      ...(categoryId ? { categoryId } : {}),
      ...(subCategoryId ? { subCategoryId } : {}),
    });

    const items = await this.prisma.inventoryItem.findMany({
      where: {
        status: Status.Active,
        ...(categoryId ? { categoryId } : {}),
        ...(subCategoryId ? { subCategoryId } : {}),
      },
      select: {
        id: true,
        name: true,
        sku: true,
        category: { select: { id: true, name: true } },
        subCategory: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });

    if (!items.length) {
      return { balances: [] };
    }

    const ids = items.map((i) => i.id);

    const agg = await this.prisma.inventoryTransaction.groupBy({
      by: ["itemId"],
      where: {
        itemId: { in: ids },
        status: InventoryTransactionStatus.completed,
        ...(storeId ? { storeId } : {}),
      },
      _sum: { qtyIn: true, qtyOut: true },
    });

    const balanceByItemId = new Map<string, string>();
    for (const row of agg) {
      balanceByItemId.set(
        row.itemId,
        decimalNetBalance(row._sum.qtyIn ?? null, row._sum.qtyOut ?? null)
      );
    }

    const balances: ItemBalanceRow[] = items.map((it) => ({
      itemId: it.id,
      name: it.name,
      sku: it.sku,
      category: it.category,
      subCategory: it.subCategory,
      balance: balanceByItemId.get(it.id) ?? "0",
    }));

    return { balances };
  }

  async updateInventoryItem(
    id: string,
    input: {
      sku?: string | null;
      name?: string;
      categoryId?: string | null;
      subCategoryId?: string | null;
      brandId?: string | null;
      uomId?: string | null;
      barcode?: string | null;
      costPrice?: string | number;
      sellingPrice?: string | number;
      lowStockThreshold?: number;
      status?: Status;
    }
  ): Promise<InventoryItemData> {
    try {
      await this.assertLookupsExist({
        categoryId: input.categoryId,
        subCategoryId: input.subCategoryId,
        brandId: input.brandId,
        uomId: input.uomId,
      });

      if (input.barcode) {
        await this.assertBarcodeUnique(input.barcode, id);
      }

      return await this.prisma.inventoryItem.update({
        where: { id },
        data: {
          ...(input.sku !== undefined ? { sku: input.sku } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.subCategoryId !== undefined ? { subCategoryId: input.subCategoryId } : {}),
          ...(input.brandId !== undefined ? { brandId: input.brandId } : {}),
          ...(input.uomId !== undefined ? { uomId: input.uomId } : {}),
          ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
          ...(input.costPrice !== undefined ? { costPrice: input.costPrice as any } : {}),
          ...(input.sellingPrice !== undefined ? { sellingPrice: input.sellingPrice as any } : {}),
          ...(input.lowStockThreshold !== undefined ? { lowStockThreshold: input.lowStockThreshold } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedAt: new Date(),
        },
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("SKU or barcode already exists");
      }
      throw e;
    }
  }

  async deleteInventoryItem(id: string): Promise<InventoryItemData> {
    const inventoryTransactionCount = await this.prisma.inventoryTransaction.count({
      where: { itemId: id },
    });

    if (inventoryTransactionCount > 0) {
      throw new Error(
        `Cannot delete inventory item because it is referenced by inventory transactions (${inventoryTransactionCount})`
      );
    }

    try {
      return await this.prisma.inventoryItem.delete({ where: { id } });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Inventory item not found");
      }
      throw e;
    }
  }

  /**
   * Balance matrix: for each store, list each item and its balance (sum(qtyIn) − sum(qtyOut))
   * computed from completed transactions at that store.
   *
   * When `stores` or `items` is null/empty, defaults to all Active stores/items respectively.
   */
  async getInventoryBalanceMatrix(
    params: InventoryBalanceMatrixParams = {}
  ): Promise<InventoryBalanceMatrixRow[]> {
    const categoryId = params.categoryId?.trim();
    const subCategoryId = params.subCategoryId?.trim();

    await this.assertLookupsExist({
      ...(categoryId ? { categoryId } : {}),
      ...(subCategoryId ? { subCategoryId } : {}),
    });

    const requestedStoreIds =
      params.stores === null || params.stores === undefined
        ? []
        : params.stores.map((s) => s.trim()).filter(Boolean);
    const requestedItemIds =
      params.items === null || params.items === undefined
        ? []
        : params.items.map((s) => s.trim()).filter(Boolean);

    const stores =
      requestedStoreIds.length > 0
        ? await this.prisma.store.findMany({
            where: { id: { in: requestedStoreIds }, status: Status.Active },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          })
        : await this.prisma.store.findMany({
            where: { status: Status.Active },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          });

    if (requestedStoreIds.length > 0 && stores.length !== new Set(requestedStoreIds).size) {
      throw new Error("One or more store IDs were not found");
    }

    const items =
      requestedItemIds.length > 0
        ? await this.prisma.inventoryItem.findMany({
            where: {
              id: { in: requestedItemIds },
              status: Status.Active,
              ...(categoryId ? { categoryId } : {}),
              ...(subCategoryId ? { subCategoryId } : {}),
            },
            select: {
              id: true,
              name: true,
              sku: true,
              barcode: true,
              category: { select: { id: true, name: true } },
              subCategory: { select: { id: true, name: true } },
            },
            orderBy: { name: "asc" },
          })
        : await this.prisma.inventoryItem.findMany({
            where: {
              status: Status.Active,
              ...(categoryId ? { categoryId } : {}),
              ...(subCategoryId ? { subCategoryId } : {}),
            },
            select: {
              id: true,
              name: true,
              sku: true,
              barcode: true,
              category: { select: { id: true, name: true } },
              subCategory: { select: { id: true, name: true } },
            },
            orderBy: { name: "asc" },
          });

    if (requestedItemIds.length > 0 && items.length !== new Set(requestedItemIds).size) {
      throw new Error("One or more item IDs were not found");
    }

    if (!stores.length || !items.length) {
      return stores.map((st) => ({ store: st, items: [] }));
    }

    const storeIds = stores.map((s) => s.id);
    const itemIds = items.map((i) => i.id);

    const agg = await this.prisma.inventoryTransaction.groupBy({
      by: ["storeId", "itemId"],
      where: {
        status: InventoryTransactionStatus.completed,
        storeId: { in: storeIds },
        itemId: { in: itemIds },
      },
      _sum: { qtyIn: true, qtyOut: true },
    });

    const balanceByStoreItem = new Map<string, string>();
    for (const row of agg) {
      // storeId is nullable in schema, but our filter ensures non-null.
      if (!row.storeId) continue;
      balanceByStoreItem.set(
        `${row.storeId}::${row.itemId}`,
        decimalNetBalance(row._sum.qtyIn ?? null, row._sum.qtyOut ?? null)
      );
    }

    return stores.map((store) => ({
      store,
      items: items.map((item) => ({
        item,
        balance: balanceByStoreItem.get(`${store.id}::${item.id}`) ?? "0",
      })),
    }));
  }
}

export const inventoryItemService = new InventoryItemService();

