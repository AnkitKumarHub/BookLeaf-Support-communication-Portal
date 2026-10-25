import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Application } from "express";
import { loadEnv } from "../env.js";
import { inngestHandler } from "./ai/serve.js";
import { mountAdminRoutes } from "./admin/admin.module.js";
import { mountAuthRoutes } from "./auth/auth.module.js";
import { mountBooksRoutes } from "./books/books.module.js";
import { mountRealtimeRoutes } from "./realtime/realtime.module.js";
import { mountTicketsRoutes } from "./tickets/tickets.module.js";
import { mountUploadsRoutes } from "./uploads/uploads.module.js";
import { errorHandler, notFoundHandler } from "./shared/error-handler.js";

export function createServerApplication(): Application {
  const env = loadEnv();
  const app = express();

  app.use(cookieParser());
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      allowedHeaders: ["Content-Type", "X-CSRF-Token"],
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    return res.json({ server: "ok" });
  });

  app.use("/api/inngest", inngestHandler);

  mountAuthRoutes(app);
  mountBooksRoutes(app);
  mountTicketsRoutes(app);
  mountUploadsRoutes(app);
  mountAdminRoutes(app);
  mountRealtimeRoutes(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
