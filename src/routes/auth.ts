import express from "express";
import {
  register,
  login,
  forgotPassword,
  resetPassword,
  getMyPrivileges,
  getMyMenus,
  changeMyPassword,
} from "../controllers/authController";
import { authenticateJWT } from "../middlewares/auth";
const router = express.Router();
/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created
 *       400:
 *         description: Validation error
 */
router.post("/register", register);
/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     summary: Login and receive a JWT token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@admin.com
 *               password:
 *                 type: string
 *                 example: 12345
 *     responses:
 *       200:
 *         description: Authenticated
 *       400:
 *         description: Invalid credentials
 */
router.post("/login", login);

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
 *         description: Password reset email sent
 *       500:
 *         description: Internal server error
 */
router.post("/forgot-password", forgotPassword);

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
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *               confirmPassword:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Invalid or expired token
 */
router.post("/reset-password", resetPassword);

router.get("/me/privileges", authenticateJWT, getMyPrivileges);
router.get("/me/menus", authenticateJWT, getMyMenus);
router.patch("/me/password", authenticateJWT, changeMyPassword);

export = router;
