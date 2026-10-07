import { Request, Response } from "express";
import { helperService } from "../services/helperService";
import { emailService } from "../services/emailService";

/**
 * @openapi
 * /api/v1/helper/phone-otp:
 *   post:
 *     summary: Generate OTP for phone number verification
 *     tags: [Helper]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 description: Phone number to send OTP to
 *                 example: "+2348012345678"
 *     responses:
 *       200:
 *         description: OTP generated successfully
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
 *                     otp:
 *                       type: string
 *                       description: Generated OTP (4 digits)
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                       description: OTP expiration time
 *                     phoneNumber:
 *                       type: string
 *       400:
 *         description: Invalid phone number format
 *       500:
 *         description: Server error
 */
export const helperController = {
  generatePhoneOTP: async (req: Request, res: Response) => {
    try {
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          message: "Phone number is required",
        });
      }

      const result = await helperService.generatePhoneOTP(phoneNumber);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message,
        });
      }

      res.json({
        success: true,
        message: result.message,
        data: {
          otp: result.otp,
          expiresAt: result.expiresAt,
          phoneNumber: phoneNumber,
        },
      });
    } catch (error: any) {
      console.error("Error in generatePhoneOTP:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/helper/email-otp:
   *   post:
   *     summary: Generate OTP for email verification
   *     tags: [Helper]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 description: Email address to send OTP to
   *                 example: "user@example.com"
   *     responses:
   *       200:
   *         description: OTP generated successfully
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
   *                     otp:
   *                       type: string
   *                       description: Generated OTP (4 digits)
   *                     expiresAt:
   *                       type: string
   *                       format: date-time
   *                       description: OTP expiration time
   *                     email:
   *                       type: string
   *       400:
   *         description: Invalid email format
   *       500:
   *         description: Server error
   */
  generateEmailOTP: async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required",
        });
      }

      const result = await helperService.generateEmailOTP(email);

      // send email to user
      emailService.sendTemplateEmail({
        to: email,
        templateName: "otp",
        subject: "Your LiftPay Verification Code",
        data: {
          // first_name is optional - template handles both cases
          otp_code: result.otp,
        },
      });
      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message,
        });
      }

      res.json({
        success: true,
        message: result.message,
        data: {
          otp: result.otp,
          expiresAt: result.expiresAt,
          email: email,
        },
      });
    } catch (error: any) {
      console.error("Error in generateEmailOTP:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/helper/health:
   *   get:
   *     summary: Check helper service health
   *     tags: [Helper]
   *     responses:
   *       200:
   *         description: Service is healthy
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 message:
   *                   type: string
   *                 timestamp:
   *                   type: string
   *                   format: date-time
   */
  health: async (req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        message: "Helper service is running",
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Error in helper health check:", error);
      res.status(500).json({
        success: false,
        message: "Service unavailable",
        error: error.message,
      });
    }
  },
};
