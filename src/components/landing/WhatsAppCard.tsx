import { cn } from '@/lib/utils'
import { CheckCheck } from 'lucide-react'

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
        "bg-[#ECE5DD] relative overflow-hidden flex flex-col font-sans",
        !width && "w-full",
        !height && "h-auto",
        className
      )}
    >
      {/* WhatsApp header bar */}
      {showHeader && (
        <div className="relative z-10 flex items-center gap-2 px-3 py-2 bg-[#075E54]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <div className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold leading-tight">NeoBot</p>
            <p className="text-white/70 text-[10px] leading-tight">online</p>
          </div>
          <div className="flex items-center gap-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15.05 5A5 5 0 0119 8.95M15.05 1A9 9 0 0123 8.94M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z" />
            </svg>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
              <circle cx="12" cy="5" r="1.5" fill="white" />
              <circle cx="12" cy="12" r="1.5" fill="white" />
              <circle cx="12" cy="19" r="1.5" fill="white" />
            </svg>
          </div>
        </div>
      )}

      {/* Background pattern — uses the whatsapp-chat-bg class from index.css */}
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
                <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
