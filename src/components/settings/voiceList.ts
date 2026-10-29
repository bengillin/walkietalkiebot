// Shapes the TTS voice list for the settings picker: drops macOS novelty
// voices and groups the rest by language, the user's own language first.

/** macOS "novelty" voices: sound effects, not usable for reading replies. */
const NOVELTY_VOICES = new Set(
  [
    'Albert',
    'Bad News',
    'Bahh',
    'Bells',
    'Boing',
    'Bubbles',
    'Cellos',
    'Deranged',
    'Good News',
    'Hysterical',
    'Jester',
    'Organ',
    'Pipe Organ',
    'Superstar',
    'Trinoids',
    'Whisper',
    'Wobble',
    'Zarvox',
  ].map((n) => n.toLowerCase()),
)

type VoiceLike = Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'voiceURI'>

export interface VoiceGroup<V extends VoiceLike = SpeechSynthesisVoice> {
  /** Primary language subtag, e.g. "en" */
  language: string
  /** Human-readable name, e.g. "English" */
  label: string
  voices: V[]
}

export function isNoveltyVoice(voice: Pick<VoiceLike, 'name'>): boolean {
  return NOVELTY_VOICES.has(voice.name.trim().toLowerCase())
}

function primaryLanguage(lang: string): string {
  return (lang.split(/[-_]/)[0] || '').toLowerCase()
}

function languageLabel(language: string, displayLocale: string): string {
  if (!language) return 'Other'
  try {
    const names = new Intl.DisplayNames([displayLocale, 'en'], { type: 'language' })
    return names.of(language) ?? language
  } catch {
    return language
  }
}

/**
 * Filter out novelty voices (keeping `keepVoice`, the current selection, so
 * the picker never loses it) and group by language: the user's language
 * first, then the rest alphabetically by label. Voices sort by name.
 */
export function groupVoices<V extends VoiceLike>(
  voices: V[],
  userLanguage: string,
  keepVoice?: string,
): VoiceGroup<V>[] {
  const userLang = primaryLanguage(userLanguage)
  const groups = new Map<string, V[]>()
  for (const voice of voices) {
    const kept = keepVoice && (voice.voiceURI === keepVoice || voice.name === keepVoice)
    if (isNoveltyVoice(voice) && !kept) continue
    const language = primaryLanguage(voice.lang)
    const list = groups.get(language) ?? []
    list.push(voice)
    groups.set(language, list)
  }

  return [...groups.entries()]
    .map(([language, list]) => ({
      language,
      label: languageLabel(language, userLanguage || 'en'),
      voices: [...list].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      if (a.language === userLang) return -1
      if (b.language === userLang) return 1
      return a.label.localeCompare(b.label)
    })
}
