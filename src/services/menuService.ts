import prisma from "../utils/prisma";
import { Status } from "@prisma/client";
import { menuChildSelect, MenuChildData } from "../utils/menuAccess";

export interface MenuData {
  id: string;
  route: string;
  caption: string;
  status: Status;
  children?: MenuChildData[];
}

export interface ListMenusParams {
  q?: string;
  status?: Status | "All";
  includeChildren?: boolean;
}

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as any).code === "string";
}

export class MenuService {
  private prisma = prisma;

  private async attachChildren(menus: MenuData[], includeChildren: boolean): Promise<MenuData[]> {
    if (!includeChildren || menus.length === 0) {
      return menus;
    }

    const menuIds = menus.map((menu) => menu.id);
    const children = await this.prisma.menuChildren.findMany({
      where: { menuId: { in: menuIds } },
      select: menuChildSelect,
      orderBy: [{ menuId: "asc" }, { name: "asc" }],
    });

    const childrenByMenuId = new Map<string, MenuChildData[]>();
    for (const child of children) {
      const list = childrenByMenuId.get(child.menuId) ?? [];
      list.push(child);
      childrenByMenuId.set(child.menuId, list);
    }

    return menus.map((menu) => ({
      ...menu,
      children: childrenByMenuId.get(menu.id) ?? [],
    }));
  }

  private async assertMenuExists(menuId: string): Promise<void> {
    const menu = await this.prisma.menu.findUnique({ where: { id: menuId }, select: { id: true } });
    if (!menu) throw new Error("Menu not found");
  }

  async createMenu(input: { route: string; caption: string; status?: Status }): Promise<MenuData> {
    try {
      return await this.prisma.menu.create({
        data: {
          route: input.route,
          caption: input.caption,
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Menu route already exists");
      }
      throw e;
    }
  }

  async listMenus(params: ListMenusParams = {}): Promise<MenuData[]> {
    const where: {
      status?: Status;
      OR?: Array<{ route: { contains: string } } | { caption: { contains: string } }>;
    } = {};

    if (params.status === undefined) {
      where.status = Status.Active;
    } else if (params.status !== "All") {
      where.status = params.status;
    }

    if (params.q) {
      where.OR = [{ route: { contains: params.q } }, { caption: { contains: params.q } }];
    }

    const finalWhere = Object.keys(where).length ? where : undefined;

    const rows = await this.prisma.menu.findMany({
      where: finalWhere,
      orderBy: { route: "asc" },
    });

    const q = params.q?.toLowerCase();
    const filtered = q
      ? rows.filter((m) => m.route.toLowerCase().includes(q) || m.caption.toLowerCase().includes(q))
      : rows;

    return this.attachChildren(filtered, true);
  }

  async getMenuById(id: string, includeChildren = true): Promise<MenuData | null> {
    const menu = await this.prisma.menu.findUnique({ where: { id } });
    if (!menu) return null;
    const [withChildren] = await this.attachChildren([menu], true);
    return withChildren;
  }

  async updateMenu(
    id: string,
    input: { route?: string; caption?: string; status?: Status }
  ): Promise<MenuData> {
    try {
      return await this.prisma.menu.update({
        where: { id },
        data: {
          ...(input.route !== undefined ? { route: input.route } : {}),
          ...(input.caption !== undefined ? { caption: input.caption } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2002") {
        throw new Error("Menu route already exists");
      }
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Menu not found");
      }
      throw e;
    }
  }

  async deleteMenu(id: string): Promise<MenuData> {
    try {
      return await this.prisma.menu.delete({ where: { id } });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Menu not found");
      }
      throw e;
    }
  }

  async listMenuChildren(menuId: string, status?: Status | "All"): Promise<MenuChildData[]> {
    await this.assertMenuExists(menuId);
    const where: { menuId: string; status?: Status } = { menuId };
    if (status === undefined) {
      where.status = Status.Active;
    } else if (status !== "All") {
      where.status = status;
    }

    return this.prisma.menuChildren.findMany({
      where,
      select: menuChildSelect,
      orderBy: { name: "asc" },
    });
  }

  async getMenuChildById(menuId: string, childId: string): Promise<MenuChildData | null> {
    return this.prisma.menuChildren.findFirst({
      where: { id: childId, menuId },
      select: menuChildSelect,
    });
  }

  async createMenuChild(
    menuId: string,
    input: { name: string; route: string; status?: Status }
  ): Promise<MenuChildData> {
    await this.assertMenuExists(menuId);
    const name = input.name.trim();
    const route = input.route.trim();
    if (!name) throw new Error("name is required");
    if (!route) throw new Error("route is required");

    return this.prisma.menuChildren.create({
      data: {
        menuId,
        name,
        route,
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      select: menuChildSelect,
    });
  }

  async updateMenuChild(
    menuId: string,
    childId: string,
    input: { name?: string; route?: string; status?: Status }
  ): Promise<MenuChildData> {
    const existing = await this.getMenuChildById(menuId, childId);
    if (!existing) throw new Error("Menu child not found");

    const name = input.name !== undefined ? input.name.trim() : undefined;
    const route = input.route !== undefined ? input.route.trim() : undefined;
    if (name !== undefined && !name) throw new Error("name must be a non-empty string");
    if (route !== undefined && !route) throw new Error("route must be a non-empty string");

    try {
      return await this.prisma.menuChildren.update({
        where: { id: childId },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(route !== undefined ? { route } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedAt: new Date(),
        },
        select: menuChildSelect,
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        throw new Error("Menu child not found");
      }
      throw e;
    }
  }

  async deleteMenuChild(menuId: string, childId: string): Promise<MenuChildData> {
    const existing = await this.getMenuChildById(menuId, childId);
    if (!existing) throw new Error("Menu child not found");

    try {
      return await this.prisma.menuChildren.delete({
        where: { id: childId },
        select: menuChildSelect,
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2023") {
        throw new Error("Cannot delete menu child: it is referenced by role assignments");
      }
      throw e;
    }
  }
}

export const menuService = new MenuService();
