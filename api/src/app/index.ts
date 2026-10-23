import express, { type Application } from "express";
import { errorHandler, notFoundHandler } from "./shared/error-handler.js";

export function createServerApplication(): Application {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    return res.json({ server: "ok" });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
