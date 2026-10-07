import { NextFunction, Request, Response } from "express";
import { getAuthenticatedUserId } from "./auth";
import { userService } from "../services/userService";

type Action = "read" | "write" | "delete";

function toSnakeCasePathSegment(s: string): string {
  return s.trim().toLowerCase().replace(/-/g, "_");
}

function actionFromMethod(method: string): Action | null {
  const m = method.toUpperCase();
  if (m === "GET") return "read";
  if (m === "POST" || m === "PUT" || m === "PATCH") return "write";
  if (m === "DELETE") return "delete";
  return null;
}

/** First path segment under /api/v1 (e.g. account-heads) and the rest of the path for sub-route rules. */
function getRouteContext(req: Request): { resource: string; subPath: string } | null {
  const original = (req.originalUrl ?? req.url ?? "").split("?")[0] ?? "";

  // Preferred: full path /api/v1/account-heads/...
  const fromOriginal = original.match(/^\/api\/v1\/([^/]+)(\/.*)?$/);
  if (fromOriginal) {
    return {
      resource: toSnakeCasePathSegment(fromOriginal[1]),
      subPath: fromOriginal[2] ?? "",
    };
  }

  // Global middleware on index router: baseUrl=/api/v1, path=/account-heads/...
  const baseUrl = (req.baseUrl ?? "").toString();
  const reqPath = (req.path ?? "").toString();
  if (baseUrl === "/api/v1" || baseUrl.endsWith("/api/v1")) {
    const trimmed = reqPath.replace(/^\//, "");
    const [first, ...rest] = trimmed.split("/").filter(Boolean);
    if (first) {
      return {
        resource: toSnakeCasePathSegment(first),
        subPath: rest.length ? `/${rest.join("/")}` : "",
      };
    }
  }

  // Nested router: baseUrl=/api/v1/account-heads, path=/ or /:id
  const mount = baseUrl.replace(/^\/api\/v1\/?/, "").replace(/^\//, "");
  const firstMount = mount.split("/").filter(Boolean)[0];
  if (firstMount) {
    return {
      resource: toSnakeCasePathSegment(firstMount),
      subPath: reqPath,
    };
  }

  return null;
}

function inferRequiredPrivilege(req: Request): string | null {
  const route = getRouteContext(req);
  if (!route) return null;

  const { resource, subPath: path } = route;
  const action = actionFromMethod(req.method);
  if (!action) return null;

  // Ensure every mounted router in src/routes/index.ts is represented here.
  const knownResources = new Set<string>([
    // RBAC / config
    "users",
    "app_roles",
    "privileges",
    "menus",

    // Accounting
    "banks",
    "account_groups",
    "account_heads",
    "account_subheads",
    "account_charts",
    "account_transactions",
    "default_subhead_settings",
    "default_account_settings",

    // Billing / school fees
    "billing_items",
    "concession_discounts",
    "class_default_billings",
    "student_billings",
    "student_concession_discounts",
    "temp_journal_transfers",

    // Inventory master data / ops
    "categories",
    "sub_categories",
    "brands",
    "uoms",
    "inventory_items",
    "suppliers",
    "purchases",
    "sales",
    "donations",
    "stores",
    "store_transfers",
    "inventory_receive_acknowledgements",
    "upload",

    // School domain
    "school_classes",
    "students",
    "sub_classes",
    "terms",
    "sessions",
    "active_period",
    "default_billing_period",
    "staff",

    // Projects / facilities / collections
    "projects",
    "project_collections",
    "facilities",
    "facility_collections",
    "cashiers",
    "student_collections",
    "staff_collections",

    // Access control helper routes
    "user_stores",
  ]);

  // Special-case “manage” endpoints where action is not simple CRUD.
  if (resource === "users") {
    if (path.includes("/privileges")) return "users.privileges.manage";
    if (path.includes("/roles")) return "users.roles.manage";
    return `users.${action}`;
  }

  if (resource === "app_roles") {
    if (path.includes("/privileges")) return "app_roles.privileges.manage";
    if (path.includes("/menus")) return "app_roles.menus.manage";
    return `app_roles.${action}`;
  }

  if (resource === "stores" && path.includes("/users")) {
    return "stores.users.manage";
  }

  // Privilege definitions are read-only via API.
  if (resource === "privileges") {
    return "privileges.read";
  }

  // Read-only catalogs
  if (resource === "banks" || resource === "account_groups" || resource === "account_heads") {
    return `${resource}.read`;
  }

  // Some routers only expose write endpoints
  if (resource === "inventory_receive_acknowledgements") {
    return "inventory_receive_acknowledgements.write";
  }
  if (resource === "upload") {
    return "upload.write";
  }

  if (!knownResources.has(resource)) {
    return null;
  }

  // Everything else follows resource.action
  return `${resource}.${action}`;
}

export async function requirePrivilege(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const required = inferRequiredPrivilege(req);
    if (!required) {
      return res.status(403).json({
        success: false,
        message: "Access denied (missing privilege mapping for this route)",
      });
    }

    const privileges = await userService.getUserPrivileges(userId);
    const has = privileges.some((p) => p.name === required);
    if (!has) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    return next();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Authorization failed";
    const status = message === "User not found" ? 404 : 500;
    return res.status(status).json({ success: false, message });
  }
}
