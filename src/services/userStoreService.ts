import prisma from "../utils/prisma";
import { Prisma, Status } from "@prisma/client";

export interface UserStoreAccessData {
  userId: string;
  storeId: string;
  createdAt: Date;
  user: { id: string; email: string; firstName: string | null; lastName: string | null };
  store: { id: string; name: string; status: Status };
}

export interface ListUserStoreAssignmentsParams {
  userId?: string;
  storeId?: string;
  page?: number;
  limit?: number;
}

export interface ListStoreUsersParams {
  page?: number;
  limit?: number;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string";
}

const assignmentInclude = {
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
  store: { select: { id: true, name: true, status: true } },
} satisfies Prisma.UserStoreInclude;

export class UserStoreService {
  private prisma = prisma;

  async ensureUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new Error("Invalid userId");
  }

  async grantAccess(userId: string, storeId: string): Promise<UserStoreAccessData> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
    if (!store) throw new Error("Store not found");

    await this.ensureUserExists(userId);

    try {
      return await this.prisma.userStore.create({
        data: { userId, storeId },
        include: assignmentInclude,
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("User already has access to this store");
      }
      throw e;
    }
  }

  async revokeAccess(userId: string, storeId: string): Promise<{ userId: string; storeId: string }> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
    if (!store) throw new Error("Store not found");

    try {
      await this.prisma.userStore.delete({
        where: { userId_storeId: { userId, storeId } },
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("User is not assigned to this store");
      }
      throw e;
    }

    return { userId, storeId };
  }

  async getAssignment(userId: string, storeId: string): Promise<UserStoreAccessData | null> {
    return await this.prisma.userStore.findUnique({
      where: { userId_storeId: { userId, storeId } },
      include: assignmentInclude,
    });
  }

  async listAssignments(params: ListUserStoreAssignmentsParams = {}): Promise<{
    assignments: UserStoreAccessData[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.UserStoreWhereInput = {};
    if (params.userId) where.userId = params.userId;
    if (params.storeId) where.storeId = params.storeId;

    const [total, rows] = await Promise.all([
      this.prisma.userStore.count({ where }),
      this.prisma.userStore.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
        include: assignmentInclude,
      }),
    ]);

    return {
      assignments: rows,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /** Users with explicit `user_stores` access (does not include manager-only access). */
  async listUsersForStore(
    storeId: string,
    params: ListStoreUsersParams = {}
  ): Promise<{
    storeId: string;
    users: Array<{
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      accessGrantedAt: Date;
    }>;
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
    if (!store) throw new Error("Store not found");

    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;
    const where = { storeId };

    const [total, rows] = await Promise.all([
      this.prisma.userStore.count({ where }),
      this.prisma.userStore.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip,
        take: limit,
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      }),
    ]);

    return {
      storeId,
      users: rows.map((r) => ({
        id: r.user.id,
        email: r.user.email,
        firstName: r.user.firstName,
        lastName: r.user.lastName,
        accessGrantedAt: r.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /**
   * Stores linked only via `user_stores` (explicit grant rows).
   * For manager + grant access, use `storeService.listStoresAccessibleByUser`.
   */
  async listStoresForUser(
    userId: string,
    params: { page?: number; limit?: number } = {}
  ): Promise<{
    userId: string;
    stores: Array<{
      id: string;
      name: string;
      description: string | null;
      status: Status;
      managerId: string | null;
      accessGrantedAt: Date;
    }>;
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    await this.ensureUserExists(userId);

    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;
    const where = { userId };

    const [total, rows] = await Promise.all([
      this.prisma.userStore.count({ where }),
      this.prisma.userStore.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip,
        take: limit,
        include: {
          store: {
            select: { id: true, name: true, description: true, status: true, managerId: true },
          },
        },
      }),
    ]);

    return {
      userId,
      stores: rows.map((r) => ({
        id: r.store.id,
        name: r.store.name,
        description: r.store.description,
        status: r.store.status,
        managerId: r.store.managerId,
        accessGrantedAt: r.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

}

export const userStoreService = new UserStoreService();
