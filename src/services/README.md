# Helper Service

## Overview

The Helper Service provides utility functions for common operations like OTP generation and validation.

## Features

### 1. Phone Number OTP Generation

Generates a 4-digit numeric OTP for phone number verification.

**Endpoint:** `POST /api/v1/helper/phone-otp`

**Request Body:**

```json
{
  "phoneNumber": "+2348012345678"
}
```

**Response:**

```json
{
  "success": true,
  "message": "OTP sent successfully to +2348012345678",
  "data": {
    "otp": "243188",
    "expiresAt": "2025-10-15T10:06:17.669Z",
    "phoneNumber": "+2348012345678"
  }
}
```

### 2. Email OTP Generation

Generates a 4-digit numeric OTP for email verification.

**Endpoint:** `POST /api/v1/helper/email-otp`

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

**Response:**

```json
{
  "success": true,
  "message": "OTP sent successfully to user@example.com",
  "data": {
    "otp": "609845",
    "expiresAt": "2025-10-15T10:06:28.119Z",
    "email": "user@example.com"
  }
}
```

### 3. Health Check

Check if the helper service is running.

**Endpoint:** `GET /api/v1/helper/health`

**Response:**

```json
{
  "success": true,
  "message": "Helper service is running",
  "timestamp": "2025-10-15T10:01:11.658Z"
}
```

## OTP Specifications

- **Length:** 4 digits
- **Expiry:** 5 minutes from generation
- **Generation:** Cryptographically secure random numbers
- **Format:** Numeric only (0-9)

## Error Handling

### Invalid Phone Number

```json
{
  "success": false,
  "message": "Invalid phone number format"
}
```

### Invalid Email

```json
{
  "success": false,
  "message": "Invalid email format"
}
```

### Missing Required Fields

```json
{
  "success": false,
  "message": "Phone number is required"
}
```

## Additional Functions

### Alphanumeric OTP Generation

```typescript
const alphanumericOTP = helperService.generateAlphanumericOTP(8); // 8 characters
```

### Secure Token Generation

```typescript
const secureToken = helperService.generateSecureToken(32); // 32 bytes hex
```

### OTP Verification

```typescript
const isValid = await helperService.verifyOTP(
  providedOTP,
  storedOTP,
  expiresAt
);
```

## Security Notes

1. **Production Usage:** In production, store generated OTPs in a secure database or cache with proper expiration handling.

2. **Rate Limiting:** Implement rate limiting to prevent OTP abuse.

3. **SMS/Email Integration:** Integrate with actual SMS and email services to send OTPs to users.

4. **Logging:** Remove console.log statements in production for security.

## Testing

All endpoints can be tested using curl or any HTTP client:

```bash
# Health check
curl -X GET http://localhost:5000/api/v1/helper/health

# Phone OTP
curl -X POST http://localhost:5000/api/v1/helper/phone-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+2348012345678"}'

# Email OTP
curl -X POST http://localhost:5000/api/v1/helper/email-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```
