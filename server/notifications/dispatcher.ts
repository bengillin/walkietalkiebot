import type { Notification, NotificationChannel } from './types.js'

export class NotificationDispatcher {
  private channels: NotificationChannel[] = []

  register(channel: NotificationChannel): void {
    if (channel.isAvailable()) {
      this.channels.push(channel)
      console.log(`Notification channel registered: ${channel.name}`)
    } else {
      console.log(`Notification channel not available: ${channel.name}`)
    }
  }

  unregister(name: string): void {
    this.channels = this.channels.filter(c => c.name !== name)
  }

  async dispatch(notification: Notification): Promise<void> {
    const results = await Promise.allSettled(
      this.channels.map(channel => channel.send(notification))
    )

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const channel = this.channels[i]
      if (result.status === 'rejected') {
        console.error(`Notification failed on ${channel.name}:`, result.reason)
      }
    }
  }

  getChannels(): string[] {
    return this.channels.map(c => c.name)
  }
}

// Singleton instance
let dispatcher: NotificationDispatcher | null = null

export function getNotificationDispatcher(): NotificationDispatcher {
  if (!dispatcher) {
    dispatcher = new NotificationDispatcher()
  }
  return dispatcher
}
