import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const apiMock = vi.hoisted(() => ({
  isDatabaseAvailable: vi.fn(),
  getStatus: vi.fn(),
  needsMigration: vi.fn(),
}))
const storeMock = vi.hoisted(() => ({ enableServerSync: vi.fn(), setProjectId: vi.fn() }))
vi.mock('../lib/api', () => apiMock)
vi.mock('../lib/store', () => storeMock)

import { useServerSync } from './useServerSync'

beforeEach(() => {
  vi.useFakeTimers()
  for (const fn of [...Object.values(apiMock), ...Object.values(storeMock)]) fn.mockReset()
  apiMock.getStatus.mockResolvedValue({ cwd: '/p' })
  apiMock.needsMigration.mockReturnValue(false)
})
afterEach(() => vi.useRealTimers())

describe('useServerSync', () => {
  it('keeps checking while the server is down, then syncs once it is up', async () => {
    apiMock.isDatabaseAvailable.mockResolvedValueOnce(false).mockResolvedValueOnce(false)
    apiMock.isDatabaseAvailable.mockResolvedValue(true)
    const sync = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useServerSync(vi.fn(), sync))

    await vi.advanceTimersByTimeAsync(0)
    expect(storeMock.enableServerSync).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000) // 2nd check: still down
    expect(apiMock.isDatabaseAvailable).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(4000) // 3rd check: up
    expect(storeMock.enableServerSync).toHaveBeenCalled()
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('syncs even when some tapes failed to migrate', async () => {
    apiMock.isDatabaseAvailable.mockResolvedValue(true)
    apiMock.needsMigration.mockReturnValue(true)
    const sync = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useServerSync(vi.fn().mockResolvedValue(false), sync))
    await vi.advanceTimersByTimeAsync(0)
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('stops checking when unmounted', async () => {
    apiMock.isDatabaseAvailable.mockResolvedValue(false)
    const { unmount } = renderHook(() => useServerSync(vi.fn(), vi.fn()))
    await vi.advanceTimersByTimeAsync(0)
    unmount()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(apiMock.isDatabaseAvailable).toHaveBeenCalledTimes(1)
  })
})
