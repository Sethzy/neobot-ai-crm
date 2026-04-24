'use client';

/**
 * WhatsApp phone mockup for the ProductShowcase section.
 * Uses Magic UI Iphone frame with WhatsApp chat UI inside.
 * Streams bot messages in chunks with lightweight CSS transitions,
 * pauses offscreen, then cycles through conversations.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Iphone } from '@/components/ui/iphone'

interface FileAttachment {
  name: string
  /** 'excel' | 'pdf' — determines the icon color/shape */
  type: 'excel' | 'pdf'
  size: string
}

interface WhatsAppMessage {
  id: string
  sender: 'user' | 'bot'
  content: string
  time: string
  cards?: { name: string; company: string }[]
  files?: FileAttachment[]
}

interface Conversation {
  messages: WhatsAppMessage[]
}

/** Inline Excel icon (green) */
function ExcelIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
      <rect x="3" y="3" width="18" height="18" rx="2" fill="#217346" />
      <path d="M7 7L10 12L7 17H9L11 13.5L13 17H15L12 12L15 7H13L11 10.5L9 7H7Z" fill="white" />
    </svg>
  )
}

/** Inline PDF icon (red) */
function PdfIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
      <rect x="3" y="3" width="18" height="18" rx="2" fill="#E53E3E" />
      <text x="12" y="15.5" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold" fontFamily="sans-serif">PDF</text>
    </svg>
  )
}

const conversations: Conversation[] = [
  {
    messages: [
      {
        id: 'a1', sender: 'bot', content: 'Found 23 F&B owners in Singapore that match your criteria — scraped 3 directories, enriched via LinkedIn. Here\'s a preview:', time: '11:42 AM',
        cards: [
          { name: 'Rachel Tan', company: 'Kopi Culture Pte Ltd' },
          { name: 'David Lim', company: 'Golden Bowl Restaurant' },
          { name: 'Sarah Wong', company: 'FreshBites Catering' },
        ],
      },
      { id: 'a2', sender: 'bot', content: 'Drafted a personalised email for each one referencing their latest news. Ready to send?', time: '11:42 AM' },
      { id: 'a3', sender: 'user', content: 'Send them and book meetings with anyone who replies', time: '11:43 AM' },
      { id: 'a4', sender: 'bot', content: 'All sent. I\'ll monitor replies, auto-book meetings from your calendar availability, and prep a brief before each call.', time: '11:43 AM' },
    ],
  },
  {
    messages: [
      { id: 'b1', sender: 'bot', content: 'Morning update — while you slept:\n\n• Rachel replied — meeting booked for Tue 2pm, brief attached\n• Scraped 8 new listings matching your criteria\n• Generated a pitch deck for the Globex deal\n• 2 contracts reviewed, flagged 1 clause in Johnson\'s', time: '7:30 AM' },
      { id: 'b2', sender: 'user', content: 'Send Rachel a voice note confirming Tuesday', time: '7:31 AM' },
      { id: 'b3', sender: 'bot', content: 'Voice note cloned in your voice and sent via WhatsApp. Also attached the meeting brief to her calendar invite.', time: '7:31 AM' },
      { id: 'b4', sender: 'user', content: 'Show me that flagged clause', time: '7:32 AM' },
      { id: 'b5', sender: 'bot', content: 'Section 4.2 — non-compete extends 18 months post-termination across all of Southeast Asia. Unusual for this deal size. Want me to draft a revision?', time: '7:32 AM' },
    ],
  },
  {
    messages: [
      {
        id: 'c1', sender: 'bot', content: 'Weekly report ready. 47 leads tracked, 12 meetings booked, 3 deals closed ($18.4K). Your files:', time: '9:05 AM',
        files: [
          { name: 'Pipeline_Jan_2026.xlsx', type: 'excel', size: '2.4 MB' },
          { name: 'Monthly_Summary.pdf', type: 'pdf', size: '840 KB' },
        ],
      },
      { id: 'c2', sender: 'user', content: 'Create a LinkedIn post celebrating the wins and a slide deck for my team standup', time: '9:07 AM' },
      {
        id: 'c3', sender: 'bot', content: 'LinkedIn post drafted and scheduled for 12pm. 6-slide deck generated with pipeline charts, win highlights, and next week\'s targets.', time: '9:07 AM',
        files: [
          { name: 'Team_Standup_Slides.pdf', type: 'pdf', size: '3.2 MB' },
        ],
      },
      { id: 'c4', sender: 'user', content: 'Send the deck to my team on Gmail and the PDF summary to my business partner', time: '9:08 AM' },
      { id: 'c5', sender: 'bot', content: 'Both sent — team gets the deck, David gets the summary with a cover note. Calendar reminder set for your standup at 10am.', time: '9:08 AM' },
    ],
  },
]

const WORDS_PER_TICK = 3
const WORD_TICK_MS = 90
const IN_VIEW_ROOT_MARGIN = '300px 0px'
const IN_VIEW_THRESHOLD = 0.01

interface WhatsAppPhoneMockupProps {
  isVisible?: boolean
}

export function WhatsAppPhoneMockup({ isVisible = false }: WhatsAppPhoneMockupProps) {
  const [convoIndex, setConvoIndex] = useState(0)
  const [visibleCount, setVisibleCount] = useState(0)
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [showTyping, setShowTyping] = useState(false)
  const [isFading, setIsFading] = useState(false)
  const [isInView, setIsInView] = useState(false)

  const hasStartedRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const timersRef = useRef<{ intervals: ReturnType<typeof setInterval>[]; timeouts: ReturnType<typeof setTimeout>[] }>({ intervals: [], timeouts: [] })
  const msgIdxRef = useRef(0)
  const wordIdxRef = useRef(0)

  const currentConvo = conversations[convoIndex]
  const shouldAnimate = isVisible && isInView

  useEffect(() => {
    const element = rootRef.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting)
      },
      {
        threshold: IN_VIEW_THRESHOLD,
        rootMargin: IN_VIEW_ROOT_MARGIN,
      }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Keep chat pinned to latest content without smooth scroll overhead.
  useEffect(() => {
    const el = chatContainerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'auto' })
  }, [visibleCount, showTyping])

  useEffect(() => {
    const el = chatContainerRef.current
    if (!el || streamingText.length === 0) return
    el.scrollTop = el.scrollHeight
  }, [streamingText])

  const clearAllTimers = useCallback(() => {
    timersRef.current.intervals.forEach(clearInterval)
    timersRef.current.timeouts.forEach(clearTimeout)
    timersRef.current = { intervals: [], timeouts: [] }
  }, [])

  const addTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms)
    timersRef.current.timeouts.push(id)
    return id
  }, [])

  const addInterval = useCallback((fn: () => void, ms: number) => {
    const id = setInterval(fn, ms)
    timersRef.current.intervals.push(id)
    return id
  }, [])

  const streamConversation = useCallback((messages: WhatsAppMessage[]) => {
    const el = chatContainerRef.current
    if (el) el.scrollTop = 0

    setVisibleCount(1)
    setStreamingText('')
    setIsStreaming(false)
    setShowTyping(false)
    setIsFading(false)

    const remaining = messages.slice(1)
    msgIdxRef.current = 0
    wordIdxRef.current = 0

    const streamNext = () => {
      if (!hasStartedRef.current) return

      if (msgIdxRef.current >= remaining.length) {
        setIsStreaming(false)
        setShowTyping(false)
        addTimeout(() => {
          if (!hasStartedRef.current) return
          setIsFading(true)
          addTimeout(() => {
            if (!hasStartedRef.current) return
            setConvoIndex((prev) => (prev + 1) % conversations.length)
          }, 450)
        }, 1200)
        return
      }

      const msg = remaining[msgIdxRef.current]

      if (msg.sender === 'user') {
        setShowTyping(false)
        setIsStreaming(false)
        setVisibleCount((c) => c + 1)
        msgIdxRef.current++
        wordIdxRef.current = 0
        addTimeout(streamNext, 420)
        return
      }

      setShowTyping(true)
      setIsStreaming(false)

      addTimeout(() => {
        if (!hasStartedRef.current) return

        setShowTyping(false)
        setIsStreaming(true)
        const words = msg.content.split(' ')

        const interval = addInterval(() => {
          if (!hasStartedRef.current) {
            clearInterval(interval)
            return
          }

          const nextWordCount = Math.min(words.length, wordIdxRef.current + WORDS_PER_TICK)
          wordIdxRef.current = nextWordCount

          if (nextWordCount < words.length) {
            setStreamingText(words.slice(0, nextWordCount).join(' '))
            return
          }

          clearInterval(interval)
          setVisibleCount((c) => c + 1)
          setStreamingText('')
          setIsStreaming(false)
          msgIdxRef.current++
          wordIdxRef.current = 0
          addTimeout(streamNext, 300)
        }, WORD_TICK_MS)
      }, 500)
    }

    addTimeout(streamNext, 500)
  }, [addInterval, addTimeout])

  useEffect(() => {
    if (!shouldAnimate) {
      hasStartedRef.current = false
      clearAllTimers()
      const resetId = window.setTimeout(() => {
        // Keep a stable static frame when paused so UI never appears "stuck" mid-typing.
        setVisibleCount(1)
        setStreamingText('')
        setIsStreaming(false)
        setShowTyping(false)
        setIsFading(false)
      }, 0)

      return () => {
        window.clearTimeout(resetId)
      }
    }

    hasStartedRef.current = true
    clearAllTimers()

    const kickoffId = window.setTimeout(() => {
      if (!hasStartedRef.current) return
      streamConversation(conversations[convoIndex].messages)
    }, 0)

    return () => {
      window.clearTimeout(kickoffId)
    }
  }, [clearAllTimers, convoIndex, shouldAnimate, streamConversation])

  // Ensure StrictMode effect replay doesn't leave the animation stuck.
  useEffect(
    () => () => {
      hasStartedRef.current = false
      clearAllTimers()
    },
    [clearAllTimers]
  )

  return (
    <div ref={rootRef} className="relative mx-auto w-full max-w-[300px]">
      <Iphone className="[filter:drop-shadow(0_25px_50px_rgba(0,0,0,0.15))_drop-shadow(0_12px_20px_rgba(0,0,0,0.08))]">
        <div className="relative flex h-full flex-col bg-[#C8C4BE]">
          {/* Status bar area — sits alongside the Dynamic Island */}
          <div className="flex items-end justify-between bg-[#075E54] px-5 pt-10 pb-0.5 text-[9px] font-medium text-white/90">
            <span>11:42</span>
            <div className="flex items-center gap-1">
              <svg width="12" height="10" viewBox="0 0 12 10" fill="currentColor">
                <rect x="0" y="7" width="2" height="3" rx="0.5" />
                <rect x="3" y="5" width="2" height="5" rx="0.5" />
                <rect x="6" y="3" width="2" height="7" rx="0.5" />
                <rect x="9" y="0" width="2" height="10" rx="0.5" />
              </svg>
              <svg width="12" height="10" viewBox="0 0 12 10" fill="currentColor">
                <path d="M6 9a1 1 0 100-2 1 1 0 000 2zM2.5 5.5a5 5 0 017 0" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                <path d="M0.5 3.5a8 8 0 0111 0" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
              </svg>
              <svg width="18" height="10" viewBox="0 0 18 10" fill="currentColor">
                <rect x="0" y="1" width="15" height="8" rx="1.5" stroke="currentColor" strokeWidth="1" fill="none" />
                <rect x="1.5" y="2.5" width="11" height="5" rx="0.5" fill="currentColor" />
                <rect x="15" y="3" width="2" height="4" rx="0.5" />
              </svg>
            </div>
          </div>

          {/* WhatsApp header */}
          <div className="flex items-center gap-2 bg-[#075E54] px-2 py-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#25D366]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] leading-tight font-semibold text-white">Sunder</p>
              <p className="text-[9px] leading-tight text-white/70">online</p>
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

          {/* Chat area */}
          <div
            ref={chatContainerRef}
            className={`whatsapp-chat-bg scrollbar-hide flex-1 overflow-y-auto space-y-1.5 px-2 py-2 transition-opacity duration-300 ${isFading ? 'opacity-0' : 'opacity-100'}`}
          >
            {currentConvo.messages.map((msg, index) => {
              const isFullyVisible = index < visibleCount
              const isCurrentlyStreaming = index === visibleCount && isStreaming && msg.sender === 'bot'

              if (!isFullyVisible && !isCurrentlyStreaming) return null

              const isUser = msg.sender === 'user'

              return (
                <div
                  key={msg.id}
                  className={`phone-bubble-enter flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`relative max-w-[82%] rounded-lg px-2 py-1 text-[10px] leading-relaxed shadow-sm ${
                      isUser
                        ? 'rounded-tr-none bg-[#DCF8C6]'
                        : 'rounded-tl-none bg-white'
                    }`}
                  >
                    <div
                      className={`absolute top-0 h-2 w-2 ${
                        isUser ? '-right-1 bg-[#DCF8C6]' : '-left-1 bg-white'
                      }`}
                      style={{
                        clipPath: isUser
                          ? 'polygon(0 0, 100% 0, 0 100%)'
                          : 'polygon(0 0, 100% 0, 100% 100%)',
                      }}
                    />

                    <p className="text-gray-900">
                      {isCurrentlyStreaming ? streamingText : msg.content}
                      {isCurrentlyStreaming && (
                        <span className="ml-0.5 inline-block h-2.5 w-0.5 animate-pulse rounded-sm bg-gray-500 align-middle" />
                      )}
                    </p>

                    {msg.cards && isFullyVisible ? (
                      <div className="mt-1 space-y-px">
                        {msg.cards.map((card, i) => (
                          <div key={i} className="flex items-center gap-1 rounded border border-gray-100 bg-gray-50 px-1.5 py-0.5">
                            <span className="text-[8px] font-medium text-gray-900">{card.name}</span>
                            <span className="text-[7px] text-gray-400">·</span>
                            <span className="truncate text-[7px] text-gray-500">{card.company}</span>
                          </div>
                        ))}
                        <p className="mt-0.5 text-[7px] text-gray-400">+20 more</p>
                      </div>
                    ) : null}

                    {msg.files && isFullyVisible ? (
                      <div className="mt-1 space-y-0.5">
                        {msg.files.map((file, i) => (
                          <div key={i} className="flex items-center gap-1.5 rounded border border-gray-100 bg-gray-50 px-1.5 py-1">
                            {file.type === 'excel' ? <ExcelIcon /> : <PdfIcon />}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[8px] font-medium text-gray-900">{file.name}</p>
                              <p className="text-[7px] text-gray-400">{file.size}</p>
                            </div>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                            </svg>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className={`mt-0.5 flex items-center gap-0.5 ${isUser ? 'justify-end' : ''}`}>
                      <span className="text-[8px] text-gray-400">{msg.time}</span>
                      {isUser && isFullyVisible ? (
                        <svg width="13" height="8" viewBox="0 0 16 10" fill="none" className="ml-0.5">
                          <path d="M1.5 5.5L4.5 8.5L10.5 1.5" stroke="#53BDEB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M5 5.5L8 8.5L14 1.5" stroke="#53BDEB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}

            {showTyping ? (
              <div className="phone-typing-enter flex justify-start">
                <div className="relative rounded-lg rounded-tl-none bg-white px-3 py-2 shadow-sm">
                  <div className="absolute top-0 -left-1 h-2 w-2 bg-white" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Bottom input bar */}
          <div className="flex items-center gap-1 bg-[#F0F0F0] px-1.5 py-1">
            <button className="flex h-7 w-7 flex-shrink-0 items-center justify-center text-gray-500">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </button>
            <div className="flex flex-1 items-center gap-1 rounded-full bg-white px-3 py-1">
              <span className="flex-1 text-[10px] text-gray-400">Message</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            <button className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#25D366]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Home indicator */}
          <div className="flex justify-center bg-[#F0F0F0] py-2">
            <div className="h-[3px] w-20 rounded-full bg-black/20" />
          </div>

          {/* Glass reflection overlay */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-transparent" />
        </div>
      </Iphone>
    </div>
  )
}
