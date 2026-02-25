/**
 * Auth page layout with paper texture background and feature highlights.
 */
import { PaperTextureBackground } from '@/components/landing/PaperTextureBackground'

function ChatBubbleIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
    </svg>
  )
}

function CheckCircleIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  )
}

function BoltIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
    </svg>
  )
}

function FeatureItem({ icon, title, description, index }: { icon: React.ReactNode; title: string; description: string; index: number }) {
  return (
    <div 
      className="group relative flex gap-5 rounded-2xl bg-white/10 p-6 backdrop-blur-xl border border-white/10 shadow-2xl transition-all duration-500 hover:bg-white/20 hover:-translate-y-1.5 hover:shadow-blue-900/40 animate-slide-up"
      style={{ animationDelay: `${index * 150}ms`, opacity: 0 }}
    >
      {/* Shine effect on hover */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
        <div className="absolute -inset-[100%] bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 translate-x-[-100%] group-hover:transition-transform group-hover:duration-1000 group-hover:translate-x-[100%] ease-in-out" />
      </div>

      <div className="relative flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-white/10 text-white border border-white/10 shadow-inner group-hover:scale-110 group-hover:bg-white/20 group-hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all duration-300">
        {icon}
      </div>
      <div className="relative">
        <h3 className="text-lg font-medium text-white tracking-tight font-serif">{title}</h3>
        <p className="mt-1 text-sm text-blue-50/80 leading-relaxed font-normal font-display group-hover:text-white transition-colors duration-300">{description}</p>
      </div>
    </div>
  )
}

export function SlimLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="relative flex min-h-screen justify-center md:px-12 lg:px-0 bg-white">
        <div className="relative z-10 flex flex-1 flex-col bg-background px-4 py-10 shadow-2xl sm:justify-center md:flex-none md:px-28">
          <main className="mx-auto w-full max-w-sm sm:px-4 md:w-80 md:max-w-sm md:px-0">
            {children}
          </main>
        </div>
        <div className="hidden sm:contents lg:relative lg:block lg:flex-1">
          <PaperTextureBackground />
          {/* Feature highlights overlay */}
          <div className="relative z-10 flex h-full items-center justify-center p-12">
            <div className="flex flex-col gap-6 w-full max-w-md">
              <FeatureItem
                index={0}
                icon={<ChatBubbleIcon />}
                title="Just message. Neo handles it."
                description="Schedule meetings, send follow-ups, update your CRM — all from one app."
              />
              <FeatureItem
                index={1}
                icon={<CheckCircleIcon />}
                title="Remembers every conversation"
                description="Transcripts, action items, client details — nothing slips through the cracks."
              />
              <FeatureItem
                index={2}
                icon={<BoltIcon />}
                title="Works while you sleep"
                description="Morning briefs, proactive follow-ups, and deal alerts — before you even ask."
              />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
