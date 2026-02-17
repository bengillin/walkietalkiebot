import { Bot } from 'grammy'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { setupCommands } from './commands.js'
import { setupHandlers } from './handlers.js'

let bot: Bot | null = null

function getToken(): string | null {
  // Check environment variable first
  if (process.env.TELEGRAM_BOT_TOKEN) {
    return process.env.TELEGRAM_BOT_TOKEN
  }

  // Check token file
  const tokenPath = join(homedir(), '.talkie', 'telegram.token')
  if (existsSync(tokenPath)) {
    return readFileSync(tokenPath, 'utf-8').trim()
  }

  return null
}

export async function startTelegramBot(): Promise<void> {
  const token = getToken()

  if (!token) {
    throw new Error('Telegram bot token not found. Set TELEGRAM_BOT_TOKEN env or create ~/.talkie/telegram.token')
  }

  bot = new Bot(token)

  // Set up command handlers
  setupCommands(bot)

  // Set up message handlers
  setupHandlers(bot)

  // Start the bot
  await bot.start({
    onStart: () => {
      console.log('Telegram bot started')
    },
  })
}

export function stopTelegramBot(): void {
  if (bot) {
    bot.stop()
    bot = null
    console.log('Telegram bot stopped')
  }
}

export function getBot(): Bot | null {
  return bot
}
