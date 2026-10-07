import { Request, Response } from "express";
import { authService } from "../services/authService";
import { UserRegistrationInput } from "../services/authService";
import { userService } from "../services/userService";
import { getAuthenticatedUserId } from "../middlewares/auth";

/**
 * @openapi
 * /register:
 *   post:
 *     summary: Register a new user
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@admin.com
 *               password:
 *                 type: string
 *                 example: 12345
 *               firstName:
 *                 type: string
 *                 example: John
 *               lastName:
 *                 type: string
 *                 example: Doe
 *               phoneNumber:
 *                 type: string
 *                 example: '+1234567890'
 *               role:
 *                 type: string
 *                 enum: [Visitor, Admin, Merchant, Buyer, SuperAdmin, CustomerSupport]
 *                 example: Admin
 *               userType:
 *                 type: string
 *                 enum: [Admin, Merchant, Buyer]
 *                 example: Admin
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 email:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, phoneNumber }: UserRegistrationInput = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await authService.create({
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
    });
    res.status(201).json(user);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password, userType } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const result = await authService.login(email, password, userType);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @openapi
 * /api/v1/auth/users:
 *   get:
 *     summary: Get users filtered by merchant ID
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: merchantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Merchant ID to filter users
 *       - in: query
 *         name: userType
 *         schema:
 *           type: string
 *           enum: [Admin, Merchant, Buyer]
 *         description: Filter by user type
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [Visitor, Admin, Merchant, Buyer, SuperAdmin, CustomerSupport]
 *         description: Filter by user role
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           email:
 *                             type: string
 *                           firstName:
 *                             type: string
 *                           lastName:
 *                             type: string
 *                           phoneNumber:
 *                             type: string
 *                           userType:
 *                             type: string
 *                           role:
 *                             type: string
 *                           isActive:
 *                             type: boolean
 *                           isVerified:
 *                             type: boolean
 *                           isEmailVerified:
 *                             type: boolean
 *                           isPhoneVerified:
 *                             type: boolean
 *                           outletId:
 *                             type: string
 *                             format: uuid
 *                             nullable: true
 *                             description: ID of the outlet this user is assigned to
 *                           outlet:
 *                             type: object
 *                             nullable: true
 *                             description: Outlet details if user is assigned to an outlet
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 format: uuid
 *                               name:
 *                                 type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *       400:
 *         description: Bad request - merchantId is required
 *       404:
 *         description: Merchant not found
 *       500:
 *         description: Internal server error
 */
/**
 * @openapi
 * /api/v1/auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     description: Sends a password reset email with a token that expires in 10 minutes
 *     tags: [Auth]
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
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: Password reset email sent (or message indicating email sent if account exists)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "If an account with that email exists, a password reset link has been sent."
 *       500:
 *         description: Internal server error
 */
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const result = await authService.forgotPassword(email);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to process password reset request",
    });
  }
};

/**
 * @openapi
 * /api/v1/auth/reset-password:
 *   post:
 *     summary: Reset password using token
 *     description: Resets user password using the token received via email. Token expires after 10 minutes and can only be used once.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - token
 *               - newPassword
 *               - confirmPassword
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *               token:
 *                 type: string
 *                 description: Reset token received via email
 *                 example: "a1b2c3d4e5f6..."
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *                 example: "newSecurePassword123"
 *               confirmPassword:
 *                 type: string
 *                 minLength: 6
 *                 example: "newSecurePassword123"
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Password has been reset successfully"
 *       400:
 *         description: Bad request - validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Passwords do not match"
 *       401:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid or expired reset token"
 *       500:
 *         description: Internal server error
 */
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, token, newPassword, confirmPassword } = req.body;

    if (!email || !token || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, token, newPassword, and confirmPassword are required",
      });
    }

    const result = await authService.resetPassword(email, token, newPassword, confirmPassword);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || "Failed to reset password",
    });
  }
};

/**
 * @openapi
 * /api/v1/auth/me/privileges:
 *   get:
 *     summary: Get effective privileges for the authenticated user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Uses the JWT subject user id. Returns direct privileges plus those on the user's AppRole.
 *       SuperAdmin users receive every privilege in the system.
 *     responses:
 *       200:
 *         description: Privilege list for the current user
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
export const getMyPrivileges = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const privileges = await userService.getUserPrivileges(userId);

    return res.json({
      success: true,
      message: "Privileges retrieved successfully",
      data: { privileges },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to retrieve privileges";
    const httpStatus = message === "User not found" ? 404 : 500;
    return res.status(httpStatus).json({ success: false, message });
  }
};

/**
 * @openapi
 * /api/v1/auth/me/menus:
 *   get:
 *     summary: Get menus for the authenticated user's application role
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Uses the JWT subject user id. Returns menus on the user's AppRole via RoleMenu.
 *       SuperAdmin users receive every menu in the system.
 *     responses:
 *       200:
 *         description: Menu list for the current user
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
export const getMyMenus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const menus = await userService.getUserMenus(userId);

    return res.json({
      success: true,
      message: "Menus retrieved successfully",
      data: { menus },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to retrieve menus";
    const httpStatus = message === "User not found" ? 404 : 500;
    return res.status(httpStatus).json({ success: false, message });
  }
};

/**
 * @openapi
 * /api/v1/auth/me/password:
 *   patch:
 *     summary: Change password for the authenticated user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword, confirmPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *               confirmPassword:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Validation error / incorrect current password
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
export const changeMyPassword = async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body ?? {};
    if (typeof currentPassword !== "string" || !currentPassword) {
      return res
        .status(400)
        .json({ success: false, message: "currentPassword is required" });
    }
    if (typeof newPassword !== "string" || !newPassword) {
      return res.status(400).json({ success: false, message: "newPassword is required" });
    }
    if (typeof confirmPassword !== "string" || !confirmPassword) {
      return res.status(400).json({ success: false, message: "confirmPassword is required" });
    }

    const result = await authService.changePassword(
      userId,
      currentPassword,
      newPassword,
      confirmPassword
    );
    return res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to change password";
    const httpStatus =
      message === "User not found"
        ? 404
        : message.includes("required") ||
            message.includes("match") ||
            message.includes("incorrect") ||
            message.includes("at least 6")
          ? 400
          : 500;
    return res.status(httpStatus).json({ success: false, message });
  }
};
