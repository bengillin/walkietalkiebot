import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { createServer as createHttpsServer } from "https";
import { createServer as createHttpServer } from "http";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getSSLCerts, ensureWtbDir } from "./ssl.js";
import { api } from "./api.js";
import { initDb, closeDb } from "./db/index.js";
import * as conversationsRepo from "./db/repositories/conversations.js";
import * as messagesRepo from "./db/repositories/messages.js";
import { updateState } from "./state.js";
import { getNotificationDispatcher } from "./notifications/dispatcher.js";
import { MacOSNotificationChannel } from "./notifications/macos.js";
import { getJobManager } from "./jobs/manager.js";
import { authMiddleware, getAuthToken } from "./auth.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, "..", "dist");
const MAX_BODY_BYTES = Number(process.env.WTB_MAX_BODY_BYTES) || 50 * 1024 * 1024;
let server = null;
function startServer(port = 5173) {
  return new Promise((resolve, reject) => {
    if (!existsSync(distPath)) {
      reject(new Error(`dist/ not found at ${distPath}. Run 'npm run build' first.`));
      return;
    }
    try {
      initDb();
    } catch (err) {
      console.error("Failed to initialize database:", err);
      reject(err);
      return;
    }
    try {
      const convos = conversationsRepo.listConversations(1, 0);
      if (convos.length > 0) {
        const msgs = messagesRepo.getMessagesForConversation(convos[0].id);
        const stateMessages = msgs.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp
        }));
        const lastUser = msgs.filter((m) => m.role === "user").pop();
        const lastAssistant = msgs.filter((m) => m.role === "assistant").pop();
        updateState({
          messages: stateMessages,
          lastUserMessage: lastUser?.content || "",
          lastAssistantMessage: lastAssistant?.content || ""
        });
      }
    } catch {
    }
    const dispatcher = getNotificationDispatcher();
    dispatcher.register(new MacOSNotificationChannel());
    const jobManager = getJobManager();
    jobManager.init();
    const app = new Hono();
    app.use("*", authMiddleware);
    app.route("/api", api);
    app.use("/*", serveStatic({ root: distPath.replace(process.cwd(), ".") }));
    app.get("*", (c) => {
      const indexPath = join(distPath, "index.html");
      if (existsSync(indexPath)) {
        const html = readFileSync(indexPath, "utf-8");
        return c.html(html);
      }
      return c.text("Not found", 404);
    });
    ensureWtbDir();
    const certs = getSSLCerts();
    const protocol = certs ? "https" : "http";
    const handler = async (req, res) => {
      const url = new URL(req.url || "/", `${protocol}://localhost:${port}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          if (Array.isArray(value)) {
            value.forEach((v) => headers.append(key, v));
          } else {
            headers.set(key, value);
          }
        }
      }
      let body = null;
      if (req.method && ["POST", "PUT", "PATCH"].includes(req.method)) {
        const chunks = [];
        let total = 0;
        let tooLarge = false;
        for await (const chunk of req) {
          total += chunk.length;
          if (total > MAX_BODY_BYTES) {
            tooLarge = true;
            break;
          }
          chunks.push(chunk);
        }
        if (tooLarge) {
          req.destroy();
          res.writeHead(413, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "Payload too large" }));
          return;
        }
        body = Buffer.concat(chunks);
      }
      const request = new Request(url.toString(), {
        method: req.method || "GET",
        headers,
        body,
        // @ts-expect-error - Node.js specific
        duplex: "half"
      });
      const response = await app.fetch(request);
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        } finally {
          reader.releaseLock();
        }
      }
      res.end();
    };
    if (certs) {
      const serverOptions = { key: certs.key, cert: certs.cert };
      server = createHttpsServer(serverOptions, handler);
    } else {
      server = createHttpServer(handler);
    }
    server.listen(port, () => {
      const url = `${protocol}://localhost:${port}`;
      console.log(`Talkie server running at ${url}`);
      const authToken = getAuthToken();
      if (authToken) {
        console.log(`Auth enabled. Open the UI with: ${url}/?token=${authToken}`);
      }
      resolve();
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`Port ${port} is already in use`));
      } else {
        reject(err);
      }
    });
  });
}
async function stopServer() {
  closeDb();
  if (server) {
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
    server = null;
  }
}
function setupShutdownHandlers() {
  const shutdown = async (signal) => {
    console.log(`
Received ${signal}, shutting down gracefully...`);
    await stopServer();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
if (import.meta.url === `file://${process.argv[1]}`) {
  setupShutdownHandlers();
  const port = parseInt(process.env.PORT || "5173", 10);
  startServer(port).catch(console.error);
}
export {
  startServer,
  stopServer
};
