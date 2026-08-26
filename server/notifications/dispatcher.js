import { createLogger } from "../logger.js";
const log = createLogger("notify");
class NotificationDispatcher {
  channels = [];
  register(channel) {
    if (channel.isAvailable()) {
      this.channels.push(channel);
      log.debug(`Notification channel registered: ${channel.name}`);
    } else {
      log.debug(`Notification channel not available: ${channel.name}`);
    }
  }
  unregister(name) {
    this.channels = this.channels.filter((c) => c.name !== name);
  }
  async dispatch(notification) {
    const results = await Promise.allSettled(
      this.channels.map((channel) => channel.send(notification))
    );
    for (const [i, result] of results.entries()) {
      if (result.status === "rejected") {
        log.error(`Notification failed on ${this.channels[i]?.name}:`, result.reason);
      }
    }
  }
  getChannels() {
    return this.channels.map((c) => c.name);
  }
}
let dispatcher = null;
function getNotificationDispatcher() {
  if (!dispatcher) {
    dispatcher = new NotificationDispatcher();
  }
  return dispatcher;
}
export {
  NotificationDispatcher,
  getNotificationDispatcher
};
