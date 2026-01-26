import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { createServer as createHttpsServer } from "https";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getSSLCerts } from "./ssl.js";
import { api } from "./api.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, "..", "dist");
function startServer(port = 5173) {
  return new Promise((resolve, reject) => {
    if (!existsSync(distPath)) {
      reject(new Error(`dist/ not found at ${distPath}. Run 'npm run build' first.`));
      return;
    }
    const app = new Hono();
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
    const certs = getSSLCerts();
    const serverOptions = {
      key: certs.key,
      cert: certs.cert
    };
    const server = createHttpsServer(serverOptions, async (req, res) => {
      const url = new URL(req.url || "/", `https://localhost:${port}`);
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
        for await (const chunk of req) {
          chunks.push(chunk);
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
    });
    server.listen(port, () => {
      console.log(`Talkboy server running at https://localhost:${port}`);
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
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.env.PORT || "5173", 10);
  startServer(port).catch(console.error);
}
export {
  startServer
};
