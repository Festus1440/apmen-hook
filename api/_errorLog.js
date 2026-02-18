import { ObjectId } from "mongodb";
import { getDb } from "./_db.js";

const COLLECTION = "errorLogs";

/**
 * Read the most recent error log entries (max 50).
 */
export async function getErrorLogs() {
  const db = await getDb();
  return db
    .collection(COLLECTION)
    .find()
    .sort({ timestamp: -1 })
    .limit(50)
    .toArray();
}

/**
 * Append a new error log entry with the raw HTML of a page
 * where no accept button could be found.
 * Returns the inserted document's _id as a string.
 */
export async function logError({ url, pageTitle, rawHtml, reason }) {
  const db = await getDb();
  const doc = {
    timestamp: new Date().toISOString(),
    url,
    pageTitle,
    reason,
    rawHtml,
  };

  const result = await db.collection(COLLECTION).insertOne(doc);
  return result.insertedId.toString();
}

/**
 * Get a single error log entry by its MongoDB ObjectId string.
 */
export async function getErrorLogById(id) {
  let objectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    return null;
  }

  const db = await getDb();
  return db.collection(COLLECTION).findOne({ _id: objectId });
}
