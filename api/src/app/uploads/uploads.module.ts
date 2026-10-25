import type { Application } from "express";
import { createUploadsRouter } from "./uploads.route.js";

export function mountUploadsRoutes(app: Application) {
  app.use("/api/v1", createUploadsRouter());
}
