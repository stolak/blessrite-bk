import prisma from "../utils/prisma";
import {
  AccountChart,
  InventoryCategoryType,
  InventoryTransactionStatus,
  InventoryTransactionType,
  Prisma,
} from "@prisma/client";
import { accountTransactionService } from "./accountTransactionService";
import { AccountChartService } from "./accountChartService";

export interface PurchaseData {
  id: string;
  itemId: string;
  supplierId: string | null;
  transactionType: InventoryTransactionType;
  qtyIn: any;
  inCost: any;
  amountPaid: any;
  status: InventoryTransactionStatus;
  referenceNo: string | null;
  notes: string | null;
  transactionDate: Date;
  createdById: string;
  storeId: string | null;
  createdAt: Date;
  updatedAt: Date;
  item?: { name: string } | null;
  supplier?: { name: string } | null;
  store?: { id: string; name: string } | null;
  createdBy?: { firstName: string | null; lastName: string | null } | null;
}

export interface ListPurchasesParams {
  q?: string;
  itemId?: string;
  supplierId?: string;
  storeId?: string;
  status?: InventoryTransactionStatus;
  /** Inclusive lower bound on transactionDate */
  transactionDateFrom?: Date;
  /** Inclusive upper bound on transactionDate */
  transactionDateTo?: Date;
  page?: number;
  limit?: number;
}

export interface ListGroupedPurchasesParams {
  supplierId?: string;
  storeId?: string;
  /** Inclusive lower bound on transactionDate */
  transactionDateFrom?: Date;
  /** Inclusive upper bound on transactionDate */
  transactionDateTo?: Date;
  page?: number;
  limit?: number;
}

export interface GroupedPurchaseItem {
  id: string;
  itemId: string;
  item: { name: string } | null;
  qtyIn: string;
  inCost: string;
  status: InventoryTransactionStatus;
}

export interface GroupedPurchaseRow {
  supplierId: string | null;
  transactionType: InventoryTransactionType;
  referenceNo: string | null;
  storeId: string | null;
  transactionDate: Date;
  status: InventoryTransactionStatus;
  amountPaid: string;
  supplier: { name: string } | null;
  createdBy: { firstName: string | null; lastName: string | null } | null;
  store: { id: string; name: string } | null;
  notes: string | null;
  items: GroupedPurchaseItem[];
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const purchaseInclude = {
  item: { select: { name: true } },
  supplier: { select: { name: true } },
  createdBy: { select: { firstName: true, lastName: true } },
  store: { select: { id: true, name: true } },
} satisfies Prisma.InventoryTransactionInclude;

export class PurchaseService {
  private prisma = prisma;

  private generatePurchaseReferenceNo(): string {
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `PUR-${stamp}-${rand}`;
  }

  private async assertItemExists(itemId: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: itemId },
      select: { id: true },
    });
    if (!item) throw new Error("Invalid itemId");
  }

  private async assertSupplierExists(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true },
    });
    if (!supplier) throw new Error("Invalid supplierId");
  }
  private async assertPaymentAccountExists(paymentAccountId: number) {
    const paymentAccount = await this.prisma.accountChart.findUnique({
      where: { id: paymentAccountId },
      select: { id: true },
    });
    if (!paymentAccount) throw new Error("Invalid paymentAccountId");
  }
  private async assertStoreExists(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true },
    });
    if (!store) throw new Error("Invalid storeId");
  }

  async createPurchase(input: {
    itemId: string;
    storeId: string;
    supplierId?: string | null;
    qtyIn: string | number;
    inCost?: string | number;
    amountPaid?: string | number;
    paymentAccountId?: string | null;
    referenceNo?: string | null;
    notes?: string | null;
    transactionDate?: Date;
    createdById: string;
    status?: InventoryTransactionStatus;
  }): Promise<PurchaseData> {
    await this.assertItemExists(input.itemId);
    await this.assertStoreExists(input.storeId);
    if (input.supplierId) await this.assertSupplierExists(input.supplierId);
    return await this.prisma.inventoryTransaction.create({
      data: {
        itemId: input.itemId,
        storeId: input.storeId,
        supplierId: input.supplierId ?? null,
        transactionType: InventoryTransactionType.purchase,
        qtyIn: input.qtyIn as any,
        ...(input.inCost !== undefined ? { inCost: input.inCost as any } : {}),
        ...(input.amountPaid !== undefined ? { amountPaid: input.amountPaid as any } : {}),
        status: input.status ?? InventoryTransactionStatus.completed,
        referenceNo: input.referenceNo ?? null,
        notes: input.notes ?? null,
        transactionDate: input.transactionDate ?? new Date(),
        createdById: input.createdById,
      },
      include: purchaseInclude,
    });
  }

  async createBulkPurchases(input: {
    storeId: string;
    supplierId?: string | null;
    referenceNo?: string | null;
    notes?: string | null;
    transactionDate?: Date;
    amountPaid?: string | number;
    paymentAccountId?: string | null;
    createdById: string;
    items: Array<{ itemId: string; qtyIn: string | number; inCost: string | number }>;
    status?: InventoryTransactionStatus;
  }): Promise<PurchaseData[]> {
    if (!input.items.length) {
      throw new Error("items must not be empty");
    }
    await this.assertStoreExists(input.storeId);

    const supplierId = input.supplierId ?? null;
    if (supplierId) await this.assertSupplierExists(supplierId);
    if (Number(input.amountPaid ?? 0) > 0 && !input.paymentAccountId) {
      throw new Error("paymentAccountId is required when amountPaid is greater than zero");
    }
    if (input.paymentAccountId)
      await this.assertPaymentAccountExists(Number(input.paymentAccountId));

    const itemIds = [...new Set(input.items.map((i) => i.itemId))];
    const existingItems = await this.prisma.inventoryItem.findMany({
      where: { id: { in: itemIds } },
      select: {
        id: true,
        name: true,
        category: {
          select: {
            id: true,
            name: true,
            consumableAccountId: true,
            assetAccountId: true,
            categoryType: true,
          },
        },
      },
    });
    const existingSet = new Set(existingItems.map((i) => i.id));
    const missing = itemIds.filter((id) => !existingSet.has(id));
    if (missing.length) {
      throw new Error(`Invalid itemId(s): ${missing.join(", ")}`);
    }

    const txDate = input.transactionDate ?? new Date();
    const status = input.status ?? InventoryTransactionStatus.completed;
    const referenceNo =
      typeof input.referenceNo === "string" && input.referenceNo.trim().length > 0
        ? input.referenceNo.trim()
        : this.generatePurchaseReferenceNo();
    const itemById = new Map(existingItems.map((i) => [i.id, i]));

    const created = await this.prisma.$transaction(async (tx) => {
      const totalInCost = input.items.reduce((acc, it) => {
        return acc.plus(new Prisma.Decimal(it.inCost as any));
      }, new Prisma.Decimal(0));

      let supplierAccountNumber: string | null = null;
      if (totalInCost.gt(0)) {
        if (!supplierId) {
          throw new Error("supplierId is required when purchase total cost is greater than zero");
        }
        const supplierAccount = await tx.accountChart.findFirst({
          where: { accountRef: supplierId },
          select: { id: true },
        });
        if (!supplierAccount) {
          throw new Error("Supplier account not found for supplierId");
        }
        supplierAccountNumber = String(supplierAccount.id);
        // also ensure the  consumable account and asset account exists for the items
        for (const it of input.items) {
          const item = itemById.get(it.itemId);
          if (!item) throw new Error(`Invalid itemId(s): ${it.itemId}`);
          if (!item.category) throw new Error(`Category not configured for itemId ${item.name}`);
          if (!item.category.consumableAccountId)
            throw new Error(
              `Expense account not configured for item ${item.name} in category ${item.category.name}`
            );
          if (!item.category.assetAccountId)
            throw new Error(
              `Asset account not configured for item ${item.name} in category ${item.category.name}`
            );
          // ensure the asset account and consumable account are different
          if (item.category.consumableAccountId === item.category.assetAccountId)
            throw new Error(
              `Expense account and asset account cannot be the same for item ${item.name} in category ${item.category.name}`
            );
          // ensure the asset account and consumable account exists
          const consumableAccount = await tx.accountChart.findFirst({
            where: { id: item.category.consumableAccountId },
            select: { id: true },
          });
          if (!consumableAccount)
            throw new Error(
              `Expense account not found for item ${item.name} in category ${item.category.name}`
            );
          const assetAccount = await tx.accountChart.findFirst({
            where: { id: item.category.assetAccountId },
            select: { id: true },
          });
          if (!assetAccount)
            throw new Error(
              `Asset account not found for item ${item.name} in category ${item.category.name}`
            );
        }
      }

      const createdRows = await Promise.all(
        input.items.map(async (it) => {
          const inCost = new Prisma.Decimal(it.inCost as any);
          const row = await tx.inventoryTransaction.create({
            data: {
              itemId: it.itemId,
              storeId: input.storeId,
              supplierId,
              transactionType: InventoryTransactionType.purchase,
              qtyIn: it.qtyIn as any,
              inCost: it.inCost as any,
              ...(input.amountPaid !== undefined ? { amountPaid: input.amountPaid as any } : {}),
              status,
              referenceNo,
              notes: input.notes ?? null,
              transactionDate: txDate,
              createdById: input.createdById,
            },
            include: purchaseInclude,
          });

          if (inCost.gt(0)) {
            const item = itemById.get(it.itemId);
            if (!item) throw new Error(`Invalid itemId(s): ${it.itemId}`);
            if (!item.category) throw new Error(`Category not configured for itemId ${item.name}`);
            if (!item.category.consumableAccountId)
              throw new Error(
                `Expense account not configured for item ${item.name} in category ${item.category.name}`
              );

            const debitAccountId =
              item.category.categoryType === InventoryCategoryType.Consumable
                ? item.category.consumableAccountId
                : item.category.assetAccountId;

            if (!debitAccountId)
              throw new Error(
                `Asset account not configured for item ${item.name} in category ${item.category.name}`
              );

            await accountTransactionService.debitAccount(
              {
                accountId: String(debitAccountId),
                amount: inCost.toNumber(),
                ref: referenceNo,
                manualRef: referenceNo,
                transactionDate: txDate.toISOString(),
                postedBy: input.createdById,
                remarks: `Purchase debit - ${item.name} - ${referenceNo}`,
              },
              tx
            );
          }

          return row;
        })
      );

      if (totalInCost.gt(0)) {
        await accountTransactionService.creditAccount(
          {
            accountId: supplierAccountNumber ?? "",
            amount: totalInCost.toNumber(),
            ref: referenceNo,
            manualRef: referenceNo,
            transactionDate: txDate.toISOString(),
            postedBy: input.createdById,
            remarks: `Purchase credit - supplier ${supplierId} - ${referenceNo}`,
          },
          tx
        );
      }

      if (input.amountPaid && Number(input.amountPaid) > 0) {
        await accountTransactionService.creditAccount(
          {
            accountId: String(input.paymentAccountId),
            amount: Number(input.amountPaid),
            ref: referenceNo,
            manualRef: referenceNo,
            transactionDate: txDate.toISOString(),
            postedBy: input.createdById,
            remarks: `Purchase credit - payment account - ${referenceNo}`,
          },
          tx
        );
        await accountTransactionService.debitAccount(
          {
            accountId: supplierAccountNumber ?? "",
            amount: Number(input.amountPaid),
            ref: referenceNo,
            manualRef: referenceNo,
            transactionDate: txDate.toISOString(),
            postedBy: input.createdById,
            remarks: `Purchase debit - payment account - ${referenceNo}`,
          },
          tx
        );
      }

      return createdRows;
    });

    return created;
  }

  async listPurchases(params: ListPurchasesParams = {}): Promise<{
    purchases: PurchaseData[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryTransactionWhereInput = {
      transactionType: InventoryTransactionType.purchase,
      ...(params.itemId ? { itemId: params.itemId } : {}),
      ...(params.supplierId ? { supplierId: params.supplierId } : {}),
      ...(params.storeId ? { storeId: params.storeId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.transactionDateFrom !== undefined || params.transactionDateTo !== undefined
        ? {
            transactionDate: {
              ...(params.transactionDateFrom !== undefined
                ? { gte: params.transactionDateFrom }
                : {}),
              ...(params.transactionDateTo !== undefined ? { lte: params.transactionDateTo } : {}),
            },
          }
        : {}),
      ...(params.q
        ? {
            OR: [
              { referenceNo: { contains: params.q } },
              { notes: { contains: params.q } },
              { supplierReceiver: { contains: params.q } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.inventoryTransaction.count({ where }),
      this.prisma.inventoryTransaction.findMany({
        where,
        orderBy: { transactionDate: "desc" },
        skip,
        take: limit,
        include: purchaseInclude,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return { purchases: rows, pagination: { page, limit, total, totalPages } };
  }

  async listGroupedPurchases(params: ListGroupedPurchasesParams = {}): Promise<{
    purchases: GroupedPurchaseRow[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);

    const where: Prisma.InventoryTransactionWhereInput = {
      transactionType: InventoryTransactionType.purchase,
      ...(params.supplierId ? { supplierId: params.supplierId } : {}),
      ...(params.storeId ? { storeId: params.storeId } : {}),
      ...(params.transactionDateFrom !== undefined || params.transactionDateTo !== undefined
        ? {
            transactionDate: {
              ...(params.transactionDateFrom !== undefined
                ? { gte: params.transactionDateFrom }
                : {}),
              ...(params.transactionDateTo !== undefined ? { lte: params.transactionDateTo } : {}),
            },
          }
        : {}),
    };

    const rows = await this.prisma.inventoryTransaction.findMany({
      where,
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      include: purchaseInclude,
    });

    const groupedMap = new Map<string, GroupedPurchaseRow>();
    for (const row of rows) {
      const key = row.referenceNo ?? "__NULL__";
      const existing = groupedMap.get(key);
      if (!existing) {
        groupedMap.set(key, {
          supplierId: row.supplierId,
          transactionType: row.transactionType,
          referenceNo: row.referenceNo,
          storeId: row.storeId,
          transactionDate: row.transactionDate,
          status: row.status,
          amountPaid: row.amountPaid.toString(),
          supplier: row.supplier ? { name: row.supplier.name } : null,
          createdBy: row.createdBy
            ? { firstName: row.createdBy.firstName, lastName: row.createdBy.lastName }
            : null,
          store: row.store ? { id: row.store.id, name: row.store.name } : null,
          notes: row.notes,
          items: [],
        });
      }

      groupedMap.get(key)!.items.push({
        id: row.id,
        itemId: row.itemId,
        item: row.item ? { name: row.item.name } : null,
        qtyIn: row.qtyIn.toString(),
        inCost: row.inCost.toString(),
        status: row.status,
      });
    }

    const grouped = Array.from(groupedMap.values());
    const total = grouped.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const purchases = grouped.slice(start, start + limit);

    return {
      purchases,
      pagination: { page, limit, total, totalPages },
    };
  }

  async getPurchaseById(id: string): Promise<PurchaseData | null> {
    return await this.prisma.inventoryTransaction.findFirst({
      where: { id, transactionType: InventoryTransactionType.purchase },
      include: purchaseInclude,
    });
  }

  async updatePurchase(
    id: string,
    input: {
      itemId?: string;
      supplierId?: string | null;
      qtyIn?: string | number;
      inCost?: string | number;
      amountPaid?: string | number;
      status?: InventoryTransactionStatus;
      referenceNo?: string | null;
      notes?: string | null;
      transactionDate?: Date;
    }
  ): Promise<PurchaseData> {
    if (input.itemId !== undefined) await this.assertItemExists(input.itemId);
    if (input.supplierId) await this.assertSupplierExists(input.supplierId);

    // Ensure we never update a non-purchase transaction.
    const existing = await this.getPurchaseById(id);
    if (!existing) throw new Error("Purchase not found");

    return await this.prisma.inventoryTransaction.update({
      where: { id },
      data: {
        ...(input.itemId !== undefined ? { itemId: input.itemId } : {}),
        ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
        ...(input.qtyIn !== undefined ? { qtyIn: input.qtyIn as any } : {}),
        ...(input.inCost !== undefined ? { inCost: input.inCost as any } : {}),
        ...(input.amountPaid !== undefined ? { amountPaid: input.amountPaid as any } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.referenceNo !== undefined ? { referenceNo: input.referenceNo } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.transactionDate !== undefined ? { transactionDate: input.transactionDate } : {}),
        // locked fields:
        transactionType: InventoryTransactionType.purchase,
        updatedAt: new Date(),
      },
      include: purchaseInclude,
    });
  }

  async deletePurchase(id: string): Promise<PurchaseData> {
    const existing = await this.getPurchaseById(id);
    if (!existing) throw new Error("Purchase not found");

    return await this.prisma.inventoryTransaction.delete({
      where: { id },
      include: purchaseInclude,
    });
  }
}

export const purchaseService = new PurchaseService();
