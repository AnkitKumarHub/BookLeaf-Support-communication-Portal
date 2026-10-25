import { z } from "zod";
import { pageQuery, uuid } from "../../openapi/common.js";

export const listBooksQuery = z.object({
  status: z.string({ error: "Enter a single text value." }).trim().optional().meta({
    description: "Exact status text, for example `Published & Live`. Omit for every status.",
  }),
  q: z.string({ error: "Enter a single text value." }).trim().optional().meta({ description: "Title contains." }),
  ...pageQuery,
});

export const bookParams = z.object({ bookId: uuid("book id") });
