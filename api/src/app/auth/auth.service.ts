import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, isNull, gt, sql } from "drizzle-orm";
import type { Response } from "express";
import { db } from "../../db/index.js";
import { admins, authors, refreshTokens, users } from "../../db/schema.js";
import { AppError } from "../shared/errors.js";
import { signAccess, signRefresh, verifyRefresh } from "../shared/jwt.js";
import {
  ACCESS_COOKIE_MAX_AGE_MS,
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_MAX_AGE_MS,
  REFRESH_COOKIE_NAME,
} from "./auth.constants.js";
import type { PublicIdentity } from "./auth.types.js";
import { DEMO_ACCOUNTS, type DemoAccount } from "./demo-accounts.js";

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

  const tokens = await issueTokenPair(user);
  const identity = await getIdentity(user.id);
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

// The only builder of the identity object, so login and me always return the same shape.
export async function getIdentity(userId: string): Promise<PublicIdentity> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      authorId: users.authorId,
      disabledAt: users.disabledAt,
      authorName: authors.name,
      adminName: admins.name,
    })
    .from(users)
    .leftJoin(authors, eq(users.authorId, authors.id))
    .leftJoin(admins, eq(users.adminId, admins.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || user.disabledAt) {
    throw AppError.unauthenticated("Authentication required.");
  }

  return {
    id: user.id,
    email: user.email,
    name: user.authorName ?? user.adminName ?? user.email,
    role: user.role,
    authorId: user.authorId,
  };
}

type SessionResult = { identity: PublicIdentity; accessToken: string; refreshToken: string };

// Demo self-service: creates an author profile (no books yet) and its login,
// then signs in. Only reachable when DEMO_SELF_SERVICE=true.
export async function signup(input: {
  name: string;
  email: string;
  password: string;
  phone?: string | undefined;
  city?: string | undefined;
}): Promise<SessionResult> {
  const email = input.email.trim().toLowerCase();
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  if (taken) {
    throw AppError.conflict("An account with this email already exists.", {
      email: "An account with this email already exists.",
    });
  }
  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await db.transaction(async (tx) => {
    const [author] = await tx
      .insert(authors)
      .values({
        sourceId: `SIGNUP-${randomUUID().slice(0, 8).toUpperCase()}`,
        name: input.name,
        email,
        phone: input.phone || null,
        city: input.city || null,
        joinedDate: new Date().toISOString().slice(0, 10),
      })
      .returning({ id: authors.id });
    if (!author) throw AppError.internal();
    const [created] = await tx
      .insert(users)
      .values({ email, passwordHash, role: "author", authorId: author.id })
      .returning({ id: users.id, role: users.role, authorId: users.authorId });
    if (!created) throw AppError.internal();
    return created;
  });

  const tokens = await issueTokenPair(user);
  return { identity: await getIdentity(user.id), ...tokens };
}

// One-click sign-in for the demo buttons. Only reachable when DEMO_LOGINS=true.
export async function demoLogin(account: DemoAccount): Promise<SessionResult> {
  const [user] = await db
    .select({ id: users.id, role: users.role, authorId: users.authorId, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.email, DEMO_ACCOUNTS[account]))
    .limit(1);
  if (!user || user.disabledAt) {
    throw AppError.notFound("That demo account is not seeded. Run pnpm db:reset.");
  }
  const tokens = await issueTokenPair(user);
  return { identity: await getIdentity(user.id), ...tokens };
}
