import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SearchOverlay } from './SearchOverlay'
import * as api from '../../lib/api'
import { setLogLevel } from '../../lib/logger'

vi.mock('../../lib/api', () => ({ searchMessages: vi.fn() }))

const searchMessages = vi.mocked(api.searchMessages)

function renderOverlay() {
  return render(<SearchOverlay isOpen={true} onClose={vi.fn()} onSelectResult={vi.fn()} />)
}

/**
 * Type into the search box and let the 200ms debounce fire, then settle the
 * resulting state update. (waitFor polls on real timers and would deadlock
 * against the fake clock, so drive it explicitly instead.)
 */
async function search(term: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: term } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  setLogLevel('silent') // keep expected error paths off the test output
})

afterEach(() => {
  vi.useRealTimers()
})

describe('results', () => {
  it('renders matches returned by the API', async () => {
    searchMessages.mockResolvedValue({
      results: [
        {
          messageId: 'm1',
          conversationId: 'c1',
          conversationTitle: 'Deploy notes',
          snippet: 'the <b>deploy</b> step',
          role: 'user',
          timestamp: Date.now(),
        },
      ],
    } as never)

    renderOverlay()
    await search('deploy')

    expect(screen.getByText('Deploy notes')).toBeInTheDocument()
  })

  it('says "No results found" when the search genuinely matches nothing', async () => {
    searchMessages.mockResolvedValue({ results: [] } as never)

    renderOverlay()
    await search('nothing here')

    expect(screen.getByText('No results found')).toBeInTheDocument()
  })
})

describe('failure is distinguishable from emptiness', () => {
  // Regression: a rejected search used to setResults([]), rendering the exact
  // same "No results found" as a successful empty search — so an outage looked
  // like an answer.
  it('reports a failed search instead of showing "No results found"', async () => {
    searchMessages.mockRejectedValue(new Error('API error (500)'))

    renderOverlay()
    await search('deploy')

    expect(screen.getByText(/Search failed/)).toBeInTheDocument()
    expect(screen.getByText(/API error \(500\)/)).toBeInTheDocument()
    expect(screen.queryByText('No results found')).not.toBeInTheDocument()
  })

  it('falls back to a generic message for a non-Error rejection', async () => {
    searchMessages.mockRejectedValue('just a string')

    renderOverlay()
    await search('deploy')

    expect(screen.getByText(/Search is unavailable/)).toBeInTheDocument()
  })

  it('clears the failure once a later search succeeds', async () => {
    searchMessages.mockRejectedValueOnce(new Error('transient'))
    renderOverlay()
    await search('first')
    expect(screen.getByText(/Search failed/)).toBeInTheDocument()

    searchMessages.mockResolvedValue({ results: [] } as never)
    await search('second')

    expect(screen.getByText('No results found')).toBeInTheDocument()
    expect(screen.queryByText(/Search failed/)).not.toBeInTheDocument()
  })

  it('clears the failure when the query is emptied', async () => {
    searchMessages.mockRejectedValue(new Error('down'))
    renderOverlay()
    await search('query')
    expect(screen.getByText(/Search failed/)).toBeInTheDocument()

    await search('')

    expect(screen.queryByText(/Search failed/)).not.toBeInTheDocument()
  })
})
