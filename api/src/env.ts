import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().optional(),
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  SEED_AUTHOR_PASSWORD: z.string().min(1).optional(),
  SEED_ADMIN_PASSWORD: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

export function loadEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${message}`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

export function loadSeedEnv(): {
  DATABASE_URL: string;
  SEED_AUTHOR_PASSWORD: string;
  SEED_ADMIN_PASSWORD: string;
} {
  const schema = z.object({
    DATABASE_URL: z.string().min(1),
    SEED_AUTHOR_PASSWORD: z.string().min(1),
    SEED_ADMIN_PASSWORD: z.string().min(1),
  });
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      "Seed requires DATABASE_URL, SEED_AUTHOR_PASSWORD, and SEED_ADMIN_PASSWORD",
    );
  }
  return parsed.data;
}
