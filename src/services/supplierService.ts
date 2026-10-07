import prisma from "../utils/prisma";
import { Status } from "@prisma/client";
import { defaulSubheadSettingsService } from "./defaulSubheadSettingsService";
import { accountChartService } from "./accountChartService";

export interface SupplierData {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  website: string | null;
  notes: string | null;
  status: Status;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: { firstName: string | null; lastName: string | null } | null;
}

export interface ListSuppliersParams {
  q?: string;
  status?: Status | "All";
  createdById?: string;
  page?: number;
  limit?: number;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as any).code === "string";
}

export class SupplierService {
  private prisma = prisma;
  private static readonly SUPPLIER_SUBHEAD_SETTINGS_ID = "SUPPLIER_SUBHEAD";

  async createSupplier(input: {
    name: string;
    contactName?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    website?: string | null;
    notes?: string | null;
    status?: Status;
    createdById?: string | null;
  }): Promise<SupplierData> {
    try {
      const created = await this.prisma.supplier.create({
        data: {
          name: input.name,
          contactName: input.contactName ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          city: input.city ?? null,
          state: input.state ?? null,
          country: input.country ?? null,
          website: input.website ?? null,
          notes: input.notes ?? null,
          ...(input.status !== undefined ? { status: input.status } : {}),
          createdById: input.createdById ?? null,
        },
        include: {
          createdBy: { select: { firstName: true, lastName: true } },
        },
      });

      try {
        const defaultSubhead = await defaulSubheadSettingsService.getBySettingsId(
          SupplierService.SUPPLIER_SUBHEAD_SETTINGS_ID
        );
        if (defaultSubhead?.subheadId) {
          await accountChartService.create({
            subheadId: defaultSubhead.subheadId,
            accountDescription: created.name,
            accountRef: created.id,
          });
        }
      } catch (linkError) {
        await this.prisma.supplier.delete({ where: { id: created.id } }).catch(() => undefined);
        throw linkError;
      }

      return created;
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Supplier name already exists");
      }
      throw e;
    }
  }

  async listSuppliers(params: ListSuppliersParams = {}): Promise<{
    suppliers: SupplierData[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    // Default behavior: only Active unless explicitly overridden.
    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.createdById) {
      where.createdById = params.createdById;
    }

    if (params.q) {
      where.OR = [
        { name: { contains: params.q } },
        { contactName: { contains: params.q } },
        { email: { contains: params.q } },
        { phone: { contains: params.q } },
        { city: { contains: params.q } },
        { state: { contains: params.q } },
        { country: { contains: params.q } },
      ];
    }

    const finalWhere = Object.keys(where).length ? where : undefined;

    const [total, rows] = await Promise.all([
      this.prisma.supplier.count({ where: finalWhere }),
      this.prisma.supplier.findMany({
        where: finalWhere,
        orderBy: { name: "asc" },
        skip,
        take: limit,
        include: {
          createdBy: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    // Keep behavior predictable if MySQL collation differs.
    const q = params.q?.toLowerCase();
    const suppliers = q
      ? rows.filter((s) => {
          const fields = [
            s.name,
            s.contactName ?? "",
            s.email ?? "",
            s.phone ?? "",
            s.city ?? "",
            s.state ?? "",
            s.country ?? "",
          ].map((x) => x.toLowerCase());
          return fields.some((x) => x.includes(q));
        })
      : rows;

    return { suppliers, pagination: { page, limit, total, totalPages } };
  }

  async getSupplierById(id: string): Promise<SupplierData | null> {
    return await this.prisma.supplier.findUnique({
      where: { id },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
  }

  async updateSupplier(
    id: string,
    input: {
      name?: string;
      contactName?: string | null;
      email?: string | null;
      phone?: string | null;
      address?: string | null;
      city?: string | null;
      state?: string | null;
      country?: string | null;
      website?: string | null;
      notes?: string | null;
      status?: Status;
    }
  ): Promise<SupplierData> {
    try {
      return await this.prisma.supplier.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.state !== undefined ? { state: input.state } : {}),
          ...(input.country !== undefined ? { country: input.country } : {}),
          ...(input.website !== undefined ? { website: input.website } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedAt: new Date(),
        },
        include: { createdBy: { select: { firstName: true, lastName: true } } },
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Supplier name already exists");
      }
      throw e;
    }
  }

  async deleteSupplier(id: string): Promise<SupplierData> {
    // validate if the supplier has any inventory transactions
    const inventoryTransactions = await this.prisma.inventoryTransaction.findMany({
      where: { supplierId: id },
    });
    if (inventoryTransactions.length > 0) {
      throw new Error("Supplier cannot be deleted while inventory transactions reference it");
    }
    try {
      return await this.prisma.supplier.delete({
        where: { id },
        include: { createdBy: { select: { firstName: true, lastName: true } } },
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Record to delete does not exist");
      }
      throw e;
    }
  }
}

export const supplierService = new SupplierService();
