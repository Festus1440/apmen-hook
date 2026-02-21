# IMAP IDLE listener

Keeps an IMAP IDLE connection open and, on new email:

1. Fetches headers and body
2. If **subject** contains any of the configured keywords **and** **sender** is in the allowed list, extracts and logs the email content
3. Dedupes by Message-ID so reconnects don’t reprocess the same messages

Can be **run from the parent repo** or **hosted separately** with its own env and `package.json`.

### Run standalone (own env, deploy separately)

```bash
cd imaplisten
cp .env.example .env
# Edit .env: IMAP_HOST, IMAP_USER, IMAP_PASS, and optionally WEBHOOK_URL
npm install
npm start
```

### Run from parent repo

From project root (uses root `.env`): `npm run imaplisten` or `node imaplisten/service.js`. Stop with **Ctrl+C**.

---

## Config (environment)

| Variable | Required | Description |
|----------|----------|-------------|
| `IMAP_HOST` | Yes | IMAP host (e.g. `imap.gmail.com`) |
| `IMAP_USER` | Yes | Login user |
| `IMAP_PASS` | Yes | Password or app password |
| `IMAP_PORT` | No | Default `993` |
| `IMAP_MAILBOX` | No | Default `INBOX` |
| `IMAP_SUBJECT_KEYWORDS` | No | Comma-separated words; subject must contain at least one (case-insensitive). Empty = match all. |
| `IMAP_ALLOWED_SENDERS` | No | Comma-separated email addresses; sender must match one. Empty = match all. |
| `IMAP_DEDUPE_MAX` | No | Max Message-IDs to keep for dedupe (default `10000`) |
| `IMAP_DEBUG` | No | Set to `1` to enable IMAP debug logging |
| `WEBHOOK_URL` or `IMAP_WEBHOOK_URL` | No | When set, POST each matched email (subject + text/html body) to this URL, e.g. `https://your-server.com/api/webhook` |

Copy `.env.example` to `.env` and fill in required values.

---

## Zoho Mail

If your Zoho email/password works on the web but IMAP fails, do this:

### 1. Use the correct IMAP host

- **Personal** (`you@zoho.com`): `IMAP_HOST=imap.zoho.com`
- **Custom domain** (`you@yourdomain.com`): `IMAP_HOST=imappro.zoho.com`

### 2. Turn on IMAP in Zoho

1. Log in at [mail.zoho.com](https://mail.zoho.com)
2. **Settings** (gear) → **Mail Accounts** → click your email
3. Under **IMAP**, check **IMAP Access**
4. **Save**

### 3. Use an App Password (required if 2FA is on)

Zoho does **not** accept your normal password for IMAP when two-factor authentication is enabled. Use an app password:

1. Go to [accounts.zoho.com](https://accounts.zoho.com) and sign in
2. **My Account** → **Security** → **App Passwords**
3. **Generate New Password** → name it (e.g. “IMAP apmen”) → **Generate**
4. Copy the 16-character password and use it as `IMAP_PASS` in your `.env` (not your regular Zoho password)

### 4. Example `.env` for Zoho (personal)

```env
IMAP_HOST=imap.zoho.com
IMAP_PORT=993
IMAP_USER=yourname@zoho.com
IMAP_PASS=your_app_password_here
```
