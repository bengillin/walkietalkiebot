import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createLogger, getLogLevel, setLogLevel, _reloadLogLevel } from './logger.js'

const spies = {
  log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {}),
}

beforeEach(() => {
  Object.values(spies).forEach((s) => s.mockClear())
  setLogLevel('debug')
})

afterEach(() => {
  delete process.env.WTB_LOG_LEVEL
  _reloadLogLevel()
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
    log.error('e')

    expect(spies.log).not.toHaveBeenCalled()
    expect(spies.warn).toHaveBeenCalledTimes(1)
    expect(spies.error).toHaveBeenCalledTimes(1)
  })

  it('silences everything at silent', () => {
    setLogLevel('silent')
    const log = createLogger('test')
    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')

    expect(spies.log).not.toHaveBeenCalled()
    expect(spies.warn).not.toHaveBeenCalled()
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
    createLogger('jobs').warn('something happened', { id: 7 })

    expect(spies.warn).toHaveBeenCalledWith('[jobs]', 'something happened', { id: 7 })
  })

  it('routes diagnostics to stdout and problems to stderr', () => {
    const log = createLogger('test')
    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')

    expect(spies.log).toHaveBeenCalledWith('[test]', 'd')
    expect(spies.log).toHaveBeenCalledWith('[test]', 'i')
    expect(spies.warn).toHaveBeenCalledWith('[test]', 'w')
    expect(spies.error).toHaveBeenCalledWith('[test]', 'e')
  })
})

describe('configuration', () => {
  it('reads the level from WTB_LOG_LEVEL', () => {
    process.env.WTB_LOG_LEVEL = 'error'
    _reloadLogLevel()

    expect(getLogLevel()).toBe('error')
  })

  it('accepts the env value case-insensitively', () => {
    process.env.WTB_LOG_LEVEL = 'WARN'
    _reloadLogLevel()

    expect(getLogLevel()).toBe('warn')
  })

  it('falls back to info when the env value is missing or nonsense', () => {
    delete process.env.WTB_LOG_LEVEL
    _reloadLogLevel()
    expect(getLogLevel()).toBe('info')

    process.env.WTB_LOG_LEVEL = 'chatty'
    _reloadLogLevel()
    expect(getLogLevel()).toBe('info')
  })
})
