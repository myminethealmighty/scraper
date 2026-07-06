
# Security Policy

## Supported Versions

Job Scraper is currently pre-1.0. Security fixes are applied to the main branch.

## Reporting A Vulnerability

Please do not open a public issue for sensitive security reports.

Report privately by contacting the maintainer through GitHub or another trusted private channel. Include:

- A clear description of the issue.
- Steps to reproduce it.
- Affected files, routes, or commands if known.
- Any proof of concept that is safe to share.

## Secrets

Never commit real values for:

- `DATABASE_URL`
- Telegram bot tokens
- Discord webhook URLs
- SSH private keys
- Cookies or session tokens
- Production `.env` files

Use `.env.example` only for placeholders.

## Scraping Safety

The project intentionally uses supported source adapters instead of arbitrary user-submitted URLs. Telegram users choose from known source buttons, and the scraper maps those choices to registered adapters.

If arbitrary URLs are added later, protect against SSRF by blocking localhost, private IP ranges, link-local addresses, cloud metadata IPs, non-http protocols, and redirects to private addresses.

## Telegram Safety

- Rotate the bot token immediately if it is shared publicly.
- Only one worker should poll one Telegram bot token at a time.
- Dashboard Telegram login must verify the Telegram login signature before creating a session.
- Notification delivery should use saved profile recipients, not a global hardcoded chat ID.

## Database Safety

Prisma migrations should run with `prisma migrate deploy` in production. Do not manually edit `_prisma_migrations` unless intentionally repairing a migration state.
