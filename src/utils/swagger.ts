import swaggerUi from "swagger-ui-express";
import swaggerJSDoc from "swagger-jsdoc";
import { Express } from "express";

const BUILD_DIR = process.env.BUILD_DIR ?? "src";
const PORT = process.env.PORT ?? 5001;
const options: swaggerJSDoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "API with Prisma + JWT",
      version: "1.0.0",
      description: "Express API with Prisma ORM, JWT auth, and Swagger docs",
    },
    tags: [
      { name: "Auth", description: "Authentication endpoints" },
      { name: "Banks", description: "Bank management" },
      { name: "Brands", description: "Brand management" },
      { name: "Menus", description: "Application menu management (route and caption)" },
      { name: "AppRoles", description: "Application roles (name and status)" },
      { name: "Privileges", description: "Permission definitions (read-only listing)" },
      { name: "Suppliers", description: "Supplier management" },
      {
        name: "ActivePeriod",
        description: "Active period singleton (start and end date range)",
      },
      {
        name: "AccountGroups",
        description: "Chart of accounts — top-level account groups (read-only listing)",
      },
      {
        name: "AccountHeads",
        description: "Chart of accounts — account heads under a group (read-only listing)",
      },
      {
        name: "AccountSubheads",
        description: "Chart of accounts — subheads (CRUD); groupId is derived from headId on write",
      },
      {
        name: "AccountCharts",
        description:
          "Ledger account chart lines (CRUD); groupId and headId are derived from subheadId on write",
      },
      {
        name: "AccountTransactions",
        description:
          "Post debit/credit entries; group/head/subhead/accountCode are derived from accountId",
      },
      {
        name: "DefaulSubheadSettings",
        description: "Default subhead settings row — PATCH update only (by settingsId)",
      },
      {
        name: "DefaultAccountSettings",
        description: "Default account settings row — PATCH update only (by settingsId)",
      },
      {
        name: "TempJournalTransfers",
        description: "Temporary journal transfer entries (CRUD)",
      },
      { name: "Users", description: "User listing and profile (authenticated)" },
      {
        name: "AuditLogs",
        description: "Audit log listing (current user and admin-style filters)",
      },
      { name: "Departments", description: "Department master data (CRUD)" },
      { name: "GradeLevels", description: "Grade level master data (CRUD)" },
      { name: "Staff", description: "Staff registration and profile management" },
      {
        name: "SalaryComponents",
        description: "Payroll salary components (earnings, deductions, function-type formulas)",
      },
      {
        name: "SalaryCharts",
        description: "Payroll salary chart amounts by grade level, step, and employment type",
      },
      {
        name: "StaffSalaryOverrideComponents",
        description: "Staff-specific salary component override amounts (CRUD)",
      },
      {
        name: "Payroll",
        description: "Payroll computation and processing",
      },
      {
        name: "ActivePayrollPeriod",
        description: "Active payroll period singleton (year and month for current payroll run)",
      },
      {
        name: "AdministrativeExpenseComponents",
        description:
          "Administrative expense categories/components with optional ledger account (CRUD)",
      },
      {
        name: "AdministrativeExpenses",
        description: "Administrative expense transactions linked to a component (CRUD)",
      },
      {
        name: "Cashiers",
        description: "Cashier records linked to staff and ledger accounts (CRUD)",
      },
      {
        name: "Vehicles",
        description: "Vehicle fleet management (CRUD)",
      },
      { name: "Email", description: "Email management" },
      { name: "Helper", description: "Helper utilities" },
      { name: "Upload", description: "File upload management" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [{ bearerAuth: [] }],
    servers: [{ url: process.env.API_URL || `http://localhost:${PORT}` }],
  },
  // Ensure all route and controller files are scanned
  apis: [
    `${BUILD_DIR}/routes/*`,
    `${BUILD_DIR}/controllers/*`,
  ],
};

const swaggerSpec = swaggerJSDoc(options) as {
  tags?: Array<{ name: string; description?: string }>;
};

/** Ensures stable tag order in the spec (Swagger UI may still alpha-sort unless tagsSorter runs). */
function orderTagsAuthFirstInSpec(spec: { tags?: Array<{ name: string; description?: string }> }) {
  const tags = spec.tags;
  if (!tags?.length) {
    return;
  }
  const byName = new Map(tags.map((t) => [t.name, t] as const));
  const orderedNames = [...byName.keys()].sort((a, b) => {
    if (a === "Auth") {
      return -1;
    }
    if (b === "Auth") {
      return 1;
    }
    return a.localeCompare(b);
  });
  spec.tags = orderedNames.map((n) => byName.get(n)!);
}

orderTagsAuthFirstInSpec(swaggerSpec);

/**
 * Must be fully self-contained: swagger-ui-express embeds only this function in the browser.
 * A helper like `swaggerTagName()` would not exist there and causes "Could not render BaseLayout".
 */
function tagsSorterAuthFirst(a: unknown, b: unknown): number {
  function tagName(t: unknown): string {
    if (typeof t === "string") {
      return t;
    }
    if (t && typeof t === "object") {
      const o = t as { name?: unknown; get?: (k: string) => unknown };
      if (typeof o.name === "string") {
        return o.name;
      }
      if (typeof o.get === "function") {
        const n = o.get("name");
        if (typeof n === "string") {
          return n;
        }
      }
    }
    return String(t);
  }
  const na = tagName(a);
  const nb = tagName(b);
  if (na === "Auth") {
    return -1;
  }
  if (nb === "Auth") {
    return 1;
  }
  return na.localeCompare(nb);
}

export function setupSwagger(app: Express) {
  const swaggerUiOptions = {
    swaggerOptions: {
      tagsSorter: tagsSorterAuthFirst,
      operationsSorter: "alpha",
      persistAuthorization: true,
    },
  };

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));
}
