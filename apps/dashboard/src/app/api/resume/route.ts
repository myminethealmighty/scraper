import { NextResponse } from "next/server";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ensureSearchProfile,
  getResumeProfileForTelegramChat,
  scoreJobsForTelegramChat,
  upsertResumeProfileForTelegramChat,
  upsertTelegramUser,
} from "@job-scraper/database";
import { requireApiAuth, requireDashboardAuth } from "../../auth";

export const runtime = "nodejs";

const nodeRequire = createRequire(import.meta.url);

export async function GET() {
  const unauthorized = await requireApiAuth();
  if (unauthorized) return unauthorized;

  const session = await requireDashboardAuth();
  const telegramId = session?.id;
  if (!telegramId) return NextResponse.json({ resume: null });

  return NextResponse.json({ resume: await getResumeProfileForTelegramChat(telegramId) });
}

export async function POST(request: Request) {
  const unauthorized = await requireApiAuth();
  if (unauthorized) return unauthorized;

  const session = await requireDashboardAuth();
  const telegramId = session?.id;
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureLocalResumeUser(telegramId);

  let resumeText = "";
  try {
    resumeText = await getResumeText(request);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }

  if (resumeText.trim().length < 20) {
    return NextResponse.json(
      { error: "Could not extract enough text from this PDF. Please try a text-based PDF resume." },
      { status: 400 },
    );
  }

  const { parsed } = await upsertResumeProfileForTelegramChat(telegramId, resumeText);
  const scores = await scoreJobsForTelegramChat(telegramId);

  return NextResponse.json({
    parsed,
    scoredJobs: scores.filter((score) => score.score > 0).length,
    privacy: "Raw resume text and uploaded files are not stored.",
  });
}

async function ensureLocalResumeUser(telegramId: string) {
  if (telegramId !== "local-dev") return;

  const user = await upsertTelegramUser({
    chatId: telegramId,
    username: "local-dev",
    firstName: "Local",
  });
  await ensureSearchProfile(user.id);
}

async function getResumeText(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("resume");

    if (file instanceof File && file.size > 0) {
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        return extractPdfText(Buffer.from(await file.arrayBuffer()));
      }

      throw new Error("Only PDF resume uploads are supported");
    }

    return "";
  }

  const body = await request.json().catch(() => ({}));
  return typeof body.resumeText === "string" ? body.resumeText : "";
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjsPath = resolvePdfJsFile("pdf.mjs");
  const workerPath = resolvePdfJsFile("pdf.worker.mjs");
  const importExternalPdfJs = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<any>;
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
        .map((item: { str?: string }) => item.str ?? "")
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
  if (!match) throw new Error("PDF parser files are not installed. Run npm install and restart the dashboard.");
  return match;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Unable to read this PDF resume";
}
