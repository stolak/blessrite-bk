import prisma from "../utils/prisma";
import { Prisma, Status } from "@prisma/client";
import { menuChildSelect, MenuChildData } from "../utils/menuAccess";

export type AppRoleStatus = "active" | "inactive";

export interface PrivilegeSummary {
  id: string;
  name: string;
  description: string | null;
}

export interface AppRoleData {
  id: string;
  name: string;
  status: string;
  privileges?: PrivilegeSummary[];
  roleMenus?: RoleMenuData[];
}

export interface AddMenusToRoleInput {
  menuIds?: string[];
  childrenMenuIds?: string[];
}

export interface ListAppRolesParams {
  q?: string;
  status?: AppRoleStatus | "all";
}

export interface RoleMenuMenuSummary {
  id: string;
  route: string;
  caption: string;
  status: Status;
  menuChildren: MenuChildData[];
}

export interface RoleMenuData {
  id: string;
  roleId: string;
  menuId: string;
  menu: RoleMenuMenuSummary;
  /** IDs explicitly whitelisted for this role+menu. Omitted in list responses; empty = all children granted. */
  assignedMenuChildIds?: string[];
}

const privilegeSelect = {
  id: true,
  name: true,
  description: true,
} satisfies Prisma.PrivilegeSelect;

const rolePrivilegeLinkSelect = {
  privilege: { select: privilegeSelect },
} satisfies Prisma.AppRoleToPrivilegeSelect;

const roleWithPrivilegesInclude = {
  privilegeLinks: { select: rolePrivilegeLinkSelect },
} satisfies Prisma.AppRoleInclude;

const roleMenuChildInclude = {
  menuChild: { select: menuChildSelect },
} satisfies Prisma.RoleMenuChildInclude;

const roleMenuInclude = {
  menu: {
    select: {
      id: true,
      route: true,
      caption: true,
      status: true,
    },
  },
  roleMenuChildren: {
    include: roleMenuChildInclude,
    orderBy: { menuChild: { name: "asc" } },
  },
} satisfies Prisma.RoleMenuInclude;

const appRoleDetailInclude = {
  privilegeLinks: { select: rolePrivilegeLinkSelect },
  roleMenus: {
    include: roleMenuInclude,
    orderBy: { menu: { route: "asc" } },
  },
} satisfies Prisma.AppRoleInclude;

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as any).code === "string";
}

function mapPrivilegesFromRoleLinks(
  links: { privilege: { id: string; name: string; description: string | null } }[]
) {
  return links.map((link) => link.privilege);
}

type RoleMenuRow = Prisma.RoleMenuGetPayload<{ include: typeof roleMenuInclude }>;

async function loadMenuChildrenByMenuId(menuIds: string[]): Promise<Map<string, MenuChildData[]>> {
  if (menuIds.length === 0) {
    return new Map();
  }

  const uniqueMenuIds = [...new Set(menuIds)];
  const children = await prisma.menuChildren.findMany({
    where: { menuId: { in: uniqueMenuIds } },
    select: menuChildSelect,
    orderBy: [{ menuId: "asc" }, { name: "asc" }],
  });

  const childrenByMenuId = new Map<string, MenuChildData[]>();
  for (const child of children) {
    const list = childrenByMenuId.get(child.menuId) ?? [];
    list.push(child);
    childrenByMenuId.set(child.menuId, list);
  }

  return childrenByMenuId;
}

function mapRoleMenuRows(
  rows: RoleMenuRow[],
  childrenByMenuId: Map<string, MenuChildData[]>,
  options?: { includeAssignedIds?: boolean; assignedChildrenOnly?: boolean }
): RoleMenuData[] {
  return rows.map((row) => ({
    id: row.id,
    roleId: row.roleId,
    menuId: row.menuId,
    menu: {
      ...row.menu,
      menuChildren: options?.assignedChildrenOnly
        ? row.roleMenuChildren.map((assignment) => assignment.menuChild)
        : (childrenByMenuId.get(row.menuId) ?? []),
    },
    ...(options?.includeAssignedIds
      ? { assignedMenuChildIds: row.roleMenuChildren.map((assignment) => assignment.menuChildId) }
      : {}),
  }));
}

async function mapRoleMenuRow(
  row: RoleMenuRow,
  options?: { includeAssignedIds?: boolean }
): Promise<RoleMenuData> {
  const childrenByMenuId = await loadMenuChildrenByMenuId([row.menuId]);
  return mapRoleMenuRows([row], childrenByMenuId, options)[0];
}

export class AppRoleService {
  private prisma = prisma;

  async createAppRole(input: { name: string; status?: AppRoleStatus }): Promise<AppRoleData> {
    return await this.prisma.appRole.create({
      data: {
        name: input.name,
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
  }

  async listAppRoles(params: ListAppRolesParams = {}): Promise<AppRoleData[]> {
    const where: { status?: string; name?: { contains: string } } = {};

    if (params.status === undefined) {
      where.status = "active";
    } else if (params.status !== "all") {
      where.status = params.status;
    }

    if (params.q) {
      where.name = { contains: params.q };
    }

    const finalWhere = Object.keys(where).length ? where : undefined;

    const rows = await this.prisma.appRole.findMany({
      where: finalWhere,
      include: {
        privilegeLinks: { select: rolePrivilegeLinkSelect },
        roleMenus: {
          include: roleMenuInclude,
          orderBy: { menu: { route: "asc" } },
        },
      },
      orderBy: { name: "asc" },
    });

    const q = params.q?.toLowerCase();
    const filtered = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;

    const allRoleMenuRows = filtered.flatMap((role) => role.roleMenus);
    const mappedRoleMenusById = new Map(
      mapRoleMenuRows(allRoleMenuRows, new Map(), { assignedChildrenOnly: true }).map(
        (roleMenu) => [roleMenu.id, roleMenu]
      )
    );

    return filtered.map((role) => ({
      id: role.id,
      name: role.name,
      status: role.status,
      privileges: mapPrivilegesFromRoleLinks(role.privilegeLinks),
      roleMenus: role.roleMenus.map((roleMenu) => mappedRoleMenusById.get(roleMenu.id)!),
    }));
  }

  async getAppRoleById(id: string): Promise<AppRoleData | null> {
    const role = await this.prisma.appRole.findUnique({
      where: { id },
      include: appRoleDetailInclude,
    });
    if (!role) return null;

    return {
      id: role.id,
      name: role.name,
      status: role.status,
      privileges: mapPrivilegesFromRoleLinks(role.privilegeLinks),
      roleMenus: mapRoleMenuRows(role.roleMenus, new Map(), { assignedChildrenOnly: true }),
    };
  }

  async updateAppRole(
    id: string,
    input: { name?: string; status?: AppRoleStatus }
  ): Promise<AppRoleData> {
    const updated = await this.prisma.appRole.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
    return (await this.getAppRoleById(updated.id))!;
  }

  async deleteAppRole(id: string): Promise<AppRoleData> {
    const existing = await this.getAppRoleById(id);
    if (!existing) throw new Error("Role not found");
    try {
      await this.prisma.appRole.delete({ where: { id } });
      return existing;
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2003") {
        throw new Error("Cannot delete role: it is assigned to users or menus");
      }
      throw e;
    }
  }

  async addPrivilegesToRole(roleId: string, privilegeIds: string[]): Promise<AppRoleData> {
    const uniqueIds = [...new Set(privilegeIds)];

    const role = await this.prisma.appRole.findUnique({
      where: { id: roleId },
      include: { privilegeLinks: { select: { privilegeId: true } } },
    });

    if (!role) {
      throw new Error("Role not found");
    }

    const privileges = await this.prisma.privilege.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });

    if (privileges.length !== uniqueIds.length) {
      throw new Error("One or more privilege IDs were not found");
    }

    const existingIds = new Set(role.privilegeLinks.map((link) => link.privilegeId));
    const toConnect = uniqueIds.filter((id) => !existingIds.has(id));

    if (toConnect.length > 0) {
      await this.prisma.appRoleToPrivilege.createMany({
        data: toConnect.map((privilegeId) => ({ appRoleId: roleId, privilegeId })),
        skipDuplicates: true,
      });
    }

    return (await this.getAppRoleById(roleId))!;
  }

  async removePrivilegeFromRole(roleId: string, privilegeId: string): Promise<AppRoleData> {
    const role = await this.prisma.appRole.findUnique({
      where: { id: roleId },
      include: {
        privilegeLinks: {
          where: { privilegeId },
          select: { privilegeId: true },
        },
      },
    });

    if (!role) {
      throw new Error("Role not found");
    }

    if (role.privilegeLinks.length === 0) {
      throw new Error("Privilege is not assigned to this role");
    }

    await this.prisma.appRoleToPrivilege.delete({
      where: {
        appRoleId_privilegeId: { appRoleId: roleId, privilegeId },
      },
    });

    return (await this.getAppRoleById(roleId))!;
  }

  async addMenusToRole(roleId: string, input: AddMenusToRoleInput): Promise<RoleMenuData[]> {
    const uniqueMenuIds = [
      ...new Set((input.menuIds ?? []).map((id) => id.trim()).filter(Boolean)),
    ];
    const uniqueChildIds = [
      ...new Set((input.childrenMenuIds ?? []).map((id) => id.trim()).filter(Boolean)),
    ];

    if (!uniqueMenuIds.length && !uniqueChildIds.length) {
      throw new Error("At least one of menuIds or childrenMenuIds must be provided");
    }

    const role = await this.prisma.appRole.findUnique({
      where: { id: roleId },
      select: { id: true },
    });
    if (!role) {
      throw new Error("Role not found");
    }

    if (uniqueMenuIds.length > 0) {
      const menus = await this.prisma.menu.findMany({
        where: { id: { in: uniqueMenuIds } },
        select: { id: true },
      });
      if (menus.length !== uniqueMenuIds.length) {
        throw new Error("One or more menu IDs were not found");
      }
    }

    let children: Array<{ id: string; menuId: string }> = [];
    if (uniqueChildIds.length > 0) {
      children = await this.prisma.menuChildren.findMany({
        where: { id: { in: uniqueChildIds } },
        select: { id: true, menuId: true },
      });
      if (children.length !== uniqueChildIds.length) {
        throw new Error("One or more children menu IDs were not found");
      }
    }

    const parentMenuIdsFromChildren = children.map((child) => child.menuId);
    const allMenuIdsToLink = [...new Set([...uniqueMenuIds, ...parentMenuIdsFromChildren])];

    await this.prisma.$transaction(async (tx) => {
      const existingRoleMenus = await tx.roleMenu.findMany({
        where: { roleId, menuId: { in: allMenuIdsToLink } },
        select: { id: true, menuId: true },
      });
      const roleMenuIdByMenuId = new Map(existingRoleMenus.map((row) => [row.menuId, row.id]));

      const missingMenuIds = allMenuIdsToLink.filter((menuId) => !roleMenuIdByMenuId.has(menuId));
      if (missingMenuIds.length > 0) {
        await tx.roleMenu.createMany({
          data: missingMenuIds.map((menuId) => ({ roleId, menuId })),
        });

        const createdRoleMenus = await tx.roleMenu.findMany({
          where: { roleId, menuId: { in: missingMenuIds } },
          select: { id: true, menuId: true },
        });
        for (const row of createdRoleMenus) {
          roleMenuIdByMenuId.set(row.menuId, row.id);
        }
      }

      if (children.length === 0) {
        return;
      }

      const roleMenuIds = [
        ...new Set(children.map((child) => roleMenuIdByMenuId.get(child.menuId)!)),
      ];
      const existingAssignments = await tx.roleMenuChild.findMany({
        where: {
          roleMenuId: { in: roleMenuIds },
          menuChildId: { in: uniqueChildIds },
        },
        select: { roleMenuId: true, menuChildId: true },
      });
      const existingKeys = new Set(
        existingAssignments.map((row) => `${row.roleMenuId}:${row.menuChildId}`)
      );

      const toCreate = children
        .map((child) => ({
          roleMenuId: roleMenuIdByMenuId.get(child.menuId)!,
          menuChildId: child.id,
        }))
        .filter((row) => !existingKeys.has(`${row.roleMenuId}:${row.menuChildId}`));

      if (toCreate.length > 0) {
        await tx.roleMenuChild.createMany({ data: toCreate });
      }
    });

    return this.listRoleMenus(roleId);
  }

  async listRoleMenus(roleId: string): Promise<RoleMenuData[]> {
    const role = await this.prisma.appRole.findUnique({
      where: { id: roleId },
      select: { id: true },
    });
    if (!role) {
      throw new Error("Role not found");
    }

    const rows = await this.prisma.roleMenu.findMany({
      where: { roleId },
      include: roleMenuInclude,
      orderBy: { menu: { route: "asc" } },
    });

    return mapRoleMenuRows(rows, new Map(), { assignedChildrenOnly: true });
  }

  async deleteRoleMenu(roleId: string, menuId: string): Promise<RoleMenuData> {
    const record = await this.prisma.roleMenu.findFirst({
      where: { menuId, roleId },
      include: roleMenuInclude,
    });

    if (!record) {
      throw new Error("Role menu record not found");
    }

    const mapped = await mapRoleMenuRow(record);
    await this.prisma.roleMenu.delete({ where: { id: record.id } });
    return mapped;
  }

  private async getRoleMenuForRole(roleId: string, roleMenuId: string): Promise<RoleMenuRow> {
    const record = await this.prisma.roleMenu.findFirst({
      where: { id: roleMenuId, roleId },
      include: roleMenuInclude,
    });
    if (!record) {
      throw new Error("Role menu record not found");
    }
    return record;
  }

  async addMenuChildrenToRoleMenu(
    roleId: string,
    roleMenuId: string,
    menuChildIds: string[]
  ): Promise<RoleMenuData> {
    const uniqueIds = [...new Set(menuChildIds.map((id) => id.trim()).filter(Boolean))];
    if (!uniqueIds.length) {
      throw new Error("menuChildIds must be a non-empty array");
    }

    const roleMenu = await this.getRoleMenuForRole(roleId, roleMenuId);

    const children = await this.prisma.menuChildren.findMany({
      where: { id: { in: uniqueIds }, menuId: roleMenu.menuId },
      select: { id: true },
    });
    if (children.length !== uniqueIds.length) {
      throw new Error("One or more menu child IDs were not found for this menu");
    }

    const existing = await this.prisma.roleMenuChild.findMany({
      where: { roleMenuId, menuChildId: { in: uniqueIds } },
      select: { menuChildId: true },
    });
    const existingIds = new Set(existing.map((row) => row.menuChildId));
    const toCreate = uniqueIds.filter((menuChildId) => !existingIds.has(menuChildId));

    if (toCreate.length > 0) {
      await this.prisma.roleMenuChild.createMany({
        data: toCreate.map((menuChildId) => ({ roleMenuId, menuChildId })),
      });
    }

    return mapRoleMenuRow(
      await this.prisma.roleMenu.findFirstOrThrow({
        where: { id: roleMenuId },
        include: roleMenuInclude,
      }),
      { includeAssignedIds: true }
    );
  }

  async listRoleMenuChildren(roleId: string, roleMenuId: string): Promise<RoleMenuData> {
    const roleMenu = await this.getRoleMenuForRole(roleId, roleMenuId);
    return mapRoleMenuRow(roleMenu, { includeAssignedIds: true });
  }

  async deleteRoleMenuChild(
    roleId: string,
    roleMenuId: string,
    menuChildId: string
  ): Promise<RoleMenuData> {
    await this.getRoleMenuForRole(roleId, roleMenuId);

    const assignment = await this.prisma.roleMenuChild.findFirst({
      where: { menuChildId, roleMenuId },
      select: { id: true },
    });
    if (!assignment) {
      throw new Error("Role menu child record not found");
    }

    await this.prisma.roleMenuChild.delete({ where: { id: assignment.id } });

    return mapRoleMenuRow(
      await this.prisma.roleMenu.findFirstOrThrow({
        where: { id: roleMenuId },
        include: roleMenuInclude,
      }),
      { includeAssignedIds: true }
    );
  }
}

export const appRoleService = new AppRoleService();
