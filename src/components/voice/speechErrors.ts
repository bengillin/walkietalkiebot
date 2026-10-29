// Classification of Web Speech API recognition errors, shared by push-to-talk,
// continuous listening and wake word detection so they agree on when retrying
// is pointless.

/** Errors no retry will fix: the mic is blocked, missing or unsupported. */
const FATAL_ERRORS = new Set([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
  'language-not-supported',
])

/** Part of normal operation: silence, or a stop we asked for. */
const BENIGN_ERRORS = new Set(['no-speech', 'aborted'])

/** After this many consecutive transient failures, stop retrying. */
export const MAX_SPEECH_RETRIES = 5

export function isFatalSpeechError(code: string): boolean {
  return FATAL_ERRORS.has(code)
}

export function isBenignSpeechError(code: string): boolean {
  return BENIGN_ERRORS.has(code)
}

/** Exponential backoff for automatic restarts: base, 2×base, 4×base… capped. */
export function speechRetryDelay(failures: number, baseMs: number, maxMs = 30_000): number {
  return Math.min(baseMs * 2 ** Math.max(0, failures), maxMs)
}

/** A message a person can act on. */
export function describeSpeechError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access is blocked. Allow it in your browser’s site settings, then reload to use voice.'
    case 'audio-capture':
      return 'No microphone found. Connect one, then reload to use voice.'
    case 'language-not-supported':
      return 'Speech recognition doesn’t support this language in your browser.'
    case 'network':
      return 'Speech recognition needs a network connection and couldn’t reach its service.'
    default:
      return `Speech recognition stopped working (${code}).`
  }
}
