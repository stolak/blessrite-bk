import { Request, Response } from "express";
import { inventoryItemService } from "../services/inventoryItemService";
import { Status } from "@prisma/client";
import {
  isNumberOrString,
  isStringOrNullOrUndefined,
  parseIntOrUndefined,
  routeParam,
} from "../utils/request";
import { parseQueryDateEndInclusive, parseQueryDateStart } from "../utils/queryDate";

/**
 * @openapi
 * /api/v1/inventory-items:
 *   post:
 *     summary: Create an inventory item
 *     tags: [InventoryItems]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, costPrice, sellingPrice]
 *             properties:
 *               sku:
 *                 type: string
 *                 nullable: true
 *               name:
 *                 type: string
 *                 example: "A4 Exercise Book"
 *               categoryId:
 *                 type: string
 *                 nullable: true
 *               subCategoryId:
 *                 type: string
 *                 nullable: true
 *               brandId:
 *                 type: string
 *                 nullable: true
 *               uomId:
 *                 type: string
 *                 nullable: true
 *               barcode:
 *                 type: string
 *                 nullable: true
 *               costPrice:
 *                 oneOf:
 *                   - type: string
 *                   - type: number
 *                 example: "120.00"
 *               sellingPrice:
 *                 oneOf:
 *                   - type: string
 *                   - type: number
 *                 example: "150.00"
 *               lowStockThreshold:
 *                 type: integer
 *                 example: 10
 *     responses:
 *       201:
 *         description: Inventory item created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate SKU or barcode
 *       500:
 *         description: Server error
 *   get:
 *     summary: List inventory items
 *     tags: [InventoryItems]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Optional search query (matches name, sku, or barcode)
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *         description: Filter by category ID
 *       - in: query
 *         name: subCategoryId
 *         schema:
 *           type: string
 *         description: Filter by sub-category ID
 *       - in: query
 *         name: brandId
 *         schema:
 *           type: string
 *         description: Filter by brand ID
 *       - in: query
 *         name: uomId
 *         schema:
 *           type: string
 *         description: Filter by uom ID
 *       - in: query
 *         name: createdById
 *         schema:
 *           type: string
 *         description: Filter by creator user ID
 *       - in: query
 *         name: storeId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: When provided, currentStock is calculated from completed transactions at this store only
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Inactive, All]
 *         description: Defaults to Active only. Use All to include Active and Inactive.
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
 *         description: Inventory items list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     inventoryItems:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           sku:
 *                             type: string
 *                             nullable: true
 *                           name:
 *                             type: string
 *                           barcode:
 *                             type: string
 *                             nullable: true
 *                           costPrice:
 *                             type: string
 *                           sellingPrice:
 *                             type: string
 *                           lowStockThreshold:
 *                             type: integer
 *                           currentStock:
 *                             type: string
 *                             description: sum(qtyIn) − sum(qtyOut) on completed transactions; scoped to storeId when that query param is set
 *                           categoryId:
 *                             type: string
 *                             nullable: true
 *                           subCategoryId:
 *                             type: string
 *                             nullable: true
 *                           brandId:
 *                             type: string
 *                             nullable: true
 *                           uomId:
 *                             type: string
 *                             nullable: true
 *                           category:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               name:
 *                                 type: string
 *                           subCategory:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               name:
 *                                 type: string
 *                           brand:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               name:
 *                                 type: string
 *                           uom:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               name:
 *                                 type: string
 *                           createdBy:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               firstName:
 *                                 type: string
 *                                 nullable: true
 *                               lastName:
 *                                 type: string
 *                                 nullable: true
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *       500:
 *         description: Server error
 */
export const inventoryItemController = {
  createInventoryItem: async (req: Request, res: Response) => {
    try {
      const {
        sku,
        name,
        categoryId,
        subCategoryId,
        brandId,
        uomId,
        barcode,
        costPrice,
        sellingPrice,
        lowStockThreshold,
      } = req.body ?? {};

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "name is required" });
      }

      if (!isNumberOrString(costPrice)) {
        return res
          .status(400)
          .json({ success: false, message: "costPrice is required (string or number)" });
      }
      if (!isNumberOrString(sellingPrice)) {
        return res
          .status(400)
          .json({ success: false, message: "sellingPrice is required (string or number)" });
      }

      if (!isStringOrNullOrUndefined(sku)) {
        return res.status(400).json({ success: false, message: "sku must be a string or null" });
      }

      if (!isStringOrNullOrUndefined(barcode)) {
        return res
          .status(400)
          .json({ success: false, message: "barcode must be a string or null" });
      }
      const normalizedBarcode =
        barcode === null || barcode === undefined || barcode.trim() === "" ? null : barcode.trim();

      if (!isStringOrNullOrUndefined(categoryId)) {
        return res
          .status(400)
          .json({ success: false, message: "categoryId must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(subCategoryId)) {
        return res
          .status(400)
          .json({ success: false, message: "subCategoryId must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(brandId)) {
        return res
          .status(400)
          .json({ success: false, message: "brandId must be a string or null" });
      }
      if (!isStringOrNullOrUndefined(uomId)) {
        return res.status(400).json({ success: false, message: "uomId must be a string or null" });
      }

      if (
        lowStockThreshold !== undefined &&
        (typeof lowStockThreshold !== "number" || lowStockThreshold < 0)
      ) {
        return res
          .status(400)
          .json({ success: false, message: "lowStockThreshold must be a number >= 0" });
      }

      const createdById = (req as any).user?.id;
      if (!createdById) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const created = await inventoryItemService.createInventoryItem({
        sku: sku === undefined || sku === null || sku.trim() === "" ? null : sku.trim(),
        name: name.trim(),
        categoryId: categoryId === undefined ? null : categoryId,
        subCategoryId: subCategoryId === undefined ? null : subCategoryId,
        brandId: brandId === undefined ? null : brandId,
        uomId: uomId === undefined ? null : uomId,
        barcode: normalizedBarcode,
        costPrice,
        sellingPrice,
        lowStockThreshold,
        createdById,
      });

      return res.status(201).json({
        success: true,
        message: "Inventory item created successfully",
        data: created,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create inventory item";
      const status = message.includes("already exists") ? 409 : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  listInventoryItems: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const categoryId =
        typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;
      const subCategoryId =
        typeof req.query.subCategoryId === "string" ? req.query.subCategoryId : undefined;
      const brandId = typeof req.query.brandId === "string" ? req.query.brandId : undefined;
      const uomId = typeof req.query.uomId === "string" ? req.query.uomId : undefined;
      const createdById =
        typeof req.query.createdById === "string" ? req.query.createdById : undefined;
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : undefined;
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
                : undefined;

      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be Active, Inactive, or All",
        });
      }
      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const result = await inventoryItemService.listInventoryItems({
        q,
        categoryId,
        subCategoryId,
        brandId,
        uomId,
        createdById,
        storeId,
        status,
        page,
        limit,
      });

      return res.json({
        success: true,
        message: "Inventory items retrieved successfully",
        data: result,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to retrieve inventory items";
      const status = message === "Invalid storeId" ? 404 : 500;
      return res.status(status).json({
        success: false,
        message,
        error: status === 500 ? message : undefined,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/inventory-items/transaction-log:
   *   get:
   *     summary: Inventory transaction log for one item (completed only)
   *     tags: [InventoryItems]
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Lists completed `InventoryTransaction` rows for `itemId` between `transactionDateFrom` and `transactionDateTo` (inclusive).
   *       If both dates are omitted, the window is the current UTC calendar month from the 1st through end of today.
   *       If only `transactionDateFrom` is set, `transactionDateTo` defaults to end of today UTC.
   *       If only `transactionDateTo` is set, `transactionDateFrom` defaults to the first day of that date's UTC month.
   *       `balanceBeforeFromDate` is sum(qtyIn) − sum(qtyOut) for completed rows strictly before the window; when `storeId`
   *       is set, balances are for that store only; otherwise across all stores (including null storeId rows).
   *       Not paginated.
   *     parameters:
   *       - in: query
   *         name: itemId
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: storeId
   *         schema: { type: string, format: uuid }
   *         description: Optional; restrict log and opening balance to this store
   *       - in: query
   *         name: transactionDateFrom
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: transactionDateTo
   *         schema: { type: string, format: date }
   *     responses:
   *       200:
   *         description: Item summary, date window, opening balance, and transactions
   *       400:
   *         description: Invalid parameters or date range
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Item or store not found
   *       500:
   *         description: Server error
   */
  getInventoryItemTransactionLog: async (req: Request, res: Response) => {
    try {
      const itemIdRaw = typeof req.query.itemId === "string" ? req.query.itemId.trim() : "";
      if (!itemIdRaw) {
        return res.status(400).json({ success: false, message: "itemId is required" });
      }

      const storeId =
        typeof req.query.storeId === "string" && req.query.storeId.trim()
          ? req.query.storeId.trim()
          : undefined;

      const fromRaw = parseQueryDateStart(req.query.transactionDateFrom);
      const toRaw = parseQueryDateEndInclusive(req.query.transactionDateTo);

      if (fromRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDateFrom is invalid" });
      }
      if (toRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDateTo is invalid" });
      }

      const transactionDateFrom = fromRaw === "missing" ? undefined : fromRaw;
      const transactionDateTo = toRaw === "missing" ? undefined : toRaw;

      const data = await inventoryItemService.getInventoryItemTransactionLog({
        itemId: itemIdRaw,
        ...(storeId !== undefined ? { storeId } : {}),
        ...(transactionDateFrom !== undefined ? { transactionDateFrom } : {}),
        ...(transactionDateTo !== undefined ? { transactionDateTo } : {}),
      });

      return res.json({
        success: true,
        message: "Inventory transaction log retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to retrieve transaction log";
      const code =
        message === "Inventory item not found" || message === "Invalid storeId"
          ? 404
          : message === "transactionDateFrom must be before or equal to transactionDateTo"
            ? 400
            : 500;
      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  /**
   * @openapi
   * /api/v1/inventory-items/balances:
   *   get:
   *     summary: Current item balances grouped by item (completed transactions)
   *     tags: [InventoryItems]
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       For each **Active** inventory item matching optional catalog filters, returns `balance` = sum(qtyIn) − sum(qtyOut)
   *       over **completed** inventory transactions. With `storeId`, only transactions for that store are summed; otherwise all stores.
   *       No date filter and no per-item id filter. Not paginated.
   *     parameters:
   *       - in: query
   *         name: categoryId
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: subCategoryId
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: storeId
   *         schema: { type: string, format: uuid }
   *         description: Optional; restrict balance calculation to this store
   *     responses:
   *       200:
   *         description: >-
   *           Success body includes data.balances, an array of objects with itemId, name, sku, category and
   *           subCategory (each id and name or null), and balance (decimal string).
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Invalid categoryId, subCategoryId, or storeId
   *       500:
   *         description: Server error
   */
  getItemBalancesGrouped: async (req: Request, res: Response) => {
    try {
      const categoryId =
        typeof req.query.categoryId === "string" && req.query.categoryId.trim()
          ? req.query.categoryId.trim()
          : undefined;
      const subCategoryId =
        typeof req.query.subCategoryId === "string" && req.query.subCategoryId.trim()
          ? req.query.subCategoryId.trim()
          : undefined;
      const storeId =
        typeof req.query.storeId === "string" && req.query.storeId.trim()
          ? req.query.storeId.trim()
          : undefined;

      const data = await inventoryItemService.getItemBalancesGrouped({
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(subCategoryId !== undefined ? { subCategoryId } : {}),
        ...(storeId !== undefined ? { storeId } : {}),
      });

      return res.json({
        success: true,
        message: "Item balances retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to retrieve item balances";
      const code =
        message === "Invalid storeId" ||
        message === "Invalid categoryId" ||
        message === "Invalid subCategoryId"
          ? 404
          : 500;
      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  /**
   * @openapi
   * /api/v1/inventory-items/balance-matrix:
   *   post:
   *     summary: Inventory balance matrix (items × stores)
   *     tags: [InventoryItems]
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Returns, for each store, the balance for each item where balance = sum(qtyIn) − sum(qtyOut)
   *       over **completed** inventory transactions at that store.
   *
   *       `stores` and `items` may be omitted / null / empty array.
   *       - When `stores` is null/[]/omitted: uses all Active stores.
   *       - When `items` is null/[]/omitted: uses all Active items (optionally filtered by categoryId/subCategoryId).
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               stores:
   *                 oneOf:
   *                   - type: array
   *                     items: { type: string, format: uuid }
   *                   - type: "null"
   *                 description: Store ids or null/[] for all Active stores
   *               items:
   *                 oneOf:
   *                   - type: array
   *                     items: { type: string, format: uuid }
   *                   - type: "null"
   *                 description: Item ids or null/[] for all Active items
   *               categoryId:
   *                 type: string
   *                 format: uuid
   *                 nullable: true
   *               subCategoryId:
   *                 type: string
   *                 format: uuid
   *                 nullable: true
   *     responses:
   *       200:
   *         description: Balance matrix (array of stores with per-item balances)
   *       400:
   *         description: Invalid input
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Invalid categoryId/subCategoryId or unknown store/item ids
   *       500:
   *         description: Server error
   */
  getInventoryBalanceMatrix: async (req: Request, res: Response) => {
    try {
      const { stores, items, categoryId, subCategoryId } = req.body ?? {};

      if (stores !== undefined && stores !== null && !Array.isArray(stores)) {
        return res
          .status(400)
          .json({ success: false, message: "stores must be an array, null, or omitted" });
      }
      if (items !== undefined && items !== null && !Array.isArray(items)) {
        return res
          .status(400)
          .json({ success: false, message: "items must be an array, null, or omitted" });
      }
      if (
        categoryId !== undefined &&
        categoryId !== null &&
        (typeof categoryId !== "string" || !categoryId.trim())
      ) {
        return res
          .status(400)
          .json({ success: false, message: "categoryId must be a non-empty string" });
      }
      if (
        subCategoryId !== undefined &&
        subCategoryId !== null &&
        (typeof subCategoryId !== "string" || !subCategoryId.trim())
      ) {
        return res
          .status(400)
          .json({ success: false, message: "subCategoryId must be a non-empty string" });
      }

      const data = await inventoryItemService.getInventoryBalanceMatrix({
        ...(stores !== undefined ? { stores } : {}),
        ...(items !== undefined ? { items } : {}),
        ...(typeof categoryId === "string" && categoryId.trim()
          ? { categoryId: categoryId.trim() }
          : {}),
        ...(typeof subCategoryId === "string" && subCategoryId.trim()
          ? { subCategoryId: subCategoryId.trim() }
          : {}),
      });

      return res.json({
        success: true,
        message: "Inventory balance matrix retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to retrieve inventory balance matrix";
      const code =
        message === "Invalid categoryId" ||
        message === "Invalid subCategoryId" ||
        message.includes("store IDs were not found") ||
        message.includes("item IDs were not found")
          ? 404
          : 500;
      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  /**
   * @openapi
   * /api/v1/inventory-items/{id}:
   *   get:
   *     summary: Get an inventory item by ID
   *     tags: [InventoryItems]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Inventory item details
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: string
   *                     sku:
   *                       type: string
   *                       nullable: true
   *                     name:
   *                       type: string
   *                     barcode:
   *                       type: string
   *                       nullable: true
   *                     costPrice:
   *                       type: string
   *                     sellingPrice:
   *                       type: string
   *                     lowStockThreshold:
   *                       type: integer
   *                     createdById:
   *                       type: string
   *                       nullable: true
   *                     categoryId:
   *                       type: string
   *                       nullable: true
   *                     subCategoryId:
   *                       type: string
   *                       nullable: true
   *                     brandId:
   *                       type: string
   *                       nullable: true
   *                     uomId:
   *                       type: string
   *                       nullable: true
   *                     createdAt:
   *                       type: string
   *                       format: date-time
   *                     updatedAt:
   *                       type: string
   *                       format: date-time
   *       404:
   *         description: Inventory item not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update an inventory item
   *     tags: [InventoryItems]
   *     security:
   *       - bearerAuth: []
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
   *             properties:
   *               sku:
   *                 type: string
   *                 nullable: true
   *               name:
   *                 type: string
   *               categoryId:
   *                 type: string
   *                 nullable: true
   *               subCategoryId:
   *                 type: string
   *                 nullable: true
   *               brandId:
   *                 type: string
   *                 nullable: true
   *               uomId:
   *                 type: string
   *                 nullable: true
   *               barcode:
   *                 type: string
   *                 nullable: true
   *               costPrice:
   *                 oneOf:
   *                   - type: string
   *                   - type: number
   *               sellingPrice:
   *                 oneOf:
   *                   - type: string
   *                   - type: number
   *               lowStockThreshold:
   *                 type: integer
   *               status:
   *                 type: string
   *                 enum: [Active, Inactive]
   *     responses:
   *       200:
   *         description: Inventory item updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Inventory item not found
   *       409:
   *         description: Duplicate SKU or barcode
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete an inventory item
   *     tags: [InventoryItems]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Inventory item deleted
   *       404:
   *         description: Inventory item not found
   *       500:
   *         description: Server error
   */
  getInventoryItemById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const item = await inventoryItemService.getInventoryItemById(id);
      if (!item)
        return res.status(404).json({ success: false, message: "Inventory item not found" });

      return res.json({
        success: true,
        message: "Inventory item retrieved successfully",
        data: item,
      });
    } catch (error: any) {
      return res
        .status(500)
        .json({
          success: false,
          message: "Failed to retrieve inventory item",
          error: error?.message,
        });
    }
  },

  updateInventoryItem: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      const {
        sku,
        name,
        categoryId,
        subCategoryId,
        brandId,
        uomId,
        barcode,
        costPrice,
        sellingPrice,
        lowStockThreshold,
        status,
      } = req.body ?? {};

      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ success: false, message: "name must be a non-empty string" });
      }

      const normalizedBarcode =
        barcode === undefined ? undefined : barcode === null ? null : barcode.trim();

      if (categoryId !== undefined && !isStringOrNullOrUndefined(categoryId)) {
        return res
          .status(400)
          .json({ success: false, message: "categoryId must be a string or null" });
      }
      if (subCategoryId !== undefined && !isStringOrNullOrUndefined(subCategoryId)) {
        return res
          .status(400)
          .json({ success: false, message: "subCategoryId must be a string or null" });
      }
      if (brandId !== undefined && !isStringOrNullOrUndefined(brandId)) {
        return res
          .status(400)
          .json({ success: false, message: "brandId must be a string or null" });
      }
      if (uomId !== undefined && !isStringOrNullOrUndefined(uomId)) {
        return res.status(400).json({ success: false, message: "uomId must be a string or null" });
      }
      if (costPrice !== undefined && !isNumberOrString(costPrice)) {
        return res
          .status(400)
          .json({ success: false, message: "costPrice must be a string or number" });
      }
      if (sellingPrice !== undefined && !isNumberOrString(sellingPrice)) {
        return res
          .status(400)
          .json({ success: false, message: "sellingPrice must be a string or number" });
      }
      if (
        lowStockThreshold !== undefined &&
        (typeof lowStockThreshold !== "number" || lowStockThreshold < 0)
      ) {
        return res
          .status(400)
          .json({ success: false, message: "lowStockThreshold must be a number >= 0" });
      }

      if (status !== undefined && status !== Status.Active && status !== Status.Inactive) {
        return res
          .status(400)
          .json({ success: false, message: "status must be Active or Inactive" });
      }

      const existing = await inventoryItemService.getInventoryItemById(id);
      if (!existing)
        return res.status(404).json({ success: false, message: "Inventory item not found" });

      const updated = await inventoryItemService.updateInventoryItem(id, {
        ...(sku !== undefined
          ? { sku: sku === undefined || sku === null || sku.trim() === "" ? null : sku.trim() }
          : {}),
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(subCategoryId !== undefined ? { subCategoryId } : {}),
        ...(brandId !== undefined ? { brandId } : {}),
        ...(uomId !== undefined ? { uomId } : {}),
        ...(normalizedBarcode !== undefined
          ? {
              barcode:
                normalizedBarcode === null ||
                normalizedBarcode === undefined ||
                normalizedBarcode.trim() === ""
                  ? null
                  : normalizedBarcode.trim(),
            }
          : {}),
        ...(costPrice !== undefined ? { costPrice } : {}),
        ...(sellingPrice !== undefined ? { sellingPrice } : {}),
        ...(lowStockThreshold !== undefined ? { lowStockThreshold } : {}),
        ...(status !== undefined ? { status } : {}),
      });

      return res.json({
        success: true,
        message: "Inventory item updated successfully",
        data: updated,
      });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update inventory item";
      const status = message.includes("already exists") ? 409 : 500;
      return res.status(status).json({ success: false, message });
    }
  },

  deleteInventoryItem: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const existing = await inventoryItemService.getInventoryItemById(id);
      if (!existing)
        return res.status(404).json({ success: false, message: "Inventory item not found" });

      const deleted = await inventoryItemService.deleteInventoryItem(id);
      return res.json({
        success: true,
        message: "Inventory item deleted successfully",
        data: deleted,
      });
    } catch (error: any) {
      const message = error?.message || "Failed to delete inventory item";
      const status = message.includes("Cannot delete")
        ? 409
        : message === "Inventory item not found"
          ? 404
          : 500;
      return res.status(status).json({ success: false, message });
    }
  },
};
