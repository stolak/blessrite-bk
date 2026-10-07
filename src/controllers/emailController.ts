import { Request, Response } from "express";
import { emailService } from "../services/emailService";
import { templateLoader } from "../services/templateLoader";

/**
 * @openapi
 * /api/v1/email/test:
 *   post:
 *     summary: Test email configuration
 *     tags: [Email]
 *     responses:
 *       200:
 *         description: Email configuration test result
 *       500:
 *         description: Email configuration test failed
 */
export const emailController = {
  testConnection: async (req: Request, res: Response) => {
    try {
      const result = await emailService.testConnection();

      if (result.success) {
        res.json({
          success: true,
          message: "Email configuration is working correctly",
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Email configuration test failed",
          error: result.error,
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Email test failed",
        error: error.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/email/send:
   *   post:
   *     summary: Send email
   *     tags: [Email]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [to, subject, html]
   *             properties:
   *               to:
   *                 type: string
   *                 description: Recipient email address
   *               subject:
   *                 type: string
   *                 description: Email subject
   *               html:
   *                 type: string
   *                 description: HTML content
   *               text:
   *                 type: string
   *                 description: Plain text content
   *     responses:
   *       200:
   *         description: Email sent successfully
   *       400:
   *         description: Invalid email data
   *       500:
   *         description: Email sending failed
   */
  sendEmail: async (req: Request, res: Response) => {
    try {
      const { to, subject, html, text } = req.body;

      if (!to || !subject || !html) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: to, subject, html",
        });
      }

      const result = await emailService.sendEmail({
        to,
        subject,
        html,
        text,
      });

      if (result.success) {
        res.json({
          success: true,
          message: "Email sent successfully",
          messageId: result.messageId,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Email sending failed",
          error: result.error,
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Email sending failed",
        error: error.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/email/welcome:
   *   post:
   *     summary: Send welcome email
   *     tags: [Email]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [to, userName, userEmail, userType]
   *             properties:
   *               to:
   *                 type: string
   *                 description: Recipient email address
   *               userName:
   *                 type: string
   *                 description: User's name
   *               userEmail:
   *                 type: string
   *                 description: User's email
   *               userType:
   *                 type: string
   *                 description: Type of user (Admin, Merchant, Buyer)
   *               verificationLink:
   *                 type: string
   *                 description: Email verification link
   *     responses:
   *       200:
   *         description: Welcome email sent successfully
   *       400:
   *         description: Invalid email data
   *       500:
   *         description: Email sending failed
   */
  sendWelcomeEmail: async (req: Request, res: Response) => {
    try {
      const { to, userName, userEmail, userType, verificationLink } = req.body;

      if (!to || !userName || !userEmail || !userType) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: to, userName, userEmail, userType",
        });
      }

      const data = {
        appName: "Lift Platform",
        userName,
        userEmail,
        userType,
        verificationLink:
          verificationLink || `${process.env.APP_URL}/verify-email`,
        registrationDate: new Date().toLocaleDateString(),
      };

      const result = await emailService.sendTemplateEmail({
        to,
        templateName: "welcome",
        data,
      });

      if (result.success) {
        res.json({
          success: true,
          message: "Welcome email sent successfully",
          messageId: result.messageId,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Welcome email sending failed",
          error: result.error,
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Welcome email sending failed",
        error: error.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/email/password-reset:
   *   post:
   *     summary: Send password reset email
   *     tags: [Email]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [to, userName, resetLink]
   *             properties:
   *               to:
   *                 type: string
   *                 description: Recipient email address
   *               userName:
   *                 type: string
   *                 description: User's name
   *               userEmail:
   *                 type: string
   *                 description: User's email
   *               resetLink:
   *                 type: string
   *                 description: Password reset link
   *               expirationTime:
   *                 type: string
   *                 description: Link expiration time
   *     responses:
   *       200:
   *         description: Password reset email sent successfully
   *       400:
   *         description: Invalid email data
   *       500:
   *         description: Email sending failed
   */
  sendPasswordResetEmail: async (req: Request, res: Response) => {
    try {
      const { to, userName, userEmail, resetLink, expirationTime } = req.body;

      if (!to || !userName || !resetLink) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: to, userName, resetLink",
        });
      }

      const data = {
        appName: "Lift Platform",
        userName,
        userEmail: userEmail || to,
        resetLink,
        expirationTime: expirationTime || "24",
      };

      const result = await emailService.sendTemplateEmail({
        to,
        templateName: "passwordReset",
        data,
      });

      if (result.success) {
        res.json({
          success: true,
          message: "Password reset email sent successfully",
          messageId: result.messageId,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Password reset email sending failed",
          error: result.error,
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Password reset email sending failed",
        error: error.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/email/merchant-status:
   *   post:
   *     summary: Send merchant status update email
   *     tags: [Email]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [to, businessName, applicationStatus, documentStatus]
   *             properties:
   *               to:
   *                 type: string
   *                 description: Recipient email address
   *               businessName:
   *                 type: string
   *                 description: Business name
   *               businessEmail:
   *                 type: string
   *                 description: Business email
   *               applicationStatus:
   *                 type: string
   *                 description: Application status
   *               documentStatus:
   *                 type: string
   *                 description: Document status
   *               verificationStatus:
   *                 type: string
   *                 description: Verification status
   *               dashboardLink:
   *                 type: string
   *                 description: Dashboard link
   *               applicationLink:
   *                 type: string
   *                 description: Application link
   *     responses:
   *       200:
   *         description: Merchant status email sent successfully
   *       400:
   *         description: Invalid email data
   *       500:
   *         description: Email sending failed
   */
  sendMerchantStatusEmail: async (req: Request, res: Response) => {
    try {
      const {
        to,
        businessName,
        businessEmail,
        applicationStatus,
        documentStatus,
        verificationStatus,
        dashboardLink,
        applicationLink,
      } = req.body;

      if (!to || !businessName || !applicationStatus || !documentStatus) {
        return res.status(400).json({
          success: false,
          message:
            "Missing required fields: to, businessName, applicationStatus, documentStatus",
        });
      }

      // Determine colors based on status
      let statusColor = "#2196F3"; // Default blue
      let buttonColor = "#2196F3";
      let buttonColorDark = "#1976d2";

      if (applicationStatus === "Approved") {
        statusColor = "#4CAF50"; // Green
        buttonColor = "#4CAF50";
        buttonColorDark = "#45a049";
      } else if (applicationStatus === "Rejected") {
        statusColor = "#f44336"; // Red
        buttonColor = "#f44336";
        buttonColorDark = "#da190b";
      }

      const data = {
        appName: "Lift Platform",
        businessName,
        businessEmail: businessEmail || to,
        applicationStatus,
        documentStatus,
        verificationStatus: verificationStatus || "Pending",
        applicationId: `APP-${Date.now()}`,
        updateDate: new Date().toLocaleDateString(),
        submissionDate: new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000
        ).toLocaleDateString(),
        reviewDate: new Date(
          Date.now() - 3 * 24 * 60 * 60 * 1000
        ).toLocaleDateString(),
        dashboardLink: dashboardLink || `${process.env.APP_URL}/dashboard`,
        applicationLink:
          applicationLink || `${process.env.APP_URL}/application`,
        statusColor,
        buttonColor,
        buttonColorDark,
        isApproved: applicationStatus === "Approved",
        needsAction: applicationStatus === "Pending",
        isRejected: applicationStatus === "Rejected",
      };

      const result = await emailService.sendTemplateEmail({
        to,
        templateName: "merchantStatusUpdate",
        data,
      });

      if (result.success) {
        res.json({
          success: true,
          message: "Merchant status email sent successfully",
          messageId: result.messageId,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Merchant status email sending failed",
          error: result.error,
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Merchant status email sending failed",
        error: error.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/email/verification:
   *   post:
   *     summary: Send email verification
   *     tags: [Email]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [to, userName, verificationLink]
   *             properties:
   *               to:
   *                 type: string
   *                 description: Recipient email address
   *               userName:
   *                 type: string
   *                 description: User's name
   *               userEmail:
   *                 type: string
   *                 description: User's email
   *               verificationLink:
   *                 type: string
   *                 description: Email verification link
   *               verificationCode:
   *                 type: string
   *                 description: Alternative verification code
   *               expirationTime:
   *                 type: string
   *                 description: Link expiration time
   *     responses:
   *       200:
   *         description: Verification email sent successfully
   *       400:
   *         description: Invalid email data
   *       500:
   *         description: Email sending failed
   */
  sendVerificationEmail: async (req: Request, res: Response) => {
    try {
      const {
        to,
        userName,
        userEmail,
        verificationLink,
        verificationCode,
        expirationTime,
      } = req.body;

      if (!to || !userName || !verificationLink) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: to, userName, verificationLink",
        });
      }

      const data = {
        appName: "Lift Platform",
        userName,
        userEmail: userEmail || to,
        verificationLink,
        verificationCode,
        expirationTime: expirationTime || "24",
      };

      const result = await emailService.sendTemplateEmail({
        to,
        templateName: "verification",
        data,
      });

      if (result.success) {
        res.json({
          success: true,
          message: "Verification email sent successfully",
          messageId: result.messageId,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Verification email sending failed",
          error: result.error,
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Verification email sending failed",
        error: error.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/email/payment:
   *   post:
   *     summary: Send payment notification
   *     tags: [Email]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [to, userName, paymentStatus, amount, currency]
   *             properties:
   *               to:
   *                 type: string
   *                 description: Recipient email address
   *               userName:
   *                 type: string
   *                 description: User's name
   *               userEmail:
   *                 type: string
   *                 description: User's email
   *               paymentStatus:
   *                 type: string
   *                 description: Payment status (Successful, Pending, Failed)
   *               amount:
   *                 type: number
   *                 description: Payment amount
   *               currency:
   *                 type: string
   *                 description: Currency code
   *               transactionId:
   *                 type: string
   *                 description: Transaction ID
   *               paymentMethod:
   *                 type: string
   *                 description: Payment method used
   *               reference:
   *                 type: string
   *                 description: Payment reference
   *     responses:
   *       200:
   *         description: Payment notification sent successfully
   *       400:
   *         description: Invalid email data
   *       500:
   *         description: Email sending failed
   */
  sendPaymentNotification: async (req: Request, res: Response) => {
    try {
      const {
        to,
        userName,
        userEmail,
        paymentStatus,
        amount,
        currency,
        transactionId,
        paymentMethod,
        reference,
      } = req.body;

      if (!to || !userName || !paymentStatus || !amount || !currency) {
        return res.status(400).json({
          success: false,
          message:
            "Missing required fields: to, userName, paymentStatus, amount, currency",
        });
      }

      // Determine colors and status class based on payment status
      let statusColor = "#f39c12"; // Default orange for pending
      let buttonColor = "#f39c12";
      let buttonColorDark = "#e67e22";
      let statusClass = "status-pending";

      if (paymentStatus === "Successful") {
        statusColor = "#27ae60"; // Green
        buttonColor = "#27ae60";
        buttonColorDark = "#229954";
        statusClass = "status-success";
      } else if (paymentStatus === "Failed") {
        statusColor = "#e74c3c"; // Red
        buttonColor = "#e74c3c";
        buttonColorDark = "#c0392b";
        statusClass = "status-failed";
      }

      const data = {
        appName: "Lift Platform",
        userName,
        userEmail: userEmail || to,
        paymentStatus,
        amount: amount.toFixed(2),
        currency: currency.toUpperCase(),
        transactionId: transactionId || `TXN-${Date.now()}`,
        paymentMethod: paymentMethod || "Credit Card",
        reference: reference || `REF-${Date.now()}`,
        transactionDate: new Date().toLocaleString(),
        statusColor,
        buttonColor,
        buttonColorDark,
        statusClass,
        isSuccessful: paymentStatus === "Successful",
        isPending: paymentStatus === "Pending",
        isFailed: paymentStatus === "Failed",
        actionLink: `${process.env.APP_URL}/transactions/${transactionId}`,
        retryLink: `${process.env.APP_URL}/payments/retry`,
      };

      const result = await emailService.sendTemplateEmail({
        to,
        templateName: "paymentNotification",
        data,
      });

      if (result.success) {
        res.json({
          success: true,
          message: "Payment notification sent successfully",
          messageId: result.messageId,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Payment notification sending failed",
          error: result.error,
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Payment notification sending failed",
        error: error.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/email/account-update:
   *   post:
   *     summary: Send account update notification
   *     tags: [Email]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [to, userName, updateType, updateDescription]
   *             properties:
   *               to:
   *                 type: string
   *                 description: Recipient email address
   *               userName:
   *                 type: string
   *                 description: User's name
   *               userEmail:
   *                 type: string
   *                 description: User's email
   *               updateType:
   *                 type: string
   *                 description: Type of update
   *               updateDescription:
   *                 type: string
   *                 description: Description of the update
   *               changes:
   *                 type: array
   *                 description: List of changes made
   *               isSecurityRelated:
   *                 type: boolean
   *                 description: Whether the update is security-related
   *     responses:
   *       200:
   *         description: Account update notification sent successfully
   *       400:
   *         description: Invalid email data
   *       500:
   *         description: Email sending failed
   */
  sendAccountUpdateEmail: async (req: Request, res: Response) => {
    try {
      const {
        to,
        userName,
        userEmail,
        updateType,
        updateDescription,
        changes,
        isSecurityRelated,
        requiresAction,
        actionRequired,
        actionLink,
        actionText,
      } = req.body;

      if (!to || !userName || !updateType || !updateDescription) {
        return res.status(400).json({
          success: false,
          message:
            "Missing required fields: to, userName, updateType, updateDescription",
        });
      }

      const data = {
        appName: "Lift Platform",
        userName,
        userEmail: userEmail || to,
        updateType,
        updateDescription,
        updateDate: new Date().toLocaleString(),
        updatedBy: "System",
        ipAddress: req.ip || "Unknown",
        changes: changes || [],
        isSecurityRelated: isSecurityRelated || false,
        requiresAction: requiresAction || false,
        actionRequired: actionRequired || "",
        actionLink: actionLink || `${process.env.APP_URL}/account`,
        actionText: actionText || "View Account",
        additionalInfo:
          "Please review these changes and contact support if you have any concerns.",
      };

      const result = await emailService.sendTemplateEmail({
        to,
        templateName: "accountUpdate",
        data,
      });

      if (result.success) {
        res.json({
          success: true,
          message: "Account update notification sent successfully",
          messageId: result.messageId,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Account update notification sending failed",
          error: result.error,
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Account update notification sending failed",
        error: error.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/email/notification:
   *   post:
   *     summary: Send general notification
   *     tags: [Email]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [to, userName, notificationTitle, notificationMessage]
   *             properties:
   *               to:
   *                 type: string
   *                 description: Recipient email address
   *               userName:
   *                 type: string
   *                 description: User's name
   *               userEmail:
   *                 type: string
   *                 description: User's email
   *               notificationTitle:
   *                 type: string
   *                 description: Notification title
   *               notificationMessage:
   *                 type: string
   *                 description: Notification message
   *               priorityClass:
   *                 type: string
   *                 description: Priority class (priority-high, priority-medium, priority-low)
   *               actionLink:
   *                 type: string
   *                 description: Action link
   *               actionText:
   *                 type: string
   *                 description: Action button text
   *     responses:
   *       200:
   *         description: Notification sent successfully
   *       400:
   *         description: Invalid email data
   *       500:
   *         description: Email sending failed
   */
  sendNotificationEmail: async (req: Request, res: Response) => {
    try {
      const {
        to,
        userName,
        userEmail,
        notificationTitle,
        notificationMessage,
        priorityClass,
        actionLink,
        actionText,
        additionalInfo,
        nextSteps,
        importantNotes,
      } = req.body;

      if (!to || !userName || !notificationTitle || !notificationMessage) {
        return res.status(400).json({
          success: false,
          message:
            "Missing required fields: to, userName, notificationTitle, notificationMessage",
        });
      }

      const data = {
        appName: "Lift Platform",
        userName,
        userEmail: userEmail || to,
        notificationTitle,
        notificationMessage,
        priorityClass: priorityClass || "priority-medium",
        actionLink: actionLink || "",
        actionText: actionText || "Take Action",
        additionalInfo: additionalInfo || "",
        nextSteps: nextSteps || [],
        importantNotes: importantNotes || "",
        notificationMeta: {
          Priority:
            priorityClass?.replace("priority-", "").toUpperCase() || "MEDIUM",
          Date: new Date().toLocaleDateString(),
          Time: new Date().toLocaleTimeString(),
        },
      };

      const result = await emailService.sendTemplateEmail({
        to,
        templateName: "notification",
        data,
      });

      if (result.success) {
        res.json({
          success: true,
          message: "Notification sent successfully",
          messageId: result.messageId,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Notification sending failed",
          error: result.error,
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Notification sending failed",
        error: error.message,
      });
    }
  },

  /**
   * @openapi
   * /api/v1/email/templates:
   *   get:
   *     summary: Get available email templates
   *     tags: [Email]
   *     responses:
   *       200:
   *         description: List of available templates
   *       500:
   *         description: Failed to get templates
   */
  getAvailableTemplates: async (req: Request, res: Response) => {
    try {
      const templates = templateLoader.getAvailableTemplates();
      const templatesWithMetadata = templates.map((template) => ({
        name: template,
        ...templateLoader.getTemplateMetadata(template),
      }));

      res.json({
        success: true,
        message: "Templates retrieved successfully",
        data: {
          templates: templatesWithMetadata,
          count: templates.length,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to get templates",
        error: error.message,
      });
    }
  },
};
