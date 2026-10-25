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

const NAME_MESSAGE = "Use between 2 and 80 characters.";
const PASSWORD_MESSAGE = "Use at least 8 characters.";

export const signupBody = z.object({
  name: z.string({ error: NAME_MESSAGE }).trim().min(2, { error: NAME_MESSAGE }).max(80, { error: NAME_MESSAGE }),
  email: z.string({ error: "Enter a valid email." }).trim().pipe(z.email({ error: "Enter a valid email." })),
  password: z.string({ error: PASSWORD_MESSAGE }).min(8, { error: PASSWORD_MESSAGE }).max(200, { error: "Use at most 200 characters." }),
  phone: z.string().trim().max(30, { error: "Use at most 30 characters." }).optional(),
  city: z.string().trim().max(80, { error: "Use at most 80 characters." }).optional(),
});

export const demoLoginBody = z.object({
  account: z.enum(["priya", "sneha", "admin"], { error: "Choose priya, sneha, or admin." }),
});
