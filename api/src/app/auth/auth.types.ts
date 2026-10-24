import type { UserRole } from "../shared/jwt.js";

export type RequestAuth = {
  id: string;
  role: UserRole;
  authorId: string | null;
  // Access token expiry; the SSE stream closes at this time.
  expiresAt: Date;
};

export type PublicIdentity = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  authorId: string | null;
};

declare global {
  namespace Express {
    interface Request {
      auth?: RequestAuth;
    }
  }
}
