import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, isNull, gt } from "drizzle-orm";
import type { Response } from "express";
import { db } from "../../db/index.js";
import { refreshTokens, users } from "../../db/schema.js";
import { AppError } from "../shared/errors.js";
import { signAccess, signRefresh, verifyRefresh } from "../shared/jwt.js";
import {
  ACCESS_COOKIE_MAX_AGE_MS,
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_MAX_AGE_MS,
  REFRESH_COOKIE_NAME,
} from "./auth.constants.js";
import type { PublicIdentity } from "./auth.types.js";

const INVALID_LOGIN = "Invalid email or password.";

function jwtCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "none" as const,
    path: "/",
    maxAge,
  };
}

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
) {
  res.cookie(ACCESS_COOKIE_NAME, accessToken, jwtCookieOptions(ACCESS_COOKIE_MAX_AGE_MS));
  res.cookie(
    REFRESH_COOKIE_NAME,
    refreshToken,
    jwtCookieOptions(REFRESH_COOKIE_MAX_AGE_MS),
  );
}

export function clearAuthCookies(res: Response) {
  const options = {
    httpOnly: true,
    secure: true,
    sameSite: "none" as const,
    path: "/",
  };
  res.clearCookie(ACCESS_COOKIE_NAME, options);
  res.clearCookie(REFRESH_COOKIE_NAME, options);
}

async function issueTokenPair(user: {
  id: string;
  role: "author" | "admin";
  authorId: string | null;
}) {
  const jti = randomUUID();
  const accessToken = signAccess(user);
  const refreshToken = signRefresh(user.id, jti);
  const expiresAt = new Date(Date.now() + REFRESH_COOKIE_MAX_AGE_MS);
  await db.insert(refreshTokens).values({
    userId: user.id,
    jti,
    expiresAt,
  });
  return { accessToken, refreshToken };
}

export async function login(
  email: string,
  password: string,
): Promise<{ identity: PublicIdentity; accessToken: string; refreshToken: string }> {
  const normalized = email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);

  const passwordOk = user
    ? await bcrypt.compare(password, user.passwordHash)
    : false;

  if (!user || !passwordOk || user.disabledAt) {
    if (!user) {
      await bcrypt.hash(password, 12);
    }
    throw AppError.unauthenticated(INVALID_LOGIN);
  }

  const identity: PublicIdentity = {
    id: user.id,
    email: user.email,
    role: user.role,
    authorId: user.authorId,
  };
  const tokens = await issueTokenPair(identity);
  return { identity, ...tokens };
}

export async function rotateRefresh(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefresh(refreshToken);
  } catch {
    throw AppError.unauthenticated("Authentication required.");
  }

  const now = new Date();
  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.jti, payload.jti),
        eq(refreshTokens.userId, payload.sub),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, now),
      ),
    )
    .limit(1);

  if (!row) {
    throw AppError.unauthenticated("Authentication required.");
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (!user || user.disabledAt) {
    throw AppError.unauthenticated("Authentication required.");
  }

  const next = await db.transaction(async (tx) => {
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.jti, payload.jti));

    const jti = randomUUID();
    const accessToken = signAccess({
      id: user.id,
      role: user.role,
      authorId: user.authorId,
    });
    const nextRefresh = signRefresh(user.id, jti);
    await tx.insert(refreshTokens).values({
      userId: user.id,
      jti,
      expiresAt: new Date(Date.now() + REFRESH_COOKIE_MAX_AGE_MS),
    });
    return { accessToken, refreshToken: nextRefresh };
  });

  return next;
}

export async function revokeRefresh(refreshToken: string | undefined) {
  if (!refreshToken) return;
  try {
    const payload = verifyRefresh(refreshToken);
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(refreshTokens.jti, payload.jti), isNull(refreshTokens.revokedAt)),
      );
  } catch {
    return;
  }
}

export async function getIdentity(userId: string): Promise<PublicIdentity> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || user.disabledAt) {
    throw AppError.unauthenticated("Authentication required.");
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    authorId: user.authorId,
  };
}
