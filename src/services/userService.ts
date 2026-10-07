import prisma from "../utils/prisma";
import { Prisma, Status, UserType } from "@prisma/client";
import { MenuChildData, menuChildSelect, resolveAccessibleMenuChildren } from "../utils/menuAccess";

export interface ListUsersParams {
  /** userType (Prisma UserType) */
  userType?: UserType;
  /** Filter users assigned to this AppRole id (UserRole.roleId) */
  roleId?: string;
  /** Filter users assigned to an AppRole with this exact name */
  roleName?: string;
  /** User.status string field (e.g. active) */
  status?: string;
  /** Search email / firstName / lastName (substring, case-sensitive per DB collation) */
  q?: string;
  /** When true, include soft-deleted users (isDeleted=true). Default excludes them. */
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
}

export interface ListedUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  userType: UserType;
  status: string;
  isActive: boolean;
  isVerified: boolean;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Application role from UserRole (at most one per user) */
  appRole: AppRoleSummary | null;
}

export interface PrivilegeSummary {
  id: string;
  name: string;
  description: string | null;
}

export interface MenuChildSummary {
  id: string;
  menuId: string;
  name: string;
  route: string;
  status: Status;
}

export interface MenuSummary {
  id: string;
  route: string;
  caption: string;
  status: Status;
  children: MenuChildSummary[];
}

export interface AppRoleSummary {
  id: string;
  name: string;
  status: string;
}

export interface UserDetailData {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
  privileges: PrivilegeSummary[];
  appRole: AppRoleSummary | null;
}

export interface UserAccessData {
  id: string;
  email: string;
  privileges: PrivilegeSummary[];
  appRoles: AppRoleSummary[];
}

const privilegeSelect = {
  id: true,
  name: true,
  description: true,
} satisfies Prisma.PrivilegeSelect;

const menuSelect = {
  id: true,
  route: true,
  caption: true,
  status: true,
} satisfies Prisma.MenuSelect;

const appRoleSelect = {
  id: true,
  name: true,
  status: true,
} satisfies Prisma.AppRoleSelect;

const userRoleWithAppRoleSelect = {
  roleId: true,
  role: { select: appRoleSelect },
} satisfies Prisma.UserRoleSelect;

const privilegeLinkSelect = {
  privilege: { select: privilegeSelect },
} satisfies Prisma.PrivilegeToUserSelect;

const rolePrivilegeLinkSelect = {
  privilege: { select: privilegeSelect },
} satisfies Prisma.AppRoleToPrivilegeSelect;

const userAccessSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phoneNumber: true,
  privilegeLinks: { select: privilegeLinkSelect },
  userRoles: {
    select: userRoleWithAppRoleSelect,
  },
} satisfies Prisma.UserSelect;

const getUserByIdSelect = {
  ...userAccessSelect,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const userListSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phoneNumber: true,
  userType: true,
  status: true,
  isActive: true,
  isVerified: true,
  isEmailVerified: true,
  isPhoneVerified: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
  userRoles: {
    select: userRoleWithAppRoleSelect,
  },
  privilegeLinks: {
    select: privilegeLinkSelect,
  },
} satisfies Prisma.UserSelect;

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type UserWithRoles = Prisma.UserGetPayload<{
  select: typeof userListSelect | typeof getUserByIdSelect;
}>;

function mapPrivilegesFromLinks(
  links: { privilege: PrivilegeSummary }[]
): PrivilegeSummary[] {
  return links.map((link) => link.privilege);
}

function mapAppRoleFromUser(user: UserWithRoles): AppRoleSummary | null {
  return user.userRoles[0]?.role ?? null;
}

function mapUserDetail(
  user: Prisma.UserGetPayload<{ select: typeof getUserByIdSelect }>
): UserDetailData {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phoneNumber: user.phoneNumber,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    privileges: mapPrivilegesFromLinks(user.privilegeLinks),
    appRole: mapAppRoleFromUser(user),
  };
}

function mapListedUser(user: Prisma.UserGetPayload<{ select: typeof userListSelect }>): ListedUser {
  const { userRoles: _userRoles, privilegeLinks: _privilegeLinks, ...rest } = user;
  return {
    ...rest,
    appRole: mapAppRoleFromUser(user),
  };
}

function mergePrivilegesById(groups: PrivilegeSummary[][]): PrivilegeSummary[] {
  const byId = new Map<string, PrivilegeSummary>();
  for (const group of groups) {
    for (const p of group) {
      byId.set(p.id, p);
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function mergeMenusById(menus: MenuSummary[]): MenuSummary[] {
  const byId = new Map<string, MenuSummary>();
  for (const menu of menus) {
    const existing = byId.get(menu.id);
    if (!existing) {
      byId.set(menu.id, {
        ...menu,
        children: [...(menu.children ?? [])],
      });
      continue;
    }

    const childById = new Map((existing.children ?? []).map((child) => [child.id, child]));
    for (const child of menu.children ?? []) {
      childById.set(child.id, child);
    }
    existing.children = [...childById.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  return [...byId.values()].sort((a, b) => a.route.localeCompare(b.route));
}

function mapMenuChildSummary(child: MenuChildData): MenuChildSummary {
  return {
    id: child.id,
    menuId: child.menuId,
    name: child.name,
    route: child.route,
    status: child.status,
  };
}

export class UserService {
  async getUserById(userId: string): Promise<UserDetailData> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: getUserByIdSelect,
    });

    if (!user) {
      throw new Error("User not found");
    }

    return mapUserDetail(user);
  }

  /**
   * Effective privileges for a user: direct User↔Privilege links plus privileges on the
   * assigned AppRole (UserRole). SuperAdmin users receive every privilege in the system.
   */
  async getUserPrivileges(userId: string): Promise<PrivilegeSummary[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        userType: true,
        privilegeLinks: { select: privilegeLinkSelect },
        userRoles: {
          select: {
            role: {
              select: {
                privilegeLinks: { select: rolePrivilegeLinkSelect },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (user.userType === UserType.SuperAdmin) {
      return prisma.privilege.findMany({
        select: privilegeSelect,
        orderBy: { name: "asc" },
      });
    }

    const rolePrivileges = user.userRoles.flatMap((ur) =>
      mapPrivilegesFromLinks(ur.role.privilegeLinks)
    );
    return mergePrivilegesById([
      mapPrivilegesFromLinks(user.privilegeLinks),
      rolePrivileges,
    ]);
  }

  /**
   * Menus linked to the user's AppRole via RoleMenu (UserRole → AppRole).
   * SuperAdmin users receive every menu in the system.
   */
  async getUserMenus(userId: string): Promise<MenuSummary[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        userType: true,
        userRoles: {
          select: {
            role: {
              select: {
                roleMenus: {
                  select: {
                    id: true,
                    menuId: true,
                    menu: { select: menuSelect },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (user.userType === UserType.SuperAdmin) {
      const menus = await prisma.menu.findMany({
        select: menuSelect,
        orderBy: { route: "asc" },
      });
      const children = await prisma.menuChildren.findMany({
        where: { status: Status.Active },
        select: menuChildSelect,
        orderBy: { name: "asc" },
      });
      const childrenByMenuId = new Map<string, MenuChildSummary[]>();
      for (const child of children) {
        const list = childrenByMenuId.get(child.menuId) ?? [];
        list.push(mapMenuChildSummary(child));
        childrenByMenuId.set(child.menuId, list);
      }

      return menus.map((menu) => ({
        ...menu,
        children: childrenByMenuId.get(menu.id) ?? [],
      }));
    }

    const roleMenus = user.userRoles.flatMap((userRole) => userRole.role.roleMenus);
    const menus = await Promise.all(
      roleMenus.map(async (roleMenu) => {
        const children = await resolveAccessibleMenuChildren(roleMenu.id, roleMenu.menuId);
        return {
          ...roleMenu.menu,
          children: children.map(mapMenuChildSummary),
        };
      })
    );

    return mergeMenusById(menus);
  }

  /**
   * Paginated user list with optional filters on userType, AppRole (via UserRole), and status.
   * By default excludes rows where isDeleted is true.
   */
  async listUsers(params: ListUsersParams = {}): Promise<{
    users: ListedUser[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = clampInt(params.page ?? 1, 1, 1_000_000);
    const limit = clampInt(params.limit ?? 20, 1, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (!params.includeDeleted) {
      where.isDeleted = false;
    }

    if (params.userType !== undefined) {
      where.userType = params.userType;
    }

    if (params.status !== undefined && params.status.trim() !== "") {
      where.status = params.status.trim();
    }

    if (params.roleId) {
      where.userRoles = { some: { roleId: params.roleId } };
    } else if (params.roleName) {
      where.userRoles = { some: { role: { name: params.roleName } } };
    }

    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { email: { contains: q } },
        { firstName: { contains: q } },
        { lastName: { contains: q } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: userListSelect,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return {
      users: rows.map(mapListedUser),
      pagination: { page, limit, total, totalPages },
    };
  }

  async updateUser(userId: string, data: { email?: string }) {
    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, email: true, updatedAt: true },
    });

    return user;
  }

  async deleteUser(userId: string) {
    await prisma.user.delete({
      where: { id: userId },
    });

    return { message: "User deleted successfully" };
  }

  private mapUserAccess(
    user: Prisma.UserGetPayload<{ select: typeof userAccessSelect }>
  ): UserAccessData {
    return {
      id: user.id,
      email: user.email,
      privileges: mapPrivilegesFromLinks(user.privilegeLinks),
      appRoles: user.userRoles.map((ur) => ur.role),
    };
  }

  private async getUserAccessById(userId: string): Promise<UserAccessData | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: userAccessSelect,
    });
    if (!user) {
      return null;
    }
    return this.mapUserAccess(user);
  }

  async addPrivilegesToUser(userId: string, privilegeIds: string[]): Promise<UserAccessData> {
    const uniqueIds = [...new Set(privilegeIds)];

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { privilegeLinks: { select: { privilegeId: true } } },
    });

    if (!user) {
      throw new Error("User not found");
    }

    const privileges = await prisma.privilege.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });

    if (privileges.length !== uniqueIds.length) {
      throw new Error("One or more privilege IDs were not found");
    }

    const existingIds = new Set(user.privilegeLinks.map((link) => link.privilegeId));
    const toConnect = uniqueIds.filter((id) => !existingIds.has(id));

    if (toConnect.length === 0) {
      return (await this.getUserAccessById(userId))!;
    }

    await prisma.privilegeToUser.createMany({
      data: toConnect.map((privilegeId) => ({ userId, privilegeId })),
      skipDuplicates: true,
    });

    return (await this.getUserAccessById(userId))!;
  }

  async removePrivilegeFromUser(userId: string, privilegeId: string): Promise<UserAccessData> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        privilegeLinks: {
          where: { privilegeId },
          select: { privilegeId: true },
        },
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (user.privilegeLinks.length === 0) {
      throw new Error("Privilege is not assigned to this user");
    }

    await prisma.privilegeToUser.delete({
      where: {
        privilegeId_userId: { privilegeId, userId },
      },
    });

    return (await this.getUserAccessById(userId))!;
  }

  /**
   * Assigns an application role to a user. UserRole uses userId as primary key,
   * so each user may have at most one AppRole; assigning again replaces the existing link.
   */
  async addAppRoleToUser(userId: string, roleId: string): Promise<UserAccessData> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      throw new Error("User not found");
    }

    const role = await prisma.appRole.findUnique({ where: { id: roleId }, select: { id: true } });
    if (!role) {
      throw new Error("Role not found");
    }

    await prisma.userRole.upsert({
      where: { userId },
      create: { userId, roleId },
      update: { roleId },
    });

    return (await this.getUserAccessById(userId))!;
  }

  async removeAppRoleFromUser(userId: string, roleId: string): Promise<UserAccessData> {
    const userRole = await prisma.userRole.findUnique({ where: { userId } });

    if (!userRole) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) {
        throw new Error("User not found");
      }
      throw new Error("Role is not assigned to this user");
    }

    if (userRole.roleId !== roleId) {
      throw new Error("Role is not assigned to this user");
    }

    await prisma.userRole.delete({ where: { userId } });

    return (await this.getUserAccessById(userId))!;
  }
}

export const userService = new UserService();
