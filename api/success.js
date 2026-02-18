import * as cheerio from "cheerio";

/**
 * Parse success email HTML (job-assigned notification) and extract all job info.
 * Matches structure from sample-job-success.html: <li><b>Label:</b> value</li>
 * and h2 "a job has been assigned to {name}".
 */
export function parseSuccessEmail(html) {
  const $ = cheerio.load(html);
  const info = {
    assignedTo: null,
    address: null,
    roadDistance: null,
    referenceNo: null,
    appointmentDate: null,
    modeOfPayment: null,
    service: null,
    appliance: null,
    brand: null,
    model: null,
    symptom: null,
    problemDetail: null,
    serviceFee: null,
    jobType: null,
    dispatchTeam: null,
  };

  // "We would like to inform you that a job has been assigned to Festus Muberuka:"
  const h2Text = $("h2").first().text().trim();
  const assignedMatch = h2Text.match(/assigned to ([^:]+):?$/i);
  if (assignedMatch) {
    info.assignedTo = assignedMatch[1].trim();
  }

  const labelToKey = {
    "Address": "address",
    "Road Distance": "roadDistance",
    "Reference No": "referenceNo",
    "Reference No.": "referenceNo",
    "Appointment Date": "appointmentDate",
    "Mode of Payment": "modeOfPayment",
    "Service": "service",
    "Appliance": "appliance",
    "Brand": "brand",
    "Model": "model",
    "Symptom": "symptom",
    "Problem Detail": "problemDetail",
    "Problem Details": "problemDetail",
    "Service Fee": "serviceFee",
    "Job Type": "jobType",
    "Dispatch Team": "dispatchTeam",
  };

  $("li").each((_i, el) => {
    const text = $(el).text().trim();
    const boldPart = $(el).find("b").first().text().trim();
    if (!boldPart) return;

    const label = boldPart.replace(/:$/, "").trim();
    const key = labelToKey[label] || labelToKey[label + "."];
    if (!key) return;

    const value = text.replace(new RegExp("^" + escapeRegex(boldPart) + "\\s*"), "").trim();
    if (info[key] === undefined) return;
    info[key] = value || null;
  });

  return info;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Process an incoming success-email webhook payload. Returns { statusCode, data }.
 */
export async function processSuccess(body) {
  const subject = body?.subject || body?.Subject || "";
  const html = body?.html || body?.HtmlBody || "";

  if (!html) {
    return {
      statusCode: 400,
      data: {
        status: "error",
        message: "No HTML body found in the payload",
      },
    };
  }

  try {
    const jobInfo = parseSuccessEmail(html);
    return {
      statusCode: 200,
      data: {
        status: "ok",
        message: "Success email parsed",
        subject,
        receivedAt: new Date().toISOString(),
        job: jobInfo,
      },
    };
  } catch (error) {
    console.error("Success email parse error:", error);
    return {
      statusCode: 500,
      data: {
        status: "error",
        message: "Failed to parse success email",
        detail: error.message,
      },
    };
  }
}
