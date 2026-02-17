import { Bot, InlineKeyboard } from 'grammy'
import * as conversations from '../db/repositories/conversations.js'
import * as messages from '../db/repositories/messages.js'
import * as telegramState from '../db/repositories/telegram.js'
import * as activities from '../db/repositories/activities.js'

const WEB_UI_URL = process.env.TALKIE_URL || 'https://localhost:5173'

export function setupHandlers(bot: Bot): void {
  // Handle text messages
  bot.on('message:text', async (ctx) => {
    const userId = ctx.from?.id
    if (!userId) return

    const text = ctx.message.text

    // Skip if it's a command
    if (text.startsWith('/')) return

    // Get or create conversation
    let state = telegramState.getTelegramState(userId)

    if (!state?.current_conversation_id) {
      // Create a new conversation
      const id = crypto.randomUUID()
      const title = text.length > 40 ? text.slice(0, 40) + '...' : text
      conversations.createConversation({ id, title })
      telegramState.setTelegramConversation(userId, id)
      state = { user_id: userId, current_conversation_id: id, updated_at: Date.now() }
    }

    const conversationId = state.current_conversation_id!

    // Verify conversation still exists
    const conv = conversations.getConversation(conversationId)
    if (!conv) {
      telegramState.setTelegramConversation(userId, null)
      await ctx.reply('Your conversation was deleted. Creating a new one...')

      const id = crypto.randomUUID()
      const title = text.length > 40 ? text.slice(0, 40) + '...' : text
      conversations.createConversation({ id, title })
      telegramState.setTelegramConversation(userId, id)
    }

    // Add user message to database
    const messageId = crypto.randomUUID()
    messages.createMessage({
      id: messageId,
      conversationId,
      role: 'user',
      content: text,
      source: 'telegram',
    })

    // Show typing indicator
    await ctx.replyWithChatAction('typing')

    try {
      // Call Claude Code via the existing API endpoint
      // Use undici dispatcher for self-signed cert support
      const { Agent: UndiciAgent, fetch: undiciFetch } = await import('undici')
      const response = await undiciFetch(`${WEB_UI_URL}/api/claude-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.getMessagesForConversation(conversationId).map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
        dispatcher: new UndiciAgent({ connect: { rejectUnauthorized: false } }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      // Read SSE stream
      let fullResponse = ''
      const toolCalls: Array<{ id: string; tool: string; input?: string; status: 'complete' | 'error' }> = []
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6)

            try {
              const event = JSON.parse(data)

              if (event.text) {
                fullResponse += event.text
              }

              if (event.activity) {
                if (event.activity.type === 'tool_start') {
                  toolCalls.push({
                    id: event.activity.id || crypto.randomUUID(),
                    tool: event.activity.tool,
                    input: event.activity.input,
                    status: 'complete',
                  })
                } else if (event.activity.type === 'tool_end') {
                  const tc = toolCalls.find(t => t.id === event.activity.id)
                  if (tc) {
                    tc.status = event.activity.status || 'complete'
                  }
                }
              }

              if (event.error) {
                console.error('Claude Code error:', event.error)
              }
            } catch {
              // Ignore parse errors
            }
          }

          // Keep sending typing indicator while processing
          await ctx.replyWithChatAction('typing')
        }
      }

      if (fullResponse.trim()) {
        // Store assistant response in database
        const assistantMessageId = crypto.randomUUID()
        messages.createMessage({
          id: assistantMessageId,
          conversationId,
          role: 'assistant',
          content: fullResponse,
          source: 'telegram',
        })

        // Store activities if any
        if (toolCalls.length > 0) {
          activities.createActivitiesBatch(
            toolCalls.map(tc => ({
              id: tc.id,
              conversationId,
              messageId: assistantMessageId,
              tool: tc.tool,
              input: tc.input,
              status: tc.status,
              timestamp: Date.now(),
            }))
          )
        }

        // Send response (truncate if too long for Telegram)
        const maxLength = 4096
        if (fullResponse.length > maxLength) {
          // Split into multiple messages
          for (let i = 0; i < fullResponse.length; i += maxLength) {
            await ctx.reply(fullResponse.slice(i, i + maxLength))
          }
        } else {
          await ctx.reply(fullResponse)
        }
      } else {
        await ctx.reply("I didn't get a response. Please try again.")
      }
    } catch (err) {
      console.error('Error processing Telegram message:', err)

      const keyboard = new InlineKeyboard()
        .text('Try again', 'retry_message')

      await ctx.reply(
        'Sorry, I encountered an error processing your message. ' +
        'Make sure the Talkie server is running and Claude Code is available.',
        { reply_markup: keyboard }
      )
    }
  })

  // Handle retry button
  bot.callbackQuery('retry_message', async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Please send your message again' })
    await ctx.deleteMessage()
  })

  // Handle unsupported message types
  bot.on('message:voice', async (ctx) => {
    await ctx.reply(
      "Voice messages aren't supported yet. " +
      "Please type your message instead, or use the web UI for voice input."
    )
  })

  bot.on('message:video', async (ctx) => {
    await ctx.reply(
      "Videos aren't supported yet. " +
      "Please describe what you'd like to share, or use the web UI to attach files."
    )
  })

  bot.on('message:video_note', async (ctx) => {
    await ctx.reply(
      "Video messages aren't supported yet. " +
      "Please type your message instead."
    )
  })

  bot.on('message:photo', async (ctx) => {
    const userId = ctx.from?.id
    if (!userId) return

    const caption = ctx.message.caption || ''

    // Get the largest photo size
    const photos = ctx.message.photo
    const photo = photos[photos.length - 1]

    await ctx.replyWithChatAction('typing')

    try {
      // Get file from Telegram
      const file = await ctx.api.getFile(photo.file_id)
      const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`

      // Download the image
      const imageResponse = await fetch(fileUrl)
      const imageBuffer = await imageResponse.arrayBuffer()
      const base64 = Buffer.from(imageBuffer).toString('base64')
      const mimeType = file.file_path?.endsWith('.png') ? 'image/png' : 'image/jpeg'
      const dataUrl = `data:${mimeType};base64,${base64}`

      // Get or create conversation
      let state = telegramState.getTelegramState(userId)
      if (!state?.current_conversation_id) {
        const id = crypto.randomUUID()
        const title = caption || 'Image conversation'
        conversations.createConversation({ id, title: title.slice(0, 40) })
        telegramState.setTelegramConversation(userId, id)
        state = { user_id: userId, current_conversation_id: id, updated_at: Date.now() }
      }

      const conversationId = state.current_conversation_id!

      // Analyze image via server endpoint
      const { Agent, fetch: undiciFetch } = await import('undici')
      const analyzeResponse = await undiciFetch(`${WEB_UI_URL}/api/analyze-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl,
          fileName: file.file_path || 'photo.jpg',
          type: mimeType,
          apiKey: process.env.ANTHROPIC_API_KEY,
        }),
        dispatcher: new Agent({ connect: { rejectUnauthorized: false } }),
      })

      if (!analyzeResponse.ok) {
        const error = await analyzeResponse.text()
        await ctx.reply(`Couldn't analyze image: ${error}\n\nMake sure an API key is configured in Settings.`)
        return
      }

      const { description } = await analyzeResponse.json() as { description: string }

      // Build message with image context
      const messageText = caption
        ? `[Image attached: ${description}]\n\nUser says: ${caption}`
        : `[Image attached: ${description}]\n\nDescribe what you see and ask if I have any questions about it.`

      // Store user message
      const messageId = crypto.randomUUID()
      messages.createMessage({
        id: messageId,
        conversationId,
        role: 'user',
        content: caption || '[Sent an image]',
        source: 'telegram',
        images: [{
          id: crypto.randomUUID(),
          dataUrl,
          fileName: file.file_path || 'photo.jpg',
          description,
        }],
      })

      // Send to Claude Code
      const response = await undiciFetch(`${WEB_UI_URL}/api/claude-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          history: messages.getMessagesForConversation(conversationId).slice(0, -1).map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
        dispatcher: new Agent({ connect: { rejectUnauthorized: false } }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      // Read SSE stream
      let fullResponse = ''
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const event = JSON.parse(line.slice(6))
              if (event.text) fullResponse += event.text
            } catch {
              // Ignore parse errors
            }
          }

          await ctx.replyWithChatAction('typing')
        }
      }

      if (fullResponse.trim()) {
        // Store response
        messages.createMessage({
          id: crypto.randomUUID(),
          conversationId,
          role: 'assistant',
          content: fullResponse,
          source: 'telegram',
        })

        // Send response (split if too long)
        const maxLength = 4096
        if (fullResponse.length > maxLength) {
          for (let i = 0; i < fullResponse.length; i += maxLength) {
            await ctx.reply(fullResponse.slice(i, i + maxLength))
          }
        } else {
          await ctx.reply(fullResponse)
        }
      } else {
        await ctx.reply("I received the image but didn't get a response. Please try again.")
      }
    } catch (err) {
      console.error('Error processing Telegram photo:', err)
      await ctx.reply(
        'Sorry, I had trouble processing that image. ' +
        'Make sure the Talkie server is running and an API key is configured.'
      )
    }
  })

  bot.on('message:document', async (ctx) => {
    await ctx.reply(
      "File attachments aren't supported via Telegram yet. " +
      "Please use the web UI to attach files."
    )
  })

  bot.on('message:sticker', async (ctx) => {
    await ctx.reply("😊")
  })
}
