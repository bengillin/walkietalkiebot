import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MediaLibrary } from './MediaLibrary'
import type { Conversation } from '../../types'

const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    title: 'First conversation',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Hello with image',
        timestamp: 1700000000000,
        images: [
          {
            id: 'img-1',
            dataUrl: 'data:image/png;base64,abc123',
            fileName: 'screenshot.png',
            description: 'A screenshot of the app',
          },
        ],
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'Hi there!',
        timestamp: 1700000001000,
      },
    ],
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
  },
  {
    id: 'conv-2',
    title: 'Second conversation',
    messages: [
      {
        id: 'msg-3',
        role: 'user',
        content: 'Another image',
        timestamp: 1700000002000,
        images: [
          {
            id: 'img-2',
            dataUrl: 'data:image/jpeg;base64,xyz789',
            fileName: 'photo.jpg',
          },
          {
            id: 'img-3',
            dataUrl: 'data:image/png;base64,def456',
            fileName: 'diagram.png',
            description: 'Architecture diagram',
          },
        ],
      },
    ],
    createdAt: 1700000002000,
    updatedAt: 1700000002000,
  },
]

const emptyConversations: Conversation[] = [
  {
    id: 'conv-empty',
    title: 'No images here',
    messages: [
      { id: 'msg-empty', role: 'user', content: 'Just text', timestamp: 1700000000000 },
    ],
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
]

describe('MediaLibrary', () => {
  it('renders the media library title', () => {
    const onClose = vi.fn()
    render(<MediaLibrary conversations={mockConversations} onClose={onClose} />)
    expect(screen.getByText('Media Library')).toBeInTheDocument()
  })

  it('displays empty state when no images', () => {
    const onClose = vi.fn()
    render(<MediaLibrary conversations={emptyConversations} onClose={onClose} />)
    expect(screen.getByText('No images yet')).toBeInTheDocument()
    expect(screen.getByText('Images shared in conversations will appear here')).toBeInTheDocument()
  })

  it('renders all three images', () => {
    const onClose = vi.fn()
    render(<MediaLibrary conversations={mockConversations} onClose={onClose} />)
    expect(screen.getAllByRole('img')).toHaveLength(3)
  })

  it('renders all images from conversations', () => {
    const onClose = vi.fn()
    render(<MediaLibrary conversations={mockConversations} onClose={onClose} />)
    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(3)
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(<MediaLibrary conversations={mockConversations} onClose={onClose} />)
    const backdrop = container.querySelector('.media-library__backdrop')!
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('opens lightbox when image is clicked', () => {
    const onClose = vi.fn()
    render(<MediaLibrary conversations={mockConversations} onClose={onClose} />)
    const images = screen.getAllByRole('img')
    fireEvent.click(images[0])
    expect(screen.getByText('Analysis')).toBeInTheDocument()
  })

  it('shows image description in lightbox', () => {
    const onClose = vi.fn()
    render(<MediaLibrary conversations={mockConversations} onClose={onClose} />)
    const images = screen.getAllByRole('img')
    // Click screenshot.png which has a description (sorted newest first, so it's last)
    const screenshotImg = images.find(img => img.getAttribute('alt') === 'screenshot.png')
    fireEvent.click(screenshotImg!)
    expect(screen.getByText('A screenshot of the app')).toBeInTheDocument()
  })

  it('shows no analysis message when image has no description', () => {
    const onClose = vi.fn()
    render(<MediaLibrary conversations={mockConversations} onClose={onClose} />)
    const images = screen.getAllByRole('img')
    // Click photo.jpg which has no description
    const photoImg = images.find(img => img.getAttribute('alt') === 'photo.jpg')
    fireEvent.click(photoImg!)
    expect(screen.getByText('No analysis available')).toBeInTheDocument()
  })

  it('shows conversation title in lightbox', () => {
    const onClose = vi.fn()
    render(<MediaLibrary conversations={mockConversations} onClose={onClose} />)
    const images = screen.getAllByRole('img')
    // Click screenshot.png which is from First conversation
    const screenshotImg = images.find(img => img.getAttribute('alt') === 'screenshot.png')
    fireEvent.click(screenshotImg!)
    expect(screen.getByText(/From: First conversation/)).toBeInTheDocument()
  })

  it('has a sort dropdown', () => {
    const onClose = vi.fn()
    render(<MediaLibrary conversations={mockConversations} onClose={onClose} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByText('Newest first')).toBeInTheDocument()
  })

  it('changes sort order when dropdown is changed', () => {
    const onClose = vi.fn()
    render(<MediaLibrary conversations={mockConversations} onClose={onClose} />)
    const sortDropdown = screen.getByRole('combobox')
    fireEvent.change(sortDropdown, { target: { value: 'oldest' } })
    expect(sortDropdown).toHaveValue('oldest')
  })
})
