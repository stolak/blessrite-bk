import prisma from "../utils/prisma";
import { storeService } from "./storeService";

const acknowledgementInclude = {
  item: { select: { id: true, name: true, sku: true } },
  store: { select: { id: true, name: true } },
  acknowledgedByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
} as const;

export type InventoryReceiveAcknowledgementRow = {
  id: string;
  itemId: string;
  storeId: string | null;
  referenceNo: string | null;
  transactionType: string;
  qtyIn: unknown;
  qtyOut: unknown;
  status: string;
  isAcknowledged: boolean;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
  item: { id: string; name: string; sku: string | null };
  store: { id: string; name: string } | null;
  acknowledgedByUser: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
};

export interface AcknowledgeInventoryReceiveResult {
  referenceNo: string;
  storeId: string;
  store: { id: string; name: string };
  acknowledgedAt: Date;
  acknowledgedBy: string;
  transactionCount: number;
  transactions: InventoryReceiveAcknowledgementRow[];
}

export class InventoryReceiveAcknowledgementService {
  private prisma = prisma;

  async acknowledgeByReferenceNo(input: {
    referenceNo: string;
    userId: string;
  }): Promise<AcknowledgeInventoryReceiveResult> {
    const referenceNo = input.referenceNo.trim();
    if (!referenceNo) {
      throw new Error("referenceNo is required");
    }

    const rows = await this.prisma.inventoryTransaction.findMany({
      where: { referenceNo },
      select: {
        id: true,
        storeId: true,
        isAcknowledged: true,
      },
    });

    if (!rows.length) {
      throw new Error("No inventory transactions found for this referenceNo");
    }

    const storeIds = new Set(rows.map((r) => r.storeId).filter((id): id is string => id != null));
    if (storeIds.size === 0) {
      throw new Error("Transactions for this referenceNo have no storeId");
    }
    if (storeIds.size > 1) {
      throw new Error("All transactions for this referenceNo must share the same storeId");
    }
    if (rows.some((r) => r.storeId == null)) {
      throw new Error("All transactions for this referenceNo must have a storeId");
    }

    const storeId = [...storeIds][0];

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true },
    });
    if (!store) {
      throw new Error("Store not found");
    }

    const hasAccess = await storeService.userHasStoreAccess(input.userId, storeId);
    if (!hasAccess) {
      throw new Error("You do not have access to acknowledge receipts for this store");
    }

    if (rows.every((r) => r.isAcknowledged)) {
      throw new Error("All transactions for this referenceNo are already acknowledged");
    }

    if (rows.some((r) => r.isAcknowledged)) {
      throw new Error("Some transactions for this referenceNo are already acknowledged");
    }

    const acknowledgedAt = new Date();

    await this.prisma.inventoryTransaction.updateMany({
      where: { referenceNo },
      data: {
        isAcknowledged: true,
        acknowledgedAt,
        acknowledgedBy: input.userId,
        updatedAt: acknowledgedAt,
      },
    });

    const transactions = await this.prisma.inventoryTransaction.findMany({
      where: { referenceNo },
      include: acknowledgementInclude,
      orderBy: [{ item: { name: "asc" } }, { createdAt: "asc" }],
    });

    return {
      referenceNo,
      storeId,
      store,
      acknowledgedAt,
      acknowledgedBy: input.userId,
      transactionCount: transactions.length,
      transactions,
    };
  }
}

export const inventoryReceiveAcknowledgementService = new InventoryReceiveAcknowledgementService();
