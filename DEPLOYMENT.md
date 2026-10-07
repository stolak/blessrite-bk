# LiftPay Server Deployment Guide

## 📦 Building for Production

### Build Process

The build process has been enhanced to automatically copy all necessary assets including email templates and static files.

```bash
npm run build
```

This command will:

1. ✅ Compile TypeScript files to JavaScript (`dist/` directory)
2. ✅ Copy email templates to `dist/templates/emailTemplates/`
3. ✅ Copy static assets (`banks.json`, `nigeria-states-lgas.json`)

### Build Output Structure

```
dist/
├── server.js                    # Main server file
├── app.js                       # Express app configuration
├── controllers/                 # Compiled controllers
├── services/                    # Compiled services
├── routes/                      # Compiled routes
├── middlewares/                 # Compiled middlewares
├── utils/                       # Compiled utilities
├── templates/                   # 📧 Email templates (copied)
│   └── emailTemplates/
│       ├── welcome.html
│       ├── documentRejection.html
│       ├── representativeValidation.html
│       └── ... (all other templates)
├── banks.json                   # Bank data (copied)
└── nigeria-states-lgas.json     # Location data (copied)
```

## 🚀 Deployment Steps

### 1. Prepare Your Server

Ensure your production server has:

- Node.js (v18 or higher)
- MySQL database
- Environment variables configured

### 2. Upload Files

Upload the following to your production server:

```bash
# Upload entire project or just these essentials:
- dist/                  # Built application
- node_modules/          # Dependencies (or run npm install on server)
- prisma/               # Database schema and migrations
- .env                  # Environment configuration
- package.json          # Project metadata
```

### 3. Install Dependencies (if not uploaded)

```bash
cd /path/to/your/app
npm install --production
```

### 4. Set Up Database

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database (for initial setup)
npx prisma db push

# Or run migrations (recommended for production)
npx prisma migrate deploy

# Seed database (optional, for initial data)
npm run seed
```

### 5. Configure Environment Variables

Create or update `.env` file with production values:

```env
# Database
DATABASE_URL="mysql://user:password@localhost:3306/liftpay"
SHADOW_DATABASE_URL="mysql://user:password@localhost:3306/liftpay_shadow"

# Server
PORT=5000
NODE_ENV=production

# JWT
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
JWT_EXPIRES_IN="7d"

# Email (SMTP)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASSWORD="your-app-password"
EMAIL_FROM="noreply@liftpay.co"

# AWS S3 (for file uploads)
AWS_ACCESS_KEY_ID="your-aws-access-key"
AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
AWS_REGION="us-east-1"
AWS_BUCKET_NAME="liftpay-uploads"

# Mono (Bank verification)
MONO_SECRET_KEY="your-mono-secret-key"
MONO_PUBLIC_KEY="your-mono-public-key"

# Application URLs
FRONTEND_URL="https://app.liftpay.co"
MERCHANT_DASHBOARD_URL="https://merchant.liftpay.co"
VALIDATION_URL="https://verify.liftpay.co"
```

### 6. Start the Application

#### Using Node directly:

```bash
npm start
# or
node dist/server.js
```

#### Using PM2 (Recommended):

```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start dist/server.js --name "liftpay-api"

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
```

#### Using systemd (Alternative):

Create a systemd service file `/etc/systemd/system/liftpay.service`:

```ini
[Unit]
Description=LiftPay API Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/your/app
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl enable liftpay
sudo systemctl start liftpay
sudo systemctl status liftpay
```

## 🔧 Troubleshooting

### Email Templates Not Found

**Error:**

```
Error loading template documentRejection: Error: Template file not found: /path/to/dist/templates/emailTemplates/documentRejection.html
```

**Solution:**

1. Ensure you ran `npm run build` (not just `tsc`)
2. Verify templates exist in `dist/templates/emailTemplates/`
3. Check file permissions on the templates directory

```bash
# Verify templates exist
ls -la dist/templates/emailTemplates/

# Fix permissions if needed
chmod -R 755 dist/templates/
```

### Database Connection Issues

**Error:**

```
Error: Can't reach database server at `localhost:3306`
```

**Solution:**

1. Verify MySQL is running
2. Check DATABASE_URL in `.env`
3. Ensure database user has proper permissions
4. Check firewall rules

### Port Already in Use

**Error:**

```
Error: listen EADDRINUSE: address already in use :::5000
```

**Solution:**

```bash
# Find process using port 5000
lsof -i :5000
# or on Windows
netstat -ano | findstr :5000

# Kill the process
kill -9 <PID>
# or on Windows
taskkill /PID <PID> /F

# Or change PORT in .env file
```

## 📊 Monitoring

### Check Application Logs

#### With PM2:

```bash
pm2 logs liftpay-api
pm2 logs liftpay-api --lines 100
```

#### With systemd:

```bash
journalctl -u liftpay -f
journalctl -u liftpay --since today
```

### Monitor Application Status

#### With PM2:

```bash
pm2 status
pm2 monit
```

### Health Check Endpoint

```bash
curl http://localhost:5000/api/v1/health
```

## 🔄 Updating the Application

### Standard Update Process

```bash
# 1. Pull latest code
git pull origin main

# 2. Install dependencies
npm install

# 3. Build application
npm run build

# 4. Run database migrations
npx prisma migrate deploy

# 5. Restart application
pm2 restart liftpay-api
# or
sudo systemctl restart liftpay
```

### Zero-Downtime Deployment (PM2)

```bash
# Build and reload without downtime
npm run build && pm2 reload liftpay-api
```

## 🔐 Security Checklist

- [ ] Change all default passwords and secrets
- [ ] Use strong JWT_SECRET
- [ ] Enable HTTPS/SSL
- [ ] Set up firewall rules
- [ ] Configure CORS properly
- [ ] Use environment variables for sensitive data
- [ ] Regular security updates (`npm audit fix`)
- [ ] Implement rate limiting
- [ ] Set up backup system for database
- [ ] Monitor application logs

## 📝 Environment-Specific Configurations

### Development

```bash
NODE_ENV=development
```

### Staging

```bash
NODE_ENV=staging
```

### Production

```bash
NODE_ENV=production
```

## 🆘 Support

For deployment issues or questions:

- Email: support@liftpay.co
- Documentation: https://docs.liftpay.co
- GitHub Issues: https://github.com/your-org/liftpay/issues

---

**Last Updated:** October 2025  
**Version:** 1.0.0
