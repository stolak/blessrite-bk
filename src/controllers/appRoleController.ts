import { Request, Response } from "express";
import { routeParam } from "../utils/request";
import { appRoleService, AppRoleStatus } from "../services/appRoleService";

const APP_ROLE_STATUSES: AppRoleStatus[] = ["active", "inactive"];

function parseAppRoleStatus(value: string | undefined): AppRoleStatus | "all" | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "all") {
    return "all";
  }
  if (value === "active" || value === "inactive") {
    return value;
  }
  return undefined;
}

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

function parseOptionalStringIdArray(value: unknown): string[] | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  if (!value.every((id) => typeof id === "string" && id.trim())) {
    return null;
  }
  return value.map((id) => id.trim());
}

function parseMenuChildIds(body: unknown): string[] | null {
  const menuChildIds = (body as { menuChildIds?: unknown })?.menuChildIds;
  if (!Array.isArray(menuChildIds) || menuChildIds.length === 0) {
    return null;
  }
  if (!menuChildIds.every((id) => typeof id === "string" && id.trim())) {
    return null;
  }
  return menuChildIds.map((id) => id.trim());
}

/**
 * @openapi
 * /api/v1/app-roles:
 *   post:
 *     summary: Create an application role
 *     tags: [AppRoles]
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
 *                 example: "Store Manager"
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 description: Optional status (defaults to active)
 *     responses:
 *       201:
 *         description: Role created
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 *   get:
 *     summary: List application roles
 *     tags: [AppRoles]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Optional search query (matches role name)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, all]
 *         description: Defaults to active only. Use all to include active and inactive.
 *     responses:
 *       200:
 *         description: Roles list
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
export const appRoleController = {
  createAppRole: async (req: Request, res: Response) => {
    try {
      const { name, status } = req.body ?? {};

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Role name is required",
        });
      }

      if (status !== undefined && !APP_ROLE_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "status must be active or inactive",
        });
      }

      const role = await appRoleService.createAppRole({
        name: name.trim(),
        ...(status !== undefined ? { status } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Role created successfully",
        data: role,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error?.message ?? "Failed to create role",
      });
    }
  },

  listAppRoles: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status = parseAppRoleStatus(statusRaw);

      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be active, inactive, or all",
        });
      }

      const roles = await appRoleService.listAppRoles({ q, status });

      return res.json({
        success: true,
        message: "Roles retrieved successfully",
        data: { roles },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve roles",
        error: error?.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/app-roles/{id}:
   *   get:
   *     summary: Get an application role by ID (includes privileges)
   *     tags: [AppRoles]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Role ID
   *     responses:
   *       200:
   *         description: Role details with privileges
   *       404:
   *         description: Role not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update an application role
   *     tags: [AppRoles]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Role ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               status:
   *                 type: string
   *                 enum: [active, inactive]
   *     responses:
   *       200:
   *         description: Role updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Role not found
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete an application role
   *     tags: [AppRoles]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Role ID
   *     responses:
   *       200:
   *         description: Role deleted
   *       404:
   *         description: Role not found
   *       409:
   *         description: Role is referenced by users or menus
   *       500:
   *         description: Server error
   */
  getAppRoleById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Role id parameter is required",
        });
      }

      const role = await appRoleService.getAppRoleById(id);

      if (!role) {
        return res.status(404).json({
          success: false,
          message: "Role not found",
        });
      }

      return res.json({
        success: true,
        message: "Role retrieved successfully",
        data: role,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve role",
        error: error?.message,
      });
    }
  },

  updateAppRole: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      const { name, status } = req.body ?? {};

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Role id parameter is required",
        });
      }

      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({
          success: false,
          message: "name must be a non-empty string",
        });
      }

      if (status !== undefined && !APP_ROLE_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "status must be active or inactive",
        });
      }

      const existing = await appRoleService.getAppRoleById(id);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Role not found",
        });
      }

      const updated = await appRoleService.updateAppRole(id, {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(status !== undefined ? { status } : {}),
      });

      return res.json({
        success: true,
        message: "Role updated successfully",
        data: updated,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error?.message ?? "Failed to update role",
      });
    }
  },

  deleteAppRole: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Role id parameter is required",
        });
      }

      const existing = await appRoleService.getAppRoleById(id);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Role not found",
        });
      }

      const deleted = await appRoleService.deleteAppRole(id);

      return res.json({
        success: true,
        message: "Role deleted successfully",
        data: deleted,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to delete role";
      const httpStatus = message.includes("Cannot delete role") ? 409 : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/app-roles/{id}/privileges:
   *   post:
   *     summary: Assign privileges to a role
   *     tags: [AppRoles]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Role ID
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
   *                 example: ["uuid-1", "uuid-2"]
   *     responses:
   *       200:
   *         description: Privileges assigned; returns role with updated privileges
   *       400:
   *         description: Validation error
   *       404:
   *         description: Role or privilege not found
   *       500:
   *         description: Server error
   */
  addPrivilegesToRole: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      const privilegeIds = parsePrivilegeIds(req.body);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Role id parameter is required",
        });
      }

      if (!privilegeIds) {
        return res.status(400).json({
          success: false,
          message: "privilegeIds must be a non-empty array of strings",
        });
      }

      const role = await appRoleService.addPrivilegesToRole(id, privilegeIds);

      return res.json({
        success: true,
        message: "Privileges added to role successfully",
        data: role,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to add privileges to role";
      const httpStatus =
        message === "Role not found" || message.includes("privilege IDs were not found")
          ? 404
          : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/app-roles/{id}/privileges/{privilegeId}:
   *   delete:
   *     summary: Remove a privilege from a role
   *     tags: [AppRoles]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Role ID
   *       - in: path
   *         name: privilegeId
   *         required: true
   *         schema:
   *           type: string
   *         description: Privilege ID
   *     responses:
   *       200:
   *         description: Privilege removed; returns role with updated privileges
   *       404:
   *         description: Role not found or privilege not assigned
   *       500:
   *         description: Server error
   */
  removePrivilegeFromRole: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      const privilegeId = routeParam(req.params.privilegeId);

      if (!id || !privilegeId) {
        return res.status(400).json({
          success: false,
          message: "Role id and privilege id parameters are required",
        });
      }

      const role = await appRoleService.removePrivilegeFromRole(id, privilegeId);

      return res.json({
        success: true,
        message: "Privilege removed from role successfully",
        data: role,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to remove privilege from role";
      const httpStatus =
        message === "Role not found" || message === "Privilege is not assigned to this role"
          ? 404
          : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/app-roles/{id}/menus:
   *   post:
   *     summary: Assign menus to a role
   *     tags: [AppRoles]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Role ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: Provide at least one of menuIds or childrenMenuIds as a non-empty array
   *             properties:
   *               menuIds:
   *                 type: array
   *                 items:
   *                   type: string
   *                 example: ["menu-uuid-1", "menu-uuid-2"]
   *               childrenMenuIds:
   *                 type: array
   *                 items:
   *                   type: string
   *                 description: Optional menu child IDs to whitelist when assigning parent menus
   *                 example: ["childrenmenu-uuid-1", "childrenmenu-uuid-2"]
   *     responses:
   *       200:
   *         description: Menus assigned; returns all role-menu links for the role
   *       400:
   *         description: Validation error
   *       404:
   *         description: Role or menu not found
   *       500:
   *         description: Server error
   *   get:
   *     summary: List menus attached to a role
   *     tags: [AppRoles]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Role ID
   *     responses:
   *       200:
   *         description: Role-menu links with nested menu details
   *       404:
   *         description: Role not found
   *       500:
   *         description: Server error
   */
  addMenusToRole: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      const body = req.body as { menuIds?: unknown; childrenMenuIds?: unknown };
      const menuIds = parseOptionalStringIdArray(body.menuIds);
      const childrenMenuIds = parseOptionalStringIdArray(body.childrenMenuIds);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Role id parameter is required",
        });
      }

      if (menuIds === null) {
        return res.status(400).json({
          success: false,
          message: "menuIds must be an array of strings",
        });
      }

      if (childrenMenuIds === null) {
        return res.status(400).json({
          success: false,
          message: "childrenMenuIds must be an array of strings",
        });
      }

      const resolvedMenuIds = menuIds ?? [];
      const resolvedChildrenMenuIds = childrenMenuIds ?? [];

      if (resolvedMenuIds.length === 0 && resolvedChildrenMenuIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one of menuIds or childrenMenuIds must be a non-empty array",
        });
      }

      const roleMenus = await appRoleService.addMenusToRole(id, {
        ...(resolvedMenuIds.length > 0 ? { menuIds: resolvedMenuIds } : {}),
        ...(resolvedChildrenMenuIds.length > 0
          ? { childrenMenuIds: resolvedChildrenMenuIds }
          : {}),
      });

      return res.json({
        success: true,
        message: "Menus added to role successfully",
        data: { roleMenus },
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to add menus to role";
      const httpStatus =
        message === "Role not found" ||
        message.includes("menu IDs were not found") ||
        message.includes("children menu IDs were not found")
          ? 404
          : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },

  listRoleMenus: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Role id parameter is required",
        });
      }

      const roleMenus = await appRoleService.listRoleMenus(id);

      return res.json({
        success: true,
        message: "Role menus retrieved successfully",
        data: { roleMenus },
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to retrieve role menus";
      const httpStatus = message === "Role not found" ? 404 : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/app-roles/{id}/menus/{roleMenuId}:
   *   delete:
   *     summary: Remove a menu from a role (delete role_menu link)
   *     tags: [AppRoles]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Role ID
   *       - in: path
   *         name: roleMenuId
   *         required: true
   *         schema:
   *           type: string
   *         description: RoleMenu join record ID (from GET /app-roles/{id}/menus)
   *     responses:
   *       200:
   *         description: Role-menu link deleted
   *       404:
   *         description: Role or role-menu record not found
   *       500:
   *         description: Server error
   */
  deleteRoleMenu: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      const roleMenuId = routeParam(req.params.roleMenuId);

      if (!id || !roleMenuId) {
        return res.status(400).json({
          success: false,
          message: "Role id and roleMenuId parameters are required",
        });
      }

      const deleted = await appRoleService.deleteRoleMenu(id, roleMenuId);

      return res.json({
        success: true,
        message: "Menu removed from role successfully",
        data: deleted,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to remove menu from role";
      const httpStatus = message === "Role menu record not found" ? 404 : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/app-roles/{id}/menus/{roleMenuId}/children:
   *   post:
   *     summary: Assign selected menu children to a role menu (whitelist)
   *     tags: [AppRoles]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: roleMenuId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [menuChildIds]
   *             properties:
   *               menuChildIds:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       200:
   *         description: Menu children assigned; returns updated role menu with resolved children
   *   get:
   *     summary: Get role menu child assignments and resolved children
   *     tags: [AppRoles]
   */
  addMenuChildrenToRoleMenu: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      const roleMenuId = routeParam(req.params.roleMenuId);
      const menuChildIds = parseMenuChildIds(req.body);

      if (!id || !roleMenuId) {
        return res.status(400).json({
          success: false,
          message: "Role id and roleMenuId parameters are required",
        });
      }
      if (!menuChildIds) {
        return res.status(400).json({
          success: false,
          message: "menuChildIds must be a non-empty array of strings",
        });
      }

      const roleMenu = await appRoleService.addMenuChildrenToRoleMenu(id, roleMenuId, menuChildIds);

      return res.json({
        success: true,
        message: "Menu children added to role menu successfully",
        data: roleMenu,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to add menu children to role menu";
      const httpStatus =
        message.includes("not found") || message.includes("were not found") ? 404 : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },

  listRoleMenuChildren: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      const roleMenuId = routeParam(req.params.roleMenuId);

      if (!id || !roleMenuId) {
        return res.status(400).json({
          success: false,
          message: "Role id and roleMenuId parameters are required",
        });
      }

      const roleMenu = await appRoleService.listRoleMenuChildren(id, roleMenuId);

      return res.json({
        success: true,
        message: "Role menu children retrieved successfully",
        data: roleMenu,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to retrieve role menu children";
      const httpStatus = message.includes("not found") ? 404 : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/app-roles/{id}/menus/{roleMenuId}/children/{roleMenuChildId}:
   *   delete:
   *     summary: Remove a menu child grant from a role menu
   *     tags: [AppRoles]
   */
  deleteRoleMenuChild: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      const roleMenuId = routeParam(req.params.roleMenuId);
      const roleMenuChildId = routeParam(req.params.roleMenuChildId);

      if (!id || !roleMenuId || !roleMenuChildId) {
        return res.status(400).json({
          success: false,
          message: "Role id, roleMenuId, and roleMenuChildId parameters are required",
        });
      }

      const roleMenu = await appRoleService.deleteRoleMenuChild(id, roleMenuId, roleMenuChildId);

      return res.json({
        success: true,
        message: "Menu child removed from role menu successfully",
        data: roleMenu,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to remove menu child from role menu";
      const httpStatus = message.includes("not found") ? 404 : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },
};
