/**
 * IMAP IDLE service: keeps connection open, on new email fetches headers/body,
 * filters by subject keywords and allowed senders, dedupes, and logs.
 */

import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getImapListenConfig } from "./config.js";
import { SeenSet } from "./dedup.js";

const seen = new SeenSet(Number(process.env.IMAP_DEDUPE_MAX) || 10_000);

const RETRY_MAX = Number(process.env.IMAP_RETRY_MAX) || 5;
const RETRY_DELAY_MS = Number(process.env.IMAP_RETRY_DELAY_MS) || 5000;

function maskPass(pass) {
  if (!pass || pass.length === 0) return "(empty)";
  if (pass.length <= 2) return "**";
  return pass.slice(0, 1) + "*".repeat(Math.min(pass.length - 1, 8));
}

function getMessageId(message, uid, uidValidity) {
  const id = message.envelope?.messageId;
  if (id && typeof id === "string") return id.trim().toLowerCase();
  return `uid:${uid}:${uidValidity}`;
}

function subjectMatches(subject, keywords) {
  if (!keywords.length) return true;
  const s = (subject || "").toLowerCase();
  return keywords.some((kw) => s.includes(kw));
}

function senderMatches(fromAddresses, allowed) {
  if (!allowed.length) return true;
  const addrs = (fromAddresses || [])
    .map((a) => (typeof a === "string" ? a : a?.address)?.toLowerCase())
    .filter(Boolean);
  return addrs.some((addr) => allowed.some((a) => addr === a || addr.endsWith(`@${a}`)));
}

function logMatched(envelope, body) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] IMAP matched email`);
  console.log("  From:", envelope.from?.map((f) => f.address || f).join(", "));
  console.log("  To:", envelope.to?.map((t) => t.address || t).join(", "));
  console.log("  Subject:", envelope.subject);
  console.log("  Date:", envelope.date);
  console.log("  Message-ID:", envelope.messageId);
  const bodyPreviewLen = 200;
  if (body?.text) {
    const preview = body.text.trim().slice(0, bodyPreviewLen);
    console.log("  Body preview:", preview + (body.text.length > bodyPreviewLen ? "…" : ""));
  }
  if (body?.html && !body?.text) {
    const stripped = body.html.replace(/<[^>]+>/g, "").trim().slice(0, bodyPreviewLen);
    console.log("  Body preview:", stripped + (body.html.length > bodyPreviewLen ? "…" : ""));
  }
  console.log("  ---");
}

/**
 * If WEBHOOK_URL is set, POST the email payload to it (same shape as webhook API).
 * Uses body.text and/or body.html so the webhook can parse job offers.
 */
async function forwardToWebhook(envelope, body, webhookUrl) {
  if (!webhookUrl || typeof webhookUrl !== "string" || !webhookUrl.startsWith("http")) return;
  const payload = {
    subject: envelope.subject ?? "",
    Subject: envelope.subject ?? "",
    text: body?.text ?? "",
    TextBody: body?.text ?? "",
    html: body?.html ?? "",
    HtmlBody: body?.html ?? "",
  };
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log(`[IMAP] Webhook ${webhookUrl} → ${res.status}`, text.slice(0, 200));
  } catch (err) {
    console.error("[IMAP] Webhook POST failed:", err.message);
  }
}

async function processNewMessages(client, range, config) {
  const { subjectKeywords, allowedSenders, webhookUrl } = config;
  let messages;
  try {
    messages = await client.fetchAll(range, {
      envelope: true,
      source: true,
    });
  } catch (err) {
    console.error("Fetch new messages failed:", err.message);
    return;
  }

  for (const msg of messages) {
    const uid = msg.uid;
    const uidValidity = client.mailbox?.uidValidity ?? "";
    const messageId = getMessageId(msg, uid, uidValidity);

    if (seen.has(messageId)) continue;
    seen.add(messageId);

    const env = msg.envelope || {};
    const fromAddresses = env.from || [];
    const subject = env.subject || "";

    if (!subjectMatches(subject, subjectKeywords)) continue;
    if (!senderMatches(fromAddresses, allowedSenders)) continue;

    let body = {};
    try {
      if (msg.source) {
        const parsed = await simpleParser(msg.source);
        body = { text: parsed.text, html: parsed.html };
      }
    } catch (parseErr) {
      console.warn("Parse body failed for", messageId, parseErr.message);
    }

    logMatched(env, body);
    if (webhookUrl) await forwardToWebhook(env, body, webhookUrl);
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const config = getImapListenConfig();
  const { host, port, auth } = config.imap;
  const user = auth?.user ?? "(unknown)";
  const passDisplay = maskPass(auth?.pass);

  console.log("[IMAP] Starting IMAP listen service");
  console.log("[IMAP] Connecting to", host + ":" + port, "as", user, "(pass:", passDisplay + ")...");

  const client = new ImapFlow(config.imap);

  client.on("error", (err) => {
    console.error("[IMAP] Client error:", err.message);
  });

  client.on("close", () => {
    console.log("[IMAP] Connection closed.");
  });

  let connected = false;
  for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
    try {
      await client.connect();
      connected = true;
      console.log("[IMAP] Connected as", user + "@" + host);
      break;
    } catch (err) {
      console.error("[IMAP] Connect failed (attempt " + attempt + "/" + RETRY_MAX + "):", err.message);
      if (attempt < RETRY_MAX) {
        console.log("[IMAP] Retrying in", RETRY_DELAY_MS / 1000, "s...");
        await sleep(RETRY_DELAY_MS);
      } else {
        console.error("[IMAP] Max retries reached. Exiting.");
        process.exit(1);
      }
    }
  }

  if (!connected) process.exit(1);

  console.log("[IMAP] Opening mailbox:", config.mailbox, "...");

  let lock;
  for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
    try {
      lock = await client.getMailboxLock(config.mailbox);
      break;
    } catch (err) {
      console.error("[IMAP] Mailbox open failed (attempt " + attempt + "/" + RETRY_MAX + "):", err.message);
      if (attempt < RETRY_MAX) {
        console.log("[IMAP] Retrying in", RETRY_DELAY_MS / 1000, "s...");
        await sleep(RETRY_DELAY_MS);
      } else {
        console.error("[IMAP] Max retries reached. Exiting.");
        await client.logout();
        process.exit(1);
      }
    }
  }

  let lastCount = client.mailbox.exists;
  console.log("[IMAP] Mailbox opened. Message count:", lastCount, "| Dedupe set size:", seen.size);
  if (config.webhookUrl) {
    console.log("[IMAP] Webhook forwarding ON →", config.webhookUrl);
  } else {
    console.log("[IMAP] Webhook forwarding OFF (set WEBHOOK_URL or IMAP_WEBHOOK_URL to enable).");
  }
  console.log("[IMAP] Watching for new messages (Ctrl+C to stop).");

  client.on("exists", async (data) => {
    if (data.count <= lastCount) return;
    const range = `${lastCount + 1}:*`;
    try {
      await processNewMessages(client, range, config);
      lastCount = data.count;
    } catch (err) {
      console.error("exists handler error:", err.message);
    }
  });

  try {
    await new Promise((resolve, reject) => {
      process.on("SIGINT", resolve);
      process.on("SIGTERM", resolve);
      client.on("close", resolve);
      client.on("error", reject);
    });
  } finally {
    lock.release();
    await client.logout();
    console.log("[IMAP] Listen stopped.");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
