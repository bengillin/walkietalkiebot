import { Bot } from "grammy";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { setupCommands } from "./commands.js";
import { setupHandlers } from "./handlers.js";
let bot = null;
function getToken() {
  if (process.env.TELEGRAM_BOT_TOKEN) {
    return process.env.TELEGRAM_BOT_TOKEN;
  }
  const tokenPath = join(homedir(), ".talkboy", "telegram.token");
  if (existsSync(tokenPath)) {
    return readFileSync(tokenPath, "utf-8").trim();
  }
  return null;
}
async function startTelegramBot() {
  const token = getToken();
  if (!token) {
    throw new Error("Telegram bot token not found. Set TELEGRAM_BOT_TOKEN env or create ~/.talkboy/telegram.token");
  }
  bot = new Bot(token);
  setupCommands(bot);
  setupHandlers(bot);
  await bot.start({
    onStart: () => {
      console.log("Telegram bot started");
    }
  });
}
function stopTelegramBot() {
  if (bot) {
    bot.stop();
    bot = null;
    console.log("Telegram bot stopped");
  }
}
function getBot() {
  return bot;
}
export {
  getBot,
  startTelegramBot,
  stopTelegramBot
};
