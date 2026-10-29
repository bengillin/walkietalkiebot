import { existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { createLogger } from "./logger.js";
import { getWtbDir, migrateLegacyDataDir } from "./paths.js";
const log = createLogger("ssl");
function ensureWtbDir() {
  migrateLegacyDataDir();
  const wtbDir = getWtbDir();
  if (!existsSync(wtbDir)) {
    mkdirSync(wtbDir, { recursive: true });
  }
  const modesDir = join(wtbDir, "modes");
  if (!existsSync(modesDir)) {
    mkdirSync(modesDir, { recursive: true });
  }
}
function getSSLCerts() {
  ensureWtbDir();
  const certPath = join(getWtbDir(), "tailscale.crt");
  const keyPath = join(getWtbDir(), "tailscale.key");
  if (existsSync(certPath) && existsSync(keyPath)) {
    log.debug("Using Tailscale HTTPS certificates");
    return {
      cert: readFileSync(certPath, "utf-8"),
      key: readFileSync(keyPath, "utf-8")
    };
  }
  return null;
}
export {
  ensureWtbDir,
  getSSLCerts
};
