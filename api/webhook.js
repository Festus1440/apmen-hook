import * as cheerio from "cheerio";
import axios from "axios";
import { logError, logSuccess } from "./_errorLog.js";

/**
 * Allowed zip codes — only jobs in these areas will be auto-accepted.
 * Add or remove zip codes as needed.
 */

const ALLOWED_ZIP_CODES = ['60004', '60005', '60007', '60008', '60016', '60018', '60022', '60025', '60026', '60029', '60043', '60053', '60056', '60062', '60067', '60068', '60070', '60074', '60076', '60077', '60090', '60091', '60093', '60101', '60104', '60106', '60126', '60130', '60131', '60137', '60143', '60148', '60153', '60154', '60155', '60160', '60162', '60163', '60164', '60165', '60171', '60176', '60181', '60191', '60201', '60202', '60203', '60302', '60304', '60305', '60402', '60513', '60514', '60515', '60516', '60517', '60521', '60523', '60525', '60526', '60527', '60532', '60534', '60546', '60558', '60559', '60561', '60601', '60602', '60603', '60604', '60605', '60606', '60607', '60608', '60610', '60611', '60612', '60613', '60614', '60616', '60618', '60622', '60623', '60624', '60625', '60626', '60630', '60631', '60634', '60639', '60640', '60641', '60642', '60644', '60645', '60646', '60647', '60651', '60653', '60654', '60656', '60657', '60659', '60660', '60661', '60706', '60707', '60712', '60714', '60804'];

const ACCEPT_JOB_BASE_URL = "https://login.theappliancerepairmen.com/job/accept";


/**
 * Webhook business logic (used by Express routes in server.js).
 * Exports: ALLOWED_ZIP_CODES, processWebhook(body).
 */

export { ALLOWED_ZIP_CODES };

/**
 * Process an incoming webhook payload (email body). Returns { statusCode, data }.
 */
export async function processWebhook(body) {
  const subject = body?.subject || body?.Subject || "";
  const html = body?.html || body?.HtmlBody || "";

  console.log("========== WEBHOOK RECEIVED ==========");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Subject: ${subject}`);
  console.log(`HTML body length: ${html.length} chars`);

  if (!html) {
    console.log("RESULT: No HTML body — aborting.");
    return {
      statusCode: 400,
      data: { status: "error", message: "No HTML body found in the payload" },
    };
  }

  console.log("Parsing email HTML...");
  const { acceptUrl, zipCode, jobAddress, appliances } = parseEmailHtml(html);

  console.log(`Parsed — zipCode: ${zipCode}, jobAddress: ${jobAddress || "(none)"}, appliances: [${appliances.join(", ")}]`);
  console.log(`Parsed — acceptUrl: ${acceptUrl || "(not found)"}`);

  if (!acceptUrl) {
    console.log("RESULT: No Accept Job link found — skipping.");
    return {
      statusCode: 200,
      data: {
        status: "skipped",
        reason: "No Accept Job link found in the email",
        subject,
      },
    };
  }

  if (!zipCode || !ALLOWED_ZIP_CODES.includes(zipCode)) {
    console.log(`RESULT: Zip code ${zipCode} is NOT in the allowed list — skipping.`);
    return {
      statusCode: 200,
      data: {
        status: "skipped",
        reason: "Zip code not in allowed list",
        zipCode,
        allowedZipCodes: ALLOWED_ZIP_CODES,
        subject,
        appliances,
      },
    };
  }

  console.log(`Zip ${zipCode} is ALLOWED — proceeding to accept job...`);
  console.log(`Appliances: ${appliances.join(", ")}`);
  console.log("---------- VISITING ACCEPT URL ----------");

  try {
    const acceptResult = await visitAcceptLink(acceptUrl, { jobAddress });
    const finalOutcome = acceptResult.outcome || "unknown";
    console.log(`========== DONE — Final outcome: ${finalOutcome} ==========`);

    return {
      statusCode: 200,
      data: {
        status: finalOutcome === "accepted" ? "accepted" : "completed",
        subject,
        zipCode,
        jobAddress,
        appliances,
        acceptUrl,
        acceptResult,
        receivedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("========== WEBHOOK ERROR ==========");
    console.error("Webhook processing error:", error);
    return {
      statusCode: 500,
      data: {
        status: "error",
        message: "Internal server error",
        detail: error.message,
      },
    };
  }
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

/**
 * Visit the accept link. No further action is required — the page will show
 * "Job accepted!" or an error. We analyse the response and log any non-success as an incident.
 * Successes are logged too. jobAddress is included in all log entries.
 */
async function visitAcceptLink(url, { jobAddress } = {}) {
  try {
    console.log(`Visiting accept URL: ${url}`);

    const response = await axios.get(url, {
      maxRedirects: 5,
      timeout: 15000,
      headers: BROWSER_HEADERS,
    });

    const pageUrl = response.request?.res?.responseUrl || url;
    const $ = cheerio.load(response.data);
    const pageTitle = $("title").text().trim();
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    const bodyPreview = bodyText.slice(0, 500);

    console.log(`Response: HTTP ${response.status}, title: "${pageTitle}"`);
    console.log(`Final URL: ${pageUrl}`);
    console.log(`Body preview: ${bodyPreview.slice(0, 200)}...`);

    const lowerText = bodyText.toLowerCase();
    const isJobAccepted = /job\s+accepted\s*!?/i.test(bodyText);
    const alreadyTaken =
      lowerText.includes("already") ||
      lowerText.includes("taken") ||
      lowerText.includes("expired");

    let outcome = "unknown";
    if (isJobAccepted && !alreadyTaken) {
      outcome = "accepted";
      console.log(`Outcome: accepted ("Job accepted!" found)`);
    } else if (alreadyTaken) {
      outcome = "already_taken";
      console.log(`Outcome: already_taken`);
    } else {
      outcome = "error";
      console.log(`Outcome: error or unexpected page (no "Job accepted!" found)`);
    }

    // Log all non-success incidents so we have a record
    if (outcome !== "accepted") {
      const reason =
        outcome === "already_taken"
          ? "Job already taken or expired"
          : `Unexpected response: ${bodyPreview.slice(0, 200)}`;
      const errorId = await logError({
        url: pageUrl,
        pageTitle,
        rawHtml: $.html(),
        reason,
        jobAddress,
      });
      console.log(`Incident logged — id: ${errorId}, view: GET /api/logs?id=${errorId}&raw=1`);
      return {
        httpStatus: response.status,
        url: pageUrl,
        pageTitle,
        outcome,
        bodyPreview,
        errorLogId: errorId,
      };
    }

    // Log success
    const successId = await logSuccess({
      url: pageUrl,
      pageTitle,
      bodyPreview,
      jobAddress,
    });
    console.log(`Success logged — id: ${successId}`);

    return {
      httpStatus: response.status,
      url: pageUrl,
      pageTitle,
      outcome: "accepted",
      bodyPreview,
      successLogId: successId,
    };
  } catch (error) {
    const status = error.response?.status || null;
    const statusText = error.response?.statusText || error.message;
    console.error(`Accept URL failed: HTTP ${status} — ${statusText}`);

    // Log HTTP/network errors as incidents
    const errorId = await logError({
      url,
      pageTitle: "",
      rawHtml: "",
      reason: `Request failed: ${status || "network"} — ${statusText}`,
      jobAddress,
    });
    console.log(`Incident logged — id: ${errorId}`);

    return {
      httpStatus: status,
      outcome: "error",
      error: statusText,
      errorLogId: errorId,
    };
  }
}

/**
 * Extract the token (value starting with "ey") from an accept/decline URL.
 * The token is typically the last path segment. Returns null if not found.
 */
function extractTokenFromHref(href) {
  if (!href || typeof href !== "string") return null;
  const trimmed = href.trim();
  // Match path segment that starts with "ey" (JWT-style), until next / or ? or # or end
  const match = trimmed.match(/\/(ey[^/?#]+)(?:[/?#]|$)/);
  return match ? match[1] : null;
}

/**
 * Build the canonical accept URL from a token.
 */
function buildAcceptUrl(token) {
  if (!token || !token.startsWith("ey")) return null;
  return `${ACCEPT_JOB_BASE_URL}/${token}`;
}

/**
 * Parse the email HTML and extract:
 *  - acceptUrl:   built from token (ey...) found in Accept or Decline button href
 *  - zipCode:     5-digit zip from the Address line
 *  - jobAddress:  full address from the Address line (e.g. "1611 lacey ave, Lisle, Illinois 60532")
 *  - appliances:  list of appliance names from each service entry
 */
function parseEmailHtml(html) {
  console.log("---------- PARSING EMAIL HTML ----------");
  const $ = cheerio.load(html);

  let acceptUrl = null;
  let zipCode = null;
  let jobAddress = null;
  const appliances = [];
  let acceptHref = null;
  let declineHref = null;

  $("a").each((_i, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr("href") || "";
    if (/accept/i.test(text)) {
      acceptHref = href;
      console.log(`Parse — Found accept link: "${text}" -> ${acceptHref}`);
    } else if (/decline/i.test(text)) {
      declineHref = href;
      console.log(`Parse — Found decline link: "${text}" -> ${declineHref}`);
    }
  });

  // Prefer token from accept link, then decline link; build canonical accept URL
  const token = extractTokenFromHref(acceptHref) || extractTokenFromHref(declineHref);
  if (token) {
    acceptUrl = buildAcceptUrl(token);
    console.log(`Parse — Token extracted: "${token.slice(0, 20)}...", acceptUrl: ${acceptUrl}`);
  } else if (acceptHref) {
    acceptUrl = acceptHref;
    console.log(`Parse — No token found in accept/decline hrefs, using raw accept href`);
  }

  $("li").each((_i, el) => {
    const text = $(el).text().trim();

    if (/^Address:/i.test(text)) {
      console.log(`Parse — Address line: "${text}"`);
      jobAddress = text.replace(/^Address:\s*/i, "").trim() || null;
      if (jobAddress) console.log(`Parse — Job address: ${jobAddress}`);
      const zipMatch = text.match(/\b(\d{5})\b/);
      if (zipMatch) {
        zipCode = zipMatch[1];
        console.log(`Parse — Extracted zip code: ${zipCode}`);
      }
    }

    if (/^Appliance:/i.test(text)) {
      const value = text.replace(/^Appliance:\s*/i, "").trim();
      if (value) {
        appliances.push(value);
        console.log(`Parse — Found appliance: ${value}`);
      }
    }
  });

  if (!acceptUrl) console.log("Parse — No accept link found in email.");
  if (!zipCode) console.log("Parse — No zip code found in email.");
  if (!jobAddress) console.log("Parse — No job address found in email.");
  if (appliances.length === 0) console.log("Parse — No appliances found in email.");

  console.log(`Parse — Summary: zip=${zipCode}, jobAddress=${jobAddress || "(none)"}, appliances=[${appliances.join(", ")}], hasAcceptUrl=${!!acceptUrl}`);
  return { acceptUrl, zipCode, jobAddress, appliances };
}
