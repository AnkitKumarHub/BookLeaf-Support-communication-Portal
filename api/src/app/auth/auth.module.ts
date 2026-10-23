import type { Application } from "express";
import { createAuthRouter } from "./auth.route.js";

export function mountAuthRoutes(app: Application) {
  app.use("/api/v1", createAuthRouter());
}
