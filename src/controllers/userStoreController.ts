import { Request, Response } from "express";
import { Status } from "@prisma/client";
import { userStoreService } from "../services/userStoreService";
import { storeService } from "../services/storeService";
import { parseIntOrUndefined, routeParam, routeParamTrimmed } from "../utils/request";

function httpStatusForUserStoreMutation(message: string): number {
  if (message === "Store not found" || message === "Invalid userId" || message === "User is not assigned to this store") {
    return 404;
  }
  if (message === "User already has access to this store") return 409;
  if (message === "userId and storeId are required") return 400;
  return 500;
}

/**
 * @openapi
 * tags:
 *   - name: UserStores
 *     description: Many-to-many access between users and stores (`user_stores`)
 */
export const userStoreController = {
  /**
   * @openapi
   * /api/v1/user-stores:
   *   post:
   *     summary: Grant a user access to a store
   *     tags: [UserStores]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [userId, storeId]
   *             properties:
   *               userId:
   *                 type: string
   *                 format: uuid
   *               storeId:
   *                 type: string
   *                 format: uuid
   *     responses:
   *       201:
   *         description: Access granted
   *       404:
   *         description: Store or user not found
   *       409:
   *         description: Assignment already exists
   */
  grantAccess: async (req: Request, res: Response) => {
    try {
      const { userId, storeId } = req.body ?? {};
      if (!userId || typeof userId !== "string" || !userId.trim()) {
        return res.status(400).json({ success: false, message: "userId is required" });
      }
      if (!storeId || typeof storeId !== "string" || !storeId.trim()) {
        return res.status(400).json({ success: false, message: "storeId is required" });
      }

      const data = await userStoreService.grantAccess(userId.trim(), storeId.trim());
      return res.status(201).json({ success: true, message: "User granted store access", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to grant store access";
      return res.status(httpStatusForUserStoreMutation(message)).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/user-stores:
   *   get:
   *     summary: List user–store assignments
   *     tags: [UserStores]
   *     security:
   *       - bearerAuth: []
   *     description: Filter by userId and/or storeId. Omit both to list all assignments (paginated).
   *     parameters:
   *       - in: query
   *         name: userId
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: storeId
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: page
   *         schema: { type: integer, minimum: 1, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
   *     responses:
   *       200:
   *         description: Paginated assignments
   */
  listAssignments: async (req: Request, res: Response) => {
    try {
      const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : undefined;
      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const data = await userStoreService.listAssignments({ userId, storeId, page, limit });
      return res.json({ success: true, message: "User-store assignments retrieved", data });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to list assignments",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/user-stores/{userId}/{storeId}:
   *   get:
   *     summary: Get a single user–store assignment
   *     tags: [UserStores]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: path
   *         name: storeId
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200:
   *         description: Assignment found
   *       404:
   *         description: Not assigned
   */
  getAssignment: async (req: Request, res: Response) => {
    try {
      const userId = routeParamTrimmed(req.params.userId);
      const storeId = routeParamTrimmed(req.params.storeId);
      if (!userId || !storeId) {
        return res.status(400).json({ success: false, message: "userId and storeId are required" });
      }

      const row = await userStoreService.getAssignment(userId, storeId);
      if (!row) {
        return res.status(404).json({ success: false, message: "User is not assigned to this store" });
      }

      return res.json({ success: true, message: "Assignment retrieved", data: row });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve assignment",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/user-stores/{userId}/{storeId}:
   *   delete:
   *     summary: Revoke a user's access to a store
   *     tags: [UserStores]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: path
   *         name: storeId
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200:
   *         description: Access revoked
   *       404:
   *         description: Store not found or assignment missing
   */
  revokeAccess: async (req: Request, res: Response) => {
    try {
      const userId = routeParamTrimmed(req.params.userId);
      const storeId = routeParamTrimmed(req.params.storeId);
      if (!userId || !storeId) {
        return res.status(400).json({ success: false, message: "userId and storeId are required" });
      }

      const data = await userStoreService.revokeAccess(userId, storeId);
      return res.json({ success: true, message: "User removed from store", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to revoke store access";
      return res.status(httpStatusForUserStoreMutation(message)).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/user-stores/users/{userId}/stores:
   *   get:
   *     summary: List stores explicitly assigned to a user (user_stores rows only)
   *     tags: [UserStores]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: page
   *         schema: { type: integer, minimum: 1, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
   *     responses:
   *       200:
   *         description: Stores for user
   *       404:
   *         description: Invalid userId
   */
  listStoresForUser: async (req: Request, res: Response) => {
    try {
      const userId = routeParamTrimmed(req.params.userId);
      if (!userId) {
        return res.status(400).json({ success: false, message: "userId is required" });
      }

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const data = await userStoreService.listStoresForUser(userId, { page, limit });
      return res.json({ success: true, message: "Stores for user retrieved", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to list stores for user";
      return res.status(message === "Invalid userId" ? 404 : 500).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/user-stores/users/{userId}/accessible-stores:
   *   get:
   *     summary: List stores a user can access (manager and/or user_stores)
   *     tags: [UserStores]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: q
   *         schema: { type: string }
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [Active, Inactive, Archived, All]
   *     responses:
   *       200:
   *         description: All accessible stores (includes isStoreManager, hasUserStoreAccess; no pagination)
   */
  listAccessibleStoresForUser: async (req: Request, res: Response) => {
    try {
      const userId = routeParamTrimmed(req.params.userId);
      if (!userId) {
        return res.status(400).json({ success: false, message: "userId is required" });
      }

      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status =
        statusRaw === undefined
          ? undefined
          : statusRaw === "All"
            ? "All"
            : statusRaw === "Active"
              ? Status.Active
              : statusRaw === "Inactive"
                ? Status.Inactive
                : statusRaw === "Archived"
                  ? Status.Archived
                  : undefined;

      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, Archived, or All",
        });
      }

      await userStoreService.ensureUserExists(userId);
      const data = await storeService.listStoresAccessibleByUser(userId, { q, status });
      return res.json({ success: true, message: "Accessible stores retrieved", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to list accessible stores";
      return res.status(message === "Invalid userId" ? 404 : 500).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/user-stores/stores/{storeId}/users:
   *   get:
   *     summary: List users explicitly assigned to a store
   *     tags: [UserStores]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: storeId
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: page
   *         schema: { type: integer, minimum: 1, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
   *     responses:
   *       200:
   *         description: Users with user_stores access
   *       404:
   *         description: Store not found
   */
  listUsersForStore: async (req: Request, res: Response) => {
    try {
      const storeId = routeParamTrimmed(req.params.storeId);
      if (!storeId) {
        return res.status(400).json({ success: false, message: "storeId is required" });
      }

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const data = await userStoreService.listUsersForStore(storeId, { page, limit });
      return res.json({ success: true, message: "Users for store retrieved", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to list users for store";
      return res.status(message === "Store not found" ? 404 : 500).json({ success: false, message });
    }
  },
};
