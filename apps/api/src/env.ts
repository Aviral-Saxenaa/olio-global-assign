import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  EMAIL_PROVIDER: z.enum(["console", "brevo"]).default("console"),
  EMAIL_FROM: z.string().min(1),
  BREVO_API_KEY: z.string().optional(),
  BREVO_WEBHOOK_SECRET: z.string().optional(),
  PORT: z.coerce.number().default(4000),
});

export const env = envSchema.parse(process.env);
