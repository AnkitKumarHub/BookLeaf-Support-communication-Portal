// express ka handler bnaya hai jo mere routes handle karega
import express, { type Application } from "express";

export function createServerApplication(): Application {
  const app = express();

  //#region //#============      ROUTES     =================
  app.get("/health", function (req, res) {
    return res.json({ server: "ok" });
  });
 
  //#endregion //#==========      ROUTES     ================
  return app;
}
