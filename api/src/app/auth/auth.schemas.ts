import { z } from "zod";

const LOGIN_MESSAGE = "Enter a valid email and password.";

export const loginBody = z.object({
  email: z.string({ error: LOGIN_MESSAGE }).trim().pipe(z.email({ error: LOGIN_MESSAGE })),
  password: z.string({ error: LOGIN_MESSAGE }).min(1, { error: LOGIN_MESSAGE }),
});

export const identity = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string().meta({ example: "Priya Sharma" }),
  role: z.enum(["author", "admin"]),
  authorId: z.uuid().nullable().meta({ description: "Null for admins." }),
});

export const okResult = z.object({ ok: z.literal(true) });
