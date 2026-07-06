import { redirect } from "next/navigation";
import { getDashboardSession, getTelegramBotUsername, isDashboardAuthEnabled } from "../auth";
import { TelegramLoginButton } from "../components/TelegramLoginButton";

export default async function LoginPage() {
  if (!isDashboardAuthEnabled()) redirect("/");

  const session = await getDashboardSession();
  if (session) redirect("/");

  const botUsername = getTelegramBotUsername();

  return (
    <main className="login-shell">
      <section className="login-panel">
        <h1>Job Scraper</h1>
        <p>Sign in with Telegram to open the dashboard.</p>
        {botUsername ? (
          <TelegramLoginButton botUsername={botUsername} />
        ) : (
          <p className="error-text">Set NEXT_PUBLIC_TELEGRAM_BOT_USERNAME in the environment.</p>
        )}
      </section>
    </main>
  );
}
