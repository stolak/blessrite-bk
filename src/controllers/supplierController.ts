import { Request, Response } from "express";
import { supplierService } from "../services/supplierService";
import { Status } from "@prisma/client";
import { isStringOrNullOrUndefined, parseIntOrUndefined, routeParam } from "../utils/request";

/**
 * @openapi
 * /api/v1/suppliers:
 *   post:
 *     summary: Create a supplier
 *     tags: [Suppliers]
 *     security:
 *       - bearerAuth: []
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
 *               contactName:
 *                 type: string
 *                 nullable: true
 *               email:
 *                 type: string
 *                 nullable: true
 *               phone:
 *                 type: string
 *                 nullable: true
 *               address:
 *                 type: string
 *                 nullable: true
 *               city:
 *                 type: string
 *                 nullable: true
 *               state:
 *                 type: string
 *                 nullable: true
 *               country:
 *                 type: string
 *                 nullable: true
 *               website:
 *                 type: string
 *                 nullable: true
 *               notes:
 *                 type: string
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive]
 *                 description: Optional status (defaults to Active)
 *     responses:
 *       201:
 *         description: Supplier created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate supplier name
 *       500:
 *         description: Server error
 *   get:
 *     summary: List suppliers
 *     tags: [Suppliers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Optional search query (matches name/contact/email/phone/location)
 *       - in: query
 *         name: createdById
 *         schema:
 *           type: string
 *         description: Optional filter by creator user ID
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
 *         description: Suppliers list
 *       500:
 *         description: Server error
 */
export const supplierController = {
  createSupplier: async (req: Request, res: Response) => {
    try {
      const {
        name,
        contactName,
        email,
        phone,
        address,
        city,
        state,
        country,
        website,
        notes,
        status,
      } = req.body ?? {};

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "name is required" });
      }

      const createdById = (req as any).user?.id ?? null;

      if (!isStringOrNullOrUndefined(contactName)) return res.status(400).json({ success: false, message: "contactName must be a string or null" });
      if (!isStringOrNullOrUndefined(email)) return res.status(400).json({ success: false, message: "email must be a string or null" });
      if (!isStringOrNullOrUndefined(phone)) return res.status(400).json({ success: false, message: "phone must be a string or null" });
      if (!isStringOrNullOrUndefined(address)) return res.status(400).json({ success: false, message: "address must be a string or null" });
      if (!isStringOrNullOrUndefined(city)) return res.status(400).json({ success: false, message: "city must be a string or null" });
      if (!isStringOrNullOrUndefined(state)) return res.status(400).json({ success: false, message: "state must be a string or null" });
      if (!isStringOrNullOrUndefined(country)) return res.status(400).json({ success: false, message: "country must be a string or null" });
      if (!isStringOrNullOrUndefined(website)) return res.status(400).json({ success: false, message: "website must be a string or null" });
      if (!isStringOrNullOrUndefined(notes)) return res.status(400).json({ success: false, message: "notes must be a string or null" });

      if (status !== undefined && status !== Status.Active && status !== Status.Inactive) {
        return res.status(400).json({ success: false, message: "status must be Active or Inactive" });
      }

      const supplier = await supplierService.createSupplier({
        name: name.trim(),
        contactName: contactName === undefined ? null : contactName,
        email: email === undefined ? null : email,
        phone: phone === undefined ? null : phone,
        address: address === undefined ? null : address,
        city: city === undefined ? null : city,
        state: state === undefined ? null : state,
        country: country === undefined ? null : country,
        website: website === undefined ? null : website,
        notes: notes === undefined ? null : notes,
        ...(status !== undefined ? { status } : {}),
        createdById,
      });

      return res.status(201).json({ success: true, message: "Supplier created successfully", data: supplier });
    } catch (error: any) {
      const message = error?.message ?? "Failed to create supplier";
      const code = message.includes("already exists") ? 409 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  listSuppliers: async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const createdById = typeof req.query.createdById === "string" ? req.query.createdById : undefined;
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
        return res.status(400).json({ success: false, message: "status must be Active, Inactive, or All" });
      }

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);

      const result = await supplierService.listSuppliers({ q, status, createdById, page, limit });
      return res.json({ success: true, message: "Suppliers retrieved successfully", data: result });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: "Failed to retrieve suppliers", error: error?.message });
    }
  },

  /**
   * @openapi
   * /api/v1/suppliers/{id}:
   *   get:
   *     summary: Get a supplier by ID
   *     tags: [Suppliers]
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
   *         description: Supplier details
   *       404:
   *         description: Supplier not found
   *       500:
   *         description: Server error
   *   put:
   *     summary: Update a supplier
   *     tags: [Suppliers]
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
   *               name:
   *                 type: string
   *               contactName:
   *                 type: string
   *                 nullable: true
   *               email:
   *                 type: string
   *                 nullable: true
   *               phone:
   *                 type: string
   *                 nullable: true
   *               address:
   *                 type: string
   *                 nullable: true
   *               city:
   *                 type: string
   *                 nullable: true
   *               state:
   *                 type: string
   *                 nullable: true
   *               country:
   *                 type: string
   *                 nullable: true
   *               website:
   *                 type: string
   *                 nullable: true
   *               notes:
   *                 type: string
   *                 nullable: true
   *               status:
   *                 type: string
   *                 enum: [Active, Inactive]
   *     responses:
   *       200:
   *         description: Supplier updated
   *       400:
   *         description: Validation error
   *       404:
   *         description: Supplier not found
   *       409:
   *         description: Duplicate supplier name
   *       500:
   *         description: Server error
   *   delete:
   *     summary: Delete a supplier
   *     tags: [Suppliers]
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
   *         description: Supplier deleted
   *       404:
   *         description: Supplier not found
   *       500:
   *         description: Server error
   */
  getSupplierById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const supplier = await supplierService.getSupplierById(id);
      if (!supplier) return res.status(404).json({ success: false, message: "Supplier not found" });

      return res.json({ success: true, message: "Supplier retrieved successfully", data: supplier });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: "Failed to retrieve supplier", error: error?.message });
    }
  },

  updateSupplier: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      const {
        name,
        contactName,
        email,
        phone,
        address,
        city,
        state,
        country,
        website,
        notes,
        status,
      } = req.body ?? {};

      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ success: false, message: "name must be a non-empty string" });
      }

      if (!isStringOrNullOrUndefined(contactName)) return res.status(400).json({ success: false, message: "contactName must be a string or null" });
      if (!isStringOrNullOrUndefined(email)) return res.status(400).json({ success: false, message: "email must be a string or null" });
      if (!isStringOrNullOrUndefined(phone)) return res.status(400).json({ success: false, message: "phone must be a string or null" });
      if (!isStringOrNullOrUndefined(address)) return res.status(400).json({ success: false, message: "address must be a string or null" });
      if (!isStringOrNullOrUndefined(city)) return res.status(400).json({ success: false, message: "city must be a string or null" });
      if (!isStringOrNullOrUndefined(state)) return res.status(400).json({ success: false, message: "state must be a string or null" });
      if (!isStringOrNullOrUndefined(country)) return res.status(400).json({ success: false, message: "country must be a string or null" });
      if (!isStringOrNullOrUndefined(website)) return res.status(400).json({ success: false, message: "website must be a string or null" });
      if (!isStringOrNullOrUndefined(notes)) return res.status(400).json({ success: false, message: "notes must be a string or null" });

      if (status !== undefined && status !== Status.Active && status !== Status.Inactive) {
        return res.status(400).json({ success: false, message: "status must be Active or Inactive" });
      }

      const existing = await supplierService.getSupplierById(id);
      if (!existing) return res.status(404).json({ success: false, message: "Supplier not found" });

      const updated = await supplierService.updateSupplier(id, {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(contactName !== undefined ? { contactName } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(address !== undefined ? { address } : {}),
        ...(city !== undefined ? { city } : {}),
        ...(state !== undefined ? { state } : {}),
        ...(country !== undefined ? { country } : {}),
        ...(website !== undefined ? { website } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(status !== undefined ? { status } : {}),
      });

      return res.json({ success: true, message: "Supplier updated successfully", data: updated });
    } catch (error: any) {
      const message = error?.message ?? "Failed to update supplier";
      const code = message.includes("already exists") ? 409 : 500;
      return res.status(code).json({ success: false, message });
    }
  },

  deleteSupplier: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "id is required" });

      const existing = await supplierService.getSupplierById(id);
      if (!existing) return res.status(404).json({ success: false, message: "Supplier not found" });

      const deleted = await supplierService.deleteSupplier(id);
      return res.json({ success: true, message: "Supplier deleted successfully", data: deleted });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: "Failed to delete supplier", error: error?.message });
    }
  },
};

