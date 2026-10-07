/**
 * Express merges `Request` from `express-serve-static-core`.
 * Augmenting that module ensures `req.user` is typed everywhere (incl. ts-node).
 */
import type { AuthenticatedUser } from "../../middlewares/auth";

declare module "express-serve-static-core" {
  interface Request {
    /** Set by `authenticateJWT` after verifying the bearer token. */
    user?: AuthenticatedUser;
  }

  /**
   * Express 5 types path params as `string | string[]`; for normal route segments
   * the runtime value is always a single string.
   */
  interface ParamsDictionary {
    [key: string]: string;
  }
}

export {};
