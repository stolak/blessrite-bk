import { Request, Response } from "express";
import { routeParam } from "./request";

export function httpStatusFromAssessmentMessage(message: string): number {
  const m = message.toLowerCase();
  if (m.includes("not found")) return 404;
  if (
    m.includes("already") ||
    m.includes("cannot delete") ||
    m.includes("cannot update") ||
    m.includes("cannot add") ||
    m.includes("locked") ||
    m.includes("referenced") ||
    m.includes("existing") ||
    m.includes("overlap")
  ) {
    return 409;
  }
  if (
    m.includes("invalid") ||
    m.includes("required") ||
    m.includes("cannot") ||
    m.includes("must") ||
    m.includes("exceed") ||
    m.includes("greater") ||
    m.includes("no active period")
  ) {
    return 400;
  }
  if (m.includes("only available to student") || m.includes("only available to parent") || m.includes("only available to staff") || m.includes("forbidden")) {
    return 403;
  }
  if (m.includes("unauthorized")) {
    return 401;
  }
  if (m.includes("no student profile") || m.includes("no staff profile")) {
    return 404;
  }
  return 500;
}

export function requireRouteId(req: Request, res: Response): string | null {
  const id = routeParam(req.params.id).trim();
  if (!id) {
    res.status(400).json({ success: false, message: "id is required" });
    return null;
  }
  return id;
}

export function handleAssessmentError(res: Response, error: unknown, fallback: string): Response {
  const message = error instanceof Error ? error.message : fallback;
  return res.status(httpStatusFromAssessmentMessage(message)).json({ success: false, message });
}
