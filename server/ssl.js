import { existsSync, mkdirSync, readFileSync, renameSync } from "fs";
import { homedir } from "os";
import { join } from "path";
const WTB_DIR = join(homedir(), ".wtb");
const OLD_DIR_2 = join(homedir(), ".talkie");
const OLD_DIR_1 = join(homedir(), ".talkboy");
const CERT_PATH = join(WTB_DIR, "cert.pem");
const KEY_PATH = join(WTB_DIR, "key.pem");
const TAILSCALE_CERT_PATH = join(WTB_DIR, "tailscale.crt");
const TAILSCALE_KEY_PATH = join(WTB_DIR, "tailscale.key");
function ensureWtbDir() {
  if (existsSync(OLD_DIR_2) && !existsSync(WTB_DIR)) {
    renameSync(OLD_DIR_2, WTB_DIR);
  } else if (existsSync(OLD_DIR_1) && !existsSync(WTB_DIR)) {
    renameSync(OLD_DIR_1, WTB_DIR);
  }
  if (!existsSync(WTB_DIR)) {
    mkdirSync(WTB_DIR, { recursive: true });
  }
}
function getSSLCerts() {
  ensureWtbDir();
  if (existsSync(TAILSCALE_CERT_PATH) && existsSync(TAILSCALE_KEY_PATH)) {
    console.log("Using Tailscale HTTPS certificates");
    return {
      cert: readFileSync(TAILSCALE_CERT_PATH, "utf-8"),
      key: readFileSync(TAILSCALE_KEY_PATH, "utf-8")
    };
  }
  return null;
}
export {
  ensureWtbDir,
  getSSLCerts
};
