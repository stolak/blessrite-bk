import { Request, Response } from "express";
import { routeParam } from "../utils/request";
import { bankService } from "../services/bankService";

/**
 * @openapi
 * /api/v1/banks:
 *   get:
 *     summary: Get all Nigerian banks
 *     tags: [Banks]
 *     responses:
 *       200:
 *         description: List of all Nigerian banks
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
 *                     banks:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           bankCode:
 *                             type: string
 *                           bankName:
 *                             type: string
 *                     count:
 *                       type: number
 *       500:
 *         description: Server error
 */
export const bankController = {
  getAllBanks: async (req: Request, res: Response) => {
    try {
      const banks = await bankService.getAllBanks();

      res.json({
        success: true,
        message: "Banks retrieved successfully",
        data: {
          banks,
          count: banks.length,
        },
      });
    } catch (error: any) {
      console.error("Error getting banks:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve banks",
        error: error.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/banks/{id}:
   *   get:
   *     summary: Get a specific bank by ID
   *     tags: [Banks]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Bank ID
   *     responses:
   *       200:
   *         description: Bank details
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
   *                     bankCode:
   *                       type: string
   *                     bankName:
   *                       type: string
   *       404:
   *         description: Bank not found
   *       500:
   *         description: Server error
   */
  getBankById: async (req: Request, res: Response) => {
    try {
      const id = routeParam(req.params.id);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Bank ID parameter is required",
        });
      }

      const bank = await bankService.getBankById(id);

      if (!bank) {
        return res.status(404).json({
          success: false,
          message: "Bank not found",
        });
      }

      res.json({
        success: true,
        message: "Bank retrieved successfully",
        data: bank,
      });
    } catch (error: any) {
      console.error("Error getting bank by ID:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve bank",
        error: error.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/banks/code/{bankCode}:
   *   get:
   *     summary: Get a specific bank by bank code
   *     tags: [Banks]
   *     parameters:
   *       - in: path
   *         name: bankCode
   *         required: true
   *         schema:
   *           type: string
   *         description: Bank code
   *     responses:
   *       200:
   *         description: Bank details
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
   *                     bankCode:
   *                       type: string
   *                     bankName:
   *                       type: string
   *       404:
   *         description: Bank not found
   *       500:
   *         description: Server error
   */
  getBankByCode: async (req: Request, res: Response) => {
    try {
      const bankCode = routeParam(req.params.bankCode);

      if (!bankCode) {
        return res.status(400).json({
          success: false,
          message: "Bank code parameter is required",
        });
      }

      const bank = await bankService.getBankByCode(bankCode);

      if (!bank) {
        return res.status(404).json({
          success: false,
          message: "Bank not found",
        });
      }

      res.json({
        success: true,
        message: "Bank retrieved successfully",
        data: bank,
      });
    } catch (error: any) {
      console.error("Error getting bank by code:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve bank",
        error: error.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/banks/metadata:
   *   get:
   *     summary: Get banks metadata with statistics
   *     tags: [Banks]
   *     responses:
   *       200:
   *         description: Banks metadata with statistics
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
   *                     totalBanks:
   *                       type: number
   *                     banks:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: string
   *                           bankCode:
   *                             type: string
   *                           bankName:
   *                             type: string
   *       500:
   *         description: Server error
   */
  getBanksMetadata: async (req: Request, res: Response) => {
    try {
      const metadata = await bankService.getBanksMetadata();

      res.json({
        success: true,
        message: "Banks metadata retrieved successfully",
        data: metadata,
      });
    } catch (error: any) {
      console.error("Error getting banks metadata:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve banks metadata",
        error: error.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/banks/search:
   *   get:
   *     summary: Search banks by name
   *     tags: [Banks]
   *     parameters:
   *       - in: query
   *         name: q
   *         required: true
   *         schema:
   *           type: string
   *         description: Search query for bank name
   *     responses:
   *       200:
   *         description: Matching banks
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
   *                     query:
   *                       type: string
   *                     banks:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: string
   *                           bankCode:
   *                             type: string
   *                           bankName:
   *                             type: string
   *                     count:
   *                       type: number
   *       400:
   *         description: Missing search query
   *       500:
   *         description: Server error
   */
  searchBanks: async (req: Request, res: Response) => {
    try {
      const { q } = req.query;

      if (!q || typeof q !== "string") {
        return res.status(400).json({
          success: false,
          message: "Search query parameter 'q' is required",
        });
      }

      const banks = await bankService.searchBanks(q);

      res.json({
        success: true,
        message: `Banks matching "${q}" retrieved successfully`,
        data: {
          query: q,
          banks,
          count: banks.length,
        },
      });
    } catch (error: any) {
      console.error("Error searching banks:", error);
      res.status(500).json({
        success: false,
        message: "Failed to search banks",
        error: error.message,
      });
    }
  },
};
