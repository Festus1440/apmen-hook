/**
 * Test script: loads sample-job-offer.html and POSTs it to the webhook.
 * Run with: node test-webhook.js
 * Ensure the server is running first: npm run dev (or npm start)
 */

import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://localhost:3000/api/webhook";
const SAMPLE_HTML_PATH = join(__dirname, "sample-job-offer.html");

async function main() {
  console.log("Loading sample email HTML...");
  const html = await readFile(SAMPLE_HTML_PATH, "utf-8");
  console.log(`Read ${html.length} chars from ${SAMPLE_HTML_PATH}`);

  const payload = {
    subject: "New Job Offer - 1611 lacey ave, Lisle, Illinois 60532",
    html,
  };

  console.log(`POSTing to ${WEBHOOK_URL}...`);
  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  console.log(`Status: ${response.status}`);
  console.log("Response:", JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
