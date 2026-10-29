import { describe, it, expect } from 'vitest'
import { groupVoices, isNoveltyVoice } from './voiceList'

const v = (name: string, lang: string) => ({ name, lang, voiceURI: `uri:${name}` })

describe('voice list', () => {
  it('recognises macOS novelty voices', () => {
    for (const name of ['Albert', 'Bad News', 'Zarvox', 'Pipe Organ', 'Whisper']) {
      expect(isNoveltyVoice({ name })).toBe(true)
    }
    expect(isNoveltyVoice({ name: 'Samantha' })).toBe(false)
  })

  it('drops novelty voices and groups by language, user language first', () => {
    const groups = groupVoices(
      [
        v('Thomas', 'fr-FR'),
        v('Zarvox', 'en-US'),
        v('Samantha', 'en-US'),
        v('Anna', 'de-DE'),
        v('Daniel', 'en-GB'),
        v('Bells', 'en-US'),
      ],
      'fr-CA',
    )
    expect(groups[0]?.language).toBe('fr')
    expect(groups.map((g) => g.language).sort()).toEqual(['de', 'en', 'fr'])
    const english = groups.find((g) => g.language === 'en')
    expect(english?.voices.map((x) => x.name)).toEqual(['Daniel', 'Samantha'])
    expect(groups.flatMap((g) => g.voices).some((x) => x.name === 'Zarvox')).toBe(false)
  })

  it('keeps the currently selected voice even if it is a novelty one', () => {
    const groups = groupVoices(
      [v('Zarvox', 'en-US'), v('Samantha', 'en-US')],
      'en-US',
      'uri:Zarvox',
    )
    expect(groups[0]?.voices.map((x) => x.name)).toEqual(['Samantha', 'Zarvox'])
  })

  it('labels groups with a readable language name', () => {
    const [group] = groupVoices([v('Samantha', 'en-US')], 'en-US')
    expect(group?.label).toBe('English')
  })
})
