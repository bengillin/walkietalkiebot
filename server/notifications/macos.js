import { spawn } from "child_process";
function escapeAppleScript(str) {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
class MacOSNotificationChannel {
  name = "macos";
  async send(notification) {
    const title = escapeAppleScript(notification.title);
    const body = escapeAppleScript(notification.body.slice(0, 200));
    const sound = notification.type === "job_failed" ? "Basso" : "Glass";
    const script = `display notification "${body}" with title "${title}" sound name "${sound}"`;
    return new Promise((resolve) => {
      const proc = spawn("osascript", ["-e", script]);
      proc.on("close", (code) => resolve(code === 0));
      proc.on("error", () => resolve(false));
    });
  }
  isAvailable() {
    return process.platform === "darwin";
  }
}
export {
  MacOSNotificationChannel
};
