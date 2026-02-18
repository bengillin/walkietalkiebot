import { useCallback, useRef, useEffect } from 'react'

export type SoundType = 'startListening' | 'stopListening' | 'thinking' | 'success' | 'error'

interface SoundConfig {
  frequency: number
  duration: number
  type: OscillatorType
  volume: number
  ramp?: 'up' | 'down'
}

const SOUNDS: Record<SoundType, SoundConfig | SoundConfig[]> = {
  startListening: {
    frequency: 440,
    duration: 100,
    type: 'sine',
    volume: 0.15,
    ramp: 'up',
  },
  stopListening: {
    frequency: 330,
    duration: 100,
    type: 'sine',
    volume: 0.15,
    ramp: 'down',
  },
  thinking: [
    { frequency: 220, duration: 80, type: 'sine', volume: 0.1 },
    { frequency: 277, duration: 80, type: 'sine', volume: 0.1 },
    { frequency: 330, duration: 80, type: 'sine', volume: 0.1 },
  ],
  success: [
    { frequency: 523, duration: 100, type: 'sine', volume: 0.12 },
    { frequency: 659, duration: 150, type: 'sine', volume: 0.12 },
  ],
  error: {
    frequency: 200,
    duration: 200,
    type: 'sawtooth',
    volume: 0.1,
    ramp: 'down',
  },
}

export function useSoundEffects(enabled: boolean = true) {
  const audioContextRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    // Create audio context on first user interaction
    const initAudio = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      }
    }

    window.addEventListener('click', initAudio, { once: true })
    window.addEventListener('keydown', initAudio, { once: true })

    return () => {
      window.removeEventListener('click', initAudio)
      window.removeEventListener('keydown', initAudio)
    }
  }, [])

  const playTone = useCallback((config: SoundConfig, delay: number = 0) => {
    const ctx = audioContextRef.current
    if (!ctx || !enabled) return

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.type = config.type
    oscillator.frequency.value = config.frequency

    const now = ctx.currentTime + delay / 1000
    const duration = config.duration / 1000

    if (config.ramp === 'up') {
      gainNode.gain.setValueAtTime(0, now)
      gainNode.gain.linearRampToValueAtTime(config.volume, now + duration * 0.3)
      gainNode.gain.linearRampToValueAtTime(0, now + duration)
    } else if (config.ramp === 'down') {
      gainNode.gain.setValueAtTime(config.volume, now)
      gainNode.gain.linearRampToValueAtTime(0, now + duration)
    } else {
      gainNode.gain.setValueAtTime(config.volume, now)
      gainNode.gain.setValueAtTime(0, now + duration)
    }

    oscillator.start(now)
    oscillator.stop(now + duration)
  }, [enabled])

  const play = useCallback((sound: SoundType) => {
    const config = SOUNDS[sound]
    if (!config) return

    if (Array.isArray(config)) {
      let delay = 0
      for (const tone of config) {
        playTone(tone, delay)
        delay += tone.duration
      }
    } else {
      playTone(config)
    }
  }, [playTone])

  return { play }
}
