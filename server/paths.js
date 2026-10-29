import { existsSync, renameSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import { createLogger } from "./logger.js";
const log = createLogger("paths");
function getWtbDir() {
  const override = process.env.WTB_DIR;
  return override && override.length > 0 ? resolve(override) : join(homedir(), ".wtb");
}
function migrateLegacyDataDir() {
  if (process.env.WTB_DIR) return;
  const wtbDir = getWtbDir();
  if (existsSync(wtbDir)) return;
  for (const legacy of [".talkie", ".talkboy"]) {
    const dir = join(homedir(), legacy);
    if (existsSync(dir)) {
      log.info(`Migrating ${dir} \u2192 ${wtbDir}`);
      renameSync(dir, wtbDir);
      return;
    }
  }
}
export {
  getWtbDir,
  migrateLegacyDataDir
};
