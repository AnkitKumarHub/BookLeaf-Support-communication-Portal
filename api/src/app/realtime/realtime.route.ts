import { Router, type Router as ExpressRouter } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { streamController } from "./realtime.controller.js";

export function createRealtimeRouter(): ExpressRouter {
  const router = Router();
  router.get("/stream", requireAuth, streamController);
  return router;
}
