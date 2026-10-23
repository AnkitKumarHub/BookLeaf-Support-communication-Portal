import type { UserRole } from "../shared/jwt.js";

export type RequestAuth = {
  id: string;
  role: UserRole;
  authorId: string | null;
};

export type PublicIdentity = RequestAuth & {
  email: string;
};

declare global {
  namespace Express {
    interface Request {
      auth?: RequestAuth;
    }
  }
}
