import { Request, Response } from "express";
import { UserType } from "@prisma/client";
import { userService } from "../services/userService";
import { parseIntOrUndefined, routeParam } from "../utils/request";

const USER_TYPES = new Set<string>(Object.values(UserType));

function parsePrivilegeIds(body: unknown): string[] | null {
  const privilegeIds = (body as { privilegeIds?: unknown })?.privilegeIds;
  if (!Array.isArray(privilegeIds) || privilegeIds.length === 0) {
    return null;
  }
  if (!privilegeIds.every((id) => typeof id === "string" && id.trim())) {
    return null;
  }
  return privilegeIds.map((id) => id.trim());
}

function parseRoleId(body: unknown): string | null {
  const roleId = (body as { roleId?: unknown })?.roleId;
  if (typeof roleId !== "string" || !roleId.trim()) {
    return null;
  }
  return roleId.trim();
}

/**
 * @openapi
 * /api/v1/users:
 *   get:
 *     summary: List users with filters
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Paginated list. Passwords are never returned.
 *       By default excludes users with isDeleted=true unless includeDeleted=true.
 *       Filters combine with AND. Optional q searches email, firstName, lastName (substring).
 *     parameters:
 *       - in: query
 *         name: userType
 *         schema:
 *           type: string
 *           enum: [SuperAdmin, Staff, Student, Parent]
 *         description: Filter by Prisma UserType
 *       - in: query
 *         name: roleId
 *         schema:
 *           type: string
 *         description: Filter by AppRole id (UserRole.roleId)
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *         description: Filter by AppRole name (exact match on roles.name)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by User.status string (e.g. active)
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search email, firstName, lastName (contains)
 *       - in: query
 *         name: includeDeleted
 *         schema:
 *           type: boolean
 *         description: If true, include soft-deleted users
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: users array and pagination
 *       400:
 *         description: Invalid userType
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export const userController = {
  listUsers: async (req: Request, res: Response) => {
    try {
      const userTypeRaw = typeof req.query.userType === "string" ? req.query.userType : undefined;
      const roleId =
        typeof req.query.roleId === "string" && req.query.roleId.trim()
          ? req.query.roleId.trim()
          : undefined;
      const roleName =
        typeof req.query.role === "string" && req.query.role.trim()
          ? req.query.role.trim()
          : undefined;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const includeDeletedRaw = req.query.includeDeleted;

      let userType: UserType | undefined;
      if (userTypeRaw !== undefined) {
        if (!USER_TYPES.has(userTypeRaw)) {
          return res.status(400).json({
            success: false,
            message: "userType must be SuperAdmin, Staff, Student, or Parent",
          });
        }
        userType = userTypeRaw as UserType;
      }

      if (roleId && roleName) {
        return res.status(400).json({
          success: false,
          message: "Use only one of roleId or role (role name), not both",
        });
      }

      const includeDeleted =
        includeDeletedRaw === "true" ||
        includeDeletedRaw === "1" ||
        (Array.isArray(includeDeletedRaw) && includeDeletedRaw[0] === "true");

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const result = await userService.listUsers({
        ...(userType !== undefined ? { userType } : {}),
        ...(roleId !== undefined ? { roleId } : {}),
        ...(roleName !== undefined ? { roleName } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(q !== undefined ? { q } : {}),
        includeDeleted,
        page,
        limit,
      });

      return res.json({ success: true, message: "Users retrieved successfully", data: result });
    } catch (error: unknown) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve users",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/users/{userId}:
   *   get:
   *     summary: Get a user by ID
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     description: |
 *       Returns user profile fields, direct privileges, and application role (UserRole → AppRole).
 *       Password is never returned.
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *         description: User ID
   *     responses:
   *       200:
   *         description: User details with privileges and app roles
   *       404:
   *         description: User not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  getUserById: async (req: Request, res: Response) => {
    try {
      const userId = routeParam(req.params.userId);

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "userId parameter is required",
        });
      }

      const user = await userService.getUserById(userId);

      return res.json({
        success: true,
        message: "User retrieved successfully",
        data: user,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to retrieve user";
      const httpStatus = message === "User not found" ? 404 : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/users/{userId}/privileges:
   *   get:
   *     summary: List effective privileges for a user
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Returns privileges assigned directly to the user plus those on the user's AppRole (UserRole).
   *       SuperAdmin users receive every privilege in the system.
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Effective privilege list
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success: { type: boolean }
   *                 message: { type: string }
   *                 data:
   *                   type: object
   *                   properties:
   *                     privileges:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id: { type: string }
   *                           name: { type: string }
   *                           description: { type: string, nullable: true }
   *       404:
   *         description: User not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   *   post:
   *     summary: Assign privileges to a user
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [privilegeIds]
   *             properties:
   *               privilegeIds:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       200:
   *         description: User with updated privileges and app roles
   *       400:
   *         description: Validation error
   *       404:
   *         description: User or privilege not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  getUserPrivileges: async (req: Request, res: Response) => {
    try {
      const userId = routeParam(req.params.userId);

      if (!userId) {
        return res.status(400).json({ success: false, message: "userId parameter is required" });
      }

      const privileges = await userService.getUserPrivileges(userId);

      return res.json({
        success: true,
        message: "User privileges retrieved successfully",
        data: { privileges },
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to retrieve user privileges";
      const httpStatus = message === "User not found" ? 404 : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/users/{userId}/menus:
   *   get:
   *     summary: List menus for a user's application role
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Returns menus assigned to the user's AppRole via RoleMenu (UserRole → AppRole).
   *       SuperAdmin users receive every menu in the system. Users without a role receive an empty list.
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Menu list for the user's role
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success: { type: boolean }
   *                 message: { type: string }
   *                 data:
   *                   type: object
   *                   properties:
   *                     menus:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id: { type: string }
   *                           route: { type: string }
   *                           caption: { type: string }
   *                           status:
   *                             type: string
   *                             enum: [Active, Inactive, Archived]
   *       404:
   *         description: User not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  getUserMenus: async (req: Request, res: Response) => {
    try {
      const userId = routeParam(req.params.userId);

      if (!userId) {
        return res.status(400).json({ success: false, message: "userId parameter is required" });
      }

      const menus = await userService.getUserMenus(userId);

      return res.json({
        success: true,
        message: "User menus retrieved successfully",
        data: { menus },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to retrieve user menus";
      const httpStatus = message === "User not found" ? 404 : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },

  addPrivilegesToUser: async (req: Request, res: Response) => {
    try {
      const userId = routeParam(req.params.userId);
      const privilegeIds = parsePrivilegeIds(req.body);

      if (!userId) {
        return res.status(400).json({ success: false, message: "userId parameter is required" });
      }
      if (!privilegeIds) {
        return res.status(400).json({
          success: false,
          message: "privilegeIds must be a non-empty array of strings",
        });
      }

      const data = await userService.addPrivilegesToUser(userId, privilegeIds);

      return res.json({
        success: true,
        message: "Privileges added to user successfully",
        data,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to add privileges to user";
      const httpStatus =
        message === "User not found" || message.includes("privilege IDs were not found")
          ? 404
          : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/users/{userId}/privileges/{privilegeId}:
   *   delete:
   *     summary: Remove a privilege from a user
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: privilegeId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: User with updated privileges and app roles
   *       404:
   *         description: User not found or privilege not assigned
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  removePrivilegeFromUser: async (req: Request, res: Response) => {
    try {
      const userId = routeParam(req.params.userId);
      const privilegeId = routeParam(req.params.privilegeId);

      if (!userId || !privilegeId) {
        return res.status(400).json({
          success: false,
          message: "userId and privilegeId parameters are required",
        });
      }

      const data = await userService.removePrivilegeFromUser(userId, privilegeId);

      return res.json({
        success: true,
        message: "Privilege removed from user successfully",
        data,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to remove privilege from user";
      const httpStatus =
        message === "User not found" || message === "Privilege is not assigned to this user"
          ? 404
          : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/users/{userId}/roles:
   *   post:
   *     summary: Assign an application role to a user
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Each user may have at most one AppRole (UserRole.userId is the primary key).
   *       Assigning again replaces the existing application role.
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [roleId]
   *             properties:
   *               roleId:
   *                 type: string
   *     responses:
   *       200:
   *         description: User with updated privileges and app roles
   *       400:
   *         description: Validation error
   *       404:
   *         description: User or role not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  addAppRoleToUser: async (req: Request, res: Response) => {
    try {
      const userId = routeParam(req.params.userId);
      const roleId = parseRoleId(req.body);

      if (!userId) {
        return res.status(400).json({ success: false, message: "userId parameter is required" });
      }
      if (!roleId) {
        return res.status(400).json({
          success: false,
          message: "roleId is required and must be a non-empty string",
        });
      }

      const data = await userService.addAppRoleToUser(userId, roleId);

      return res.json({
        success: true,
        message: "Application role assigned to user successfully",
        data,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to assign role to user";
      const httpStatus = message === "User not found" || message === "Role not found" ? 404 : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/users/{userId}/roles/{roleId}:
   *   delete:
   *     summary: Remove an application role from a user
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: roleId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: User with updated privileges and app roles
   *       404:
   *         description: User not found or role not assigned
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  removeAppRoleFromUser: async (req: Request, res: Response) => {
    try {
      const userId = routeParam(req.params.userId);
      const roleId = routeParam(req.params.roleId);

      if (!userId || !roleId) {
        return res.status(400).json({
          success: false,
          message: "userId and roleId parameters are required",
        });
      }

      const data = await userService.removeAppRoleFromUser(userId, roleId);

      return res.json({
        success: true,
        message: "Application role removed from user successfully",
        data,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to remove role from user";
      const httpStatus =
        message === "User not found" || message === "Role is not assigned to this user"
          ? 404
          : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },
};
