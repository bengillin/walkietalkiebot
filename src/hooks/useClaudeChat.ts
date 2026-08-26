import { useState, useCallback, useRef } from 'react'
import { sendMessageViaClaudeCode, type ActivityEvent, type PlanEvent } from '../lib/claude'
import { detectAndSavePlan } from '../lib/planDetection'
import * as api from '../lib/api'
import type { AvatarState, DroppedFile, Message, MessageImage, Activity } from '../types'
import type { SoundType } from './useSoundEffects'

interface UseClaudeChatParams {
  ttsEnabled: boolean
  messages: Message[]
  addMessage: (
    message: Omit<Message, 'id' | 'timestamp' | 'images'>,
    images?: MessageImage[],
  ) => void
  setAvatarState: (state: AvatarState) => void
  setTranscript: (text: string) => void
  speak: (text: string) => void
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
  currentConversationId: string | null
  mode: string
  onModeChange?: (mode: string) => void
  availableModes?: api.ModeInfo[]
}

// Matches: "switch to X mode", "use X mode", "change to X mode"
const MODE_SWITCH_PATTERN = /(?:switch to|use|change to|set)\s+(\w[\w-]*)\s+mode/i

// Matches: "run X and Y mode on this", "use X and Y on this"
const MULTI_MODE_PATTERN = /(?:run|use)\s+(.+?)\s+(?:on|for|against)\s+/i

export function useClaudeChat({
  ttsEnabled,
  messages,
  addMessage,
  setAvatarState,
  setTranscript,
  speak,
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
  currentConversationId,
  mode,
  onModeChange,
  availableModes,
}: UseClaudeChatParams) {
  const [responseText, setResponseText] = useState('')
  const [error, setError] = useState('')
  const [planNotification, setPlanNotification] = useState<string | null>(null)
  const toolActivityMap = useRef<Map<string, string>>(new Map())

  const handleActivity = useCallback(
    (event: ActivityEvent) => {
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
    },
    [addActivity, updateActivity],
  )

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return

      // Detect multi-mode orchestration: "run code-review and architect on this"
      if (availableModes && availableModes.length > 0 && currentConversationId) {
        const multiMatch = text.match(MULTI_MODE_PATTERN)
        if (multiMatch) {
          const modesPart = multiMatch[1] ?? ''
          const modeNames = modesPart.split(/\s+and\s+|\s*,\s*/).map((s) =>
            s
              .replace(/\s*mode\s*/gi, '')
              .trim()
              .toLowerCase(),
          )
          const matchedModes = modeNames
            .map((name) =>
              availableModes.find((m) => m.name === name || m.label.toLowerCase() === name),
            )
            .filter((m): m is api.ModeInfo => m !== undefined)

          if (matchedModes.length >= 2) {
            // Extract the actual prompt (everything after "on/for/against")
            const promptMatch = text.match(/(?:on|for|against)\s+(.+)/i)
            const orchestratePrompt = promptMatch?.[1] ?? text

            api
              .orchestrateJobs({
                conversationId: currentConversationId,
                tasks: matchedModes.map((m) => ({ prompt: orchestratePrompt, mode: m.name })),
                history: messages.map((m) => ({ role: m.role, content: m.content })),
              })
              .then((result) => {
                setPlanNotification(
                  `${result.jobs.length} jobs dispatched: ${matchedModes.map((m) => m.label).join(', ')}`,
                )
                setTimeout(() => setPlanNotification(null), 5000)
              })
              .catch((err) => console.warn('Orchestration failed:', err))

            addMessage({ role: 'user', content: text })
            addMessage({
              role: 'assistant',
              content: `Dispatching ${matchedModes.length} parallel jobs: ${matchedModes.map((m) => `${m.icon} ${m.label}`).join(', ')}. Check the job status bar for progress.`,
            })
            return
          }
        }
      }

      // Detect single mode switching
      let activeMode = mode
      if (onModeChange && availableModes) {
        const requested = text.match(MODE_SWITCH_PATTERN)?.[1]?.toLowerCase()
        if (requested) {
          const found = availableModes.find(
            (m) => m.name === requested || m.label.toLowerCase() === requested,
          )
          if (found) {
            activeMode = found.name
            onModeChange(found.name)
          }
        }
      }

      setTranscript('')
      clearSpeechTranscript()
      setAvatarState('thinking')
      playSound('thinking')
      setError('')
      setResponseText('')
      clearActivities()
      toolActivityMap.current.clear()

      const messageImages: MessageImage[] | undefined =
        attachedFiles.length > 0
          ? attachedFiles.map((f) => ({
              id: f.id,
              dataUrl: f.dataUrl,
              fileName: f.name,
              description: f.description,
            }))
          : undefined

      addMessage({ role: 'user', content: text }, messageImages)

      let fullResponse = ''
      const planRef: { current: PlanEvent | null } = { current: null }

      try {
        const imageAttachments =
          attachedFiles.length > 0
            ? attachedFiles.map((f) => ({ dataUrl: f.dataUrl, fileName: f.name }))
            : undefined

        const imageContext = !imageAttachments ? getImageContext() : null
        const messageWithContext = imageContext
          ? `[Image Context]\n${imageContext}\n\n[User Message]\n${text}`
          : text

        await sendMessageViaClaudeCode(
          messageWithContext,
          (chunk) => {
            fullResponse += chunk
            setResponseText(fullResponse)
          },
          messages.map((m) => ({ role: m.role, content: m.content })),
          handleActivity,
          imageAttachments,
          (plan) => {
            planRef.current = plan
          },
          activeMode,
          currentConversationId,
        )

        if (fullResponse.trim() && ttsEnabled) {
          speak(fullResponse)
        } else if (fullResponse.trim()) {
          setAvatarState('happy')
          setTimeout(() => setAvatarState('idle'), 1500)
        }

        if (attachedFiles.length > 0) {
          clearFiles()
          clearImageAnalyses()
        }

        setResponseText('')
        addMessage({ role: 'assistant', content: fullResponse })
        finalizeActivities()

        if (planRef.current) {
          api
            .createPlan({
              title: planRef.current.title,
              content: planRef.current.content,
              status: 'draft',
              conversationId: currentConversationId,
            })
            .then((plan) => {
              console.log('[PlanDetection] Saved plan from tool use:', plan.id, plan.title)
              setPlanNotification(plan.title)
              setTimeout(() => setPlanNotification(null), 5000)
            })
            .catch((err) => console.warn('[PlanDetection] Failed to save plan:', err))
        } else if (fullResponse.trim()) {
          detectAndSavePlan(fullResponse, currentConversationId).then((plan) => {
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
    },
    [
      messages,
      addMessage,
      setAvatarState,
      setTranscript,
      clearSpeechTranscript,
      speak,
      playSound,
      clearActivities,
      handleActivity,
      attachedFiles,
      clearFiles,
      clearImageAnalyses,
      getImageContext,
      ttsEnabled,
      finalizeActivities,
      currentConversationId,
      mode,
      onModeChange,
      availableModes,
    ],
  )

  return { handleSendMessage, responseText, error, setError, planNotification, setPlanNotification }
}
