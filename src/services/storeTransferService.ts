import prisma from "../utils/prisma";
import { activePeriodService } from "./activePeriodService";
import { InventoryTransactionStatus, InventoryTransactionType, Prisma } from "@prisma/client";
import { generateReferenceNo } from "../utils/referenceNo";

export interface StoreTransferTransactionRow {
  id: string;
  itemId: string;
  transactionType: InventoryTransactionType;
  qtyIn: unknown;
  qtyOut: unknown;
  status: InventoryTransactionStatus;
  referenceNo: string | null;
  notes: string | null;
  sessionId: string | null;
  termId: string | null;
  storeId: string | null;
  transactionDate: Date;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  item?: { name: string } | null;
  store?: { id: string; name: string } | null;
  createdBy?: { firstName: string | null; lastName: string | null } | null;
}

export type StoreTransferInsufficientDetail = {
  itemId: string;
  itemName: string;
  /** Balance at source at check time: sum(qtyIn) − sum(qtyOut) (completed transactions only). */
  available: string;
  requested: string;
  /** requested − available (how much the transfer exceeds stock). */
  shortfall: string;
};

export type InsufficientStoreTransferSnapshot = {
  sourceStore: { id: string; name: string };
  /** When availability was evaluated inside the locked transaction (ISO 8601). */
  evaluatedAt: string;
};

function formatInsufficientTransferMessage(
  details: StoreTransferInsufficientDetail[],
  sourceStore: { id: string; name: string }
): string {
  const parts = details.map(
    (d) =>
      `${d.itemName} — available ${d.available}, requested ${d.requested}, short by ${d.shortfall}`
  );
  const head =
    details.length === 1
      ? "Insufficient quantity at source store"
      : `Insufficient quantity at source store for ${details.length} items`;
  return `${head} (${sourceStore.name}): ${parts.join("; ")}`;
}

export class InsufficientStoreTransferError extends Error {
  readonly details: StoreTransferInsufficientDetail[];
  readonly snapshot: InsufficientStoreTransferSnapshot;

  constructor(args: {
    details: StoreTransferInsufficientDetail[];
    sourceStore: { id: string; name: string };
    evaluatedAt: string;
  }) {
    super(formatInsufficientTransferMessage(args.details, args.sourceStore));
    this.name = "InsufficientStoreTransferError";
    this.details = args.details;
    this.snapshot = {
      sourceStore: args.sourceStore,
      evaluatedAt: args.evaluatedAt,
    };
  }
}

const transferInclude = {
  item: { select: { name: true } },
  store: { select: { id: true, name: true } },
  createdBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.InventoryTransactionInclude;

function toPositiveDecimal(qty: string | number): Prisma.Decimal {
  const d = new Prisma.Decimal(typeof qty === "string" ? qty.trim() : qty);
  if (d.isNaN() || !d.isFinite() || d.lte(0)) {
    throw new Error("Each item quantity must be a positive number");
  }
  return d;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export interface ListStoreTransfersParams {
  sourceStoreId?: string;
  destStoreId?: string;
  itemId?: string;
  /** When set, only legs with this status. When omitted, any status (paired legs must still match each other). */
  status?: InventoryTransactionStatus;
  q?: string;
  transactionDateFrom?: Date;
  transactionDateTo?: Date;
  page?: number;
  limit?: number;
}

/** One logical transfer line: outbound leg at source + inbound leg at destination (same referenceNo + itemId). */
export interface StoreTransferLine {
  /** Same value on outbound and inbound legs when pairing succeeds. */
  status: InventoryTransactionStatus;
  referenceNo: string | null;
  notes: string | null;
  quantity: string;
  transactionDate: Date;
  item: { id: string; name: string };
  sourceStore: { id: string; name: string };
  destStore: { id: string; name: string };
  createdBy: { firstName: string | null; lastName: string | null };
  outTransactionId: string;
  inTransactionId: string;
}

export class StoreTransferService {
  private prisma = prisma;

  /**
   * Lists store transfers as paired lines (out at source, in at destination).
   * Uses outbound legs as the primary row unless only `destStoreId` is set (then inbound legs).
   * When both store ids are set, requires a matching pair for that source→destination route.
   */
  async listStoreTransfers(params: ListStoreTransfersParams = {}): Promise<{
    transfers: StoreTransferLine[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const q = params.q?.trim();
    const src = params.sourceStoreId?.trim();
    const dst = params.destStoreId?.trim();
    const itemId = params.itemId?.trim();

    const dateFilter =
      params.transactionDateFrom !== undefined || params.transactionDateTo !== undefined
        ? {
            transactionDate: {
              ...(params.transactionDateFrom !== undefined ? { gte: params.transactionDateFrom } : {}),
              ...(params.transactionDateTo !== undefined ? { lte: params.transactionDateTo } : {}),
            },
          }
        : {};

    const qFilter = q
      ? {
          OR: [{ referenceNo: { contains: q } }, { notes: { contains: q } }],
        }
      : {};

    const baseType = {
      transactionType: InventoryTransactionType.store_transfer,
      ...(params.status !== undefined ? { status: params.status } : {}),
      ...dateFilter,
      ...qFilter,
      ...(itemId ? { itemId } : {}),
    } satisfies Prisma.InventoryTransactionWhereInput;

    const destOnly = !!dst && !src;
    const bothStores = !!src && !!dst;

    if (bothStores) {
      const [countRows, idRows] = await Promise.all([
        this.prisma.$queryRaw<[{ c: bigint }]>(
          Prisma.sql`
            SELECT COUNT(*) AS c
            FROM inventory_transactions o
            INNER JOIN inventory_transactions i
              ON o.reference_no <=> i.reference_no
              AND o.item_id = i.item_id
              AND o.status = i.status
              AND i.transaction_type = ${InventoryTransactionType.store_transfer}
              AND o.transaction_type = ${InventoryTransactionType.store_transfer}
              AND o.qty_out > 0
              AND i.qty_in > 0
              AND o.store_id = ${src}
              AND i.store_id = ${dst}
            WHERE 1=1
              ${params.status !== undefined ? Prisma.sql`AND o.status = ${params.status}` : Prisma.empty}
              ${itemId ? Prisma.sql`AND o.item_id = ${itemId}` : Prisma.empty}
              ${
                params.transactionDateFrom !== undefined
                  ? Prisma.sql`AND o.transaction_date >= ${params.transactionDateFrom}`
                  : Prisma.empty
              }
              ${
                params.transactionDateTo !== undefined
                  ? Prisma.sql`AND o.transaction_date <= ${params.transactionDateTo}`
                  : Prisma.empty
              }
              ${
                q
                  ? Prisma.sql`AND (o.reference_no LIKE ${"%" + q + "%"} OR o.notes LIKE ${"%" + q + "%"})`
                  : Prisma.empty
              }
          `
        ),
        this.prisma.$queryRaw<Array<{ out_id: string }>>(
          Prisma.sql`
            SELECT o.id AS out_id
            FROM inventory_transactions o
            INNER JOIN inventory_transactions i
              ON o.reference_no <=> i.reference_no
              AND o.item_id = i.item_id
              AND o.status = i.status
              AND i.transaction_type = ${InventoryTransactionType.store_transfer}
              AND o.transaction_type = ${InventoryTransactionType.store_transfer}
              AND o.qty_out > 0
              AND i.qty_in > 0
              AND o.store_id = ${src}
              AND i.store_id = ${dst}
            WHERE 1=1
              ${params.status !== undefined ? Prisma.sql`AND o.status = ${params.status}` : Prisma.empty}
              ${itemId ? Prisma.sql`AND o.item_id = ${itemId}` : Prisma.empty}
              ${
                params.transactionDateFrom !== undefined
                  ? Prisma.sql`AND o.transaction_date >= ${params.transactionDateFrom}`
                  : Prisma.empty
              }
              ${
                params.transactionDateTo !== undefined
                  ? Prisma.sql`AND o.transaction_date <= ${params.transactionDateTo}`
                  : Prisma.empty
              }
              ${
                q
                  ? Prisma.sql`AND (o.reference_no LIKE ${"%" + q + "%"} OR o.notes LIKE ${"%" + q + "%"})`
                  : Prisma.empty
              }
            ORDER BY o.transaction_date DESC
            LIMIT ${limit} OFFSET ${skip}
          `
        ),
      ]);

      const total = Number(countRows[0]?.c ?? 0);
      const outIds = idRows.map((r) => r.out_id);
      const transfers = await this.hydrateLinesFromOutIds(outIds);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      return { transfers, pagination: { page, limit, total, totalPages } };
    }

    if (destOnly) {
      const whereIn: Prisma.InventoryTransactionWhereInput = {
        ...baseType,
        qtyIn: { gt: 0 },
        storeId: dst,
      };

      const [total, inRows] = await Promise.all([
        this.prisma.inventoryTransaction.count({ where: whereIn }),
        this.prisma.inventoryTransaction.findMany({
          where: whereIn,
          orderBy: { transactionDate: "desc" },
          skip,
          take: limit,
          include: transferInclude,
        }),
      ]);

      const transfers = await this.linesFromInLegs(inRows as StoreTransferTransactionRow[]);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      return { transfers, pagination: { page, limit, total, totalPages } };
    }

    const whereOut: Prisma.InventoryTransactionWhereInput = {
      ...baseType,
      qtyOut: { gt: 0 },
      ...(src ? { storeId: src } : {}),
    };

    const [total, outRows] = await Promise.all([
      this.prisma.inventoryTransaction.count({ where: whereOut }),
      this.prisma.inventoryTransaction.findMany({
        where: whereOut,
        orderBy: { transactionDate: "desc" },
        skip,
        take: limit,
        include: transferInclude,
      }),
    ]);

    const transfers = await this.linesFromOutLegs(outRows as StoreTransferTransactionRow[]);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return { transfers, pagination: { page, limit, total, totalPages } };
  }

  private async hydrateLinesFromOutIds(outIds: string[]): Promise<StoreTransferLine[]> {
    if (!outIds.length) return [];
    const outRows = await this.prisma.inventoryTransaction.findMany({
      where: { id: { in: outIds } },
      include: transferInclude,
    });
    const order = new Map(outIds.map((id, idx) => [id, idx]));
    outRows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return this.linesFromOutLegs(outRows as StoreTransferTransactionRow[]);
  }

  private async linesFromOutLegs(
    outRows: StoreTransferTransactionRow[]
  ): Promise<StoreTransferLine[]> {
    if (!outRows.length) return [];

    const keys = outRows.map((o) => ({
      referenceNo: o.referenceNo,
      itemId: o.itemId,
      excludeStoreId: o.storeId,
    }));

    const statuses = [...new Set(outRows.map((o) => o.status))];

    const inRows = await this.prisma.inventoryTransaction.findMany({
      where: {
        transactionType: InventoryTransactionType.store_transfer,
        status: { in: statuses },
        qtyIn: { gt: 0 },
        OR: keys.map((k) => ({
          referenceNo: k.referenceNo,
          itemId: k.itemId,
          NOT: { storeId: k.excludeStoreId },
        })),
      },
      include: transferInclude,
    });

    const inByPair = new Map<string, StoreTransferTransactionRow>();
    for (const row of inRows) {
      const key = `${row.referenceNo ?? ""}\t${row.itemId}\t${row.status}`;
      if (!inByPair.has(key)) inByPair.set(key, row as StoreTransferTransactionRow);
    }

    const lines: StoreTransferLine[] = [];
    for (const o of outRows) {
      const key = `${o.referenceNo ?? ""}\t${o.itemId}\t${o.status}`;
      const ins = inByPair.get(key);
      if (!ins || !o.store || !ins.store) continue;
      lines.push(this.toLine(o as StoreTransferTransactionRow, ins));
    }
    return lines;
  }

  private async linesFromInLegs(
    inRows: StoreTransferTransactionRow[]
  ): Promise<StoreTransferLine[]> {
    if (!inRows.length) return [];

    const keys = inRows.map((i) => ({
      referenceNo: i.referenceNo,
      itemId: i.itemId,
      excludeStoreId: i.storeId,
    }));

    const statuses = [...new Set(inRows.map((i) => i.status))];

    const outRows = await this.prisma.inventoryTransaction.findMany({
      where: {
        transactionType: InventoryTransactionType.store_transfer,
        status: { in: statuses },
        qtyOut: { gt: 0 },
        OR: keys.map((k) => ({
          referenceNo: k.referenceNo,
          itemId: k.itemId,
          NOT: { storeId: k.excludeStoreId },
        })),
      },
      include: transferInclude,
    });

    const outByPair = new Map<string, StoreTransferTransactionRow>();
    for (const row of outRows) {
      const key = `${row.referenceNo ?? ""}\t${row.itemId}\t${row.status}`;
      if (!outByPair.has(key)) outByPair.set(key, row as StoreTransferTransactionRow);
    }

    const lines: StoreTransferLine[] = [];
    for (const i of inRows) {
      const key = `${i.referenceNo ?? ""}\t${i.itemId}\t${i.status}`;
      const out = outByPair.get(key);
      if (!out || !out.store || !i.store) continue;
      lines.push(this.toLine(out, i as StoreTransferTransactionRow));
    }
    return lines;
  }

  private toLine(
    out: StoreTransferTransactionRow,
    inn: StoreTransferTransactionRow
  ): StoreTransferLine {
    const qty = String(out.qtyOut ?? inn.qtyIn ?? "0");
    return {
      status: out.status,
      referenceNo: out.referenceNo,
      notes: out.notes,
      quantity: qty,
      transactionDate: out.transactionDate,
      item: { id: out.itemId, name: out.item?.name ?? "" },
      sourceStore: { id: out.store!.id, name: out.store!.name },
      destStore: { id: inn.store!.id, name: inn.store!.name },
      createdBy: {
        firstName: out.createdBy?.firstName ?? null,
        lastName: out.createdBy?.lastName ?? null,
      },
      outTransactionId: out.id,
      inTransactionId: inn.id,
    };
  }

  /**
   * Available quantity at a store for an item: sum(qtyIn) − sum(qtyOut) for completed transactions with that storeId.
   */
  async transferBetweenStores(input: {
    sourceStoreId: string;
    destStoreId: string;
    items: Array<{ itemId: string; qty: string | number }>;
    referenceNo?: string | null;
    notes?: string | null;
    transactionDate?: Date;
    createdById: string;
  }): Promise<{
    referenceNo: string;
    transactions: StoreTransferTransactionRow[];
  }> {
    const sourceStoreId = input.sourceStoreId.trim();
    const destStoreId = input.destStoreId.trim();
    if (sourceStoreId === destStoreId) {
      throw new Error("sourceStoreId and destStoreId must be different");
    }
    if (!input.items.length) {
      throw new Error("items must not be a non-empty array");
    }

    const requestedByItem = new Map<string, Prisma.Decimal>();
    const orderedItemIds: string[] = [];
    for (const line of input.items) {
      const itemId = line.itemId.trim();
      const qty = toPositiveDecimal(line.qty);
      const prev = requestedByItem.get(itemId) ?? new Prisma.Decimal(0);
      requestedByItem.set(itemId, prev.plus(qty));
      if (!orderedItemIds.includes(itemId)) orderedItemIds.push(itemId);
    }

    const uniqueItemIds = [...requestedByItem.keys()];
    const itemsFound = await this.prisma.inventoryItem.findMany({
      where: { id: { in: uniqueItemIds } },
      select: { id: true, name: true },
    });
    if (itemsFound.length !== uniqueItemIds.length) {
      const found = new Set(itemsFound.map((r) => r.id));
      const missing = uniqueItemIds.filter((id) => !found.has(id));
      throw new Error(`Invalid itemId(s): ${missing.join(", ")}`);
    }
    const itemNameById = new Map(itemsFound.map((i) => [i.id, i.name]));

    const finalReferenceNo =
      input.referenceNo === undefined ||
      input.referenceNo === null ||
      String(input.referenceNo).trim() === ""
        ? generateReferenceNo("TRF")
        : String(input.referenceNo).trim();

    const txDate = input.transactionDate ?? new Date();
    const notesVal = input.notes === undefined || input.notes === null ? null : String(input.notes);

    return await this.prisma.$transaction(
      async (tx) => {
        const [lockFirst, lockSecond] = [sourceStoreId, destStoreId].sort();
        const gotFirst = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT id FROM stores WHERE id = ${lockFirst} FOR UPDATE
        `);
        const gotSecond = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT id FROM stores WHERE id = ${lockSecond} FOR UPDATE
        `);
        if (!gotFirst.length) {
          throw new Error(
            lockFirst === sourceStoreId ? "Invalid sourceStoreId" : "Invalid destStoreId"
          );
        }
        if (!gotSecond.length) {
          throw new Error(
            lockSecond === sourceStoreId ? "Invalid sourceStoreId" : "Invalid destStoreId"
          );
        }

        const storeRows = await tx.store.findMany({
          where: { id: { in: [sourceStoreId, destStoreId] } },
          select: { id: true, managerId: true, name: true },
        });
        if (storeRows.length !== 2) {
          const have = new Set(storeRows.map((s) => s.id));
          if (!have.has(sourceStoreId)) throw new Error("Invalid sourceStoreId");
          throw new Error("Invalid destStoreId");
        }

        const sourceRow = storeRows.find((s) => s.id === sourceStoreId)!;
        const destRow = storeRows.find((s) => s.id === destStoreId)!;

        if (sourceRow.managerId !== input.createdById) {
          throw new Error(
            "You are not authorized to transfer from this store because you are not assigned as its manager."
          );
        }

        // TODO: we need make the destination store manager to accept the transfer
        // if (destRow.managerId !== input.createdById) {
        //   throw new Error(
        //     "You are not authorized to transfer to this store because you are not assigned as its manager."
        //   );
        // }

        const grouped = await tx.inventoryTransaction.groupBy({
          by: ["itemId"],
          where: {
            storeId: sourceStoreId,
            itemId: { in: uniqueItemIds },
            status: InventoryTransactionStatus.completed,
          },
          _sum: { qtyIn: true, qtyOut: true },
        });

        const availableByItem = new Map<string, Prisma.Decimal>();
        for (const id of uniqueItemIds) {
          availableByItem.set(id, new Prisma.Decimal(0));
        }
        for (const g of grouped) {
          const sumIn = g._sum.qtyIn ?? new Prisma.Decimal(0);
          const sumOut = g._sum.qtyOut ?? new Prisma.Decimal(0);
          availableByItem.set(g.itemId, sumIn.minus(sumOut));
        }

        const insufficient: StoreTransferInsufficientDetail[] = [];
        const evaluatedAt = new Date().toISOString();
        for (const itemId of uniqueItemIds) {
          const requested = requestedByItem.get(itemId)!;
          const available = availableByItem.get(itemId)!;
          if (available.lt(requested)) {
            insufficient.push({
              itemId,
              itemName: itemNameById.get(itemId) ?? itemId,
              available: available.toString(),
              requested: requested.toString(),
              shortfall: requested.minus(available).toString(),
            });
          }
        }

        if (insufficient.length) {
          throw new InsufficientStoreTransferError({
            details: insufficient,
            sourceStore: { id: sourceStoreId, name: sourceRow.name },
            evaluatedAt,
          });
        }

        const active = await activePeriodService.getActivePeriod();
        const sessionId = active?.sessionId ?? null;
        const termId = active?.termId ?? null;

        const created: StoreTransferTransactionRow[] = [];

        for (const itemId of orderedItemIds) {
          const qty = requestedByItem.get(itemId)!;
          const qtyDec = qty;

          const outRow = await tx.inventoryTransaction.create({
            data: {
              itemId,
              transactionType: InventoryTransactionType.store_transfer,
              qtyIn: new Prisma.Decimal(0),
              qtyOut: qtyDec as any,
              status: InventoryTransactionStatus.completed,
              referenceNo: finalReferenceNo,
              notes: notesVal,
              sessionId,
              termId,
              storeId: sourceStoreId,
              transactionDate: txDate,
              createdById: input.createdById,
            },
            include: transferInclude,
          });

          const inRow = await tx.inventoryTransaction.create({
            data: {
              itemId,
              transactionType: InventoryTransactionType.store_transfer,
              qtyIn: qtyDec as any,
              qtyOut: new Prisma.Decimal(0),
              status: InventoryTransactionStatus.completed,
              referenceNo: finalReferenceNo,
              notes: notesVal,
              sessionId,
              termId,
              storeId: destStoreId,
              transactionDate: txDate,
              createdById: input.createdById,
            },
            include: transferInclude,
          });

          created.push(outRow as StoreTransferTransactionRow, inRow as StoreTransferTransactionRow);
        }

        return { referenceNo: finalReferenceNo, transactions: created };
      },
      {
        maxWait: 10000,
        timeout: 60000,
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      }
    );
  }
}

export const storeTransferService = new StoreTransferService();
