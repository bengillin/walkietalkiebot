import { RetroTape, getTapeColor } from './RetroTape'

export interface ConversationItemProps {
  title: string
  messageCount: number
  onClick?: () => void
  isSelected?: boolean
  isEjecting?: boolean
  colorIndex: number
}

export function ConversationItem(props: ConversationItemProps) {
  return (
    <RetroTape
      title={props.title}
      color={getTapeColor(props.colorIndex)}
      tapeUsage={Math.min(props.messageCount / 50, 1)}
      isSelected={props.isSelected}
      isEjecting={props.isEjecting}
      onClick={props.onClick}
    />
  )
}
