import {
  ensureSearchProfile,
  getPrisma,
  scoreJobsForTelegramChat,
  setProfileSources,
  setProfileTerms,
  upsertResumeProfileForTelegramChat,
  upsertTelegramUser,
} from "@job-scraper/database";
import { getSupportedJobSources } from "@job-scraper/scraper-core";
import { type AppConfig, logger } from "@job-scraper/shared";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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
  document?: TelegramDocument;
  from?: TelegramUserPayload;
  chat: TelegramChat;
};

type TelegramDocument = {
  file_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
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

type TelegramFile = {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
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
  private readonly awaitingResume = new Set<number>();

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
    if (!message) return;

    if (message.document) {
      await this.handleDocumentMessage(message);
      return;
    }

    if (!message.text) return;

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

    if (text === "📄 Resume" || text === "/resume") {
      await this.askForResume(message.chat.id);
      return;
    }

    if (text === "Update" || text === "✏️ Update terms") {
      const profile = await this.upsertUserAndProfile(message.chat, message.from);
      this.awaitingResume.delete(message.chat.id);
      this.awaitingTerms.add(message.chat.id);
      await this.sendMessage(
        message.chat.id,
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

    if (text === "Leave current" || text === "✅ Leave current") {
      this.awaitingTerms.delete(message.chat.id);
      this.awaitingResume.delete(message.chat.id);
      await this.sendMessage(
        message.chat.id,
        "Current search terms kept.",
        this.buildMainKeyboard(),
      );
      return;
    }

    if (text === "Update resume" || text === "📎 Upload resume") {
      this.awaitingTerms.delete(message.chat.id);
      this.awaitingResume.add(message.chat.id);
      await this.sendMessage(
        message.chat.id,
        [
          "Upload your resume as a PDF file.",
          "",
          "How your data is stored:",
          "- The uploaded PDF file is not stored.",
          "- Raw resume text is extracted only for processing and is not stored.",
          "- Only detected skills, roles, locations, and matching keywords are saved for job matching.",
        ].join("\n"),
        this.buildReplyKeyboard("resume"),
      );
      return;
    }

    if (text.startsWith("/")) {
      await this.sendMessage(
        message.chat.id,
        "Use /start to configure your job alerts.",
        this.buildMainKeyboard(),
      );
      return;
    }

    if (this.awaitingResume.has(message.chat.id)) {
      await this.sendMessage(
        message.chat.id,
        "Please upload your resume as a PDF file. Pasted resume text is not accepted here.",
        this.buildReplyKeyboard("resume"),
      );
      return;
    }

    if (this.awaitingTerms.has(message.chat.id)) {
      await this.saveTermsFromMessage(message, text);
      return;
    }

    await this.sendMessage(
      message.chat.id,
      "Please choose an action from the keyboard buttons.",
      this.buildMainKeyboard(),
    );
  }

  private async handleStart(message: TelegramMessage) {
    const profile = await this.upsertUserAndProfile(message.chat, message.from);
    this.awaitingTerms.delete(message.chat.id);
    this.awaitingResume.delete(message.chat.id);

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
      this.buildMainKeyboard(),
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
    this.awaitingResume.delete(message.chat.id);
    await this.sendMessage(
      message.chat.id,
      "Choose an action from the menu below.",
      this.buildMainKeyboard(),
    );
  }

  private async showSourcesForMessage(message: TelegramMessage) {
    const profile = await this.upsertUserAndProfile(message.chat, message.from);
    this.awaitingTerms.delete(message.chat.id);
    this.awaitingResume.delete(message.chat.id);
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
      this.buildMainKeyboard(),
    );
    this.awaitingTerms.delete(message.chat.id);
  }

  private async handleDocumentMessage(message: TelegramMessage) {
    if (!this.awaitingResume.has(message.chat.id)) {
      await this.sendMessage(
        message.chat.id,
        "Choose Resume first, then upload your resume PDF.",
        this.buildMainKeyboard(),
      );
      return;
    }

    const document = message.document;
    if (!document) return;

    const fileName = document.file_name ?? "";
    const isPdf = document.mime_type === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      await this.sendMessage(
        message.chat.id,
        "Please upload a PDF resume file.",
        this.buildReplyKeyboard("resume"),
      );
      return;
    }

    await this.sendMessage(
      message.chat.id,
      "Reading your PDF resume...",
      this.buildReplyKeyboard("resume"),
    );

    try {
      const buffer = await this.downloadTelegramFile(document.file_id);
      const text = await extractPdfText(buffer);

      if (text.trim().length < 20) {
        await this.sendMessage(
          message.chat.id,
          "I could not extract enough text from this PDF. Please upload a text-based PDF resume.",
          this.buildReplyKeyboard("resume"),
        );
        return;
      }

      await this.saveResumeFromText(message, text);
    } catch (error) {
      logger.error({ error, chatId: message.chat.id }, "Telegram resume PDF processing failed");
      await this.sendMessage(
        message.chat.id,
        "Resume upload failed. Please try a text-based PDF file.",
        this.buildReplyKeyboard("resume"),
      );
    }
  }

  private async saveResumeFromText(message: TelegramMessage, text: string) {
    await this.upsertUserAndProfile(message.chat, message.from);
    const { parsed } = await upsertResumeProfileForTelegramChat(String(message.chat.id), text);
    const scores = await scoreJobsForTelegramChat(String(message.chat.id));
    const scoredJobs = scores.filter((score) => score.score > 0).length;

    await this.sendMessage(
      message.chat.id,
      [
        "Resume profile updated.",
        "",
        "Storage: your PDF file and raw resume text were not stored.",
        "Saved for matching: detected skills, roles, locations, and keywords.",
        "Skills: " + (parsed.skills.join(", ") || "None detected"),
        "Roles: " + (parsed.roles.join(", ") || "None detected"),
        "Locations: " + (parsed.locations.join(", ") || "None detected"),
        "Matched jobs: " + scoredJobs,
      ].join("\n"),
      this.buildMainKeyboard(),
    );
    this.awaitingResume.delete(message.chat.id);
  }

  private async askForTerms(chatId: number, profileId: string) {
    this.awaitingTerms.delete(chatId);
    this.awaitingResume.delete(chatId);
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

  private async askForResume(chatId: number) {
    this.awaitingTerms.delete(chatId);
    this.awaitingResume.add(chatId);
    await this.sendMessage(
      chatId,
      [
        "Resume matching",
        "",
        "Upload your resume as a PDF file.",
        "",
        "How your data is stored:",
        "- The uploaded PDF file is not stored.",
        "- Raw resume text is extracted only for processing and is not stored.",
        "- Only detected skills, roles, locations, and matching keywords are saved for job matching.",
      ].join("\n"),
      this.buildReplyKeyboard("resume"),
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

  private async downloadTelegramFile(fileId: string): Promise<Buffer> {
    const fileResponse = await fetch(this.apiUrl("getFile"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    const filePayload = (await fileResponse.json()) as TelegramApiResponse<TelegramFile>;

    if (!fileResponse.ok || !filePayload.ok || !filePayload.result?.file_path) {
      throw new Error(filePayload.description ?? "Telegram getFile failed: " + fileResponse.status);
    }

    const downloadResponse = await fetch(this.fileUrl(filePayload.result.file_path));
    if (!downloadResponse.ok) {
      throw new Error("Telegram file download failed: " + downloadResponse.status);
    }

    return Buffer.from(await downloadResponse.arrayBuffer());
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

  private buildReplyKeyboard(mode: "root" | "terms" | "resume"): ReplyKeyboardMarkup {
    const keyboard = mode === "terms"
      ? [
          [{ text: "✏️ Update terms" }, { text: "✅ Leave current" }],
          [{ text: "🌐 Sources" }, { text: "📄 Resume" }],
          [{ text: "🏠 Home" }],
        ]
      : mode === "resume"
        ? [
            [{ text: "🌐 Sources" }, { text: "🔎 Terms" }],
            [{ text: "🏠 Home" }],
          ]
        : [
            [{ text: "🌐 Sources" }, { text: "🔎 Terms" }],
            [{ text: "📄 Resume" }, { text: "🏠 Home" }],
          ];

    return {
      keyboard,
      resize_keyboard: true,
      one_time_keyboard: false,
      is_persistent: true,
      input_field_placeholder: mode === "terms" ? "Type search terms" : "Choose an option",
    };
  }

  private buildMainKeyboard(): ReplyKeyboardMarkup {
    return this.buildReplyKeyboard("root");
  }

  private buildTermsKeyboard(): ReplyKeyboardMarkup {
    return this.buildReplyKeyboard("terms");
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

  private fileUrl(filePath: string) {
    return "https://api.telegram.org/file/bot" + this.token + "/" + filePath;
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

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjsPath = resolvePdfJsFile("pdf.mjs");
  const workerPath = resolvePdfJsFile("pdf.worker.mjs");
  const importExternalPdfJs = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<{
    GlobalWorkerOptions: { workerSrc: string };
    getDocument: (options: { data: Uint8Array }) => {
      promise: Promise<{
        numPages: number;
        getPage: (pageNumber: number) => Promise<{
          getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
          cleanup: () => void;
        }>;
        destroy: () => Promise<void>;
      }>;
    };
  }>;
  const pdfjs = await importExternalPdfJs(pathToFileURL(pdfjsPath).href);

  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const document = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => item.str ?? "")
        .filter(Boolean)
        .join(" ");
      pages.push(text);
      page.cleanup();
    }

    return pages.join("\n\n");
  } finally {
    await document.destroy();
  }
}

function resolvePdfJsFile(fileName: string): string {
  const relativePath = join("node_modules", "pdfjs-dist", "legacy", "build", fileName);
  const candidates = [
    join(process.cwd(), relativePath),
    join(process.cwd(), "..", relativePath),
    join(process.cwd(), "..", "..", relativePath),
    join(process.cwd(), "..", "..", "..", relativePath),
  ];

  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) throw new Error("PDF parser files are not installed. Run npm install and restart the worker.");
  return match;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
