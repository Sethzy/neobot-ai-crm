/**
 * Act 4: AI Agent Workflow Pipeline — 8 integration logos cycle through 4 visible
 * slots, scroll into the NeoBot processing hub, and produce action cards on the right.
 */
import React from 'react'
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  random,
} from 'remotion'

const COLORS = {
  scanner: '#2D6A4F',
  brief: '#F59E0B',
  gift: '#EC4899',
  referral: '#10B981',
  route: '#3B82F6',
}

const PARTICLE_COLORS = ['#2D6A4F', '#40916C', '#C8962E', '#F59E0B', '#10B981', '#3B82F6']

/** Action icons for output cards */
const ActionIcons: Record<string, React.FC<{ color: string }>> = {
  brief: ({ color }) => (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="5" stroke={color} strokeWidth="2" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  gift: ({ color }) => (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="8" width="18" height="4" rx="1" stroke={color} strokeWidth="2" />
      <rect x="5" y="12" width="14" height="9" rx="1" stroke={color} strokeWidth="2" />
      <path d="M12 8v13" stroke={color} strokeWidth="2" />
      <path d="M7.5 8C7.5 8 7 2 12 5c5-3 4.5 3 4.5 3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  referral: ({ color }) => (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
      <circle cx="18" cy="5" r="3" stroke={color} strokeWidth="2" />
      <circle cx="6" cy="12" r="3" stroke={color} strokeWidth="2" />
      <circle cx="18" cy="19" r="3" stroke={color} strokeWidth="2" />
      <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  route: ({ color }) => (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="10" r="3" stroke={color} strokeWidth="2" />
      <path d="M12 2a8 8 0 0 0-8 8c0 5.4 7.05 11.5 7.35 11.76a1 1 0 0 0 1.3 0C12.95 21.5 20 15.4 20 10a8 8 0 0 0-8-8z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  followup: ({ color }) => (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
      <path d="M22 2L11 13" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  meeting: ({ color }) => (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="8" y="2" width="8" height="4" rx="1" stroke={color} strokeWidth="2" />
      <path d="M9 12h6M9 16h4" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  invoice: ({ color }) => (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
      <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 10l2 2 4-4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 16h6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  lead: ({ color }) => (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
      <circle cx="10" cy="7" r="4" stroke={color} strokeWidth="2" />
      <path d="M2 21v-2a6 6 0 016-6h4" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="18" cy="16" r="3" stroke={color} strokeWidth="2" />
      <path d="M20.5 18.5L22 20" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
}

/** Integration logo card - clean tile with big logo + name */
const LogoCard: React.FC<{ name: string; bgTint: string; icon: React.ReactNode }> = ({ name, bgTint, icon }) => (
  <div
    style={{
      width: 95,
      height: 95,
      margin: 2,
      background: 'linear-gradient(180deg, #FFFFFF 0%, #FAFAFA 100%)',
      borderRadius: 22,
      border: '1px solid rgba(255, 255, 255, 0.9)',
      boxShadow: '0 10px 24px -4px rgba(0,0,0,0.06), 0 3px 10px -2px rgba(0,0,0,0.03), inset 0 0 0 1px rgba(255,255,255,1)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    }}
  >
    <div style={{ transform: 'scale(0.85)', filter: `drop-shadow(0 6px 12px ${bgTint.substring(0, 7)}50)` }}>
      {icon}
    </div>
    <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11, fontWeight: 500, color: '#3F3F46', letterSpacing: '-0.02em', marginTop: 0 }}>{name}</span>
  </div>
)

const WhatsAppCard: React.FC = () => (
  <LogoCard
    name="WhatsApp"
    bgTint="#25D36618"
    icon={
      <svg width="44" height="44" viewBox="0 0 24 24" fill="#25D366">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
        <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 0 1-4.076-1.112L4 20l1.112-3.924A8 8 0 1 1 12 20z" />
      </svg>
    }
  />
)

const GmailCard: React.FC = () => (
  <LogoCard
    name="Gmail"
    bgTint="#EA433518"
    icon={
      <svg width="44" height="34" viewBox="0 0 75 56" fill="none">
        <rect x="5" y="10" width="65" height="42" rx="4" fill="white" stroke="#D5D5D5" strokeWidth="1.5" />
        <path d="M5 14 L5 52 Q5 54 7 54 L9 54 L9 20 L37.5 40 L5 14Z" fill="#4285F4" />
        <path d="M70 14 L70 52 Q70 54 68 54 L66 54 L66 20 L37.5 40 L70 14Z" fill="#34A853" />
        <path d="M9 12 Q5 10 5 14 L37.5 38 L9 12Z" fill="#EA4335" />
        <path d="M66 12 Q70 10 70 14 L37.5 38 L66 12Z" fill="#FBBC05" />
        <path d="M9 12 L37.5 36 L66 12" stroke="#EA4335" strokeWidth="1" fill="none" />
      </svg>
    }
  />
)

const LinkedInCard: React.FC = () => (
  <LogoCard
    name="LinkedIn"
    bgTint="#0A66C218"
    icon={
      <svg width="40" height="40" viewBox="0 0 24 24" fill="#0A66C2">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    }
  />
)

const CalendarCard: React.FC = () => (
  <LogoCard
    name="Calendar"
    bgTint="#4285F418"
    icon={
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="18" rx="2.5" fill="#4285F4" />
        <rect x="3" y="4" width="18" height="5" rx="2" fill="#1967D2" />
        <rect x="5" y="11" width="14" height="9" rx="1" fill="white" />
        <line x1="9.7" y1="11" x2="9.7" y2="20" stroke="#E0E0E0" strokeWidth="0.8" />
        <line x1="14.3" y1="11" x2="14.3" y2="20" stroke="#E0E0E0" strokeWidth="0.8" />
        <line x1="5" y1="14.5" x2="19" y2="14.5" stroke="#E0E0E0" strokeWidth="0.8" />
        <line x1="5" y1="17.5" x2="19" y2="17.5" stroke="#E0E0E0" strokeWidth="0.8" />
        <rect x="8" y="2.5" width="2" height="3.5" rx="1" fill="#1967D2" />
        <rect x="14" y="2.5" width="2" height="3.5" rx="1" fill="#1967D2" />
        <rect x="10.5" y="15.2" width="3" height="1.8" rx="0.5" fill="#4285F4" opacity="0.3" />
      </svg>
    }
  />
)

const SalesforceCard: React.FC = () => (
  <LogoCard
    name="Salesforce"
    bgTint="#00A1E018"
    icon={
      <svg width="44" height="44" viewBox="0 0 24 24" fill="#00A1E0">
        <path d="M10.006 5.17a4.015 4.015 0 0 1 3.078-1.448 4.02 4.02 0 0 1 3.86 2.907 3.35 3.35 0 0 1 1.496-.351 3.39 3.39 0 0 1 3.39 3.39c0 .263-.032.518-.091.763a2.71 2.71 0 0 1 1.651 2.494 2.71 2.71 0 0 1-2.71 2.71h-.067a3.18 3.18 0 0 1-2.938 1.96 3.17 3.17 0 0 1-1.702-.496 3.62 3.62 0 0 1-3.065 1.698 3.62 3.62 0 0 1-2.864-1.4 3.04 3.04 0 0 1-1.504.396 3.05 3.05 0 0 1-2.924-2.185 2.93 2.93 0 0 1-1.396.355A2.94 2.94 0 0 1 1.28 12.92a2.94 2.94 0 0 1 2.18-2.838 3.5 3.5 0 0 1-.04-.514 3.52 3.52 0 0 1 3.52-3.52c.81 0 1.55.276 2.14.738l.926.384z" />
      </svg>
    }
  />
)

const HubSpotCard: React.FC = () => (
  <LogoCard
    name="HubSpot"
    bgTint="#FF7A5918"
    icon={
      <svg width="40" height="40" viewBox="0 0 24 24" fill="#FF7A59">
        <path d="M17.5 8.2V5.7a1.8 1.8 0 0 0 1.1-1.7 1.85 1.85 0 0 0-3.7 0c0 .7.4 1.3 1 1.7v2.5a5.3 5.3 0 0 0-2.5 1.4l-6.6-5.1a2.1 2.1 0 0 0 .1-.6 2.05 2.05 0 1 0-2 2.1c.4 0 .8-.1 1.1-.3l6.5 5a5.3 5.3 0 0 0-.7 2.6 5.4 5.4 0 0 0 .8 2.8l-2 2a1.7 1.7 0 0 0-.5-.1 1.75 1.75 0 1 0 1.8 1.8 1.7 1.7 0 0 0-.1-.5l2-2a5.3 5.3 0 1 0 3.7-9.1zm0 8.5a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4z" />
      </svg>
    }
  />
)

const SlackCard: React.FC = () => (
  <LogoCard
    name="Slack"
    bgTint="#4A154B18"
    icon={
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A" />
        <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0" />
        <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.522 2.521 2.528 2.528 0 0 1-2.52-2.521V2.522A2.528 2.528 0 0 1 15.165 0a2.528 2.528 0 0 1 2.521 2.522v6.312z" fill="#2EB67D" />
        <path d="M15.165 18.956a2.528 2.528 0 0 1 2.521 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.522 2.527 2.527 0 0 1 2.52-2.52h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.521h-6.313z" fill="#ECB22E" />
      </svg>
    }
  />
)

const StripeCard: React.FC = () => (
  <LogoCard
    name="Stripe"
    bgTint="#635BFF18"
    icon={
      <svg width="40" height="40" viewBox="0 0 24 24" fill="#635BFF">
        <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" />
      </svg>
    }
  />
)

/** Action output card with icon, label, and subtitle */
const ActionCard: React.FC<{
  label: string
  color: string
  icon: string
  subtitle: string
  xOffset: number
  opacity: number
  scale?: number
}> = ({ label, color, icon, subtitle, xOffset, opacity, scale = 1 }) => {
  const IconComponent = ActionIcons[icon]
  return (
    <div
      style={{
        width: 320,
        height: 96,
        boxSizing: 'border-box',
        background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(252, 252, 252, 0.95) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 24,
        border: '1px solid rgba(255,255,255,0.9)',
        boxShadow: '0 12px 28px -6px rgba(0,0,0,0.08), 0 4px 12px -3px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(255,255,255,1)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 16,
        opacity,
        transform: `translateX(${xOffset}px) scale(${scale})`,
        transformOrigin: 'left center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 20, bottom: 20, width: 4, backgroundColor: color, borderRadius: '0 4px 4px 0' }} />
      <div style={{
        width: 48,
        height: 48,
        background: `linear-gradient(135deg, ${color}08 0%, ${color}15 100%)`,
        borderRadius: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: `inset 0 1px 1px rgba(255,255,255,0.9), 0 4px 12px -4px ${color}20`,
        border: `1px solid ${color}15`,
      }}>
        {IconComponent && <IconComponent color={color} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, paddingRight: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color, boxShadow: `0 0 8px 1px ${color}80` }} />
          <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        </div>
        <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14, fontWeight: 500, color: '#27272A', letterSpacing: '-0.01em', lineHeight: 1.3 }}>
          {subtitle}
        </div>
      </div>
    </div>
  )
}

/** NeoBot Processing Hub - dark rounded square with 3D isometric N icon */
const ProcessingHub: React.FC<{ scale: number; glowIntensity: number }> = ({ scale, glowIntensity }) => {
  const jerkPulse = glowIntensity > 0 ? Math.pow(glowIntensity, 0.5) : 0
  const pulseScale = 1 + jerkPulse * 0.12

  return (
    <div
      style={{
        width: 120,
        height: 120,
        background: 'linear-gradient(180deg, #242427 0%, #141417 100%)',
        borderRadius: 32,
        boxShadow: `0 24px 48px -12px rgba(0,0,0,0.5), 0 0 ${8 + jerkPulse * 30}px rgba(45, 106, 79, ${0.15 + jerkPulse * 0.4}), inset 0 1px 1px rgba(255,255,255,0.15), inset 0 0 40px rgba(0,0,0,0.2)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `scale(${scale * pulseScale})`,
        position: 'relative',
        zIndex: 100,
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <svg width="60" height="60" viewBox="0 0 80 80" fill="none">
        <g transform="translate(4, 4) scale(0.9)">
          <polygon points="15.5,20 26.5,20 59.5,64 48.5,64" fill="white" />
          <polygon points="26.5,20 31.5,17 64.5,61 59.5,64" fill="#c8c8c8" />
          <polygon points="26.5,20 31.5,17 31.5,61 26.5,64" fill="#c8c8c8" />
          <polygon points="15.5,20 26.5,20 26.5,64 15.5,64" fill="white" />
          <polygon points="15.5,20 26.5,20 31.5,17 20.5,17" fill="#e8e8e8" />
          <polygon points="59.5,20 64.5,17 64.5,61 59.5,64" fill="#c8c8c8" />
          <polygon points="48.5,20 59.5,20 59.5,64 48.5,64" fill="white" />
          <polygon points="48.5,20 59.5,20 64.5,17 53.5,17" fill="#e8e8e8" />
        </g>
      </svg>
    </div>
  )
}

/** Pixel particle for burst effects */
const PixelParticle: React.FC<{
  x: number
  y: number
  progress: number
  color: string
  size: number
  rotation: number
}> = ({ x, y, progress, color, size, rotation }) => {
  const opacity = interpolate(progress, [0, 0.2, 0.6, 1], [0, 1, 0.8, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const scale = interpolate(progress, [0, 0.25, 1], [0.4, 1.2, 0.9], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const rot = rotation + progress * 40

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        backgroundColor: color,
        borderRadius: 3,
        opacity,
        transform: `scale(${scale}) rotate(${rot}deg)`,
        transformOrigin: 'center center',
        zIndex: 5,
        boxShadow: `0 0 ${size * 0.5}px ${color}60`,
      }}
    />
  )
}

export const Act4DocumentProcessing: React.FC = () => {
  const frame = useCurrentFrame()
  const { width, height, durationInFrames } = useVideoConfig()

  const centerX = width / 2
  const centerY = height / 2
  const logoSize = 120
  const scannerX = centerX
  const docScale = 1.0
  const docWidth = 99 * docScale
  const contentCenterY = centerY - 20
  const scannerLineX = scannerX - 60
  const spawnX = -550
  const travelDistance = scannerLineX - spawnX

  const allIntegrations = [WhatsAppCard, GmailCard, LinkedInCard, CalendarCard, SalesforceCard, HubSpotCard, SlackCard, StripeCard]
  const numDocs = 9

  // Seamless loop: total scroll per loop must be exact multiple of card spacing
  // so positions at frame=0 and frame=durationInFrames are identical
  const cardSpacing = travelDistance / numDocs
  const cardsPerLoop = 3 // how many card-widths we advance per full loop (tune speed here)
  const scrollSpeed = (cardsPerLoop * cardSpacing) / durationInFrames

  const getDocPosition = (slotIndex: number) => {
    const phaseOffset = slotIndex * cardSpacing
    const rawProgress = (frame * scrollSpeed + phaseOffset) % travelDistance
    return spawnX + rawProgress
  }

  const getDocState = (xPos: number) => {
    const docRightEdge = xPos + docWidth
    const distanceToScanner = scannerLineX - docRightEdge
    if (distanceToScanner < 0) {
      const consumeProgress = Math.min(1, -distanceToScanner / docWidth)
      return { opacity: 1, scale: 1, isConsuming: true, hidden: consumeProgress >= 1 }
    }
    if (distanceToScanner < 50) {
      return { opacity: 1, scale: 1, isConsuming: true, hidden: false }
    }
    return { opacity: 1, scale: 1, isConsuming: false, hidden: false }
  }

  const getLogoState = () => {
    for (let i = 0; i < numDocs; i++) {
      const xPos = getDocPosition(i)
      const docRightEdge = xPos + docWidth
      const distanceToScanner = scannerLineX - docRightEdge
      if (distanceToScanner < 0 && distanceToScanner > -docWidth) {
        const consumeProgress = Math.min(1, -distanceToScanner / docWidth)
        return { scale: 1, glow: consumeProgress }
      }
    }
    return { scale: 1, glow: 0 }
  }

  const logoState = getLogoState()

  const outputCardSets = [
    [
      { label: 'Morning Brief', color: COLORS.brief, icon: 'brief', subtitle: '3 follow-ups, client meeting at 2pm' },
      { label: 'Gift Ordered', color: COLORS.gift, icon: 'gift', subtitle: "Flowers for Sarah's birthday" },
      { label: 'Referral Ask', color: COLORS.referral, icon: 'referral', subtitle: 'Sarah just closed — time to ask?' },
      { label: 'Route Planned', color: COLORS.route, icon: 'route', subtitle: '5 viewings, optimal order' },
    ],
    [
      { label: 'Follow-up Sent', color: COLORS.brief, icon: 'followup', subtitle: '3 cold leads nudged, 1 replied' },
      { label: 'Meeting Prepped', color: COLORS.gift, icon: 'meeting', subtitle: 'Agenda + notes for 2pm call' },
      { label: 'Invoice Matched', color: COLORS.referral, icon: 'invoice', subtitle: '12 invoices reconciled, 2 flagged' },
      { label: 'Lead Found', color: COLORS.route, icon: 'lead', subtitle: '8 prospects match your ICP' },
    ],
  ]

  const cardsContainerX = centerX + logoSize / 2 - 20

  const getConsumptionState = () => {
    const cycleCount = Math.floor((frame * scrollSpeed) / travelDistance)
    for (let i = 0; i < numDocs; i++) {
      const xPos = getDocPosition(i)
      const docRightEdge = xPos + docWidth
      const distanceToScanner = scannerLineX - docRightEdge
      if (distanceToScanner < 0 && distanceToScanner > -docWidth * 2.5) {
        const consumeProgress = Math.min(1, -distanceToScanner / docWidth)
        const holdProgress = consumeProgress >= 1 ? (-distanceToScanner - docWidth) / (docWidth * 1.5) : 0
        return { active: true, consuming: consumeProgress < 1, progress: consumeProgress, holdProgress: Math.min(1, holdProgress), docIndex: i, cycleId: cycleCount * 4 + i }
      }
      if (distanceToScanner >= 0 && distanceToScanner < 10) {
        return { active: true, consuming: true, progress: 0, holdProgress: 0, docIndex: i, cycleId: cycleCount * 4 + i }
      }
    }
    return { active: false, consuming: false, progress: 0, holdProgress: 0, docIndex: -1, cycleId: 0 }
  }

  const consumption = getConsumptionState()

  const getCardAnimation = (cardIndex: number) => {
    if (!consumption.active) return { xOffset: 120, opacity: 0, scale: 1 }
    const appearThreshold = 0.05 + cardIndex * 0.1
    const cardProgress = interpolate(consumption.progress, [appearThreshold, appearThreshold + 0.15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) })
    const xOffset = interpolate(cardProgress, [0, 1], [40, 80])
    const totalProgress = consumption.progress + consumption.holdProgress
    const gentleFade = interpolate(totalProgress, [1.5, 3.0], [1, 0.15], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    return { xOffset, opacity: cardProgress * gentleFade, scale: 1 }
  }

  const sceneOpacity = 1

  const renderParticles = () => {
    if (!consumption.active || consumption.progress < 0.02) return null
    const particles: React.ReactNode[] = []
    const cycleSeed = consumption.cycleId

    for (let i = 0; i < 12; i++) {
      const seed = i + cycleSeed * 100
      const angle = ((i / 12) - 0.5) * Math.PI * 0.7 + random(`ang-${seed}`) * 0.25
      const distance = 70 + random(`dist-${seed}`) * 130
      const delay = i * 0.015
      const startX = scannerLineX
      const startY = contentCenterY + (random(`sy-${seed}`) - 0.5) * 80
      const endX = startX + Math.abs(Math.cos(angle)) * distance + 20
      const endY = startY + Math.sin(angle) * distance
      const progress = interpolate(consumption.progress, [delay, delay + 0.55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
      const pX = interpolate(progress, [0, 1], [startX, endX], { easing: Easing.out(Easing.quad) })
      const pY = interpolate(progress, [0, 1], [startY, endY], { easing: Easing.out(Easing.quad) })

      particles.push(
        <PixelParticle
          key={`p-${i}-${cycleSeed}`}
          x={pX} y={pY}
          progress={progress}
          color={PARTICLE_COLORS[i % PARTICLE_COLORS.length]}
          size={7 + random(`sz-${seed}`) * 8}
          rotation={random(`rot-${seed}`) * 360}
        />
      )
    }

    return particles
  }

  return (
    <AbsoluteFill style={{ backgroundColor: 'transparent' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: sceneOpacity }}>
        {/* Input cards - individually clipped as they pass scanner */}
        <div style={{ position: 'absolute', left: 0, top: 0, width, height, zIndex: 5 }}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((slotIndex) => {
            const xPos = getDocPosition(slotIndex)
            const state = getDocState(xPos)
            // Per-slot wrap count: each card changes logo only when IT wraps
            const phaseOffset = slotIndex * cardSpacing
            const slotCycleCount = Math.floor((frame * scrollSpeed + phaseOffset) / travelDistance)
            const logoIndex = (slotIndex + slotCycleCount) % allIntegrations.length
            const InputComponent = allIntegrations[logoIndex]
            if (xPos < -docWidth) return null
            const docRightEdge = xPos + docWidth
            const amountPastScanner = docRightEdge - scannerLineX
            let clipPercent = 100
            if (amountPastScanner > 0) {
              const visibleWidth = docWidth - amountPastScanner
              clipPercent = Math.max(0, (visibleWidth / docWidth) * 100)
            }
            if (clipPercent <= 0) return null
            return (
              <div
                key={`input-${slotIndex}`}
                style={{
                  position: 'absolute',
                  left: xPos,
                  top: contentCenterY,
                  marginTop: -55 * docScale,
                  opacity: state.opacity,
                  transform: `scale(${state.scale * docScale})`,
                  transformOrigin: 'left center',
                  clipPath: `inset(0 ${100 - clipPercent}% 0 0)`,
                }}
              >
                <InputComponent />
              </div>
            )
          })}
        </div>

        {/* Scanner line */}
        <div
          style={{
            position: 'absolute',
            left: scannerX - 60,
            top: contentCenterY - 280,
            width: 4,
            height: 560,
            background: `linear-gradient(to bottom, transparent 0%, ${COLORS.scanner}30 15%, ${COLORS.scanner} 50%, ${COLORS.scanner}30 85%, transparent 100%)`,
            boxShadow: `0 0 15px ${COLORS.scanner}50`,
            zIndex: 8,
          }}
        />

        {/* Particles */}
        {renderParticles()}

        {/* Center processing hub */}
        <div style={{ position: 'absolute', left: scannerLineX, top: contentCenterY, transform: 'translate(-50%, -50%)', zIndex: 50 }}>
          <ProcessingHub scale={logoState.scale} glowIntensity={logoState.glow} />
        </div>

        {/* Output action cards */}
        <div
          style={{
            position: 'absolute',
            left: cardsContainerX,
            top: contentCenterY,
            transform: 'translateY(-50%)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '28px 36px',
            zIndex: 10,
          }}
        >
          {outputCardSets[consumption.docIndex % 2 === 0 ? 0 : 1].map((card, i) => {
            const anim = getCardAnimation(i)
            return <ActionCard key={`${card.label}-${consumption.docIndex}`} label={card.label} color={card.color} icon={card.icon} subtitle={card.subtitle} xOffset={anim.xOffset} opacity={anim.opacity} scale={anim.scale} />
          })}
        </div>
      </div>
    </AbsoluteFill>
  )
}
