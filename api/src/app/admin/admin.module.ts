import type { Application } from "express";
import { createAdminRouter } from "./admin.route.js";

export function mountAdminRoutes(app: Application) {
  app.use("/api/v1", createAdminRouter());
}
