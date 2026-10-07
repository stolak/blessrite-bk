import nodemailer from "nodemailer";
import { templateLoader, TemplateData } from "./templateLoader";

interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

interface TemplateEmailOptions {
  to: string | string[];
  templateName: string;
  data: TemplateData;
  subject?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || "mail.mbrcomputers.net",
      port: parseInt(process.env.MAIL_PORT || "465"),
      secure: process.env.MAIL_ENCRYPTION === "ssl", // true for 465, false for other ports
      auth: {
        user: process.env.MAIL_USERNAME || "skultrack@stolaksoftech.com.ng",
        pass: process.env.MAIL_PASSWORD || "RealPassword",
      },
      tls: {
        rejectUnauthorized: false, // For self-signed certificates
      },
    });
  }

  /**
   * Send email using the configured SMTP settings
   */
  async sendEmail(
    options: EmailOptions
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const mailOptions = {
        from: process.env.MAIL_FROM_ADDRESS || "skultrack@stolaksoftech.com.ng",
        to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
      };

      const info = await this.transporter.sendMail(mailOptions);
      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error: any) {
      console.error("Email sending failed:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send email using an external template file
   */
  async sendTemplateEmail(
    options: TemplateEmailOptions
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const { to, templateName, data, subject } = options;

      // Render the template with data
      const html = await templateLoader.renderTemplate(templateName, data);

      // Use provided subject or extract from template data
      const emailSubject =
        subject || data.subject || `Notification from ${data.appName || "Lift Platform"}`;

      return await this.sendEmail({
        to,
        subject: emailSubject,
        html,
      });
    } catch (error: any) {
      console.error("Template email sending failed:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send email using a legacy template object (for backward compatibility)
   */
  async sendLegacyTemplateEmail(
    to: string | string[],
    template: EmailTemplate,
    data?: Record<string, any>
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      let html = template.html;
      let text = template.text;
      let subject = template.subject;

      // Replace template variables if data is provided
      if (data) {
        Object.keys(data).forEach((key) => {
          const placeholder = `{{${key}}}`;
          const value = data[key] || "";
          html = html.replace(new RegExp(placeholder, "g"), value);
          text = text.replace(new RegExp(placeholder, "g"), value);
          subject = subject.replace(new RegExp(placeholder, "g"), value);
        });
      }

      return await this.sendEmail({
        to,
        subject,
        html,
        text,
      });
    } catch (error: any) {
      console.error("Legacy template email sending failed:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Test email configuration
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.transporter.verify();
      console.log("SMTP connection verified successfully");
      return { success: true };
    } catch (error: any) {
      console.error("SMTP connection failed:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get email templates
   */
  getTemplates() {
    return {
      // Welcome email template
      welcome: {
        subject: "Welcome to {{appName}} - Account Created Successfully",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to {{appName}}</title>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background-color: #f9f9f9; }
              .footer { background-color: #333; color: white; padding: 15px; text-align: center; font-size: 12px; }
              .button { display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Welcome to {{appName}}!</h1>
              </div>
              <div class="content">
                <h2>Hello {{userName}},</h2>
                <p>Your account has been successfully created. We're excited to have you on board!</p>
                <p><strong>Account Details:</strong></p>
                <ul>
                  <li>Email: {{userEmail}}</li>
                  <li>Account Type: {{userType}}</li>
                  <li>Registration Date: {{registrationDate}}</li>
                </ul>
                <p>To get started, please verify your email address by clicking the button below:</p>
                <a href="{{verificationLink}}" class="button">Verify Email Address</a>
                <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
                <p><a href="{{verificationLink}}">{{verificationLink}}</a></p>
                <p>If you have any questions, please don't hesitate to contact our support team.</p>
                <p>Best regards,<br>The {{appName}} Team</p>
              </div>
              <div class="footer">
                <p>&copy; 2024 {{appName}}. All rights reserved.</p>
                <p>This email was sent to {{userEmail}}. If you didn't create this account, please ignore this email.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Welcome to {{appName}}!
          
          Hello {{userName}},
          
          Your account has been successfully created. We're excited to have you on board!
          
          Account Details:
          - Email: {{userEmail}}
          - Account Type: {{userType}}
          - Registration Date: {{registrationDate}}
          
          To get started, please verify your email address by visiting this link:
          {{verificationLink}}
          
          If you have any questions, please don't hesitate to contact our support team.
          
          Best regards,
          The {{appName}} Team
          
          © 2024 {{appName}}. All rights reserved.
          This email was sent to {{userEmail}}. If you didn't create this account, please ignore this email.
        `,
      },

      // Password reset email template
      passwordReset: {
        subject: "{{appName}} - Password Reset Request",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset - {{appName}}</title>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #f44336; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background-color: #f9f9f9; }
              .footer { background-color: #333; color: white; padding: 15px; text-align: center; font-size: 12px; }
              .button { display: inline-block; padding: 12px 24px; background-color: #f44336; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
              .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 15px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Password Reset Request</h1>
              </div>
              <div class="content">
                <h2>Hello {{userName}},</h2>
                <p>We received a request to reset your password for your {{appName}} account.</p>
                <p>To reset your password, click the button below:</p>
                <a href="{{resetLink}}" class="button">Reset Password</a>
                <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
                <p><a href="{{resetLink}}">{{resetLink}}</a></p>
                <div class="warning">
                  <strong>Important:</strong>
                  <ul>
                    <li>This link will expire in {{expirationTime}} minutes</li>
                    <li>If you didn't request this password reset, please ignore this email</li>
                    <li>Your password will not be changed until you create a new one</li>
                  </ul>
                </div>
                <p>If you have any questions, please contact our support team.</p>
                <p>Best regards,<br>The {{appName}} Team</p>
              </div>
              <div class="footer">
                <p>&copy; 2024 {{appName}}. All rights reserved.</p>
                <p>This email was sent to {{userEmail}}. If you didn't request this, please ignore this email.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Password Reset Request - {{appName}}
          
          Hello {{userName}},
          
          We received a request to reset your password for your {{appName}} account.
          
          To reset your password, visit this link:
          {{resetLink}}
          
          Important:
          - This link will expire in {{expirationTime}} minutes
          - If you didn't request this password reset, please ignore this email
          - Your password will not be changed until you create a new one
          
          If you have any questions, please contact our support team.
          
          Best regards,
          The {{appName}} Team
          
          © 2024 {{appName}}. All rights reserved.
          This email was sent to {{userEmail}}. If you didn't request this, please ignore this email.
        `,
      },

      // Merchant application status notification
      merchantStatusUpdate: {
        subject: "{{appName}} - Merchant Application Status Update",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Application Status Update - {{appName}}</title>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: {{headerColor}}; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background-color: #f9f9f9; }
              .footer { background-color: #333; color: white; padding: 15px; text-align: center; font-size: 12px; }
              .status-box { background-color: {{statusBgColor}}; border: 1px solid {{statusBorderColor}}; padding: 15px; border-radius: 5px; margin: 15px 0; }
              .button { display: inline-block; padding: 12px 24px; background-color: {{buttonColor}}; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Application Status Update</h1>
              </div>
              <div class="content">
                <h2>Hello {{businessName}},</h2>
                <p>Your merchant application status has been updated.</p>
                <div class="status-box">
                  <h3>Application Status: {{applicationStatus}}</h3>
                  <p><strong>Document Status:</strong> {{documentStatus}}</p>
                  <p><strong>Verification Status:</strong> {{verificationStatus}}</p>
                </div>
                {{#if isApproved}}
                <p>Congratulations! Your merchant account has been approved. You can now start using our platform.</p>
                <a href="{{dashboardLink}}" class="button">Access Dashboard</a>
                {{/if}}
                {{#if needsAction}}
                <p>Your application requires some additional information or documents. Please review the requirements and submit the necessary documents.</p>
                <a href="{{applicationLink}}" class="button">Review Application</a>
                {{/if}}
                {{#if isRejected}}
                <p>Unfortunately, your application could not be approved at this time. Please review the feedback and consider resubmitting.</p>
                <a href="{{applicationLink}}" class="button">Review Feedback</a>
                {{/if}}
                <p>If you have any questions about this update, please contact our support team.</p>
                <p>Best regards,<br>The {{appName}} Team</p>
              </div>
              <div class="footer">
                <p>&copy; 2024 {{appName}}. All rights reserved.</p>
                <p>This email was sent to {{businessEmail}}. If you have questions, please contact support.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Application Status Update - {{appName}}
          
          Hello {{businessName}},
          
          Your merchant application status has been updated.
          
          Application Status: {{applicationStatus}}
          Document Status: {{documentStatus}}
          Verification Status: {{verificationStatus}}
          
          {{#if isApproved}}
          Congratulations! Your merchant account has been approved. You can now start using our platform.
          Access your dashboard: {{dashboardLink}}
          {{/if}}
          
          {{#if needsAction}}
          Your application requires some additional information or documents. Please review the requirements and submit the necessary documents.
          Review application: {{applicationLink}}
          {{/if}}
          
          {{#if isRejected}}
          Unfortunately, your application could not be approved at this time. Please review the feedback and consider resubmitting.
          Review feedback: {{applicationLink}}
          {{/if}}
          
          If you have any questions about this update, please contact our support team.
          
          Best regards,
          The {{appName}} Team
          
          © 2024 {{appName}}. All rights reserved.
          This email was sent to {{businessEmail}}. If you have questions, please contact support.
        `,
      },

      // General notification template
      notification: {
        subject: "{{appName}} - {{notificationTitle}}",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>{{notificationTitle}} - {{appName}}</title>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background-color: #f9f9f9; }
              .footer { background-color: #333; color: white; padding: 15px; text-align: center; font-size: 12px; }
              .button { display: inline-block; padding: 12px 24px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>{{notificationTitle}}</h1>
              </div>
              <div class="content">
                <h2>Hello {{userName}},</h2>
                <p>{{notificationMessage}}</p>
                {{#if actionLink}}
                <a href="{{actionLink}}" class="button">{{actionText}}</a>
                {{/if}}
                <p>If you have any questions, please don't hesitate to contact our support team.</p>
                <p>Best regards,<br>The {{appName}} Team</p>
              </div>
              <div class="footer">
                <p>&copy; 2024 {{appName}}. All rights reserved.</p>
                <p>This email was sent to {{userEmail}}.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          {{notificationTitle}} - {{appName}}
          
          Hello {{userName}},
          
          {{notificationMessage}}
          
          {{#if actionLink}}
          {{actionText}}: {{actionLink}}
          {{/if}}
          
          If you have any questions, please don't hesitate to contact our support team.
          
          Best regards,
          The {{appName}} Team
          
          © 2024 {{appName}}. All rights reserved.
          This email was sent to {{userEmail}}.
        `,
      },
    };
  }
}

export const emailService = new EmailService();
