import { describe, it, expect, afterEach } from 'vitest'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { getWtbDir } from './paths.js'
import { getDbPath } from './db/index.js'

describe('getWtbDir', () => {
  afterEach(() => {
    delete process.env.WTB_DIR
  })

  it('defaults to ~/.wtb', () => {
    delete process.env.WTB_DIR
    expect(getWtbDir()).toBe(join(homedir(), '.wtb'))
  })

  it('honors WTB_DIR, resolved to an absolute path', () => {
    process.env.WTB_DIR = 'some/rel/dir'
    expect(getWtbDir()).toBe(resolve('some/rel/dir'))
  })

  it('puts the database inside the data directory', () => {
    process.env.WTB_DIR = '/tmp/wtb-test-dir'
    expect(getDbPath()).toBe('/tmp/wtb-test-dir/wtb.db')
  })
})
