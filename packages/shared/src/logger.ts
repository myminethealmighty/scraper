import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "DATABASE_URL",
      "TELEGRAM_BOT_TOKEN",
      "DISCORD_WEBHOOK_URL",
      "*.DATABASE_URL",
      "*.TELEGRAM_BOT_TOKEN",
      "*.DISCORD_WEBHOOK_URL"
    ],
    censor: "[redacted]"
  }
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
