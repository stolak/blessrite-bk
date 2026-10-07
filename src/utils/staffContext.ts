import { UserType } from "@prisma/client";
import prisma from "./prisma";

/**
 * Resolves the staff id for the authenticated staff user (Staff.userId).
 */
export async function resolveStaffId(userId: string): Promise<string> {
  const id = userId.trim();
  if (!id) throw new Error("Unauthorized");

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, userType: true },
  });
  if (!user) throw new Error("Unauthorized");
  if (user.userType !== UserType.Staff) {
    throw new Error("This action is only available to staff users");
  }

  const staff = await prisma.staff.findFirst({
    where: { userId: id },
    select: { id: true },
  });
  if (!staff) throw new Error("No staff profile linked to this user");

  return staff.id;
}
