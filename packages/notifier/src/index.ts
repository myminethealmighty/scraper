import { type AppConfig, logger } from "@job-aggregator/shared";

export type NotificationJob = {
  title: string;
  company: string;
  location: string;
  applyUrl: string;
  source: string;
};

export interface Notifier {
  notifyNewJobs(jobs: NotificationJob[]): Promise<void>;
}

export class NoopNotifier implements Notifier {
  async notifyNewJobs(): Promise<void> {
    return;
  }
}

export class TelegramNotifier implements Notifier {
  constructor(
    private readonly token: string,
    private readonly chatId: string
  ) {}

  async notifyNewJobs(jobs: NotificationJob[]): Promise<void> {
    if (jobs.length === 0) return;

    const text = formatJobs(jobs);
    const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: this.chatId,
        text,
        disable_web_page_preview: false
      })
    });

    if (!response.ok) {
      throw new Error(`Telegram notification failed: ${response.status} ${response.statusText}`);
    }
  }
}

export class DiscordNotifier implements Notifier {
  constructor(private readonly webhookUrl: string) {}

  async notifyNewJobs(jobs: NotificationJob[]): Promise<void> {
    if (jobs.length === 0) return;

    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: formatJobs(jobs) })
    });

    if (!response.ok) {
      throw new Error(`Discord notification failed: ${response.status} ${response.statusText}`);
    }
  }
}

export function createNotifier(config: AppConfig): Notifier {
  if (config.NOTIFIER_PROVIDER === "telegram") {
    if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) {
      logger.warn("Telegram notifier selected without TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
      return new NoopNotifier();
    }

    return new TelegramNotifier(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID);
  }

  if (config.NOTIFIER_PROVIDER === "discord") {
    if (!config.DISCORD_WEBHOOK_URL) {
      logger.warn("Discord notifier selected without DISCORD_WEBHOOK_URL");
      return new NoopNotifier();
    }

    return new DiscordNotifier(config.DISCORD_WEBHOOK_URL);
  }

  return new NoopNotifier();
}

function formatJobs(jobs: NotificationJob[]): string {
  const lines = jobs.slice(0, 10).map((job) =>
    [`${job.title} at ${job.company}`, `${job.location} - ${job.source}`, job.applyUrl].join("\n")
  );

  const suffix = jobs.length > 10 ? `\n\nAnd ${jobs.length - 10} more new jobs.` : "";
  return `New matching jobs found:\n\n${lines.join("\n\n")}${suffix}`;
}
