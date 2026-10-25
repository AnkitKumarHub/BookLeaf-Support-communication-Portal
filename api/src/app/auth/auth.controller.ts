import type { Request, Response } from "express";
import type { z } from "zod";
import type { ValidRequest } from "../../openapi/define-route.js";
import { AppError } from "../shared/errors.js";
import { sendData } from "../shared/envelope.js";
import { REFRESH_COOKIE_NAME } from "./auth.constants.js";
import type { demoLoginBody, loginBody, signupBody } from "./auth.schemas.js";
import {
  clearAuthCookies,
  demoLogin,
  getIdentity,
  login,
  revokeRefresh,
  rotateRefresh,
  setAuthCookies,
  signup,
} from "./auth.service.js";

export async function loginController(
  req: ValidRequest<{ body: z.output<typeof loginBody> }>,
  res: Response,
) {
  const result = await login(req.valid.body.email, req.valid.body.password);
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

export async function signupController(
  req: ValidRequest<{ body: z.output<typeof signupBody> }>,
  res: Response,
) {
  const result = await signup(req.valid.body);
  setAuthCookies(res, result.accessToken, result.refreshToken);
  sendData(res, result.identity, 201);
}

export async function demoLoginController(
  req: ValidRequest<{ body: z.output<typeof demoLoginBody> }>,
  res: Response,
) {
  const result = await demoLogin(req.valid.body.account);
  setAuthCookies(res, result.accessToken, result.refreshToken);
  sendData(res, result.identity);
}
