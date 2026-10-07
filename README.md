## API with Node.js, TypeScript, Prisma (MySQL), and JWT

A production-ready REST API built with Express, TypeScript, Prisma ORM (MySQL), JWT authentication, and Swagger docs.

### Features
- Express + TypeScript
- Prisma ORM with MySQL
- Auth: Register/Login with hashed passwords (bcrypt) + JWT
- Protected routes via middleware
- Service layer architecture
- Swagger UI at /docs
- Environment config validation

---

## Requirements
- Node.js 18+
- MySQL 8+ running locally
- npm

---

## Getting Started

### 1) Install
```bash
npm install
```

### 2) Environment variables
Create a `.env` file in project root:
```
DATABASE_URL="mysql://username:password@localhost:3306/dbname"
JWT_SECRET="your-strong-secret"
PORT=5000
```

### 3) Prisma setup
Generate client and run migrations:
```bash
npx prisma generate
npx prisma migrate dev --name init
```

When schema changes:
```bash
npx prisma migrate dev --name <change-name>
```

### 4) Run the API
```bash
npm run dev
```
Server: `http://localhost:5000`  
Swagger: `http://localhost:5000/docs`

---

## API Endpoints

### Auth
- POST `/api/auth/register`
  - body: `{ email: string, password: string }`
  - 201 → `{ id, email, createdAt }`
- POST `/api/auth/login`
  - body: `{ email: string, password: string }`
  - 200 → `{ token, user: { id, email } }`

### Protected
- GET `/api/profile`
  - headers: `Authorization: Bearer <JWT>`
  - 200 → `{ message, user }`

Full docs at `/docs`.

---

## Project Structure
```
src/
  app.ts               # Express app, mounts routes and Swagger
  server.ts            # Server entrypoint
  controllers/
    authController.ts  # HTTP handling for auth routes
  middlewares/
    auth.ts            # JWT authentication middleware
  routes/
    auth.ts            # /api/auth routes
    protected.ts       # /api/profile route
  services/
    authService.ts     # Business logic for auth
    userService.ts     # Business logic for user data
  utils/
    env.ts             # Env helpers (validates JWT secret)
    swagger.ts         # Swagger setup
  types/
    express/index.d.ts # Extends Express Request with user
prisma/
  schema.prisma        # Prisma schema
  migrations/          # Prisma migrations
```

---

## Scripts
- Dev: `npm run dev`
- Build: `npm run build`
- Start (built): `npm start`
- Prisma:
  - `npx prisma generate`
  - `npx prisma migrate dev --name <name>`
  - `npx prisma studio`

---

## Prisma Schema (User model)
Using MySQL with UUID string ids:
```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(uuid()) @db.Char(36)
  email     String   @unique
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Using PostgreSQL instead of MySQL

You can switch this project to PostgreSQL with a few changes.

1) Update `prisma/schema.prisma` datasource:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

2) Update `.env` connection string:
```
DATABASE_URL="postgresql://username:password@localhost:5432/dbname"
```

3) UUID primary key options (PostgreSQL):
- Use Prisma's built-in generator (recommended):
```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```
- Or use the DB function if you have the `pgcrypto` extension enabled:
```prisma
model User {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email     String   @unique
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

4) Regenerate client and migrate:
```bash
npx prisma generate
npx prisma migrate dev --name switch-to-postgres
```

Server code does not change because Prisma abstracts the driver.

---

## Auth Flow
- Register → validate → hash password (bcrypt) → create user
- Login → validate → verify password → issue JWT `{ userId }`, `expiresIn: 1h`
- Protected → middleware validates Bearer token → attaches `req.user`

---

## Swagger
- `swagger-ui-express` + `swagger-jsdoc`
- JSDoc annotations in `src/routes/*.ts`
- Served at `/docs`
- Bearer auth configured in OpenAPI

---

## Troubleshooting
- Missing JWT secret → ensure `.env` has `JWT_SECRET`, restart app
- Prisma client init error → `npx prisma generate`
- Windows EPERM on Prisma engine → stop dev server, delete `node_modules/.prisma/client`, reinstall, generate; try Admin shell or pause AV
- MySQL connection → verify credentials/DB exists; port 3306 open

---

## Security
- Strong `JWT_SECRET` and rotate periodically
- Don’t commit `.env` (use `.gitignore`)
- Add CORS rules if exposing publicly

---

## License
MIT


