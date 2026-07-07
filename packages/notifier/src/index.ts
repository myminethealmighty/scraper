import { type AppConfig, logger } from "@job-scraper/shared";

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
    private readonly chatIds: string[],
    private readonly timeZone: string
  ) {}

  async notifyNewJobs(jobs: NotificationJob[]): Promise<void> {
    if (jobs.length === 0) return;

    if (this.chatIds.length === 0) {
      logger.warn("Telegram notifier has no recipients; skipping message");
      return;
    }

    const text = formatJobs(jobs, this.timeZone, "telegram");

    for (const chatId of this.chatIds) {
      const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true
        })
      });

      if (!response.ok) {
        throw new Error(`Telegram notification failed for chat ${chatId}: ${response.status} ${response.statusText}`);
      }
    }
  }
}

export class DiscordNotifier implements Notifier {
  constructor(
    private readonly webhookUrl: string,
    private readonly timeZone: string
  ) {}

  async notifyNewJobs(jobs: NotificationJob[]): Promise<void> {
    if (jobs.length === 0) return;

    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: formatJobs(jobs, this.timeZone, "plain") })
    });

    if (!response.ok) {
      throw new Error(`Discord notification failed: ${response.status} ${response.statusText}`);
    }
  }
}

export function createNotifier(config: AppConfig): Notifier {
  if (config.NOTIFIER_PROVIDER === "telegram") {
    if (!config.TELEGRAM_BOT_TOKEN) {
      logger.warn("Telegram notifier selected without TELEGRAM_BOT_TOKEN");
      return new NoopNotifier();
    }

    logger.warn("Telegram bot token is configured, but global chat IDs are disabled. Profile-based Telegram delivery should read recipients from the database.");
    return new TelegramNotifier(config.TELEGRAM_BOT_TOKEN, [], config.NOTIFIER_TIME_ZONE);
  }

  if (config.NOTIFIER_PROVIDER === "discord") {
    if (!config.DISCORD_WEBHOOK_URL) {
      logger.warn("Discord notifier selected without DISCORD_WEBHOOK_URL");
      return new NoopNotifier();
    }

    return new DiscordNotifier(config.DISCORD_WEBHOOK_URL, config.NOTIFIER_TIME_ZONE);
  }

  return new NoopNotifier();
}

function formatJobs(jobs: NotificationJob[], timeZone: string, format: "plain" | "telegram" = "plain"): string {
  const scrapeTime = formatScrapeTime(new Date(), timeZone);
  const lines = jobs.slice(0, 10).map((job) => formatJob(job, format));

  const suffix = jobs.length > 10 ? `\n\nAnd ${jobs.length - 10} more new jobs.` : "";
  return `New matching jobs found\nScrape time: ${scrapeTime}\n\n${lines.join("\n\n---\n\n")}${suffix}`;
}

function formatJob(job: NotificationJob, format: "plain" | "telegram"): string {
  const title = compactLine(job.title, format) || "Untitled job";
  const source = compactLine(job.source, format);
  const company = optionalLine(job.company, format);
  const location = optionalLine(job.location, format);
  const salary = optionalLine(job.salary, format);
  const techStack = formatTechStack(job.technologies, format);
  const companyLocation = formatCompanyLocation(company, location);

  return [
    source ? `${title} (${source})` : title,
    companyLocation,
    salary,
    techStack,
    format === "telegram" ? formatApplyLink(job.applyUrl) : job.applyUrl
  ]
    .filter(Boolean)
    .join("\n");
}

function formatCompanyLocation(company: string, location: string): string {
  if (company && location) return `${company} - ${location}`;
  return company || location;
}

function formatScrapeTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatTechStack(technologies: string[] | undefined, format: "plain" | "telegram"): string {
  if (!technologies || technologies.length === 0) return "";

  return Array.from(new Set(technologies.map((technology) => optionalLine(technology, format)).filter(Boolean))).slice(0, 12).join(" ");
}

function formatApplyLink(applyUrl: string): string {
  return `<a href="${escapeHtmlAttribute(applyUrl)}">🔗 Apply Here</a>`;
}

function optionalLine(value: string | null | undefined, format: "plain" | "telegram"): string {
  const line = compactLine(value, format);
  if (!line) return "";
  if (/^(unknown|n\/?a|none|null|salary not listed|tech stack not listed)$/i.test(line)) return "";
  return line;
}

function compactLine(value: string | null | undefined, format: "plain" | "telegram"): string {
  const line = value?.replace(/\s+/g, " ").trim() ?? "";
  return format === "telegram" ? escapeHtml(line) : line;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
