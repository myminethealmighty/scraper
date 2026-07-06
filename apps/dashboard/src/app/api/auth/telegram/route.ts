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
    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram login failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
