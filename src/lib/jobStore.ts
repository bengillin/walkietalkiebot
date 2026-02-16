import { create } from 'zustand'
import * as api from './api'
import type { Job } from './api'

interface JobState {
  jobs: Job[]
  activeSubscriptions: Map<string, () => void>

  // Actions
  createJob: (conversationId: string, prompt: string, history?: Array<{ role: string; content: string }>) => Promise<string>
  cancelJob: (id: string) => Promise<void>
  refreshJobs: () => Promise<void>
  subscribeToJob: (id: string) => () => void
  clearCompleted: () => void
}

export const useJobStore = create<JobState>((set, get) => ({
  jobs: [],
  activeSubscriptions: new Map(),

  createJob: async (conversationId, prompt, history) => {
    const result = await api.createJob({ conversationId, prompt, history })
    // Refresh to get the full job object
    await get().refreshJobs()
    // Auto-subscribe to events
    get().subscribeToJob(result.id)
    return result.id
  },

  cancelJob: async (id) => {
    await api.cancelJob(id)
    // Unsubscribe
    const subs = get().activeSubscriptions
    const unsub = subs.get(id)
    if (unsub) {
      unsub()
      subs.delete(id)
    }
    await get().refreshJobs()
  },

  refreshJobs: async () => {
    try {
      const { jobs } = await api.listJobs()
      set({ jobs })
    } catch {
      // Server may not be available
    }
  },

  subscribeToJob: (id) => {
    const subs = get().activeSubscriptions
    // Don't double-subscribe
    if (subs.has(id)) {
      return subs.get(id)!
    }

    const unsub = api.subscribeToJobEvents(
      id,
      (event) => {
        // On status change, refresh the job list
        if (event.type === 'status_change') {
          get().refreshJobs()
        }
      },
      () => {
        // On done, clean up subscription and refresh
        subs.delete(id)
        get().refreshJobs()
      }
    )

    subs.set(id, unsub)
    return unsub
  },

  clearCompleted: () => {
    set(state => ({
      jobs: state.jobs.filter(j => !['completed', 'failed', 'cancelled'].includes(j.status)),
    }))
  },
}))
