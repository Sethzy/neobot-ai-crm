'use client';

/** Pipeline board animation for the ProductShowcase hero section. */
import { memo, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AppIcon, type AppIconName } from '@/components/icons/app-icons'

type ClientCard = {
  status: string
  value: string
  name: string
  company: string
  email: string
  phone: string
  initials: string
  avatarColor: string
}

type ClientColumn = {
  title: string
  titleColor: string
  glowColor: string
  icon: AppIconName
  iconClass: string
  cards: ClientCard[]
}

const columns: ClientColumn[] = [
  {
    title: 'HOT LEADS',
    titleColor: 'text-[#E56A6A]',
    glowColor: '#E56A6A',
    icon: 'flame',
    iconClass: 'icon-flame',
    cards: [
      {
        status: 'Demo booked',
        value: '$1.2M',
        name: 'Sarah Chen',
        company: 'Maple Realty',
        email: 'sarah@maple.sg',
        phone: '(65) 9123-4567',
        initials: 'SC',
        avatarColor: '#8B5CF6',
      },
      {
        status: 'Viewing set',
        value: '$850K',
        name: 'James Lim',
        company: 'PropNex',
        email: 'james@propnex.sg',
        phone: '(65) 8234-5678',
        initials: 'JL',
        avatarColor: '#3B82F6',
      },
      {
        status: 'Active Discussion',
        value: '$2.1M',
        name: 'Rachel Tan',
        company: 'ERA Singapore',
        email: 'rachel@era.sg',
        phone: '(65) 9345-6789',
        initials: 'RT',
        avatarColor: '#EC4899',
      },
      {
        status: 'New inquiry',
        value: '$680K',
        name: 'Michael Wong',
        company: 'Huttons Asia',
        email: 'michael@huttons.sg',
        phone: '(65) 8456-7890',
        initials: 'MW',
        avatarColor: '#F97316',
      },
    ],
  },
  {
    title: 'ACTIVE CLIENTS',
    titleColor: 'text-[#4CAE80]',
    glowColor: '#4CAE80',
    icon: 'lock',
    iconClass: 'icon-key',
    cards: [
      {
        status: 'Contract sent',
        value: '$1.5M',
        name: 'David Lee',
        company: 'OrangeTee',
        email: 'david@orangetee.sg',
        phone: '(65) 9567-8901',
        initials: 'DL',
        avatarColor: '#10B981',
      },
      {
        status: 'In negotiation',
        value: '$920K',
        name: 'Emily Ng',
        company: 'Knight Frank',
        email: 'emily@kf.sg',
        phone: '(65) 8678-9012',
        initials: 'EN',
        avatarColor: '#06B6D4',
      },
      {
        status: 'Closing',
        value: '$3.2M',
        name: 'Andrew Koh',
        company: 'CBRE',
        email: 'andrew@cbre.sg',
        phone: '(65) 9789-0123',
        initials: 'AK',
        avatarColor: '#EF4444',
      },
      {
        status: 'Active',
        value: '$750K',
        name: 'Jessica Yeo',
        company: 'JLL',
        email: 'jessica@jll.sg',
        phone: '(65) 8890-1234',
        initials: 'JY',
        avatarColor: '#F59E0B',
      },
    ],
  },
  {
    title: 'FOLLOW UP',
    titleColor: 'text-[#D8A139]',
    glowColor: '#D8A139',
    icon: 'clock',
    iconClass: 'icon-clock',
    cards: [
      {
        status: 'Needs callback',
        value: '$1.1M',
        name: 'Ryan Teo',
        company: 'Savills',
        email: 'ryan@savills.sg',
        phone: '(65) 9901-2345',
        initials: 'RT',
        avatarColor: '#8B5CF6',
      },
      {
        status: '2 weeks ago',
        value: '$400K',
        name: 'Michelle Loh',
        company: 'Colliers',
        email: 'michelle@colliers.sg',
        phone: '(65) 8012-3456',
        initials: 'ML',
        avatarColor: '#3B82F6',
      },
      {
        status: 'Re-engaged',
        value: '$560K',
        name: 'Kevin Pang',
        company: 'EdgeProp',
        email: 'kevin@edgeprop.sg',
        phone: '(65) 9234-5678',
        initials: 'KP',
        avatarColor: '#10B981',
      },
      {
        status: 'Overdue',
        value: '$890K',
        name: 'Amanda Goh',
        company: 'SLP Intl',
        email: 'amanda@slp.sg',
        phone: '(65) 8345-6789',
        initials: 'AG',
        avatarColor: '#EF4444',
      },
    ],
  },
]

/**
 * Diagonal sweep order so the highlight travels across the board
 * rather than sequentially down a single column.
 * Pattern: (0,0) → (1,1) → (2,2) → (0,3) → (1,0) → (2,1) → ...
 */
const CYCLE_ORDER: [col: number, card: number][] = [
  [0, 0], [1, 1], [2, 2], [0, 3],
  [1, 0], [2, 1], [0, 2], [1, 3],
  [2, 0], [0, 1], [1, 2], [2, 3],
]

const CYCLE_MS = 2500

const Card = memo(function Card({
  card,
  isActive,
  glowColor,
}: {
  card: ClientCard
  isActive: boolean
  glowColor: string
}) {
  return (
    <div
      className={`pipeline-card relative rounded-[10px] border bg-white p-3 ${isActive ? 'is-active' : ''}`}
      style={
        isActive
          ? {
              borderColor: `${glowColor}70`,
              boxShadow: `0 8px 30px ${glowColor}28, 0 0 0 1px ${glowColor}45`,
            }
          : {
              borderColor: 'rgb(228 228 231)', // zinc-200
              boxShadow: '0 1px 1px rgba(0,0,0,0.02)',
            }
      }
    >
      {/* Shimmer overlay */}
      <div className="card-shimmer" />

      <div className="mb-2 flex items-center justify-between text-[10px]">
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-zinc-500">
          {card.status}
        </span>
        <span className="font-semibold text-zinc-700">{card.value}</span>
      </div>

      <div className="flex items-center gap-2">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold text-white"
          style={{ backgroundColor: card.avatarColor }}
        >
          {card.initials}
        </div>
        <div>
          <p className="text-[12px] font-semibold leading-tight text-zinc-800">{card.name}</p>
          <p className="text-[10px] text-zinc-500">{card.company}</p>
        </div>
      </div>

      <div className="mt-2 space-y-0.5 text-[10px] text-zinc-500">
        <p className="flex items-center gap-1">
          <AppIcon name="email" className="h-2.5 w-2.5" />
          {card.email}
        </p>
        <p className="flex items-center gap-1">
          <AppIcon name="phone" className="h-2.5 w-2.5" />
          {card.phone}
        </p>
      </div>
    </div>
  )
})

/** Same heavy spring as UseCases cards. */
const columnSpring = { type: 'spring' as const, stiffness: 35, damping: 14, mass: 2.4 }

export function DocumentSplitAnimation({ isVisible = true }: { isVisible?: boolean }) {
  const [cycleIdx, setCycleIdx] = useState(0)

  /** Only start the highlight cycle after columns have animated in. */
  useEffect(() => {
    if (!isVisible) return
    const id = setInterval(() => {
      setCycleIdx((prev) => (prev + 1) % CYCLE_ORDER.length)
    }, CYCLE_MS)
    return () => clearInterval(id)
  }, [isVisible])

  const [activeCol, activeCard] = CYCLE_ORDER[cycleIdx]

  return (
    <div className="w-full overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/[0.08] ring-1 ring-black/[0.06]">
      {/* macOS window chrome */}
      <div className="flex items-center border-b border-zinc-100 bg-[#F8F8F8] px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-[#FF5F57]" />
          <div className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
          <div className="h-3 w-3 rounded-full bg-[#28C840]" />
        </div>
        <span className="mx-auto -ml-2 text-[11px] font-medium tracking-wide text-zinc-400">
          Neo Pipeline
        </span>
      </div>

      {/* Board content with bottom fade */}
      <div
        className="relative p-4"
        style={{
          maskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)',
        }}
      >
        <div className="grid grid-cols-3 gap-4">
          {columns.map((column, colIdx) => {
            return (
              <motion.div
                key={column.title}
                initial={{ y: 60, opacity: 0 }}
                animate={isVisible ? { y: 0, opacity: 1 } : { y: 60, opacity: 0 }}
                transition={isVisible ? { ...columnSpring, delay: 0.3 + colIdx * 0.12 } : { duration: 0 }}
              >
                <div
                  className={`mb-2 flex items-center gap-1.5 text-[11px] font-bold tracking-[0.12em] ${column.titleColor}`}
                >
                  <AppIcon
                    name={column.icon}
                    className={`h-3.5 w-3.5 ${column.iconClass}`}
                  />
                  <span>{column.title}</span>
                </div>
                <div className="space-y-2">
                  {column.cards.map((card, cardIdx) => (
                    <Card
                      key={`${column.title}-${card.name}`}
                      card={card}
                      isActive={colIdx === activeCol && cardIdx === activeCard}
                      glowColor={column.glowColor}
                    />
                  ))}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
      <div className="sr-only">
        Live pipeline board showing Hot Leads, Active Clients, and Follow Up lists.
      </div>
    </div>
  )
}
