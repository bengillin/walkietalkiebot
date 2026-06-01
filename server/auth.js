import { timingSafeEqual } from "crypto";
import { getCookie, setCookie } from "hono/cookie";
const AUTH_COOKIE = "wtb_token";
function tokensMatch(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
function getAuthToken() {
  const token = process.env.WTB_AUTH_TOKEN;
  return token && token.length > 0 ? token : null;
}
const LOGIN_PAGE = (error) => `<!doctype html>
<html><head><meta charset="utf-8"><title>Walkie Talkie Bot \u2014 Sign in</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:system-ui,sans-serif;background:#111;color:#eee;display:grid;place-items:center;height:100vh;margin:0}
  form{background:#1c1c1c;padding:2rem;border-radius:12px;width:min(90vw,360px);box-shadow:0 8px 40px rgba(0,0,0,.5)}
  h1{font-size:1.1rem;margin:0 0 1rem}
  input{width:100%;box-sizing:border-box;padding:.6rem;border-radius:8px;border:1px solid #333;background:#0c0c0c;color:#eee;font-size:1rem}
  button{margin-top:1rem;width:100%;padding:.6rem;border:0;border-radius:8px;background:#4a8;color:#000;font-weight:600;cursor:pointer}
  .err{color:#f77;font-size:.85rem;margin-top:.5rem}
</style></head>
<body><form method="GET" action="/">
  <h1>\u{1F399}\uFE0F Walkie Talkie Bot</h1>
  <input name="token" type="password" placeholder="Access token" autofocus autocomplete="current-password">
  ${error ? '<div class="err">Invalid token.</div>' : ""}
  <button type="submit">Sign in</button>
</form></body></html>`;
async function authMiddleware(c, next) {
  const token = getAuthToken();
  if (!token) return next();
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ") && tokensMatch(header.slice(7), token)) {
    return next();
  }
  const cookie = getCookie(c, AUTH_COOKIE);
  if (cookie && tokensMatch(cookie, token)) {
    return next();
  }
  const queryToken = c.req.query("token");
  if (queryToken && tokensMatch(queryToken, token)) {
    setCookie(c, AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: "Strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 30
    });
    return c.redirect(c.req.path);
  }
  if (c.req.path.startsWith("/api")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const attempted = queryToken != null;
  return c.html(LOGIN_PAGE(attempted), 401);
}
export {
  authMiddleware,
  getAuthToken
};
