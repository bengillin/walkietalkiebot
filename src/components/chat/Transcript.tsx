import './Transcript.css'

interface TranscriptProps {
  text: string
  label?: string
}

export function Transcript({ text, label }: TranscriptProps) {
  if (!text) return null

  return (
    <div className="transcript">
      {label && <span className="transcript__label">{label}</span>}
      <p className="transcript__text">{text}</p>
    </div>
  )
}
