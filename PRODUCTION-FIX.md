# Production Email Template Fix

## 🐛 Problems

### Problem 1: Email Templates Not Found

Email templates were not being found in production because the TypeScript compiler (`tsc`) only compiles `.ts` files and doesn't copy `.html` template files to the `dist` folder.

**Error Message:**

```
Error loading template documentRejection: Error: Template file not found: /home/mcemto5/lift/server/dist/build/templates/emailTemplates/documentRejection.html
```

### Problem 2: ES Module vs CommonJS Conflict

After initially adding `"type": "module"` to package.json, Node.js was treating compiled `.js` files as ES modules, but TypeScript was compiling to CommonJS format (using `exports`).

**Error Message:**

```
ReferenceError: exports is not defined in ES module scope
This file is being treated as an ES module because it has a '.js' file extension
and '/home/mcemto5/lift/server/package.json' contains "type": "module".
```

## ✅ Solutions

Enhanced the build process to automatically copy email templates and static assets to the `dist` folder.

### Changes Made:

1. **Updated `build.js`** - Enhanced to:

   - **Clean dist directory** before building (ensures fresh build)
   - **Wait for TypeScript compilation** to fully complete before copying files
   - **Verify build directory** was created successfully
   - Copy `src/templates/` directory to `dist/templates/`
   - Copy static assets (`banks.json`, `nigeria-states-lgas.json`)
   - **Verify templates were copied** with file count
   - Provide detailed build progress feedback
   - **Converted to CommonJS format** (using `require()` instead of `import`)
   - **Wrapped in async function** to handle asynchronous operations properly

2. **Updated `package.json`** - Changed build script:

   - From: `"build": "tsc"`
   - To: `"build": "node build.js"`
   - **Removed**: `"type": "module"` (to keep CommonJS compatibility)
   - Added: `"build:tsc"` for TypeScript-only compilation

3. **Created `DEPLOYMENT.md`** - Comprehensive deployment guide

### Why CommonJS?

TypeScript is configured to compile to CommonJS format (`"module": "commonjs"` in tsconfig.json). The compiled code uses `exports` and `require()`, so package.json must NOT have `"type": "module"`. The `build.js` script also uses CommonJS to match this configuration.

## 🚀 How to Deploy the Fix

### On Your Production Server:

```bash
# 1. Pull the latest code
git pull origin main

# 2. Install dependencies (if needed)
npm install

# 3. Build with the new enhanced build script
npm run build

# 4. Verify templates were copied
ls -la dist/templates/emailTemplates/

# 5. Restart your application
pm2 restart liftpay-api
# or
sudo systemctl restart liftpay
# or
node dist/server.js
```

### Verification:

After deployment, check that:

```bash
# Templates exist in dist folder
ls dist/templates/emailTemplates/

# Should show:
# - accountUpdate.html
# - documentRejection.html ✅ (NEW)
# - merchantStatusUpdate.html
# - notification.html
# - passwordReset.html
# - paymentNotification.html
# - README.md
# - representativeValidation.html ✅ (NEW)
# - verification.html
# - welcome.html
```

## 📋 Build Process Flow

```
npm run build
    ↓
node build.js (async)
    ↓
1. Clean dist/ directory
    ↓
2. Compile TypeScript (tsc)
    ↓
3. Wait for compilation (1 second)
    ↓
4. Verify dist/ was created
    ↓
5. Copy Email Templates
   src/templates/ → dist/templates/
    ↓
6. Verify templates copied (count files)
    ↓
7. Copy Static Assets
   banks.json → dist/banks.json
   nigeria-states-lgas.json → dist/nigeria-states-lgas.json
    ↓
8. Display build summary
    ↓
✅ Build Complete!
```

### Expected Build Output:

```
🏗️  Building project to: dist

🧹 Cleaning build directory...
✅ Cleaned dist

📦 Compiling TypeScript...
⏳ Waiting for compilation to complete...
✅ TypeScript compilation completed!

📧 Copying email templates...
✅ Email templates copied: 10 files

📄 Copying static assets...
  ✓ Copied banks.json
  ✓ Copied nigeria-states-lgas.json

✅ Build completed successfully! Files written to: dist

📁 Build structure:
   dist/
   ├── templates/emailTemplates/ (10 files)
   ├── banks.json
   ├── nigeria-states-lgas.json
   └── ... (compiled JS files)
```

## 🔍 Template Path Resolution

The `TemplateLoader` class uses `__dirname` which automatically resolves to the correct path in both development and production:

- **Development:** `src/templates/emailTemplates/`
- **Production:** `dist/templates/emailTemplates/`

## 🧪 Testing the Fix

### Local Test:

```bash
# Build the project
npm run build

# Check templates exist
ls dist/templates/emailTemplates/

# Start production build
node dist/server.js

# Test email sending
curl -X POST http://localhost:5000/api/v1/email/test
```

### Production Test:

```bash
# After deployment, test email functionality
curl -X POST https://api.liftpay.co/api/v1/email/test

# Check application logs
pm2 logs liftpay-api --lines 50
```

## 📦 What Gets Copied

### Email Templates (10 files):

- ✅ accountUpdate.html
- ✅ documentRejection.html (NEW)
- ✅ merchantStatusUpdate.html
- ✅ notification.html
- ✅ passwordReset.html
- ✅ paymentNotification.html
- ✅ README.md
- ✅ representativeValidation.html (NEW)
- ✅ verification.html
- ✅ welcome.html

### Static Assets:

- ✅ banks.json (33 Nigerian banks)
- ✅ nigeria-states-lgas.json (States and LGAs)

## 🎯 Quick Commands Reference

```bash
# Build for production
npm run build

# Build TypeScript only (without copying assets)
npm run build:tsc

# Start production server
npm start

# Build and start
npm run build && npm start
```

## ⚠️ Important Notes

1. **Always use `npm run build`** instead of `tsc` directly
2. **Templates are cached** - restart server after template changes
3. **Check file permissions** on production server
4. **Verify .env file** has correct paths and configurations

## 🔄 Future Builds

From now on, whenever you:

- Add new email templates
- Update existing templates
- Add new static assets

Just run `npm run build` and everything will be copied automatically!

## 📞 Support

If you still encounter issues:

1. Check `dist/templates/emailTemplates/` exists
2. Verify file permissions: `chmod -R 755 dist/templates/`
3. Check application logs for detailed error messages
4. Ensure `.env` file is properly configured

---

**Status:** ✅ Fixed  
**Date:** October 14, 2025  
**Version:** 1.0.1
