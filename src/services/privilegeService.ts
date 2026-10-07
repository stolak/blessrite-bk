import prisma from "../utils/prisma";

export interface PrivilegeData {
  id: string;
  name: string;
  description: string | null;
}

export interface ListPrivilegesParams {
  q?: string;
}

export class PrivilegeService {
  private prisma = prisma;

  async listPrivileges(params: ListPrivilegesParams = {}): Promise<PrivilegeData[]> {
    const where = params.q
      ? {
          OR: [
            { name: { contains: params.q } },
            { description: { contains: params.q } },
          ],
        }
      : undefined;

    const rows = await this.prisma.privilege.findMany({
      where,
      orderBy: { name: "asc" },
    });

    const q = params.q?.toLowerCase();
    if (!q) {
      return rows;
    }

    return rows.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false)
    );
  }
}

export const privilegeService = new PrivilegeService();
