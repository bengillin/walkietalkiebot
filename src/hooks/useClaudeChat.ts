import { useState, useCallback, useRef } from 'react'
import {
  sendMessageStreaming,
  sendMessageViaClaudeCode,
  type ActivityEvent,
  type PlanEvent,
} from '../lib/claude'
import { detectAndSavePlan } from '../lib/planDetection'
import * as api from '../lib/api'
import type { AvatarState, DroppedFile, Message, MessageImage, Activity } from '../types'
import type { SoundType } from './useSoundEffects'

interface UseClaudeChatParams {
  apiKey: string
  useClaudeCode: boolean
  ttsEnabled: boolean
  messages: Message[]
  addMessage: (message: Omit<Message, 'id' | 'timestamp' | 'images'>, images?: MessageImage[]) => void
  setAvatarState: (state: AvatarState) => void
  setTranscript: (text: string) => void
  speak: (text: string) => void
  speakStreaming: (chunk: string, flush: boolean) => void
  playSound: (sound: SoundType) => void
  clearSpeechTranscript: () => void
  attachedFiles: DroppedFile[]
  clearFiles: () => void
  clearImageAnalyses: () => void
  getImageContext: () => string
  addActivity: (activity: Omit<Activity, 'id' | 'timestamp'>) => string
  updateActivity: (id: string, updates: Partial<Activity>) => void
  clearActivities: () => void
  finalizeActivities: () => void
  contextMessages: Message[]
  currentConversationId: string | null
  claudeModel: string
  claudeMaxTokens: number
  claudeSystemPrompt: string
}

export function useClaudeChat({
  apiKey,
  useClaudeCode,
  ttsEnabled,
  messages,
  addMessage,
  setAvatarState,
  setTranscript,
  speak,
  speakStreaming,
  playSound,
  clearSpeechTranscript,
  attachedFiles,
  clearFiles,
  clearImageAnalyses,
  getImageContext,
  addActivity,
  updateActivity,
  clearActivities,
  finalizeActivities,
  contextMessages,
  currentConversationId,
  claudeModel,
  claudeMaxTokens,
  claudeSystemPrompt,
}: UseClaudeChatParams) {
  const [responseText, setResponseText] = useState('')
  const [error, setError] = useState('')
  const [planNotification, setPlanNotification] = useState<string | null>(null)
  const toolActivityMap = useRef<Map<string, string>>(new Map())

  const handleActivity = useCallback((event: ActivityEvent) => {
    if (event.type === 'tool_start') {
      const activityId = addActivity({
        type: 'tool_start' as const,
        tool: event.tool,
        input: event.input,
        status: 'running' as const,
      })
      if (event.id) {
        toolActivityMap.current.set(event.id, activityId)
      }
    } else if (event.type === 'tool_input') {
      if (event.id) {
        const activityId = toolActivityMap.current.get(event.id)
        if (activityId) {
          updateActivity(activityId, { input: event.input })
        }
      }
    } else if (event.type === 'tool_end') {
      if (event.id) {
        const activityId = toolActivityMap.current.get(event.id)
        if (activityId) {
          updateActivity(activityId, { status: event.status || 'complete', output: event.output })
        }
      }
    } else if (event.type === 'all_complete') {
      for (const activityId of toolActivityMap.current.values()) {
        updateActivity(activityId, { status: event.status || 'complete' })
      }
    }
  }, [addActivity, updateActivity])

  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return
    if (!useClaudeCode && !apiKey) return

    setTranscript('')
    clearSpeechTranscript()
    setAvatarState('thinking')
    playSound('thinking')
    setError('')
    setResponseText('')
    clearActivities()
    toolActivityMap.current.clear()

    const messageImages: MessageImage[] | undefined = attachedFiles.length > 0
      ? attachedFiles.map(f => ({ id: f.id, dataUrl: f.dataUrl, fileName: f.name, description: f.description }))
      : undefined

    addMessage({ role: 'user', content: text }, messageImages)
    const updatedMessages = [...messages, { id: 'temp', role: 'user' as const, content: text, timestamp: Date.now() }]

    let fullResponse = ''
    const planRef: { current: PlanEvent | null } = { current: null }

    try {
      if (useClaudeCode) {
        const imageAttachments = attachedFiles.length > 0
          ? attachedFiles.map(f => ({ dataUrl: f.dataUrl, fileName: f.name }))
          : undefined

        const imageContext = !imageAttachments ? getImageContext() : null
        const messageWithContext = imageContext
          ? `[Image Context]\n${imageContext}\n\n[User Message]\n${text}`
          : text

        await sendMessageViaClaudeCode(
          messageWithContext,
          (chunk) => { fullResponse += chunk; setResponseText(fullResponse) },
          messages.map(m => ({ role: m.role, content: m.content })),
          handleActivity,
          imageAttachments,
          (plan) => { planRef.current = plan }
        )

        if (fullResponse.trim() && ttsEnabled) {
          speak(fullResponse)
        } else if (fullResponse.trim()) {
          setAvatarState('happy')
          setTimeout(() => setAvatarState('idle'), 1500)
        }
      } else {
        await sendMessageStreaming(
          updatedMessages,
          apiKey,
          (chunk) => {
            fullResponse += chunk
            setResponseText(fullResponse)
            if (ttsEnabled) speakStreaming(chunk, false)
          },
          contextMessages,
          attachedFiles,
          { model: claudeModel, maxTokens: claudeMaxTokens, systemPrompt: claudeSystemPrompt }
        )
      }

      if (attachedFiles.length > 0) {
        clearFiles()
        clearImageAnalyses()
      }

      if (!useClaudeCode && ttsEnabled) {
        speakStreaming('', true)
      } else if (!useClaudeCode && !ttsEnabled) {
        setAvatarState('happy')
        setTimeout(() => setAvatarState('idle'), 1500)
      }

      setResponseText('')
      addMessage({ role: 'assistant', content: fullResponse })
      finalizeActivities()

      if (planRef.current) {
        api.createPlan({
          title: planRef.current.title,
          content: planRef.current.content,
          status: 'draft',
          conversationId: currentConversationId,
        }).then(plan => {
          console.log('[PlanDetection] Saved plan from tool use:', plan.id, plan.title)
          setPlanNotification(plan.title)
          setTimeout(() => setPlanNotification(null), 5000)
        }).catch(err => console.warn('[PlanDetection] Failed to save plan:', err))
      } else if (fullResponse.trim()) {
        detectAndSavePlan(fullResponse, currentConversationId).then(plan => {
          if (plan) {
            setPlanNotification(plan.title)
            setTimeout(() => setPlanNotification(null), 5000)
          }
        })
      }
    } catch (err) {
      console.error('API error:', err)
      playSound('error')
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setAvatarState('confused')
      setTimeout(() => setAvatarState('idle'), 2000)
      if (fullResponse.trim()) {
        addMessage({ role: 'assistant', content: fullResponse })
        finalizeActivities()
      }
    }

    setTranscript('')
  }, [apiKey, messages, addMessage, setAvatarState, setTranscript, clearSpeechTranscript, speak, speakStreaming, playSound, contextMessages, useClaudeCode, clearActivities, handleActivity, attachedFiles, clearFiles, clearImageAnalyses, getImageContext, ttsEnabled, finalizeActivities, currentConversationId, claudeModel, claudeMaxTokens, claudeSystemPrompt])

  return { handleSendMessage, responseText, error, setError, planNotification, setPlanNotification }
}
