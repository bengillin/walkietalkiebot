import { create } from 'zustand'
import type { AppState, AvatarState, Message } from '../types'

export const useStore = create<AppState>((set) => ({
  avatarState: 'idle',
  setAvatarState: (avatarState: AvatarState) => set({ avatarState }),

  messages: [],
  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        },
      ],
    })),

  isVoiceEnabled: true,
  setVoiceEnabled: (isVoiceEnabled) => set({ isVoiceEnabled }),

  transcript: '',
  setTranscript: (transcript) => set({ transcript }),
}))
