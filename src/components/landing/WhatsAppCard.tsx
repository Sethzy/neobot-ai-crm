import { cn } from '@/lib/utils'
import { AppIcon } from '@/components/icons/app-icons'

export interface Message {
  sender: 'user' | 'assistant'
  text: string
  time?: string
  status?: 'sent' | 'delivered' | 'read'
}

interface WhatsAppCardProps {
  messages: Message[]
  width?: number
  height?: number
  className?: string
  scale?: number
  /** Render a compact WhatsApp-style green header bar (default true) */
  showHeader?: boolean
}

export function WhatsAppCard({ messages, width, height, className, scale = 1, showHeader = true }: WhatsAppCardProps) {
  return (
    <div
      style={{
        width: width,
        height: height,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}
      className={cn(
        'bg-[#C8C4BE] relative overflow-hidden flex flex-col font-sans shadow-lg shadow-black/[0.08] ring-1 ring-black/[0.06]',
        !width && 'w-full',
        !height && 'h-auto',
        className
      )}
    >
      {/* WhatsApp header bar */}
      {showHeader && (
        <div className="relative z-10 flex items-center gap-2 px-3 py-2 bg-[#075E54]">
          <AppIcon name="arrowLeft" className="h-4 w-4 text-white" />
          <div className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center flex-shrink-0">
            <AppIcon name="whatsapp" className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold leading-tight">Sunder</p>
            <p className="text-white/70 text-[10px] leading-tight">online</p>
          </div>
          <div className="flex items-center gap-3">
            <AppIcon name="phone" className="h-3.5 w-3.5 text-white" />
            <AppIcon name="more" className="h-3.5 w-3.5 text-white" />
          </div>
        </div>
      )}

      {/* Background pattern — uses the whatsapp-chat-bg class from globals.css */}
      <div className="absolute inset-0 whatsapp-chat-bg" />

      <div className="relative z-10 flex-1 p-4 md:p-6 lg:p-8 flex flex-col gap-2 md:gap-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[85%] rounded-lg px-3 py-1.5 text-[15px] leading-snug shadow-sm relative",
              msg.sender === 'user'
                ? "self-end bg-[#d9fdd3] rounded-tr-none"
                : "self-start bg-white rounded-tl-none"
            )}
          >
            {/* Bubble Tail */}
            <div
              className={cn(
                "absolute top-0 w-3 h-3 border-[6px] border-transparent",
                msg.sender === 'user'
                  ? "-right-3 border-t-[#d9fdd3] border-l-[#d9fdd3]"
                  : "-left-3 border-t-white border-r-white"
              )}
              style={{
                clipPath: msg.sender === 'user' 
                  ? 'polygon(0 0, 0 100%, 100% 0)' 
                  : 'polygon(100% 0, 100% 100%, 0 0)'
              }}
            />

            <span className="text-[#111b21] whitespace-pre-wrap block">{msg.text}</span>
            <div className={cn(
              "flex items-center gap-1 mt-1 select-none",
              msg.sender === 'user' ? "justify-end" : "justify-end"
            )}>
              <span className="text-[11px] text-[#667781] leading-none">
                {msg.time || '10:42 AM'}
              </span>
              {msg.sender === 'user' && (
                <AppIcon name="checks" className="w-3.5 h-3.5 text-[#53bdeb]" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
