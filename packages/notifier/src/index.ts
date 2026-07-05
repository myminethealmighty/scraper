import { type AppConfig, logger } from "@job-aggregator/shared";

export type NotificationJob = {
  title: string;
  company: string;
  location: string;
  salary?: string | null;
  technologies?: string[];
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
  const scrapeTime = formatScrapeTime(new Date());
  const lines = jobs.slice(0, 10).map((job) => {
    const title = compactLine(job.title);
    const company = compactLine(job.company) || "Unknown";
    const location = compactLine(job.location) || "Unknown";
    const salary = compactLine(job.salary) || "Salary not listed";
    const techStack = formatTechStack(job.technologies);

    return [
      `${title} (${job.source})`,
      `${company} - ${location}`,
      salary,
      "",
      techStack,
      "",
      job.applyUrl
    ].join("\n");
  });

  const suffix = jobs.length > 10 ? `\n\nAnd ${jobs.length - 10} more new jobs.` : "";
  return `New matching jobs found\nScrape time: ${scrapeTime}\n\n${lines.join("\n\n")}${suffix}`;
}

function formatScrapeTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatTechStack(technologies: string[] | undefined): string {
  if (!technologies || technologies.length === 0) return "Tech stack not listed";

  return Array.from(new Set(technologies.map(compactLine).filter(Boolean))).slice(0, 12).join(" ");
}

function compactLine(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}
