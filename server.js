/**
 * Standalone HTTP server for apmen-hook (always-on).
 *
 * GET  /api           — service info
 * GET  /api/webhook   — health check
 * POST /api/webhook   — webhook (email → parse → accept job)
 * GET  /api/logs      — error log list/detail (HTML or JSON)
 * GET  /api/success   — success route info
 * POST /api/success   — parse success (job-assigned) email and return job info
 */

import express from "express";
import { ALLOWED_ZIP_CODES, processWebhook } from "./api/webhook.js";
import { processSuccess } from "./api/success.js";
import logsHandler from "./api/logs.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "2mb" }));

// CORS for webhook and success (email webhooks)
const corsMiddleware = (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
};
app.use("/api/webhook", corsMiddleware);
app.use("/api/success", corsMiddleware);

app.get("/api", (req, res) => {
  res.json({
    name: "apmen-hook",
    version: "1.0.0",
    endpoints: {
      health: "GET  /api",
      webhook: "POST /api/webhook",
      success: "POST /api/success",
      logs: "GET  /api/logs",
    },
  });
});

app.get("/api/webhook", (req, res) => {
  res.json({
    status: "ok",
    message: "apmen-hook is running",
    allowedZipCodes: ALLOWED_ZIP_CODES,
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/webhook", async (req, res) => {
  const { statusCode, data } = await processWebhook(req.body);
  res.status(statusCode).json(data);
});

app.get("/api/logs", logsHandler);

app.get("/api/success", (req, res) => {
  res.json({ status: "ok", message: "POST success email here to parse job info" });
});
app.post("/api/success", async (req, res) => {
  const { statusCode, data } = await processSuccess(req.body);
  res.status(statusCode).json(data);
});

app.all("/api/webhook", (req, res) => {
  res.setHeader("Allow", "GET, POST, OPTIONS");
  res.status(405).json({
    status: "error",
    message: `Method ${req.method} not allowed`,
  });
});
app.all("/api/success", (req, res) => {
  res.setHeader("Allow", "GET, POST, OPTIONS");
  res.status(405).json({
    status: "error",
    message: `Method ${req.method} not allowed`,
  });
});

// 404 for unknown routes
app.use((req, res) => {
  res.status(404).json({ status: "error", message: "Not found" });
});

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`apmen-hook server running at http://localhost:${port}`);
    console.log(`  GET  /api         — service info`);
    console.log(`  GET  /api/webhook — health check`);
    console.log(`  POST /api/webhook — webhook`);
    console.log(`  GET  /api/logs    — error logs`);
    console.log(`  POST /api/success — parse success email`);
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`Port ${port} in use, trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      throw err;
    }
  });
}

startServer(PORT);
