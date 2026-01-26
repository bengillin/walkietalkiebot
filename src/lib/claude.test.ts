import { describe, it, expect } from 'vitest'
import { extractUrls } from './claude'

describe('extractUrls', () => {
  it('extracts a simple URL', () => {
    const text = 'Check out https://example.com for more info'
    expect(extractUrls(text)).toEqual(['https://example.com'])
  })

  it('extracts multiple URLs', () => {
    const text = 'Visit https://google.com and https://github.com today'
    expect(extractUrls(text)).toEqual(['https://google.com', 'https://github.com'])
  })

  it('handles URLs with paths and query params', () => {
    const text = 'See https://example.com/path/to/page?foo=bar&baz=qux'
    expect(extractUrls(text)).toEqual(['https://example.com/path/to/page?foo=bar&baz=qux'])
  })

  it('removes trailing punctuation', () => {
    const text = 'Check https://example.com, and also https://other.com.'
    expect(extractUrls(text)).toEqual(['https://example.com', 'https://other.com'])
  })

  it('handles URLs ending with parentheses correctly', () => {
    const text = 'See (https://example.com/page) for details'
    expect(extractUrls(text)).toEqual(['https://example.com/page'])
  })

  it('deduplicates URLs', () => {
    const text = 'Visit https://example.com and again https://example.com'
    expect(extractUrls(text)).toEqual(['https://example.com'])
  })

  it('returns empty array when no URLs', () => {
    const text = 'No links here, just plain text'
    expect(extractUrls(text)).toEqual([])
  })

  it('handles http URLs', () => {
    const text = 'Old site at http://legacy.example.com'
    expect(extractUrls(text)).toEqual(['http://legacy.example.com'])
  })

  it('handles URLs with fragments', () => {
    const text = 'Jump to https://example.com/page#section'
    expect(extractUrls(text)).toEqual(['https://example.com/page#section'])
  })
})
