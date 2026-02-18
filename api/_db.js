import { MongoClient } from "mongodb";

let cachedClient = null;

/**
 * Return a connected MongoClient, reusing the cached connection
 * across warm serverless invocations.
 */
async function getClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }

  const client = new MongoClient(uri);
  await client.connect();
  cachedClient = client;
  return client;
}

/**
 * Return the default database for this project.
 */
export async function getDb() {
  const client = await getClient();
  return client.db("apmen-hook");
}
