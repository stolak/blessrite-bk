import prisma from "../utils/prisma";
import {
  InventoryTransactionStatus,
  InventoryTransactionType,
  InventoryCategoryType,
  Prisma,
  Status,
} from "@prisma/client";
import { accountTransactionService } from "./accountTransactionService";
import { defaultAccountSettingsService } from "./defaultAccountSettingsService";

export interface SaleData {
  id: string;
  itemId: string;
  transactionType: InventoryTransactionType;
  qtyOut: Prisma.Decimal;
  outCost: Prisma.Decimal;
  status: InventoryTransactionStatus;
  referenceNo: string | null;
  notes: string | null;
  customerMame: string | null;
  transactionDate: Date;
  createdById: string;
  storeId: string | null;
  createdAt: Date;
  updatedAt: Date;
  item?: { name: string } | null;
  store?: { id: string; name: string } | null;
  createdBy?: { firstName: string | null; lastName: string | null } | null;
}

export interface ListSalesParams {
  q?: string;
  itemId?: string;
  storeId?: string;
  customerName?: string;
  transactionDateFrom?: Date;
  transactionDateTo?: Date;
  page?: number;
  limit?: number;
}

export interface ListGroupedSalesParams {
  storeId?: string;
  transactionDateFrom?: Date;
  transactionDateTo?: Date;
  page?: number;
  limit?: number;
}

export interface GroupedSaleItem {
  id: string;
  itemId: string;
  item: { name: string } | null;
  qtyOut: string;
  outCost: string;
  status: InventoryTransactionStatus;
}

export interface GroupedSaleRow {
  transactionType: InventoryTransactionType;
  referenceNo: string | null;
  storeId: string | null;
  transactionDate: Date;
  status: InventoryTransactionStatus;
  customerMame: string | null;
  createdBy: { firstName: string | null; lastName: string | null } | null;
  store: { id: string; name: string } | null;
  notes: string | null;
  totalAmount: string;
  items: GroupedSaleItem[];
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const saleInclude = {
  item: { select: { name: true } },
  store: { select: { id: true, name: true } },
  createdBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.InventoryTransactionInclude;

export class SalesService {
  private prisma = prisma;

  private generateSalesReferenceNo(): string {
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `SAL-${stamp}-${rand}`;
  }

  private async assertStoreExists(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true },
    });
    if (!store) throw new Error("Invalid storeId");
  }

  async createBulkSales(input: {
    storeId: string;
    referenceNo?: string | null;
    notes?: string | null;
    customerName?: string | null;
    transactionDate?: Date;
    staffId?: string | null;
    stundentId?: string | null;
    createdById: string;
    items: Array<{ itemId: string; qty: string | number; amount: string | number }>;
  }): Promise<SaleData[]> {
    if (!input.items.length) {
      throw new Error("items must not be empty");
    }

    await this.assertStoreExists(input.storeId);

    const itemIds = [...new Set(input.items.map((i) => i.itemId))];
    const existingItems = await this.prisma.inventoryItem.findMany({
      where: { id: { in: itemIds } },
      select: {
        id: true,
        name: true,
        costPrice: true,
        category: {
          select: {
            id: true,
            name: true,
            assetAccountId: true,
            consumableAccountId: true,
            assetAccount: {
              select: {
                id: true,
                accountNo: true,
                accountDescription: true,
              },
            },
            consumableAccount: {
              select: {
                id: true,
                accountNo: true,
                accountDescription: true,
              },
            },
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
    // ensure each item has valid category with asset and consumable accounts
    for (const item of existingItems) {
      if (!item.category) {
        throw new Error(`Item ${item.name} has no category`);
      }

      if (!item.category.consumableAccountId) {
        throw new Error(`Item ${item.name} has no consumable account`);
      }
      if (item.category.categoryType === InventoryCategoryType.NonConsumable) {
        if (!item.category.assetAccount) {
          throw new Error(`Item ${item.name} has no asset account`);
        }
      }

      if (!item.category.consumableAccount) {
        throw new Error(`Item ${item.name} has no consumable account`);
      }
    }

    const salesLedger =
      await defaultAccountSettingsService.getAccountChartBySettingsId("SALES_ACCOUNT");

    const salesIncomeAccountId = String(salesLedger.accountId);
    let staffAccountId = null;
    let studentAccountId = null;
    if (input.staffId && input.stundentId) {
      throw new Error("Only one of staffId or stundentId may be provided in the request, not both");
    }
    if (input.staffId) {
      const staff = await this.prisma.staff.findUnique({
        where: { id: input.staffId },
        select: { id: true },
      });
      if (!staff) {
        throw new Error("Staff not found");
      }
      staffAccountId =
        await defaultAccountSettingsService.getAccountChartBySettingsId("STAFF_ACCOUNT");
      if (!staffAccountId) {
        throw new Error("Staff account not found");
      }
      staffAccountId = String(staffAccountId.accountId);
    }
    if (input.stundentId) {
      const student = await this.prisma.student.findUnique({
        where: { id: input.stundentId },
        select: { id: true },
      });
      if (!student) {
        throw new Error("Student not found");
      }
      studentAccountId =
        await defaultAccountSettingsService.getAccountChartBySettingsId("STUDENT_ACCOUNT");
      if (!studentAccountId) {
        throw new Error("Student account not found");
      }
      studentAccountId = String(studentAccountId.accountId);
    }

    const txDate = input.transactionDate ?? new Date();
    const referenceNo =
      typeof input.referenceNo === "string" && input.referenceNo.trim().length > 0
        ? input.referenceNo.trim()
        : this.generateSalesReferenceNo();
    const customerMame =
      input.customerName === undefined || input.customerName === null
        ? null
        : String(input.customerName).trim() || null;

    const totalSaleAmount = input.items.reduce(
      (acc, it) => acc.plus(new Prisma.Decimal(it.amount as Prisma.Decimal.Value)),
      new Prisma.Decimal(0)
    );

    const cashier = await this.prisma.cashier.findFirst({
      where: { userId: input.createdById, status: Status.Active },
    });
    if (!cashier) {
      throw new Error("The user is not a cashier hence cannot create sales");
    }
    if (!cashier.accountChartId) {
      throw new Error("The cashier does not have a ledger hence cannot create sales");
    }
    const cashierAccountId = String(cashier.accountChartId);

    const ledger = await this.prisma.accountChart.findUnique({
      where: { id: cashier.accountChartId },
      select: { id: true },
    });
    if (!ledger) {
      throw new Error("The cashier's ledger is not active hence cannot create sales");
    }

    const itemById = new Map(existingItems.map((i) => [i.id, i]));
    const txDateIso = txDate.toISOString();

    const created = await this.prisma.$transaction(async (tx) => {
      if (totalSaleAmount.gt(0)) {
        const cashierAccount = await tx.accountChart.findUnique({
          where: { id: cashier.accountChartId! },
          select: { id: true },
        });
        if (!cashierAccount) {
          throw new Error("Cashier ledger account not found");
        }
        const salesIncomeAccount = await tx.accountChart.findUnique({
          where: { id: salesLedger.accountId },
          select: { id: true },
        });
        if (!salesIncomeAccount) {
          throw new Error("Sales income account not found for SALES_LEDGER");
        }
      }

      for (const it of input.items) {
        const item = itemById.get(it.itemId);
        if (!item) throw new Error(`Invalid itemId(s): ${it.itemId}`);

        const qty = new Prisma.Decimal(it.qty as Prisma.Decimal.Value);
        const lineCost = new Prisma.Decimal(item.costPrice as Prisma.Decimal.Value).mul(qty);
        if (!lineCost.gt(0)) continue;

        if (!item.category) throw new Error(`Category not configured for item ${item.name}`);
        if (!item.category.consumableAccountId) {
          throw new Error(
            `Expense account not configured for item ${item.name} in category ${item.category.name}`
          );
        }

        const consumableAccount = await tx.accountChart.findUnique({
          where: { id: item.category.consumableAccountId },
          select: { id: true },
        });
        if (!consumableAccount) {
          throw new Error(
            `Expense account not found for item ${item.name} in category ${item.category.name}`
          );
        }

        if (item.category.categoryType === InventoryCategoryType.NonConsumable) {
          if (!item.category.assetAccountId) {
            throw new Error(
              `Asset account not configured for item ${item.name} in category ${item.category.name}`
            );
          }
          const assetAccount = await tx.accountChart.findUnique({
            where: { id: item.category.assetAccountId },
            select: { id: true },
          });
          if (!assetAccount) {
            throw new Error(
              `Asset account not found for item ${item.name} in category ${item.category.name}`
            );
          }
        }
      }

      const createdRows = await Promise.all(
        input.items.map(async (it) => {
          return tx.inventoryTransaction.create({
            data: {
              itemId: it.itemId,
              storeId: input.storeId,
              transactionType: InventoryTransactionType.sales,
              qtyOut: it.qty as any,
              outCost: it.amount as any,
              status: InventoryTransactionStatus.completed,
              referenceNo,
              notes: input.notes ?? `Sales - ${referenceNo} - ${customerMame}`,
              customerMame,
              transactionDate: txDate,
              createdById: input.createdById,
              staffId: input.staffId ?? null,
              studentId: input.stundentId ?? null,
            },
            include: saleInclude,
          });
        })
      );

      for (const it of input.items) {
        const item = itemById.get(it.itemId);
        if (!item?.category) throw new Error(`Invalid itemId(s): ${it.itemId}`);

        const qty = new Prisma.Decimal(it.qty as Prisma.Decimal.Value);
        const lineCost = new Prisma.Decimal(item.costPrice as Prisma.Decimal.Value).mul(qty);
        if (!lineCost.gt(0)) continue;

        const costAmount = lineCost.toNumber();
        const remarksSuffix = `${item.name} - ${referenceNo}`;

        if (item.category.categoryType === InventoryCategoryType.Consumable) {
          // Do nothing because the item cost have already been posted to the consumable account during entry
          // await accountTransactionService.creditAccount(
          //   {
          //     accountId: String(item.category.consumableAccountId),
          //     amount: costAmount,
          //     ref: referenceNo,
          //     manualRef: referenceNo,
          //     transactionDate: txDateIso,
          //     postedBy: input.createdById,
          //     remarks: `Sales consumable credit - ${remarksSuffix}`,
          //   },
          //   tx
          // );
          // await accountTransactionService.debitAccount(
          //   {
          //     accountId: salesIncomeAccountId,
          //     amount: costAmount,
          //     ref: referenceNo,
          //     manualRef: referenceNo,
          //     transactionDate: txDateIso,
          //     postedBy: input.createdById,
          //     remarks: `Sales consumable COGS debit - ${remarksSuffix}`,
          //   },
          //   tx
          // );
        } else {
          await accountTransactionService.debitAccount(
            {
              accountId: String(item.category.consumableAccountId),
              amount: costAmount,
              ref: referenceNo,
              manualRef: referenceNo,
              transactionDate: txDateIso,
              postedBy: input.createdById,
              remarks: `Sales non-consumable consumable debit - ${remarksSuffix}`,
            },
            tx
          );
          await accountTransactionService.creditAccount(
            {
              accountId: String(item.category.assetAccountId),
              amount: costAmount,
              ref: referenceNo,
              manualRef: referenceNo,
              transactionDate: txDateIso,
              postedBy: input.createdById,
              remarks: `Sales non-consumable asset credit - ${remarksSuffix}`,
            },
            tx
          );
        }
      }

      if (totalSaleAmount.gt(0)) {
        let debitAccountId = cashierAccountId;
        if (input.staffId) {
          debitAccountId = staffAccountId!;
        }
        if (input.stundentId) {
          debitAccountId = studentAccountId!;
        }
        const saleTotal = totalSaleAmount.toNumber();
        const saleLineRemarks = input.items
          .map((it) => {
            const item = itemById.get(it.itemId);
            return `${item?.name ?? it.itemId} - ${it.qty}`;
          })
          .join(", ");
        await accountTransactionService.debitAccount(
          {
            accountId: debitAccountId,
            amount: saleTotal,
            ref: referenceNo,
            manualRef: referenceNo,
            transactionDate: txDateIso,
            postedBy: input.createdById,
            accountSub: input.staffId ?? input.stundentId ?? undefined,
            remarks: `Sales receipt - ${saleLineRemarks} - ${referenceNo}`,
          },
          tx
        );
        await accountTransactionService.creditAccount(
          {
            accountId: salesIncomeAccountId,
            amount: saleTotal,
            ref: referenceNo,
            manualRef: referenceNo,
            transactionDate: txDateIso,
            postedBy: input.createdById,
            remarks: `Sales receipt - ${saleLineRemarks} - ${referenceNo}`,
          },
          tx
        );
      }

      return createdRows;
    });

    return created;
  }

  async listSales(params: ListSalesParams = {}): Promise<{
    sales: SaleData[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryTransactionWhereInput = {
      transactionType: InventoryTransactionType.sales,
      status: InventoryTransactionStatus.completed,
      ...(params.itemId ? { itemId: params.itemId } : {}),
      ...(params.storeId ? { storeId: params.storeId } : {}),
      ...(params.customerName?.trim()
        ? { customerMame: { contains: params.customerName.trim() } }
        : {}),
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
              { customerMame: { contains: params.q } },
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
        include: saleInclude,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return { sales: rows, pagination: { page, limit, total, totalPages } };
  }

  async listGroupedSales(params: ListGroupedSalesParams = {}): Promise<{
    sales: GroupedSaleRow[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);

    const where: Prisma.InventoryTransactionWhereInput = {
      transactionType: InventoryTransactionType.sales,
      status: InventoryTransactionStatus.completed,
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
      include: saleInclude,
    });

    const groupedMap = new Map<string, GroupedSaleRow>();
    for (const row of rows) {
      const key = row.referenceNo ?? "__NULL__";
      const existing = groupedMap.get(key);
      if (!existing) {
        groupedMap.set(key, {
          transactionType: row.transactionType,
          referenceNo: row.referenceNo,
          storeId: row.storeId,
          transactionDate: row.transactionDate,
          status: row.status,
          customerMame: row.customerMame,
          createdBy: row.createdBy
            ? { firstName: row.createdBy.firstName, lastName: row.createdBy.lastName }
            : null,
          store: row.store ? { id: row.store.id, name: row.store.name } : null,
          notes: row.notes,
          totalAmount: "0",
          items: [],
        });
      }

      const group = groupedMap.get(key)!;
      group.items.push({
        id: row.id,
        itemId: row.itemId,
        item: row.item ? { name: row.item.name } : null,
        qtyOut: row.qtyOut.toString(),
        outCost: row.outCost.toString(),
        status: row.status,
      });
      group.totalAmount = new Prisma.Decimal(group.totalAmount).plus(row.outCost).toString();
    }

    const grouped = Array.from(groupedMap.values());
    const total = grouped.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const sales = grouped.slice(start, start + limit);

    return { sales, pagination: { page, limit, total, totalPages } };
  }

  async getSaleById(id: string): Promise<SaleData | null> {
    return await this.prisma.inventoryTransaction.findFirst({
      where: {
        id,
        transactionType: InventoryTransactionType.sales,
      },
      include: saleInclude,
    });
  }
}

export const salesService = new SalesService();
