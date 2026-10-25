import { Router, type Router as ExpressRouter } from "express";
import { defineRoutes } from "../../openapi/define-route.js";
import {
  demoLoginController,
  loginController,
  logoutController,
  meController,
  refreshController,
  signupController,
} from "./auth.controller.js";
import { demoLoginBody, identity, loginBody, okResult, signupBody } from "./auth.schemas.js";
import { demoLoginsEnabled, selfServiceEnabled } from "../shared/flags.js";
import { loginRateLimit } from "./login-rate-limit.js";

export function createAuthRouter(): ExpressRouter {
  const router = Router();
  const route = defineRoutes(router, { basePath: "/api/v1", tag: "Auth" });

  route.post("/auth/login", {
    summary: "Sign in",
    description:
      "Checks email and password and sets the `bookleaf_access` (15 min) and `bookleaf_refresh` (7 days) HttpOnly cookies. Unknown email and wrong password return the same 401.",
    access: "public",
    middlewares: [loginRateLimit],
    body: loginBody,
    responses: {
      200: { description: "Signed in.", schema: identity },
      401: "Invalid email or password.",
      429: "More than 10 attempts in 15 minutes from this IP.",
    },
    handler: loginController,
  });

  route.post("/auth/refresh", {
    summary: "Refresh the session",
    description:
      "Reads the `bookleaf_refresh` cookie, revokes it, and sets a new access and refresh pair. The web client calls this once when any request returns 401.",
    access: "public",
    responses: {
      200: { description: "New cookies set.", schema: okResult },
      401: "Missing, expired, or revoked refresh token.",
    },
    handler: refreshController,
  });

  route.post("/auth/logout", {
    summary: "Sign out",
    description: "Revokes the refresh token and clears both cookies.",
    access: "user",
    responses: { 200: { description: "Signed out.", schema: okResult } },
    handler: logoutController,
  });

  route.get("/auth/me", {
    summary: "Current user",
    description: "The signed-in author or admin. Same shape as the login response.",
    access: "user",
    responses: { 200: { description: "Current user.", schema: identity } },
    handler: meController,
  });

  if (selfServiceEnabled()) {
    route.post("/auth/signup", {
      summary: "Create an author account (demo)",
      description:
        "Demo only, enabled by `DEMO_SELF_SERVICE=true`. Creates an author with no books and signs in (sets both cookies). Rate limited with login.",
      access: "public",
      middlewares: [loginRateLimit],
      body: signupBody,
      responses: {
        201: { description: "Created and signed in.", schema: identity },
        409: "An account with this email already exists.",
        429: "Too many attempts from this IP.",
      },
      handler: signupController,
    });
  }

  if (demoLoginsEnabled()) {
    route.post("/auth/demo-login", {
      summary: "One-click demo sign-in",
      description:
        "Demo only, enabled by `DEMO_LOGINS=true`. Signs in as a seeded account without a password: `priya` (author, ₹0.00 pending on one book), `sneha` (author, a book in production), or `admin`.",
      access: "public",
      body: demoLoginBody,
      responses: {
        200: { description: "Signed in.", schema: identity },
        404: "The demo account is not seeded.",
      },
      handler: demoLoginController,
    });
  }

  return router;
}
