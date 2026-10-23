import type { Request } from "express";
import { AppError } from "../shared/errors.js";
import {
  LOGIN_RATE_LIMIT,
  LOGIN_RATE_WINDOW_MS,
} from "./auth.constants.js";

const attempts = new Map<string, number[]>();

export function assertLoginRateLimit(req: Request) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter(
    (at) => now - at < LOGIN_RATE_WINDOW_MS,
  );
  if (recent.length >= LOGIN_RATE_LIMIT) {
    throw AppError.rateLimited();
  }
  recent.push(now);
  attempts.set(ip, recent);
}
