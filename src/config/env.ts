import { config } from "dotenv";
import { z } from "zod";

config({
  path: process.env.NODE_ENV === "test" ? ".env.test" : ".env",
});
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),

  LAB_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const env = envSchema.parse(process.env);
