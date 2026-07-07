import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SESSION_COOKIE = "job_scraper_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const TELEGRAM_LOGIN_MAX_AGE_SECONDS = 24 * 60 * 60;

export type TelegramDashboardSession = {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  authDate: number;
};

export type TelegramLoginPayload = {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
};

export function getTelegramBotUsername(): string | null {
  const username = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? process.env.TELEGRAM_BOT_USERNAME;
  return username ? username.replace(/^@/, "") : null;
}

export function isDashboardAuthEnabled(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export function getDashboardTelegramId(session: TelegramDashboardSession | null): string | undefined {
  return session?.id;
}

export async function getDashboardSession(): Promise<TelegramDashboardSession | null> {
  if (!isDashboardAuthEnabled()) return null;

  const cookieStore = await cookies();
  const sessionCookies = cookieStore.getAll(SESSION_COOKIE);

  for (const sessionCookie of sessionCookies) {
    const session = verifySessionCookie(sessionCookie.value);
    if (session) return session;
  }

  return null;
}

export async function requireDashboardAuth(): Promise<TelegramDashboardSession | null> {
  if (!isDashboardAuthEnabled()) return null;

  const session = await getDashboardSession();
  if (!session) redirect("/login");

  return session;
}

export async function requireApiAuth(): Promise<Response | null> {
  if (!isDashboardAuthEnabled()) return null;

  const session = await getDashboardSession();
  if (session) return null;

  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function setDashboardSession(session: TelegramDashboardSession): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, signSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  });
}

export async function clearDashboardSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export function verifyTelegramLogin(payload: TelegramLoginPayload): TelegramDashboardSession {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is required for Telegram login");
  }

  const authDate = Number(payload.auth_date);
  if (!Number.isFinite(authDate)) throw new Error("Invalid Telegram auth date");

  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (ageSeconds > TELEGRAM_LOGIN_MAX_AGE_SECONDS) throw new Error("Telegram login expired");

  const checkString = Object.entries(payload)
    .filter(([key, value]) => key !== "hash" && value !== undefined && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + "=" + value)
    .join("\n");

  const expectedHash = createHmac("sha256", telegramSecret()).update(checkString).digest("hex");
  if (!safeEqualHex(expectedHash, payload.hash)) throw new Error("Invalid Telegram login signature");

  return {
    id: payload.id,
    username: payload.username,
    firstName: payload.first_name,
    lastName: payload.last_name,
    photoUrl: payload.photo_url,
    authDate
  };
}

function signSession(session: TelegramDashboardSession): string {
  const encoded = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = createHmac("sha256", telegramSecret()).update(encoded).digest("base64url");
  return encoded + "." + signature;
}

function verifySessionCookie(value: string): TelegramDashboardSession | null {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;

  const expected = createHmac("sha256", telegramSecret()).update(encoded).digest("base64url");
  if (!safeEqual(expected, signature)) return null;

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TelegramDashboardSession;
  } catch {
    return null;
  }
}

function telegramSecret(): Buffer {
  return createHash("sha256").update(process.env.TELEGRAM_BOT_TOKEN ?? "").digest();
}

function safeEqualHex(a: string, b: string): boolean {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) return false;
  return safeEqual(a, b);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
