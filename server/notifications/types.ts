export interface Notification {
  type: 'job_completed' | 'job_failed'
  jobId: string
  title: string
  body: string
}

export interface NotificationChannel {
  name: string
  send(notification: Notification): Promise<boolean>
  isAvailable(): boolean
}
