import { getAuthToken } from "./auth.js";
const DEFAULT_BIND_HOST = "127.0.0.1";
function resolveBindHost() {
  const host = process.env.WTB_HOST?.trim();
  return host && host.length > 0 ? host : DEFAULT_BIND_HOST;
}
function resolveBindHosts() {
  const host = resolveBindHost();
  return process.env.WTB_HOST?.trim() ? [host] : [DEFAULT_BIND_HOST, "::1"];
}
function isLoopbackBindAddress(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "::1" || /^127(\.\d{1,3}){3}$/.test(h);
}
function isLoopbackHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h.endsWith(".localhost") || h === "::1" || /^127(\.\d{1,3}){3}$/.test(h);
}
function assertSafeBind(host) {
  if (isLoopbackBindAddress(host) || getAuthToken()) return;
  throw new Error(
    `Refusing to listen on ${host} without authentication. Anyone who can reach this address could run commands on this machine through Claude Code.
Set WTB_AUTH_TOKEN (e.g. export WTB_AUTH_TOKEN="$(openssl rand -hex 32)"), or unset WTB_HOST to listen on ${DEFAULT_BIND_HOST} only.`
  );
}
function hostnameOf(hostHeader) {
  if (!hostHeader) return null;
  try {
    return new URL(`http://${hostHeader}`).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return null;
  }
}
function isSameOrigin(origin, hostHeader) {
  if (!hostHeader) return false;
  try {
    return new URL(origin).host.toLowerCase() === hostHeader.toLowerCase();
  } catch {
    return false;
  }
}
const WRITE_METHODS = /* @__PURE__ */ new Set(["POST", "PUT", "PATCH", "DELETE"]);
async function requestGuard(c, next) {
  const hostHeader = c.req.header("host");
  if (!getAuthToken()) {
    const hostname = hostnameOf(hostHeader);
    if (!hostname || !isLoopbackHost(hostname)) {
      return c.text("Forbidden: this server only answers to localhost", 403);
    }
  }
  if (c.req.path.startsWith("/api")) {
    const origin = c.req.header("origin");
    if (origin !== void 0 && !isSameOrigin(origin, hostHeader)) {
      return c.json({ error: "Cross-origin request rejected" }, 403);
    }
    if (c.req.header("sec-fetch-site") === "cross-site") {
      return c.json({ error: "Cross-site request rejected" }, 403);
    }
    if (WRITE_METHODS.has(c.req.method) && hasBody(c)) {
      const type = c.req.header("content-type") ?? "";
      if (!/^application\/json\b/i.test(type)) {
        return c.json({ error: "Content-Type must be application/json" }, 415);
      }
    }
  }
  return next();
}
function hasBody(c) {
  const length = c.req.header("content-length");
  if (length !== void 0) return Number(length) > 0;
  return c.req.header("transfer-encoding") !== void 0 || c.req.raw.body !== null;
}
export {
  DEFAULT_BIND_HOST,
  assertSafeBind,
  hostnameOf,
  isLoopbackHost,
  requestGuard,
  resolveBindHost,
  resolveBindHosts
};
