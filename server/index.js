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
import { authMiddleware, getAuthToken, hasValidCredentials } from "./auth.js";
import { assertSafeBind, isLoopbackHost, requestGuard, resolveBindHosts } from "./security.js";
import { createLogger } from "./logger.js";
const log = createLogger("server");
const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, "..", "dist");
const MAX_BODY_BYTES = Number(process.env.WTB_MAX_BODY_BYTES) || 50 * 1024 * 1024;
let servers = [];
function startServer(port = 5173) {
  return new Promise((resolve, reject) => {
    const hosts = resolveBindHosts();
    try {
      hosts.forEach(assertSafeBind);
    } catch (err) {
      reject(err);
      return;
    }
    if (!existsSync(distPath)) {
      reject(new Error(`dist/ not found at ${distPath}. Run 'npm run build' first.`));
      return;
    }
    try {
      initDb();
    } catch (err) {
      log.error("Failed to initialize database:", err);
      reject(err);
      return;
    }
    try {
      const [mostRecent] = conversationsRepo.listConversations(1, 0);
      if (mostRecent) {
        const msgs = messagesRepo.getMessagesForConversation(mostRecent.id);
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
    app.use("*", requestGuard);
    app.use("*", authMiddleware);
    app.route("/api", api);
    app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));
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
    const handleRequest = async (req, res) => {
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
        if (!hasValidCredentials(req.headers.authorization, req.headers.cookie)) {
          req.resume();
          res.writeHead(401, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }
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
        body = chunks.length > 0 ? Buffer.concat(chunks) : null;
      }
      const request = new Request(url.toString(), {
        method: req.method || "GET",
        headers,
        body,
        // Node-specific; present in @types/node, so no suppression needed.
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
    const handler = (req, res) => {
      handleRequest(req, res).catch((err) => {
        log.error("Request failed:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        } else {
          res.destroy();
        }
      });
    };
    const createServer = () => certs ? createHttpsServer({ key: certs.key, cert: certs.cert }, handler) : createHttpServer(handler);
    listenAll(createServer, port, hosts).then((bound) => {
      servers = bound;
      const loopback = hosts.every(isLoopbackHost);
      const shownHost = loopback ? "localhost" : hosts[0];
      const url = `${protocol}://${shownHost}:${port}`;
      log.info(`Talkie server running at ${url}`);
      if (!loopback) {
        log.info(
          `Listening on ${hosts.join(", ")}, so other machines can reach it. Auth is required.`
        );
      }
      if (getAuthToken()) {
        log.info(`Auth enabled. Sign in once with: ${url}/?token=<your WTB_AUTH_TOKEN>`);
      }
      resolve();
    }).catch(reject);
  });
}
async function listenAll(createServer, port, hosts) {
  const bound = [];
  try {
    for (const host of hosts) {
      const srv = createServer();
      try {
        await new Promise((resolve, reject) => {
          srv.once("error", reject);
          srv.listen(port, host, () => {
            srv.off("error", reject);
            resolve();
          });
        });
        bound.push(srv);
      } catch (err) {
        const code = err.code;
        if (code === "EADDRINUSE") throw new Error(`Port ${port} is already in use`);
        if (host === "::1" && (code === "EADDRNOTAVAIL" || code === "EAFNOSUPPORT")) {
          log.debug("IPv6 loopback unavailable; listening on 127.0.0.1 only");
          continue;
        }
        throw err;
      }
    }
    return bound;
  } catch (err) {
    bound.forEach((srv) => srv.close());
    throw err;
  }
}
async function stopServer() {
  closeDb();
  await Promise.all(
    servers.map((srv) => new Promise((resolve) => srv.close(() => resolve())))
  );
  servers = [];
}
function setupShutdownHandlers() {
  const shutdown = async (signal) => {
    log.debug(`
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
  startServer(port).catch((err) => {
    log.error("Server failed to start:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
export {
  startServer,
  stopServer
};
