import { describe, it, expect } from 'vitest'
import { buildPrompt } from './promptBuilder'
import { getMode } from './modes'

describe('buildPrompt', () => {
  it('builds a basic voice mode prompt', () => {
    const result = buildPrompt({
      message: 'Hello',
      mode: getMode('voice'),
    })

    expect(result).toContain('[MODE: Voice]')
    expect(result).toContain('Keep responses to 1-2 sentences')
    expect(result).toContain('User: Hello')
    expect(result).not.toContain('[Recent conversation]')
    expect(result).not.toContain('[Attached Images')
    expect(result).not.toContain('[PLAN OUTPUT')
  })

  it('includes conversation history', () => {
    const result = buildPrompt({
      message: 'What next?',
      mode: getMode('voice'),
      history: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ],
    })

    expect(result).toContain('[Recent conversation]')
    expect(result).toContain('User: Hi')
    expect(result).toContain('Assistant: Hello!')
    expect(result).toContain('[/Recent conversation]')
  })

  it('limits history to last 10 messages', () => {
    const history = Array.from({ length: 15 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
    }))

    const result = buildPrompt({
      message: 'Test',
      mode: getMode('voice'),
      history,
    })

    expect(result).not.toContain('Message 0')
    expect(result).not.toContain('Message 4')
    expect(result).toContain('Message 5')
    expect(result).toContain('Message 14')
  })

  it('includes image paths', () => {
    const result = buildPrompt({
      message: 'What is this?',
      mode: getMode('voice'),
      imagePaths: ['/tmp/wtb-images/img1.png', '/tmp/wtb-images/img2.jpg'],
    })

    expect(result).toContain('[Attached Images')
    expect(result).toContain('/tmp/wtb-images/img1.png')
    expect(result).toContain('/tmp/wtb-images/img2.jpg')
    expect(result).toContain('[/Attached Images]')
  })

  it('adds plan detection for architect mode', () => {
    const result = buildPrompt({
      message: 'Design a caching system',
      mode: getMode('architect'),
    })

    expect(result).toContain('[MODE: Architect]')
    expect(result).toContain('Think in systems')
    expect(result).toContain('[PLAN OUTPUT')
    expect(result).toContain('/tmp/wtb-plan.md')
  })

  it('does not add plan detection for voice mode', () => {
    const result = buildPrompt({
      message: 'Plan something',
      mode: getMode('voice'),
    })

    expect(result).not.toContain('[PLAN OUTPUT')
  })

  it('builds code-review mode correctly', () => {
    const result = buildPrompt({
      message: 'Review this PR',
      mode: getMode('code-review'),
    })

    expect(result).toContain('[MODE: Code Review]')
    expect(result).toContain('bugs, security issues')
    expect(result).not.toContain('[PLAN OUTPUT')
  })

  it('builds debug mode correctly', () => {
    const result = buildPrompt({
      message: 'Why is this failing?',
      mode: getMode('debug'),
    })

    expect(result).toContain('[MODE: Debug]')
    expect(result).toContain('Diagnose problems step by step')
  })

  it('builds pair mode correctly', () => {
    const result = buildPrompt({
      message: 'Let us refactor this',
      mode: getMode('pair'),
    })

    expect(result).toContain('[MODE: Pair]')
    expect(result).toContain('pair programming partner')
  })

  it('assembles blocks in correct order', () => {
    const result = buildPrompt({
      message: 'Do something',
      mode: getMode('architect'),
      history: [{ role: 'user', content: 'Hi' }],
      imagePaths: ['/tmp/img.png'],
    })

    const contextIdx = result.indexOf('[Recent conversation]')
    const imageIdx = result.indexOf('[Attached Images')
    const modeIdx = result.indexOf('[MODE: Architect]')
    const planIdx = result.indexOf('[PLAN OUTPUT')
    const userIdx = result.indexOf('User: Do something')

    expect(contextIdx).toBeLessThan(imageIdx)
    expect(imageIdx).toBeLessThan(modeIdx)
    expect(modeIdx).toBeLessThan(planIdx)
    expect(planIdx).toBeLessThan(userIdx)
  })

  it('falls back to voice mode for unknown mode name', () => {
    const result = buildPrompt({
      message: 'Hello',
      mode: getMode('nonexistent'),
    })

    expect(result).toContain('[MODE: Voice]')
  })
})
