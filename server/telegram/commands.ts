import { Bot, InlineKeyboard } from 'grammy'
import * as conversations from '../db/repositories/conversations.js'
import * as telegramState from '../db/repositories/telegram.js'

const WEB_UI_URL = process.env.TALKIE_URL || 'https://localhost:5173'

export function setupCommands(bot: Bot): void {
  // /start - Welcome message
  bot.command('start', async (ctx) => {
    const userId = ctx.from?.id
    if (!userId) return

    await ctx.reply(
      `Welcome to Talkie!\n\n` +
      `I'm your mobile interface to Claude Code conversations.\n\n` +
      `Commands:\n` +
      `/conversations - List recent conversations\n` +
      `/new <name> - Create new conversation\n` +
      `/current - Show current conversation\n` +
      `/status - Check what Claude is doing\n` +
      `/help - Show this message\n\n` +
      `Web UI: ${WEB_UI_URL}\n\n` +
      `Just send me a text message to chat with Claude!`
    )
  })

  // /help - Show commands
  bot.command('help', async (ctx) => {
    await ctx.reply(
      `Talkie Commands:\n\n` +
      `/conversations - List recent conversations\n` +
      `/new <name> - Create new conversation\n` +
      `/current - Show current conversation\n` +
      `/status - Check what Claude is doing\n` +
      `/help - Show this message\n\n` +
      `Send any text message to continue your current conversation.`
    )
  })

  // /conversations - List recent conversations with inline keyboard
  bot.command('conversations', async (ctx) => {
    const convos = conversations.listConversations(5, 0)

    if (convos.length === 0) {
      await ctx.reply('No conversations yet. Send a message or use /new to create one.')
      return
    }

    const keyboard = new InlineKeyboard()

    for (const conv of convos) {
      const title = conv.title.length > 30 ? conv.title.slice(0, 30) + '...' : conv.title
      keyboard.text(title, `select_conv:${conv.id}`).row()
    }

    keyboard.text('+ Create new', 'create_conv')

    await ctx.reply('Select a conversation:', { reply_markup: keyboard })
  })

  // /new <name> - Create new conversation
  bot.command('new', async (ctx) => {
    const userId = ctx.from?.id
    if (!userId) return

    const name = ctx.match?.trim() || 'New conversation'
    const id = crypto.randomUUID()

    const conv = conversations.createConversation({ id, title: name })
    telegramState.setTelegramConversation(userId, conv.id)

    await ctx.reply(`Created new conversation: "${conv.title}"\n\nSend me a message to start chatting.`)
  })

  // /current - Show current conversation
  bot.command('current', async (ctx) => {
    const userId = ctx.from?.id
    if (!userId) return

    const state = telegramState.getTelegramState(userId)

    if (!state?.current_conversation_id) {
      await ctx.reply('No conversation selected. Use /conversations to pick one or /new to create one.')
      return
    }

    const conv = conversations.getConversation(state.current_conversation_id)

    if (!conv) {
      telegramState.setTelegramConversation(userId, null)
      await ctx.reply('Current conversation no longer exists. Use /conversations to pick a new one.')
      return
    }

    const keyboard = new InlineKeyboard()
      .text('Switch conversation', 'switch_conv')
      .text('Open in web', 'open_web')

    await ctx.reply(
      `Current conversation: "${conv.title}"\n\n` +
      `Created: ${new Date(conv.created_at).toLocaleDateString()}\n` +
      `Last updated: ${new Date(conv.updated_at).toLocaleString()}`,
      { reply_markup: keyboard }
    )
  })

  // /status - What's Claude doing
  bot.command('status', async (ctx) => {
    try {
      const { Agent, fetch: undiciFetch } = await import('undici')
      const response = await undiciFetch(`${WEB_UI_URL}/api/status`, {
        dispatcher: new Agent({ connect: { rejectUnauthorized: false } }),
      })
      const data = await response.json() as { running: boolean; avatarState: string; dbStatus: string }

      const stateEmoji: Record<string, string> = {
        idle: '😴',
        listening: '👂',
        thinking: '🤔',
        speaking: '🗣',
        happy: '😊',
        confused: '😕',
      }

      await ctx.reply(
        `Talkie Status:\n\n` +
        `Server: ${data.running ? '✅ Running' : '❌ Stopped'}\n` +
        `Database: ${data.dbStatus === 'connected' ? '✅ Connected' : '⚠️ Unavailable'}\n` +
        `Claude: ${stateEmoji[data.avatarState] || '❓'} ${data.avatarState}`
      )
    } catch {
      await ctx.reply('Could not reach Talkie server. Is it running?')
    }
  })

  // Handle inline keyboard callbacks
  bot.callbackQuery(/^select_conv:(.+)$/, async (ctx) => {
    const userId = ctx.from?.id
    if (!userId) return

    const convId = ctx.match[1]
    const conv = conversations.getConversation(convId)

    if (!conv) {
      await ctx.answerCallbackQuery({ text: 'Conversation not found' })
      return
    }

    telegramState.setTelegramConversation(userId, convId)
    await ctx.answerCallbackQuery({ text: `Switched to: ${conv.title}` })
    await ctx.editMessageText(`Selected: "${conv.title}"\n\nSend me a message to continue chatting.`)
  })

  bot.callbackQuery('create_conv', async (ctx) => {
    const userId = ctx.from?.id
    if (!userId) return

    const id = crypto.randomUUID()
    const conv = conversations.createConversation({ id, title: 'New conversation' })
    telegramState.setTelegramConversation(userId, conv.id)

    await ctx.answerCallbackQuery({ text: 'Created new conversation' })
    await ctx.editMessageText(`Created new conversation.\n\nSend me a message to start chatting.`)
  })

  bot.callbackQuery('switch_conv', async (ctx) => {
    const convos = conversations.listConversations(5, 0)

    if (convos.length === 0) {
      await ctx.answerCallbackQuery({ text: 'No conversations available' })
      return
    }

    const keyboard = new InlineKeyboard()

    for (const conv of convos) {
      const title = conv.title.length > 30 ? conv.title.slice(0, 30) + '...' : conv.title
      keyboard.text(title, `select_conv:${conv.id}`).row()
    }

    keyboard.text('+ Create new', 'create_conv')

    await ctx.answerCallbackQuery()
    await ctx.editMessageText('Select a conversation:', { reply_markup: keyboard })
  })

  bot.callbackQuery('open_web', async (ctx) => {
    await ctx.answerCallbackQuery({ text: `Open ${WEB_UI_URL} in your browser` })
  })
}
