import { redirect } from "next/navigation";

import {
  getDashboardSession,
  getTelegramBotUsername,
  isDashboardAuthEnabled,
} from "../auth";
import { TelegramLoginButton } from "../components/TelegramLoginButton";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!isDashboardAuthEnabled()) redirect("/");

  const session = await getDashboardSession();
  if (session) redirect("/");

  const botUsername = getTelegramBotUsername();

  return (
    <main className="login-shell">
      <section className="login-panel">
        <h1>Sign in</h1>
        {botUsername ? (
          <TelegramLoginButton botUsername={botUsername} />
        ) : (
          <p className="error-text">
            Set NEXT_PUBLIC_TELEGRAM_BOT_USERNAME in the environment.
          </p>
        )}
      </section>
    </main>
  );
}
