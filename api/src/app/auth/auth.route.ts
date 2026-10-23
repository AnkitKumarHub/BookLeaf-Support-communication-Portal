import { Router, type Router as ExpressRouter } from "express";
import {
  loginController,
  logoutController,
  meController,
  refreshController,
} from "./auth.controller.js";
import { requireAuth } from "./auth.middleware.js";

export function createAuthRouter(): ExpressRouter {
  const router = Router();

  router.post("/auth/login", loginController);
  router.post("/auth/refresh", refreshController);
  router.post("/auth/logout", requireAuth, logoutController);
  router.get("/auth/me", requireAuth, meController);

  return router;
}
