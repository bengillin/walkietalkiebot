import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createLogger, getLogLevel, setLogLevel } from './logger'

const spies = {
  log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {}),
}

beforeEach(() => {
  Object.values(spies).forEach((s) => s.mockClear())
  localStorage.clear()
  setLogLevel('debug')
})

describe('level filtering', () => {
  it('emits everything at debug', () => {
    const log = createLogger('test')
    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')

    expect(spies.log).toHaveBeenCalledTimes(2) // debug + info
    expect(spies.warn).toHaveBeenCalledTimes(1)
    expect(spies.error).toHaveBeenCalledTimes(1)
  })

  it('drops anything below the current level', () => {
    setLogLevel('warn')
    const log = createLogger('test')
    log.debug('d')
    log.info('i')
    log.warn('w')

    expect(spies.log).not.toHaveBeenCalled()
    expect(spies.warn).toHaveBeenCalledTimes(1)
  })

  it('silences everything at silent', () => {
    setLogLevel('silent')
    const log = createLogger('test')
    log.error('even errors')

    expect(spies.error).not.toHaveBeenCalled()
  })

  it('applies the level at call time, not at logger creation', () => {
    const log = createLogger('test')
    setLogLevel('error')
    log.warn('suppressed after the fact')

    expect(spies.warn).not.toHaveBeenCalled()
  })
})

describe('output shape', () => {
  it('tags each line with its scope and forwards the rest verbatim', () => {
    createLogger('voice').warn('mic unavailable', { code: 7 })

    expect(spies.warn).toHaveBeenCalledWith('[voice]', 'mic unavailable', { code: 7 })
  })
})

describe('persistence', () => {
  it('remembers the level across sessions', () => {
    setLogLevel('error')

    expect(localStorage.getItem('wtb:logLevel')).toBe('error')
    expect(getLogLevel()).toBe('error')
  })

  it('still applies the level when storage is unavailable', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(() => setLogLevel('error')).not.toThrow()
    expect(getLogLevel()).toBe('error')

    setItem.mockRestore()
  })

  it('exposes a console handle for changing the level at runtime', () => {
    expect(typeof (window as unknown as { wtbLogLevel: unknown }).wtbLogLevel).toBe('function')
  })
})
