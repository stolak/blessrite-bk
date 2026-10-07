import { Request, Response } from "express";
import { Status } from "@prisma/client";
import { storeService } from "../services/storeService";
import { parseIntOrUndefined, routeParam, routeParamTrimmed } from "../utils/request";

/**
 * @openapi
 * /api/v1/stores:
 *   post:
 *     summary: Create a store
 *     tags: [Stores]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       name must be unique. managerId is optional and must reference an existing User when provided.
 *       Response includes manager (basic profile) and _count.inventoryTransactions (typically 0 on create).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *               description:
 *                 type: string
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *                 description: Defaults to Active
 *               managerId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: User id for StoreManager relation
 *     responses:
 *       201:
 *         description: Store created
 *       400:
 *         description: Validation error
 *       404:
 *         description: Invalid managerId
 *       409:
 *         description: Duplicate store name
 *       500:
 *         description: Server error
 *   get:
 *     summary: List stores
 *     tags: [Stores]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Defaults to Active stores only unless status=All or another status is passed.
 *       Each row includes manager, transaction count, and accessibleUsers (users with UserStore access), ordered by accessGrantedAt ascending.
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Search store name or description (substring)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, Archived, All]
 *         description: Omit for Active only; use All for all statuses
 *       - in: query
 *         name: managerId
 *         schema: { type: string, format: uuid }
 *         description: Filter by assigned manager user id
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated stores and pagination metadata
 *       400:
 *         description: Invalid status filter
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export const storeController = {
  createStore: async (req: Request, res: Response) => {
    try {
      const { name, description, status, managerId } = req.body ?? {};

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "name is required" });
      }

      if (
        status !== undefined &&
        status !== Status.Active &&
        status !== Status.Inactive &&
        status !== Status.Archived
      ) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      if (managerId !== undefined && managerId !== null && (typeof managerId !== "string" || !managerId.trim())) {
        return res.status(400).json({ success: false, message: "managerId must be a non-empty string or null" });
      }

      const created = await storeService.createStore({
        name: name.trim(),
        ...(description !== undefined
          ? { description: description === null ? null : String(description) }
          : {}),
        ...(status !== undefined ? { status } : {}),
        ...(managerId !== undefined ? { managerId: managerId === null ? null : managerId.trim() } : {}),
      });

      return res.status(201).json({ success: true, message: "Store created successfully", data: created });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create store";
      const code =
        message.startsWith("Invalid ") ? 404 : message.includes("already exists") ? 409 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  listStores: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const managerId = typeof req.query.managerId === "string" ? req.query.managerId : undefined;
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

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const result = await storeService.listStores({ q, status, managerId, page, limit });
      return res.json({ success: true, message: "Stores retrieved successfully", data: result });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve stores",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/stores/me:
   *   get:
   *     summary: List stores the current user can access
   *     tags: [Stores]
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Returns stores where the user is the assigned manager (`managerId`) and/or has a `user_stores` grant.
   *       Each item includes `isStoreManager`, `hasUserStoreAccess`, and `userStoreAccessGrantedAt` when applicable.
   *       Defaults to Active stores only (same as listing stores); pass status=All or a specific status to widen.
   *     parameters:
   *       - in: query
   *         name: q
   *         schema: { type: string }
   *         description: Search store name or description (substring)
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [Active, Inactive, Archived, All]
   *         description: Omit for Active only; use All for all statuses
   *     responses:
   *       200:
   *         description: All accessible stores for the authenticated user (no pagination)
   *       400:
   *         description: Invalid status filter
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  listMyStores: async (req: Request, res: Response) => {
    try {
      const userId = (req as { user?: { id: string } }).user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

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

      const result = await storeService.listStoresAccessibleByUser(userId, { q, status });
      return res.json({ success: true, message: "Stores retrieved successfully", data: result });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve stores",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/stores/{id}:
   *   get:
   *     summary: Get a store by ID
   *     tags: [Stores]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Store with manager and inventory transaction count
   *       404:
   *         description: Store not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a store
   *     tags: [Stores]
   *     security:
   *       - bearerAuth: []
   *     description: managerId may be set to null to unassign the manager. name must remain unique.
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               description:
   *                 type: string
   *                 nullable: true
   *               status:
   *                 type: string
   *                 enum: [Active, Inactive, Archived]
   *               managerId:
   *                 type: string
   *                 format: uuid
   *                 nullable: true
   *     responses:
   *       200:
   *         description: Updated store
   *       400:
   *         description: Validation error
   *       404:
   *         description: Store or manager not found
   *       409:
   *         description: Duplicate store name
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a store
   *     tags: [Stores]
   *     security:
   *       - bearerAuth: []
   *     description: Fails with 409 if any InventoryTransaction references this store (storeId).
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Deleted store returned in data
   *       404:
   *         description: Store not found
   *       409:
   *         description: Referenced by inventory transactions
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  getStoreById: async (req: Request, res: Response) => {
    try {
      const id = routeParamTrimmed(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });
      const row = await storeService.getStoreById(id);
      if (!row) return res.status(404).json({ success: false, message: "Store not found" });
      return res.json({ success: true, message: "Store retrieved successfully", data: row });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve store",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  updateStore: async (req: Request, res: Response) => {
    try {
      const id = routeParamTrimmed(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const { name, description, status, managerId } = req.body ?? {};

      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ success: false, message: "name must be a non-empty string if provided" });
      }

      if (
        status !== undefined &&
        status !== Status.Active &&
        status !== Status.Inactive &&
        status !== Status.Archived
      ) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      if (managerId !== undefined && managerId !== null && (typeof managerId !== "string" || !managerId.trim())) {
        return res.status(400).json({ success: false, message: "managerId must be a non-empty string or null" });
      }

      const updated = await storeService.updateStore(id, {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined
          ? { description: description === null ? null : String(description) }
          : {}),
        ...(status !== undefined ? { status } : {}),
        ...(managerId !== undefined ? { managerId: managerId === null ? null : managerId.trim() } : {}),
      });

      return res.json({ success: true, message: "Store updated successfully", data: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update store";
      const code =
        message === "Store not found" || message.startsWith("Invalid ")
          ? 404
          : message === "name cannot be empty"
            ? 400
            : message.includes("already exists")
              ? 409
              : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  deleteStore: async (req: Request, res: Response) => {
    try {
      const id = routeParamTrimmed(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });
      const deleted = await storeService.deleteStore(id);
      return res.json({ success: true, message: "Store deleted successfully", data: deleted });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete store";
      const code =
        message === "Store not found" ? 404 : message.includes("cannot be deleted") ? 409 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/stores/{id}/users:
   *   post:
   *     summary: Grant a user access to a store (UserStore)
   *     tags: [Stores]
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Creates a row in `user_stores` so the user has access to this store (many-to-many).
   *       This is separate from `managerId` on the store. Duplicate grants return 409.
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Store id
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [userId]
   *             properties:
   *               userId:
   *                 type: string
   *                 format: uuid
   *                 description: User to grant store access
   *     responses:
   *       201:
   *         description: Access granted; returns UserStore with user and store summaries
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Store not found or invalid userId
   *       409:
   *         description: User already has access to this store
   *       500:
   *         description: Server error
   */
  /**
   * @openapi
   * /api/v1/stores/{id}/users:
   *   get:
   *     summary: List users assigned to a store (UserStore)
   *     tags: [Stores]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
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
   *         description: Users with explicit store access
   *       404:
   *         description: Store not found
   */
  listStoreUsers: async (req: Request, res: Response) => {
    try {
      const id = routeParamTrimmed(req.params.id);
      if (!id) {
        return res.status(400).json({ success: false, message: "id is required" });
      }

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const data = await storeService.listUsersForStore(id, { page, limit });
      return res.json({ success: true, message: "Store users retrieved successfully", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to list store users";
      return res.status(message === "Store not found" ? 404 : 500).json({ success: false, message });
    }
  },

  addUserToStore: async (req: Request, res: Response) => {
    try {
      const id = routeParamTrimmed(req.params.id);
      const { userId } = req.body ?? {};
      if (!id) {
        return res.status(400).json({ success: false, message: "id is required" });
      }
      if (!userId || typeof userId !== "string" || !userId.trim()) {
        return res.status(400).json({ success: false, message: "userId is required" });
      }

      const data = await storeService.addUserToStore(id, userId.trim());
      return res.status(201).json({ success: true, message: "User added to store successfully", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to add user to store";
      const code =
        message === "Store not found" || message === "Invalid userId"
          ? 404
          : message === "User already has access to this store"
            ? 409
            : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/stores/{id}/users/{userId}:
   *   delete:
   *     summary: Revoke a user's access to a store
   *     tags: [Stores]
   *     security:
   *       - bearerAuth: []
   *     description: Deletes the `user_stores` row for this pair if it exists.
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Store id
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: User id to remove from store access
   *     responses:
   *       200:
   *         description: Access revoked
   *       400:
   *         description: Missing path parameters
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Store not found or user was not assigned to this store
   *       500:
   *         description: Server error
   */
  removeUserFromStore: async (req: Request, res: Response) => {
    try {
      const id = routeParamTrimmed(req.params.id);
      const userId = routeParamTrimmed(req.params.userId);
      if (!id) {
        return res.status(400).json({ success: false, message: "id is required" });
      }
      if (!userId) {
        return res.status(400).json({ success: false, message: "userId is required" });
      }

      const data = await storeService.removeUserFromStore(id, userId);
      return res.json({ success: true, message: "User removed from store successfully", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to remove user from store";
      const code =
        message === "Store not found" || message === "User is not assigned to this store" ? 404 : 500;
      return res.status(code).json({ success: false, message });
    }
  },
};
