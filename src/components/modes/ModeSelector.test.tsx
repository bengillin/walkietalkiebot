import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModeSelector } from './ModeSelector'
import type { ModeInfo } from '../../lib/api'

const mockModes: ModeInfo[] = [
  { name: 'voice', label: 'Voice', description: 'Brief, spoken responses', icon: '🎙️' },
  { name: 'architect', label: 'Architect', description: 'Systems thinking', icon: '🏗️' },
  { name: 'debug', label: 'Debug', description: 'Problem diagnosis', icon: '🐛' },
]

describe('ModeSelector', () => {
  it('renders current mode label and icon', () => {
    render(<ModeSelector modes={mockModes} currentMode="voice" onSelectMode={() => {}} />)
    expect(screen.getByText('Voice')).toBeInTheDocument()
    expect(screen.getByText('🎙️')).toBeInTheDocument()
  })

  it('opens dropdown on click', () => {
    render(<ModeSelector modes={mockModes} currentMode="voice" onSelectMode={() => {}} />)
    expect(screen.queryByText('Systems thinking')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTitle(/^Mode:/))
    expect(screen.getByText('Systems thinking')).toBeInTheDocument()
    expect(screen.getByText('Problem diagnosis')).toBeInTheDocument()
  })

  it('calls onSelectMode when option is clicked', () => {
    const onSelect = vi.fn()
    render(<ModeSelector modes={mockModes} currentMode="voice" onSelectMode={onSelect} />)

    fireEvent.click(screen.getByTitle(/^Mode:/))
    fireEvent.click(screen.getByText('Architect'))

    expect(onSelect).toHaveBeenCalledWith('architect')
  })

  it('closes dropdown after selection', () => {
    render(<ModeSelector modes={mockModes} currentMode="voice" onSelectMode={() => {}} />)

    fireEvent.click(screen.getByTitle(/^Mode:/))
    expect(screen.getByText('Systems thinking')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Debug'))
    expect(screen.queryByText('Systems thinking')).not.toBeInTheDocument()
  })

  it('highlights active mode in dropdown', () => {
    render(<ModeSelector modes={mockModes} currentMode="architect" onSelectMode={() => {}} />)
    fireEvent.click(screen.getByTitle(/^Mode:/))

    // Find the option button (not the trigger) — look for the one with the description
    const architectDesc = screen.getByText('Systems thinking')
    const architectOption = architectDesc.closest('button')
    expect(architectOption?.className).toContain('--active')
  })

  it('returns null when no modes available', () => {
    const { container } = render(<ModeSelector modes={[]} currentMode="voice" onSelectMode={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
})
