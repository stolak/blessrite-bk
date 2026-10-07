import { Request, Response } from "express";
import { helperService } from "../services/helperService";

export class DashboardController {
  /**
   * Get dashboard statistics
   */
  async getDashboardStats(req: Request, res: Response) {
    try {
      const stats = await helperService.getDashboardStats();

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      console.error("Error getting dashboard stats:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }
}

export const dashboardController = new DashboardController();
