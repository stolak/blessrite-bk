import { Request, Response } from "express";
import { routeParam } from "../utils/request";
import { Status } from "@prisma/client";
import { menuService } from "../services/menuService";

const MENU_STATUSES = [Status.Active, Status.Inactive, Status.Archived] as const;

function parseMenuStatus(value: string | undefined): Status | "All" | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "All") {
    return "All";
  }
  if (value === Status.Active || value === Status.Inactive || value === Status.Archived) {
    return value;
  }
  return undefined;
}

/**
 * @openapi
 * /api/v1/menus:
 *   post:
 *     summary: Create a menu
 *     tags: [Menus]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [route, caption]
 *             properties:
 *               route:
 *                 type: string
 *                 example: "/inventory/items"
 *               caption:
 *                 type: string
 *                 example: "Inventory Items"
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive, Archived]
 *                 description: Optional status (defaults to Active)
 *     responses:
 *       201:
 *         description: Menu created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate menu route
 *       500:
 *         description: Server error
 *   get:
 *     summary: List menus
 *     tags: [Menus]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Optional search query (matches route or caption)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, Archived, All]
 *         description: Defaults to Active only. Use All to include every status.
 *     responses:
 *       200:
 *         description: Menus list
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
export const menuController = {
  createMenu: async (req: Request, res: Response) => {
    try {
      const { route, caption, status } = req.body ?? {};

      if (!route || typeof route !== "string" || !route.trim()) {
        return res.status(400).json({
          success: false,
          message: "Menu route is required",
        });
      }

      if (!caption || typeof caption !== "string" || !caption.trim()) {
        return res.status(400).json({
          success: false,
          message: "Menu caption is required",
        });
      }

      if (status !== undefined && !MENU_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      const menu = await menuService.createMenu({
        route: route.trim(),
        caption: caption.trim(),
        ...(status !== undefined ? { status } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Menu created successfully",
        data: menu,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create menu";
      const httpStatus = message.includes("already exists") ? 409 : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },

  listMenus: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status = parseMenuStatus(statusRaw);

      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, Archived, or All",
        });
      }

      const menus = await menuService.listMenus({
        q,
        status,
        includeChildren: req.query.includeChildren === "true",
      });

      return res.json({
        success: true,
        message: "Menus retrieved successfully",
        data: { menus },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve menus",
        error: error?.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/menus/{id}:
   *   get:
   *     summary: Get a menu by ID
   *     tags: [Menus]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Menu ID
   *     responses:
   *       200:
   *         description: Menu details
   *       404:
   *         description: Menu not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a menu
   *     tags: [Menus]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Menu ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               route:
   *                 type: string
   *               caption:
   *                 type: string
   *               status:
   *                 type: string
   *                 enum: [Active, Inactive, Archived]
   *     responses:
   *       200:
   *         description: Menu updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Menu not found
   *       409:
   *         description: Duplicate menu route
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a menu
   *     tags: [Menus]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Menu ID
   *     responses:
   *       200:
   *         description: Menu deleted
   *       404:
   *         description: Menu not found
   *       500:
   *         description: Server error
   */
  getMenuById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Menu id parameter is required",
        });
      }

      const menu = await menuService.getMenuById(id, req.query.includeChildren === "true");

      if (!menu) {
        return res.status(404).json({
          success: false,
          message: "Menu not found",
        });
      }

      return res.json({
        success: true,
        message: "Menu retrieved successfully",
        data: menu,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve menu",
        error: error?.message,
      });
    }
  },

  updateMenu: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      const { route, caption, status } = req.body ?? {};

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Menu id parameter is required",
        });
      }

      if (route !== undefined && (typeof route !== "string" || !route.trim())) {
        return res.status(400).json({
          success: false,
          message: "route must be a non-empty string",
        });
      }

      if (caption !== undefined && (typeof caption !== "string" || !caption.trim())) {
        return res.status(400).json({
          success: false,
          message: "caption must be a non-empty string",
        });
      }

      if (status !== undefined && !MENU_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      if (route === undefined && caption === undefined && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "At least one of route, caption, or status is required",
        });
      }

      const existing = await menuService.getMenuById(id);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Menu not found",
        });
      }

      const updated = await menuService.updateMenu(id, {
        ...(route !== undefined ? { route: route.trim() } : {}),
        ...(caption !== undefined ? { caption: caption.trim() } : {}),
        ...(status !== undefined ? { status } : {}),
      });

      return res.json({
        success: true,
        message: "Menu updated successfully",
        data: updated,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update menu";
      const httpStatus = message.includes("already exists") ? 409 : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },

  deleteMenu: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Menu id parameter is required",
        });
      }

      const existing = await menuService.getMenuById(id);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Menu not found",
        });
      }

      const deleted = await menuService.deleteMenu(id);

      return res.json({
        success: true,
        message: "Menu deleted successfully",
        data: deleted,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to delete menu",
        error: error?.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/menus/{id}/children:
   *   get:
   *     summary: List children for a menu
   *     tags: [Menus]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [Active, Inactive, Archived, All]
   *     responses:
   *       200:
   *         description: Menu children list
   *       404:
   *         description: Menu not found
   *   post:
   *     summary: Create a menu child
   *     tags: [Menus]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name, route]
   *             properties:
   *               name:
   *                 type: string
   *               route:
   *                 type: string
   *                 description: Use "#" for non-navigable section headers
   *               status:
   *                 type: string
   *                 enum: [Active, Inactive, Archived]
   *     responses:
   *       201:
   *         description: Menu child created
   */
  listMenuChildren: async (req: Request, res: Response) => {
    try {
      const menuId = routeParam(req.params.id);
      if (!menuId) {
        return res.status(400).json({ success: false, message: "Menu id parameter is required" });
      }

      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status = parseMenuStatus(statusRaw);
      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, Archived, or All",
        });
      }

      const children = await menuService.listMenuChildren(menuId, status);

      return res.json({
        success: true,
        message: "Menu children retrieved successfully",
        data: { children },
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to retrieve menu children";
      const httpStatus = message.includes("not found") ? 404 : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },

  createMenuChild: async (req: Request, res: Response) => {
    try {
      const menuId = routeParam(req.params.id);
      const { name, route, status } = req.body ?? {};

      if (!menuId) {
        return res.status(400).json({ success: false, message: "Menu id parameter is required" });
      }
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "name is required" });
      }
      if (!route || typeof route !== "string" || !route.trim()) {
        return res.status(400).json({ success: false, message: "route is required" });
      }
      if (status !== undefined && !MENU_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      const child = await menuService.createMenuChild(menuId, {
        name: name.trim(),
        route: route.trim(),
        ...(status !== undefined ? { status } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Menu child created successfully",
        data: child,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create menu child";
      const httpStatus = message.includes("not found")
        ? 404
        : message.includes("required")
          ? 400
          : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },

  /**
   * @openapi
   * /api/v1/menus/{id}/children/{childId}:
   *   get:
   *     summary: Get a menu child by ID
   *     tags: [Menus]
   *   put:
   *     summary: Update a menu child
   *     tags: [Menus]
   *   delete:
   *     summary: Delete a menu child
   *     tags: [Menus]
   */
  getMenuChildById: async (req: Request, res: Response) => {
    try {
      const menuId = routeParam(req.params.id);
      const childId = routeParam(req.params.childId);
      if (!menuId || !childId) {
        return res
          .status(400)
          .json({ success: false, message: "Menu id and child id parameters are required" });
      }

      const child = await menuService.getMenuChildById(menuId, childId);
      if (!child) {
        return res.status(404).json({ success: false, message: "Menu child not found" });
      }

      return res.json({
        success: true,
        message: "Menu child retrieved successfully",
        data: child,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve menu child",
        error: error?.message,
      });
    }
  },

  updateMenuChild: async (req: Request, res: Response) => {
    try {
      const menuId = routeParam(req.params.id);
      const childId = routeParam(req.params.childId);
      const { name, route, status } = req.body ?? {};

      if (!menuId || !childId) {
        return res
          .status(400)
          .json({ success: false, message: "Menu id and child id parameters are required" });
      }
      if (name === undefined && route === undefined && status === undefined) {
        return res.status(400).json({ success: false, message: "At least one field must be provided" });
      }
      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ success: false, message: "name must be a non-empty string" });
      }
      if (route !== undefined && (typeof route !== "string" || !route.trim())) {
        return res.status(400).json({ success: false, message: "route must be a non-empty string" });
      }
      if (status !== undefined && !MENU_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or Archived",
        });
      }

      const updated = await menuService.updateMenuChild(menuId, childId, {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(route !== undefined ? { route: route.trim() } : {}),
        ...(status !== undefined ? { status } : {}),
      });

      return res.json({
        success: true,
        message: "Menu child updated successfully",
        data: updated,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update menu child";
      const httpStatus = message.includes("not found")
        ? 404
        : message.includes("must")
          ? 400
          : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },

  deleteMenuChild: async (req: Request, res: Response) => {
    try {
      const menuId = routeParam(req.params.id);
      const childId = routeParam(req.params.childId);
      if (!menuId || !childId) {
        return res
          .status(400)
          .json({ success: false, message: "Menu id and child id parameters are required" });
      }

      const deleted = await menuService.deleteMenuChild(menuId, childId);

      return res.json({
        success: true,
        message: "Menu child deleted successfully",
        data: deleted,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to delete menu child";
      const httpStatus = message.includes("not found")
        ? 404
        : message.includes("referenced")
          ? 409
          : 500;
      return res.status(httpStatus).json({ success: false, message });
    }
  },
};
