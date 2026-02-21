/**
 * IMAP listen service config from environment.
 * Required: IMAP_HOST, IMAP_USER, IMAP_PASS
 * Optional: IMAP_PORT, IMAP_MAILBOX, IMAP_SUBJECT_KEYWORDS, IMAP_ALLOWED_SENDERS,
 *           WEBHOOK_URL or IMAP_WEBHOOK_URL (POST matched emails to this URL, e.g. http://localhost:3000/api/webhook)
 */

export function getImapListenConfig() {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "Missing IMAP env: set IMAP_HOST, IMAP_USER, IMAP_PASS (and optionally IMAP_SUBJECT_KEYWORDS, IMAP_ALLOWED_SENDERS)"
    );
  }

  const port = Number(process.env.IMAP_PORT) || 993;
  const mailbox = process.env.IMAP_MAILBOX || "INBOX";

  // Comma-separated → array, lowercase for matching
  const subjectKeywordsRaw = process.env.IMAP_SUBJECT_KEYWORDS || "";
  const subjectKeywords = subjectKeywordsRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const allowedSendersRaw = process.env.IMAP_ALLOWED_SENDERS || "";
  const allowedSenders = allowedSendersRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  // Optional: when set, IMAP listener POSTs each matched email to this URL (e.g. http://localhost:3000/api/webhook)
  const webhookUrl = (process.env.WEBHOOK_URL || process.env.IMAP_WEBHOOK_URL || "").trim() || null;

  return {
    imap: {
      host,
      port,
      secure: port === 993,
      auth: { user, pass },
      logger: process.env.IMAP_DEBUG === "1" ? console : false,
    },
    mailbox,
    subjectKeywords,
    allowedSenders,
    webhookUrl,
  };
}
