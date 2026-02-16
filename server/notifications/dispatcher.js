class NotificationDispatcher {
  channels = [];
  register(channel) {
    if (channel.isAvailable()) {
      this.channels.push(channel);
      console.log(`Notification channel registered: ${channel.name}`);
    } else {
      console.log(`Notification channel not available: ${channel.name}`);
    }
  }
  unregister(name) {
    this.channels = this.channels.filter((c) => c.name !== name);
  }
  async dispatch(notification) {
    const results = await Promise.allSettled(
      this.channels.map((channel) => channel.send(notification))
    );
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const channel = this.channels[i];
      if (result.status === "rejected") {
        console.error(`Notification failed on ${channel.name}:`, result.reason);
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
