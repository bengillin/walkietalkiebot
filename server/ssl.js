import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import selfsigned from "selfsigned";
const WTB_DIR = join(homedir(), ".wtb");
const OLD_DIR_2 = join(homedir(), ".talkie");
const OLD_DIR_1 = join(homedir(), ".talkboy");
const CERT_PATH = join(WTB_DIR, "cert.pem");
const KEY_PATH = join(WTB_DIR, "key.pem");
const TAILSCALE_CERT_PATH = join(WTB_DIR, "tailscale.crt");
const TAILSCALE_KEY_PATH = join(WTB_DIR, "tailscale.key");
function getSSLCerts() {
  if (existsSync(OLD_DIR_2) && !existsSync(WTB_DIR)) {
    renameSync(OLD_DIR_2, WTB_DIR);
  } else if (existsSync(OLD_DIR_1) && !existsSync(WTB_DIR)) {
    renameSync(OLD_DIR_1, WTB_DIR);
  }
  if (!existsSync(WTB_DIR)) {
    mkdirSync(WTB_DIR, { recursive: true });
  }
  if (existsSync(TAILSCALE_CERT_PATH) && existsSync(TAILSCALE_KEY_PATH)) {
    console.log("Using Tailscale HTTPS certificates");
    return {
      cert: readFileSync(TAILSCALE_CERT_PATH, "utf-8"),
      key: readFileSync(TAILSCALE_KEY_PATH, "utf-8"),
      isTailscale: true
    };
  }
  if (existsSync(CERT_PATH) && existsSync(KEY_PATH)) {
    return {
      cert: readFileSync(CERT_PATH, "utf-8"),
      key: readFileSync(KEY_PATH, "utf-8")
    };
  }
  console.log("Generating self-signed SSL certificates...");
  const attrs = [{ name: "commonName", value: "localhost" }];
  const pems = selfsigned.generate(attrs, {
    algorithm: "sha256",
    days: 365,
    keySize: 2048,
    extensions: [
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: "localhost" },
          { type: 7, ip: "127.0.0.1" }
        ]
      }
    ]
  });
  writeFileSync(CERT_PATH, pems.cert);
  writeFileSync(KEY_PATH, pems.private);
  console.log(`SSL certificates saved to ${WTB_DIR}`);
  return {
    cert: pems.cert,
    key: pems.private
  };
}
export {
  getSSLCerts
};
