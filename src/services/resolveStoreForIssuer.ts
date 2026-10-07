import prisma from "../utils/prisma";

/** Must stay in sync with controller 403 handling for collection creates. */
export const MSG_NOT_STORE_MANAGER =
  "You are not authorized to issue items because you are not assigned as a store manager.";

/**
 * Resolves store for inventory issuance: explicit storeId must exist and issuer must be its manager;
 * otherwise first store managed by issuer (name ascending).
 */
export async function resolveStoreIdForIssuer(
  inputStoreId: string | undefined | null,
  issuerUserId: string
): Promise<string> {
  const trimmed = inputStoreId && typeof inputStoreId === "string" ? inputStoreId.trim() : "";
  if (trimmed) {
    const store = await prisma.store.findUnique({
      where: { id: trimmed },
      select: { id: true, managerId: true },
    });
    if (!store) throw new Error("Invalid storeId");
    if (store.managerId !== issuerUserId) {
      throw new Error(
        "You are not authorized to issue items from this store because you are not assigned as its manager."
      );
    }
    return store.id;
  }

  const managed = await prisma.store.findMany({
    where: { managerId: issuerUserId },
    orderBy: { name: "asc" },
    take: 1,
    select: { id: true },
  });
  if (!managed.length) {
    throw new Error(MSG_NOT_STORE_MANAGER);
  }
  return managed[0].id;
}
