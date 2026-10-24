import type { NextFunction, Request, Response } from "express";
import { AppError } from "../shared/errors.js";
import { verifyAccess, type UserRole } from "../shared/jwt.js";
import { ACCESS_COOKIE_NAME } from "./auth.constants.js";
import "./auth.types.js";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[ACCESS_COOKIE_NAME];
  if (typeof token !== "string" || token.length === 0) {
    next(AppError.unauthenticated("Authentication required."));
    return;
  }

  try {
    const payload = verifyAccess(token);
    req.auth = {
      id: payload.sub,
      role: payload.role,
      authorId: payload.authorId,
      expiresAt: new Date(payload.exp * 1000),
    };
    next();
  } catch {
    next(AppError.unauthenticated("Authentication required."));
  }
}

export function requireRole(role: UserRole) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(AppError.unauthenticated("Authentication required."));
      return;
    }
    if (req.auth.role !== role) {
      next(AppError.forbidden());
      return;
    }
    next();
  };
}

export function requireAuthor(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }
    if (!req.auth || req.auth.role !== "author" || !req.auth.authorId) {
      next(AppError.forbidden());
      return;
    }
    next();
  });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }
    if (!req.auth || req.auth.role !== "admin") {
      next(AppError.forbidden());
      return;
    }
    next();
  });
}

export function requestAdmin(req: Request): { userId: string } {
  const auth = req.auth;
  if (!auth || auth.role !== "admin") {
    throw AppError.forbidden();
  }
  return { userId: auth.id };
}

export function requestAuthor(req: Request): { userId: string; authorId: string } {
  const auth = req.auth;
  if (!auth || auth.role !== "author" || !auth.authorId) {
    throw AppError.forbidden();
  }
  return { userId: auth.id, authorId: auth.authorId };
}
