import { NextResponse } from "next/server";
import { ensureSearchProfile, upsertTelegramUser } from "@job-scraper/database";
import { setDashboardSession, verifyTelegramLogin, type TelegramLoginPayload } from "../../../auth";

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries()) as TelegramLoginPayload;

  try {
    const session = verifyTelegramLogin(params);
    const user = await upsertTelegramUser({
      chatId: session.id,
      username: session.username ?? null,
      firstName: session.firstName ?? null,
      lastName: session.lastName ?? null
    });
    await ensureSearchProfile(user.id);
    await setDashboardSession(session);
    return NextResponse.redirect(publicUrl(request, "/"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram login failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

function publicUrl(request: Request, path: string): URL {
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        return new URL(path, url.origin);
      }
    } catch {
      // Fall back to forwarded headers below.
    }
  }

  const requestUrl = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? requestUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? (host.includes("localhost") ? requestUrl.protocol.replace(":", "") : "https");
  return new URL(path, proto + "://" + host);
}
