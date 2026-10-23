import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../shared/errors.js";
import { sendData } from "../shared/envelope.js";
import { REFRESH_COOKIE_NAME } from "./auth.constants.js";
import { assertLoginRateLimit } from "./login-rate-limit.js";
import {
  clearAuthCookies,
  getIdentity,
  login,
  revokeRefresh,
  rotateRefresh,
  setAuthCookies,
} from "./auth.service.js";

const loginBody = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function loginController(req: Request, res: Response) {
  assertLoginRateLimit(req);
  const parsed = loginBody.safeParse(req.body);
  if (!parsed.success) {
    throw AppError.validation("Please correct the highlighted fields.", {
      email: "Enter a valid email and password.",
    });
  }

  const result = await login(parsed.data.email, parsed.data.password);
  setAuthCookies(res, result.accessToken, result.refreshToken);
  sendData(res, result.identity);
}

export async function refreshController(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (typeof token !== "string" || token.length === 0) {
    throw AppError.unauthenticated("Authentication required.");
  }
  const next = await rotateRefresh(token);
  setAuthCookies(res, next.accessToken, next.refreshToken);
  sendData(res, { ok: true });
}

export async function logoutController(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  await revokeRefresh(typeof token === "string" ? token : undefined);
  clearAuthCookies(res);
  sendData(res, { ok: true });
}

export async function meController(req: Request, res: Response) {
  if (!req.auth) {
    throw AppError.unauthenticated("Authentication required.");
  }
  const identity = await getIdentity(req.auth.id);
  sendData(res, identity);
}
