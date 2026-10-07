import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { getJwtSecret } from "../utils/env";

/** Payload stored on `req.user` after `authenticateJWT` (from JWT `user` claim). */
export interface AuthenticatedUser {
  id: string;
  email?: string;
  name?: string;
  profileImageUrl?: string;
}

/** User id from the verified JWT only — never from params, query, or body. */
export function getAuthenticatedUserId(req: Request): string | null {
  const user = req.user as AuthenticatedUser | undefined;
  if (!user?.id || typeof user.id !== "string") {
    return null;
  }
  const id = user.id.trim();
  return id || null;
}

export const authenticateJWT = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.sendStatus(401);
  const token = authHeader.split(" ")[1];
  jwt.verify(
    token,
    getJwtSecret(),
    (err: any, user: any | JwtPayload | undefined) => {
      if (err) return res.sendStatus(403);
      req.user = (user as JwtPayload & { user?: AuthenticatedUser })?.user;
      next();
    }
  );
};
