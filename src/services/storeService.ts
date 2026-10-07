import prisma from "../utils/prisma";
import { Prisma, Status } from "@prisma/client";
import { userStoreService } from "./userStoreService";

/** Users with explicit store access via `user_stores` (included on list stores). */
export interface StoreAccessibleUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  accessGrantedAt: Date;
}

export interface StoreData {
  id: string;
  name: string;
  description: string | null;
  status: Status;
  managerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  manager?: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
  _count?: { inventoryTransactions: number };
  accessibleUsers?: StoreAccessibleUser[];
}

export interface ListStoresParams {
  q?: string;
  status?: Status | "All";
  managerId?: string;
  page?: number;
  limit?: number;
}

/** Store row plus how the requesting user relates to it (manager and/or explicit UserStore). */
export interface StoreAccessibleByUser extends StoreData {
  isStoreManager: boolean;
  hasUserStoreAccess: boolean;
  /** When the user has a `user_stores` row, its `createdAt`; otherwise null. */
  userStoreAccessGrantedAt: Date | null;
}

export interface UserStoreAccessData {
  userId: string;
  storeId: string;
  createdAt: Date;
  user: { id: string; email: string; firstName: string | null; lastName: string | null };
  store: { id: string; name: string };
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string";
}

const storeInclude = {
  manager: { select: { id: true, firstName: true, lastName: true, email: true } },
  _count: { select: { inventoryTransactions: true } },
} satisfies Prisma.StoreInclude;

const listStoresInclude = {
  ...storeInclude,
  userAccesses: {
    orderBy: { createdAt: "asc" as const },
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.StoreInclude;

function myStoresInclude(userId: string) {
  return {
    ...storeInclude,
    userAccesses: {
      where: { userId },
      orderBy: { createdAt: "asc" as const },
      take: 1,
      select: { createdAt: true },
    },
  } satisfies Prisma.StoreInclude;
}

export class StoreService {
  private prisma = prisma;

  private async assertManagerExists(managerId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: managerId }, select: { id: true } });
    if (!u) throw new Error("Invalid managerId");
  }

  /** Grants `UserStore` access for the assigned manager (same as add-user-to-store). Idempotent. */
  private async ensureManagerStoreAccess(storeId: string, managerUserId: string): Promise<void> {
    await this.prisma.userStore.upsert({
      where: { userId_storeId: { userId: managerUserId, storeId } },
      create: { userId: managerUserId, storeId },
      update: {},
    });
  }

  async createStore(input: {
    name: string;
    description?: string | null;
    status?: Status;
    managerId?: string | null;
  }): Promise<StoreData> {
    const name = input.name.trim();
    if (!name) throw new Error("name is required");

    if (input.managerId) await this.assertManagerExists(input.managerId);

    try {
      const created = await this.prisma.store.create({
        data: {
          name,
          description: input.description === undefined || input.description === null ? null : String(input.description),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.managerId !== undefined ? { managerId: input.managerId } : {}),
        },
        include: storeInclude,
      });
      if (created.managerId) {
        await this.ensureManagerStoreAccess(created.id, created.managerId);
      }
      return created;
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Store name already exists");
      }
      throw e;
    }
  }

  async listStores(params: ListStoresParams = {}): Promise<{
    stores: StoreData[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.StoreWhereInput = {};

    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.managerId) {
      where.managerId = params.managerId;
    }

    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [{ name: { contains: q } }, { description: { contains: q } }];
    }

    const [total, rows] = await Promise.all([
      this.prisma.store.count({ where }),
      this.prisma.store.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take: limit,
        include: listStoresInclude,
      }),
    ]);

    const stores: StoreData[] = rows.map((row) => {
      const { userAccesses, ...rest } = row;
      return {
        ...rest,
        accessibleUsers: userAccesses.map((ua) => ({
          id: ua.user.id,
          email: ua.user.email,
          firstName: ua.user.firstName,
          lastName: ua.user.lastName,
          accessGrantedAt: ua.createdAt,
        })),
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return { stores, pagination: { page, limit, total, totalPages } };
  }

  /**
   * Stores the user may use: assigned manager (`Store.managerId`) and/or explicit `UserStore` grant.
   */
  async listStoresAccessibleByUser(
    userId: string,
    params: Omit<ListStoresParams, "managerId" | "page" | "limit"> = {}
  ): Promise<{ stores: StoreAccessibleByUser[] }> {
    const accessFilter: Prisma.StoreWhereInput = {
      OR: [{ managerId: userId }, { userAccesses: { some: { userId } } }],
    };

    const whereParts: Prisma.StoreWhereInput[] = [accessFilter];

    if (params.status === undefined) {
      whereParts.push({ status: Status.Active });
    } else if (params.status !== "All") {
      whereParts.push({ status: params.status });
    }

    if (params.q?.trim()) {
      const q = params.q.trim();
      whereParts.push({ OR: [{ name: { contains: q } }, { description: { contains: q } }] });
    }

    const where: Prisma.StoreWhereInput = { AND: whereParts };

    const include = myStoresInclude(userId);

    const rows = await this.prisma.store.findMany({
      where,
      orderBy: { name: "asc" },
      include,
    });

    const stores: StoreAccessibleByUser[] = rows.map((row) => {
      const { userAccesses, ...rest } = row;
      const grant = userAccesses[0];
      return {
        ...rest,
        isStoreManager: rest.managerId === userId,
        hasUserStoreAccess: userAccesses.length > 0,
        userStoreAccessGrantedAt: grant?.createdAt ?? null,
      };
    });

    return { stores };
  }

  /** True when user is store manager and/or has an explicit `user_stores` grant. */
  async userHasStoreAccess(userId: string, storeId: string): Promise<boolean> {
    const store = await this.prisma.store.findFirst({
      where: {
        id: storeId,
        OR: [{ managerId: userId }, { userAccesses: { some: { userId } } }],
      },
      select: { id: true },
    });
    return !!store;
  }

  async getStoreById(id: string): Promise<StoreData | null> {
    const row = await this.prisma.store.findUnique({
      where: { id },
      include: listStoresInclude,
    });
    if (!row) return null;

    const { userAccesses, ...rest } = row;
    return {
      ...rest,
      accessibleUsers: userAccesses.map((ua) => ({
        id: ua.user.id,
        email: ua.user.email,
        firstName: ua.user.firstName,
        lastName: ua.user.lastName,
        accessGrantedAt: ua.createdAt,
      })),
    };
  }

  async updateStore(
    id: string,
    input: {
      name?: string;
      description?: string | null;
      status?: Status;
      managerId?: string | null;
    }
  ): Promise<StoreData> {
    if (input.name !== undefined && !input.name.trim()) {
      throw new Error("name cannot be empty");
    }

    if (input.managerId) await this.assertManagerExists(input.managerId);

    const existing = await this.getStoreById(id);
    if (!existing) throw new Error("Store not found");

    try {
      const updated = await this.prisma.store.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined
            ? { description: input.description === null ? null : String(input.description) }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.managerId !== undefined ? { managerId: input.managerId } : {}),
          updatedAt: new Date(),
        },
        include: storeInclude,
      });
      if (updated.managerId) {
        await this.ensureManagerStoreAccess(updated.id, updated.managerId);
      }
      return updated;
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Store not found");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Store name already exists");
      }
      throw e;
    }
  }

  async deleteStore(id: string): Promise<StoreData> {
    const existing = await this.getStoreById(id);
    if (!existing) throw new Error("Store not found");

    try {
      return await this.prisma.store.delete({
        where: { id },
        include: storeInclude,
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Store cannot be deleted while inventory transactions reference it");
      }
      throw e;
    }
  }

  async addUserToStore(storeId: string, userId: string): Promise<UserStoreAccessData> {
    return userStoreService.grantAccess(userId, storeId);
  }

  async removeUserFromStore(storeId: string, userId: string): Promise<{ storeId: string; userId: string }> {
    return userStoreService.revokeAccess(userId, storeId);
  }

  async listUsersForStore(storeId: string, params: { page?: number; limit?: number } = {}) {
    return userStoreService.listUsersForStore(storeId, params);
  }
}

export const storeService = new StoreService();
