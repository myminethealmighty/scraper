import {
  ensureSearchProfile,
  getPrisma,
  setProfileSources,
  setProfileTerms,
  upsertTelegramUser,
} from "@job-scraper/database";
import { getSupportedJobSources } from "@job-scraper/scraper-core";
import { type AppConfig, logger } from "@job-scraper/shared";

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

type TelegramCallbackQuery = {
  id: string;
  data?: string;
  from: TelegramUserPayload;
  message?: {
    message_id: number;
    chat: TelegramChat;
  };
};

type TelegramMessage = {
  message_id: number;
  text?: string;
  from?: TelegramUserPayload;
  chat: TelegramChat;
};

type TelegramUserPayload = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramChat = {
  id: number;
  type: string;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type InlineKeyboardMarkup = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

type ReplyKeyboardMarkup = {
  keyboard: Array<Array<{ text: string }>>;
  resize_keyboard: boolean;
  one_time_keyboard: boolean;
  is_persistent: boolean;
  input_field_placeholder?: string;
};

type TelegramReplyMarkup = InlineKeyboardMarkup | ReplyKeyboardMarkup;

const SOURCE_DONE = "sources:done";
const SOURCE_ALL = "sources:all";
const SOURCE_CLEAR = "sources:clear";
const TERMS_UPDATE = "terms:update";
const TERMS_KEEP = "terms:keep";

export function startTelegramBot(config: AppConfig) {
  if (!config.TELEGRAM_BOT_TOKEN) {
    logger.info("Telegram bot token not configured; bot listener disabled");
    return;
  }

  const bot = new TelegramBotPoller(config.TELEGRAM_BOT_TOKEN);
  bot.start();

  process.on("SIGTERM", () => bot.stop());
  process.on("SIGINT", () => bot.stop());
}

class TelegramBotPoller {
  private offset = 0;
  private stopped = false;
  private readonly awaitingTerms = new Set<number>();

  constructor(private readonly token: string) {}

  start() {
    logger.info("Starting Telegram bot listener");
    void this.deleteWebhook().finally(() => this.poll());
  }

  stop() {
    this.stopped = true;
  }

  private async poll(): Promise<void> {
    while (!this.stopped) {
      try {
        const updates = await this.getUpdates();

        for (const update of updates) {
          this.offset = Math.max(this.offset, update.update_id + 1);
          await this.handleUpdate(update);
        }
      } catch (error) {
        logger.error({ error }, "Telegram bot polling failed");
        await sleep(5000);
      }
    }
  }

  private async getUpdates(): Promise<TelegramUpdate[]> {
    const url = new URL(this.apiUrl("getUpdates"));
    url.searchParams.set("timeout", "25");
    url.searchParams.set(
      "allowed_updates",
      JSON.stringify(["message", "callback_query"]),
    );
    if (this.offset > 0) url.searchParams.set("offset", String(this.offset));

    const response = await fetch(url);
    const payload = (await response.json()) as TelegramApiResponse<
      TelegramUpdate[]
    >;

    if (!response.ok || !payload.ok) {
      throw new Error(
        payload.description ?? "Telegram getUpdates failed: " + response.status,
      );
    }

    return payload.result ?? [];
  }

  private async handleUpdate(update: TelegramUpdate) {
    if (update.callback_query) {
      await this.handleCallback(update.callback_query);
      return;
    }

    const message = update.message;
    if (!message?.text) return;

    const text = message.text.trim();
    if (text === "/start" || text.startsWith("/start ")) {
      await this.handleStart(message);
      return;
    }

    if (text === "🏠 Home" || text === "Home" || text === "/home" || text === "⬅️ Back" || text === "Back" || text === "/back") {
      await this.handleHome(message);
      return;
    }

    if (text === "🌐 Sources" || text === "/sources") {
      await this.showSourcesForMessage(message);
      return;
    }

    if (text === "🔎 Terms" || text === "/terms") {
      const profile = await this.upsertUserAndProfile(message.chat, message.from);
      await this.askForTerms(message.chat.id, profile.id);
      return;
    }

    if (text.startsWith("/")) {
      await this.sendMessage(
        message.chat.id,
        "Use /start to configure your job alerts.",
        this.buildReplyKeyboard("root"),
      );
      return;
    }

    if (this.awaitingTerms.has(message.chat.id)) {
      await this.saveTermsFromMessage(message, text);
      return;
    }

    await this.sendMessage(
      message.chat.id,
      "Choose Terms first, then send your search terms.",
      this.buildReplyKeyboard("root"),
    );
  }

  private async handleStart(message: TelegramMessage) {
    const profile = await this.upsertUserAndProfile(message.chat, message.from);
    this.awaitingTerms.delete(message.chat.id);

    logger.info(
      { chatId: message.chat.id, profileId: profile.id },
      "Telegram user started bot",
    );
    await this.sendMessage(
      message.chat.id,
      [
        "Welcome to Job Scraper.",
        "",
        "Use the menu below to update sources or search terms."
      ].join("\n"),
      this.buildReplyKeyboard("root"),
    );
    await this.sendSourceKeyboard(
      message.chat.id,
      profile.id,
      [
        "Step 1: choose the job portals you want to scrape.",
      ].join("\n"),
    );
  }

  private async handleCallback(callback: TelegramCallbackQuery) {
    const data = callback.data;
    const callbackMessage = callback.message;
    if (!data || !callbackMessage) return;

    const chat = callbackMessage.chat;
    const profile = await this.upsertUserAndProfile(chat, callback.from);

    if (data === SOURCE_ALL) {
      await setProfileSources(
        profile.id,
        getSupportedJobSources().map((source) => ({
          sourceKey: source.key,
          sourceName: source.name,
        })),
      );
      await this.answerCallback(callback.id, "All sources selected");
      await this.editSourceKeyboard(
        chat.id,
        callbackMessage.message_id,
        profile.id,
      );
      return;
    }

    if (data === SOURCE_CLEAR) {
      await setProfileSources(profile.id, []);
      await this.answerCallback(callback.id, "Sources cleared");
      await this.editSourceKeyboard(
        chat.id,
        callbackMessage.message_id,
        profile.id,
      );
      return;
    }

    if (data === SOURCE_DONE) {
      const selected = await this.getSelectedSourceKeys(profile.id);
      if (selected.size === 0) {
        await this.answerCallback(callback.id, "Choose at least one source");
        return;
      }

      await this.answerCallback(callback.id, "Sources saved");
      await this.askForTerms(chat.id, profile.id);
      return;
    }

    if (data === TERMS_UPDATE) {
      this.awaitingTerms.add(chat.id);
      await this.answerCallback(callback.id, "Send your search terms");
      await this.sendMessage(
        chat.id,
        [
          "Send roles, skills, or keywords separated by commas.",
          "",
          "Example:",
          "Frontend, Backend, Laravel, Sales, Driver",
        ].join("\n"),
        this.buildReplyKeyboard("terms"),
      );
      return;
    }

    if (data === TERMS_KEEP) {
      this.awaitingTerms.delete(chat.id);
      await this.answerCallback(callback.id, "Current terms kept");
      await this.sendMessage(
        chat.id,
        "Current search terms kept.",
        this.buildReplyKeyboard("root"),
      );
      return;
    }

    if (data.startsWith("source:")) {
      const sourceKey = data.slice("source:".length);
      const source = getSupportedJobSources().find(
        (item) => item.key === sourceKey,
      );
      if (!source) {
        await this.answerCallback(callback.id, "Unsupported source");
        return;
      }

      await this.toggleSource(profile.id, source.key, source.name);
      await this.answerCallback(callback.id, source.buttonText);
      await this.editSourceKeyboard(
        chat.id,
        callbackMessage.message_id,
        profile.id,
      );
    }
  }

  private async handleHome(message: TelegramMessage) {
    await this.upsertUserAndProfile(message.chat, message.from);
    this.awaitingTerms.delete(message.chat.id);
    await this.sendMessage(
      message.chat.id,
      "Choose an action from the menu below.",
      this.buildReplyKeyboard("root"),
    );
  }

  private async showSourcesForMessage(message: TelegramMessage) {
    const profile = await this.upsertUserAndProfile(message.chat, message.from);
    this.awaitingTerms.delete(message.chat.id);
    await this.sendSourceKeyboard(
      message.chat.id,
      profile.id,
      "Choose the job portals you want to watch.",
    );
  }

  private async saveTermsFromMessage(message: TelegramMessage, text: string) {
    const profile = await this.upsertUserAndProfile(message.chat, message.from);
    const selectedSources = await this.getSelectedSourceKeys(profile.id);

    if (selectedSources.size === 0) {
      await this.sendSourceKeyboard(
        message.chat.id,
        profile.id,
        "Choose at least one job portal first, then send your search terms.",
      );
      return;
    }

    const terms = parseTerms(text);
    if (terms.length === 0) {
      await this.askForTerms(message.chat.id, profile.id);
      return;
    }

    const savedTerms = await setProfileTerms(
      profile.id,
      terms.map((value) => ({ value, type: "KEYWORD" })),
    );

    await this.sendMessage(
      message.chat.id,
      [
        "Your job alert profile is saved.",
        "",
        "Search terms: " + savedTerms.map((term) => term.value).join(", "),
        "",
        "Use /sources to change portals or /terms to replace search terms.",
      ].join("\n"),
      this.buildReplyKeyboard("root"),
    );
    this.awaitingTerms.delete(message.chat.id);
  }

  private async askForTerms(chatId: number, profileId: string) {
    this.awaitingTerms.delete(chatId);
    const existingTerms = await this.getProfileTerms(profileId);
    const currentText = existingTerms.length > 0
      ? ["", "Current terms:", existingTerms.join(", ")]
      : [];

    await this.sendMessage(
      chatId,
      [
        "Search terms",
        ...currentText,
        "",
        "Choose whether to update them or leave them unchanged.",
      ].join("\n"),
      this.buildTermsKeyboard(),
    );
  }

  private async upsertUserAndProfile(
    chat: TelegramChat,
    from?: TelegramUserPayload,
  ) {
    const user = await upsertTelegramUser({
      chatId: chat.id,
      username: from?.username ?? chat.username ?? null,
      firstName: from?.first_name ?? chat.first_name ?? null,
      lastName: from?.last_name ?? chat.last_name ?? null,
    });

    return ensureSearchProfile(user.id);
  }

  private async toggleSource(
    profileId: string,
    sourceKey: string,
    sourceName: string,
  ) {
    const prisma = getPrisma();
    const existing = await prisma.searchSource.findUnique({
      where: { profileId_sourceKey: { profileId, sourceKey } },
    });

    if (existing?.enabled) {
      await prisma.searchSource.update({
        where: { id: existing.id },
        data: { enabled: false },
      });
      return;
    }

    await prisma.searchSource.upsert({
      where: { profileId_sourceKey: { profileId, sourceKey } },
      create: { profileId, sourceKey, sourceName, enabled: true },
      update: { sourceName, enabled: true },
    });
  }

  private async getSelectedSourceKeys(profileId: string): Promise<Set<string>> {
    const sources = await getPrisma().searchSource.findMany({
      where: { profileId, enabled: true },
      select: { sourceKey: true },
    });

    return new Set(sources.map((source) => source.sourceKey));
  }

  private async getProfileTerms(profileId: string): Promise<string[]> {
    const terms = await getPrisma().searchTerm.findMany({
      where: { profileId },
      orderBy: [{ type: "asc" }, { value: "asc" }],
      select: { value: true },
    });

    return terms.map((term) => term.value);
  }

  private async sendSourceKeyboard(
    chatId: number,
    profileId: string,
    text: string,
  ) {
    await this.sendMessage(
      chatId,
      text,
      await this.buildSourceKeyboard(profileId),
    );
  }

  private async editSourceKeyboard(
    chatId: number,
    messageId: number,
    profileId: string,
  ) {
    await this.editMessageText(
      chatId,
      messageId,
      "Choose the job portals you want to scrape.",
      await this.buildSourceKeyboard(profileId),
    );
  }

  private async buildSourceKeyboard(
    profileId: string,
  ): Promise<InlineKeyboardMarkup> {
    const selected = await this.getSelectedSourceKeys(profileId);
    const sourceButtons = getSupportedJobSources().map((source) => ({
      text: (selected.has(source.key) ? "[x] " : "[ ] ") + source.buttonText,
      callback_data: "source:" + source.key,
    }));

    const rows: InlineKeyboardMarkup["inline_keyboard"] = [];
    for (let index = 0; index < sourceButtons.length; index += 2) {
      rows.push(sourceButtons.slice(index, index + 2));
    }

    rows.push([
      { text: "Select all", callback_data: SOURCE_ALL },
      { text: "Clear", callback_data: SOURCE_CLEAR },
    ]);
    rows.push([{ text: "Done", callback_data: SOURCE_DONE }]);

    return { inline_keyboard: rows };
  }

  private buildReplyKeyboard(mode: "root" | "back" | "terms"): ReplyKeyboardMarkup {
    const keyboard = mode === "back"
      ? [[{ text: "🌐 Sources" }, { text: "🔎 Terms" }], [{ text: "⬅️ Back" }, { text: "🏠 Home" }]]
      : [[{ text: "🌐 Sources" }, { text: "🔎 Terms" }]];

    return {
      keyboard,
      resize_keyboard: true,
      one_time_keyboard: false,
      is_persistent: true,
      input_field_placeholder: mode === "terms" ? "Type search terms" : "Choose an option"
    };
  }

  private buildTermsKeyboard(): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: "Update", callback_data: TERMS_UPDATE },
          { text: "Leave current", callback_data: TERMS_KEEP },
        ],
      ],
    };
  }

  private async sendMessage(
    chatId: number,
    text: string,
    replyMarkup?: TelegramReplyMarkup,
  ) {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (replyMarkup) body.reply_markup = replyMarkup;

    const response = await fetch(this.apiUrl("sendMessage"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as TelegramApiResponse<unknown>;

    if (!response.ok || !payload.ok) {
      throw new Error(
        payload.description ??
          "Telegram sendMessage failed: " + response.status,
      );
    }
  }

  private async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    replyMarkup?: InlineKeyboardMarkup,
  ) {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text,
    };
    if (replyMarkup) body.reply_markup = replyMarkup;

    const response = await fetch(this.apiUrl("editMessageText"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as TelegramApiResponse<unknown>;

    if (!response.ok || !payload.ok) {
      throw new Error(
        payload.description ??
          "Telegram editMessageText failed: " + response.status,
      );
    }
  }

  private async answerCallback(callbackQueryId: string, text?: string) {
    const response = await fetch(this.apiUrl("answerCallbackQuery"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });

    if (!response.ok) {
      logger.warn(
        { status: response.status },
        "Telegram answerCallbackQuery failed",
      );
    }
  }

  private async deleteWebhook() {
    const response = await fetch(this.apiUrl("deleteWebhook"), {
      method: "POST",
    });
    const payload = (await response.json()) as TelegramApiResponse<boolean>;

    if (!response.ok || !payload.ok) {
      logger.warn(
        { description: payload.description },
        "Telegram webhook cleanup failed",
      );
      return;
    }

    logger.info("Telegram webhook disabled for polling mode");
  }

  private apiUrl(method: string) {
    return "https://api.telegram.org/bot" + this.token + "/" + method;
  }
}

function parseTerms(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\n,]+/)
        .map((term) => term.trim())
        .filter((term) => term.length > 0),
    ),
  ).slice(0, 25);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
