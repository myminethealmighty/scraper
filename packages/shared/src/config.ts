import { z } from "zod";
import { loadEnvFromNearestFile } from "./env.js";

export const defaultKeywords = [
  "React",
  "Next.js",
  "Laravel",
  "PHP",
  "TypeScript",
  "Node.js",
  "Frontend",
  "Front End",
  "Backend",
  "Back End",
  "Full Stack",
  "Software Developer",
  "Software Engineer",
];

const boolish = z
  .string()
  .optional()
  .transform((value) => value !== "false");

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);

export const appConfigSchema = z.object({
  DATABASE_URL: z.string().url(),
  SCRAPER_KEYWORDS: z
    .string()
    .default(defaultKeywords.join(","))
    .transform((value) =>
      value
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    ),
  SCRAPER_CRON: z.string().default("0 12 * * *"),
  SCRAPER_TIME_ZONE: z.string().default("Asia/Yangon"),
  SCRAPER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  SCRAPER_RATE_LIMIT_MS: z.coerce.number().int().nonnegative().default(1200),
  SCRAPER_HEADLESS: boolish.default("true"),
  SCRAPER_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  SCRAPER_MAX_JOB_AGE_DAYS: z.coerce.number().int().positive().default(92),
  NOTIFIER_PROVIDER: z.enum(["none", "telegram", "discord"]).default("none"),
  NOTIFIER_TIMING: z.enum(["end", "source", "batch"]).default("batch"),
  NOTIFIER_BATCH_SIZE: z.coerce.number().int().positive().default(10),
  NOTIFIER_TIME_ZONE: z.string().default("Asia/Yangon"),
  TELEGRAM_BOT_TOKEN: optionalString,
  DISCORD_WEBHOOK_URL: optionalUrl,
  NEXT_PUBLIC_APP_NAME: z.string().default("Job Scraper"),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

let cachedConfig: AppConfig | null = null;

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  loadEnvFromNearestFile();

  if (!cachedConfig) {
    cachedConfig = appConfigSchema.parse(env);
  }

  return cachedConfig;
}
