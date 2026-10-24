import type { Application } from "express";
import { createRealtimeRouter } from "./realtime.route.js";

export function mountRealtimeRoutes(app: Application) {
  app.use("/api/v1", createRealtimeRouter());
}
