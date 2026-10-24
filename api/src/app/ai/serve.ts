import { serve } from "inngest/express";
import { aiFunctions } from "./functions.js";
import { inngest } from "./inngest.js";

export const inngestHandler = serve({
  client: inngest,
  functions: aiFunctions,
});
