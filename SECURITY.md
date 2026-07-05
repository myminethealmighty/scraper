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

## Secrets And Scraping Safety

Never commit real values for:

- `DATABASE_URL`
- Telegram bot tokens
- Discord webhook URLs
- SSH private keys
- Cookies or session tokens
- Production `.env` files

The project intentionally prefers supported source adapters over arbitrary user-submitted URLs. If arbitrary URLs are added later, protect against SSRF by blocking localhost, private IP ranges, non-http protocols, and redirects to private addresses.
