import { useTheme } from '../../contexts/ThemeContext'
import { RetroTape, getTapeColor } from './RetroTape'
import { ChatThread } from './ChatThread'
import { BuddyEntry } from './BuddyEntry'
import { FloppyDisk } from './FloppyDisk'
import { GuestbookPage } from './GuestbookPage'
import { RainbowFloppy } from './RainbowFloppy'

export interface ConversationItemProps {
  title: string
  messageCount: number
  onClick?: () => void
  isSelected?: boolean
  isEjecting?: boolean
  colorIndex: number
}

export function ConversationItem(props: ConversationItemProps) {
  const { theme } = useTheme()

  switch (theme) {
    case 'imessage':
      return <ChatThread {...props} />
    case 'aol':
      return <BuddyEntry {...props} />
    case 'classic-mac':
      return <FloppyDisk {...props} />
    case 'geocities':
      return <GuestbookPage {...props} />
    case 'apple-1984':
      return <RainbowFloppy {...props} />
    case 'mccallister':
    default:
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
}
