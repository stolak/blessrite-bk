import { Prisma, Status } from "@prisma/client";
import prisma from "./prisma";

export const menuChildSelect = {
  id: true,
  menuId: true,
  name: true,
  route: true,
  status: true,
} satisfies Prisma.MenuChildrenSelect;

export type MenuChildData = Prisma.MenuChildrenGetPayload<{ select: typeof menuChildSelect }>;

/**
 * If a RoleMenu has no RoleMenuChild rows, all active children of the parent menu are granted.
 * Otherwise only the explicitly assigned children are returned.
 */
export async function resolveAccessibleMenuChildren(
  roleMenuId: string,
  menuId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<MenuChildData[]> {
  const [allChildren, assigned] = await Promise.all([
    tx.menuChildren.findMany({
      where: { menuId, status: Status.Active },
      select: menuChildSelect,
      orderBy: { name: "asc" },
    }),
    tx.roleMenuChild.findMany({
      where: { roleMenuId },
      select: { menuChildId: true },
    }),
  ]);

  if (assigned.length === 0) {
    return allChildren;
  }

  const allowedIds = new Set(assigned.map((row) => row.menuChildId));
  return allChildren.filter((child) => allowedIds.has(child.id));
}
