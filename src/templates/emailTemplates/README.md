# Email Templates

This directory contains HTML email templates for the Lift Platform email service. Each template is designed to be responsive and professional, with consistent branding and styling.

## Available Templates

### 1. Welcome Email (`welcome.html`)

- **Purpose**: Sent when a new user registers
- **Variables**: `appName`, `userName`, `userEmail`, `userType`, `verificationLink`, `registrationDate`
- **Features**: Account details, verification button, next steps

### 2. Password Reset (`passwordReset.html`)

- **Purpose**: Sent when user requests password reset
- **Variables**: `appName`, `userName`, `userEmail`, `resetLink`, `expirationTime`
- **Features**: Security warnings, reset button, best practices

### 3. Email Verification (`verification.html`)

- **Purpose**: Sent to verify user's email address
- **Variables**: `appName`, `userName`, `userEmail`, `verificationLink`, `verificationCode`, `expirationTime`
- **Features**: Verification steps, alternative code, security info

### 4. Merchant Status Update (`merchantStatusUpdate.html`)

- **Purpose**: Sent when merchant application status changes
- **Variables**: `appName`, `businessName`, `businessEmail`, `applicationStatus`, `documentStatus`, `verificationStatus`, `statusColor`, `buttonColor`
- **Features**: Status cards, timeline, conditional content based on status

### 5. Payment Notification (`paymentNotification.html`)

- **Purpose**: Sent for payment-related notifications
- **Variables**: `appName`, `userName`, `userEmail`, `paymentStatus`, `amount`, `currency`, `transactionId`, `paymentMethod`, `reference`
- **Features**: Payment details, status-specific styling, security notices

### 6. Account Update (`accountUpdate.html`)

- **Purpose**: Sent when account information is updated
- **Variables**: `appName`, `userName`, `userEmail`, `updateType`, `updateDescription`, `changes`, `isSecurityRelated`
- **Features**: Change tracking, security alerts, action requirements

### 7. General Notification (`notification.html`)

- **Purpose**: Sent for general platform notifications
- **Variables**: `appName`, `userName`, `userEmail`, `notificationTitle`, `notificationMessage`, `priorityClass`, `actionLink`
- **Features**: Priority-based styling, metadata display, flexible content

### 8. Document Rejection (`documentRejection.html`)

- **Purpose**: Sent when merchant onboarding documents fail verification
- **Variables**: `merchant_name`, `rejectionReasons` (array of {section, reason}), `merchant_dashboard_link`
- **Features**: Formatted rejection list, call-to-action button, support contact info
- **Usage Example**:
  ```javascript
  await emailService.sendTemplateEmail({
    to: "merchant@example.com",
    templateName: "documentRejection",
    subject:
      "Action Required – Some of Your LiftPay Merchant Documents Need Attention",
    data: {
      merchant_name: "John's Business",
      rejectionReasons: [
        {
          section: "CAC Certificate",
          reason: "Document is not clear, please upload a better quality scan",
        },
        {
          section: "Utility Bill",
          reason: "Bill is older than 3 months, please provide a recent bill",
        },
      ],
      merchant_dashboard_link: "https://merchant.liftpay.co/dashboard",
    },
  });
  ```

### 9. Representative Validation (`representativeValidation.html`)

- **Purpose**: Sent to authorized representatives for merchant onboarding validation
- **Variables**: `representative_name`, `merchant_business_name`, `validation_link`
- **Features**: Business info display, security warnings, validation CTA, expiration notice
- **Usage Example**:
  ```javascript
  await emailService.sendTemplateEmail({
    to: "representative@example.com",
    templateName: "representativeValidation",
    subject:
      "LiftPay Merchant Registration – Authorized Representative Validation Required",
    data: {
      representative_name: "Jane Doe",
      merchant_business_name: "TechCorp Solutions Ltd",
      validation_link: "https://verify.liftpay.co/validate?token=xyz789",
    },
  });
  ```

### 10. Merchant Verification Complete (`merchantVerificationComplete.html`)

- **Purpose**: Sent when merchant verification is completed successfully
- **Variables**: `merchant_name`, `merchant_dashboard_link`
- **Features**: Success celebration, integration guidance, feature highlights, next steps, support contact
- **Usage Example**:
  ```javascript
  await emailService.sendTemplateEmail({
    to: "merchant@example.com",
    templateName: "merchantVerificationComplete",
    subject: "Welcome to LiftPay Merchant Network",
    data: {
      merchant_name: "John's Business",
      merchant_dashboard_link: "https://merchant.liftpay.co/dashboard",
    },
  });
  ```

### 11. OTP Verification (`otp.html`)

- **Purpose**: Sent for phone number verification with OTP code
- **Variables**: `first_name` (optional), `otp_code` (required)
- **Features**: Large OTP display, expiry warning, security notice, responsive design
- **Usage Example**:

  ```javascript
  // With name
  await emailService.sendTemplateEmail({
    to: "user@example.com",
    templateName: "otp",
    subject: "Your LiftPay Verification Code",
    data: {
      first_name: "John",
      otp_code: "1234",
    },
  });

  // Without name (will show "Hello," instead)
  await emailService.sendTemplateEmail({
    to: "user@example.com",
    templateName: "otp",
    subject: "Your LiftPay Verification Code",
    data: {
      otp_code: "1234",
    },
  });
  ```

## Template Features

### Responsive Design

- Mobile-first approach
- Flexible grid layouts
- Optimized for all screen sizes

### Consistent Branding

- Unified color scheme
- Professional typography
- Consistent spacing and layout

### Security Features

- Security warnings where appropriate
- Clear call-to-action buttons
- Expiration time indicators

### Accessibility

- Semantic HTML structure
- Alt text for images
- High contrast colors
- Keyboard navigation support

## Usage

### Using the Email Service

```typescript
import { emailService } from "../services/emailService";

// Send a welcome email
await emailService.sendTemplateEmail({
  to: "user@example.com",
  templateName: "welcome",
  data: {
    appName: "Lift Platform",
    userName: "John Doe",
    userEmail: "user@example.com",
    userType: "Merchant",
    verificationLink: "https://app.lift.com/verify?token=abc123",
    registrationDate: "2024-01-15",
  },
});
```

### Template Variables

All templates support the following common variables:

- `appName`: Application name (default: "Lift Platform")
- `userName`: Recipient's name
- `userEmail`: Recipient's email address

### Conditional Content

Templates support Handlebars conditional statements:

```html
{{#if isApproved}}
<p>Congratulations! Your account has been approved.</p>
{{/if}} {{#if changes}}
<ul>
  {{#each changes}}
  <li>{{field}}: {{oldValue}} → {{newValue}}</li>
  {{/each}}
</ul>
{{/if}}
```

## Customization

### Adding New Templates

1. Create a new HTML file in this directory
2. Follow the existing template structure
3. Use Handlebars syntax for dynamic content
4. Include responsive CSS styling
5. Add the template to the email controller

### Modifying Existing Templates

1. Edit the HTML file directly
2. Test with sample data
3. Ensure responsive design is maintained
4. Update documentation if needed

### Styling Guidelines

- Use inline CSS for email client compatibility
- Test across different email clients
- Maintain consistent color scheme
- Use web-safe fonts
- Optimize images for email

## Testing

### Template Testing

```bash
# Test email configuration
curl -X POST http://localhost:5000/api/v1/email/test

# Send a test welcome email
curl -X POST http://localhost:5000/api/v1/email/welcome \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "to": "test@example.com",
    "userName": "Test User",
    "userEmail": "test@example.com",
    "userType": "Merchant"
  }'
```

### Available Endpoints

- `POST /api/v1/email/test` - Test email configuration
- `POST /api/v1/email/welcome` - Send welcome email
- `POST /api/v1/email/password-reset` - Send password reset email
- `POST /api/v1/email/verification` - Send verification email
- `POST /api/v1/email/merchant-status` - Send merchant status update
- `POST /api/v1/email/payment` - Send payment notification
- `POST /api/v1/email/account-update` - Send account update notification
- `POST /api/v1/email/notification` - Send general notification
- `POST /api/v1/email/document-rejection` - Send document rejection notification
- `POST /api/v1/email/representative-validation` - Send representative validation request
- `POST /api/v1/email/merchant-verification-complete` - Send merchant verification complete notification
- `POST /api/v1/email/otp` - Send OTP verification email
- `GET /api/v1/email/templates` - Get available templates

## File Structure

```
emailTemplates/
├── README.md                          # This documentation
├── welcome.html                       # Welcome email template
├── passwordReset.html                 # Password reset template
├── verification.html                  # Email verification template
├── merchantStatusUpdate.html          # Merchant status update template
├── paymentNotification.html           # Payment notification template
├── accountUpdate.html                 # Account update template
├── notification.html                  # General notification template
├── documentRejection.html             # Document rejection template
├── representativeValidation.html      # Representative validation template
├── merchantVerificationComplete.html  # Merchant verification complete template
└── otp.html                           # OTP verification template
```

## Dependencies

- Handlebars for template rendering
- Nodemailer for email sending
- Express for API endpoints

## Support

For questions or issues with email templates, please contact the development team or create an issue in the project repository.
