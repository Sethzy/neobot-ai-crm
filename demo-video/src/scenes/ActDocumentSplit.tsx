// ActDocumentSplit - Contact card categorization animation (220 frames)
// Scrollytelling workflow: Single → Stacked → Grid → Categorized
// Contact cards with real CRM data for B2C sales

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Sequence,
  staticFile,
} from "remotion";
import { Audio } from "@remotion/media";
import { ContactCard, type ContactInfo } from "../components/ContactCard";
import { CategoryHeader, type CategoryType } from "../components/CategoryHeader";
import { BrandOverlay } from "../components/BrandOverlay";
import { BottomCaption } from "../components/BottomCaption";
import { springs } from "../theme";
import { geist } from "../fonts";
import type { DemoConfig } from "../config";

// ============================================
// HEADLINE SFX COMPONENT
// ============================================
const HeadlineSFX: React.FC = () => {
  return <Audio src={staticFile("audio/pop.wav")} volume={0.5} />;
};

const CREAM_BG = "#FFFFFF";

type ActDocumentSplitProps = {
  config: DemoConfig;
};

// ============================================
// CONTACT DATA
// ============================================
type ContactEntry = {
  id: number;
  contact: ContactInfo;
  category: CategoryType;
};

const CONTACTS: ContactEntry[] = [
  // Hot Leads (4)
  {
    id: 1,
    category: "hotLeads",
    contact: {
      name: "Sarah Chen",
      company: "Maple Realty",
      email: "sarah@maple.sg",
      phone: "(65) 9123-4567",
      status: "Demo booked",
      dealValue: "$1.2M",
      avatarColor: "#8B5CF6",
    },
  },
  {
    id: 2,
    category: "hotLeads",
    contact: {
      name: "James Lim",
      company: "PropNex",
      email: "james@propnex.sg",
      phone: "(65) 8234-5678",
      status: "Viewing set",
      dealValue: "$850K",
      avatarColor: "#3B82F6",
    },
  },
  {
    id: 3,
    category: "hotLeads",
    contact: {
      name: "Rachel Tan",
      company: "ERA Singapore",
      email: "rachel@era.sg",
      phone: "(65) 9345-6789",
      status: "Active Discussion",
      dealValue: "$2.1M",
      avatarColor: "#EC4899",
    },
  },
  {
    id: 4,
    category: "hotLeads",
    contact: {
      name: "Michael Wong",
      company: "Huttons Asia",
      email: "michael@huttons.sg",
      phone: "(65) 8456-7890",
      status: "New inquiry",
      dealValue: "$680K",
      avatarColor: "#F97316",
    },
  },
  // Active Clients (4)
  {
    id: 5,
    category: "activeClients",
    contact: {
      name: "David Lee",
      company: "OrangeTee",
      email: "david@orangetee.sg",
      phone: "(65) 9567-8901",
      status: "Contract sent",
      dealValue: "$1.5M",
      avatarColor: "#10B981",
    },
  },
  {
    id: 6,
    category: "activeClients",
    contact: {
      name: "Emily Ng",
      company: "Knight Frank",
      email: "emily@kf.sg",
      phone: "(65) 8678-9012",
      status: "In negotiation",
      dealValue: "$920K",
      avatarColor: "#06B6D4",
    },
  },
  {
    id: 7,
    category: "activeClients",
    contact: {
      name: "Andrew Koh",
      company: "CBRE",
      email: "andrew@cbre.sg",
      phone: "(65) 9789-0123",
      status: "Closing",
      dealValue: "$3.2M",
      avatarColor: "#EF4444",
    },
  },
  {
    id: 8,
    category: "activeClients",
    contact: {
      name: "Jessica Yeo",
      company: "JLL",
      email: "jessica@jll.sg",
      phone: "(65) 8890-1234",
      status: "Active",
      dealValue: "$750K",
      avatarColor: "#F59E0B",
    },
  },
  // Follow Up (4)
  {
    id: 9,
    category: "followUp",
    contact: {
      name: "Ryan Teo",
      company: "Savills",
      email: "ryan@savills.sg",
      phone: "(65) 9901-2345",
      status: "Needs callback",
      dealValue: "$1.1M",
      avatarColor: "#8B5CF6",
    },
  },
  {
    id: 10,
    category: "followUp",
    contact: {
      name: "Michelle Loh",
      company: "Colliers",
      email: "michelle@colliers.sg",
      phone: "(65) 8012-3456",
      status: "2 weeks ago",
      dealValue: "$400K",
      avatarColor: "#3B82F6",
    },
  },
  {
    id: 11,
    category: "followUp",
    contact: {
      name: "Kevin Pang",
      company: "EdgeProp",
      email: "kevin@edgeprop.sg",
      phone: "(65) 9234-5678",
      status: "Re-engaged",
      dealValue: "$560K",
      avatarColor: "#10B981",
    },
  },
  {
    id: 12,
    category: "followUp",
    contact: {
      name: "Amanda Goh",
      company: "SLP Intl",
      email: "amanda@slp.sg",
      phone: "(65) 8345-6789",
      status: "Overdue",
      dealValue: "$890K",
      avatarColor: "#EF4444",
    },
  },
];

// ============================================
// CARD DIMENSIONS
// ============================================
const CARD_WIDTH = 240;
const CARD_HEIGHT = 185; // header(~28) + gap(8) + body(~149)

// ============================================
// ANIMATION TIMELINE
// ============================================
const PHASES = {
  single: { start: 0, end: 12 },
  stack: { start: 12, end: 45 },
  grid: { start: 45, end: 105 },
  categorize: { start: 105, end: 250 },
};

export const DOCUMENT_SPLIT_DURATION = PHASES.categorize.end;

// ============================================
// POSITION CALCULATIONS
// ============================================

const getStackPosition = (
  index: number,
  centerX: number,
  centerY: number
): { x: number; y: number; rotation: number; scale: number } => {
  const offsetX = (index - 5.5) * 3;
  const offsetY = (index - 5.5) * -5;
  const rotation = (index - 5.5) * 1.5;
  return {
    x: centerX + offsetX,
    y: centerY + offsetY,
    rotation,
    scale: 1 - index * 0.015,
  };
};

// Grid: 4 columns x 3 rows, no overlap
const getGridPosition = (
  index: number,
  centerX: number,
  centerY: number
): { x: number; y: number; rotation: number; scale: number } => {
  const cols = 4;
  const gapX = CARD_WIDTH + 40; // 40px between cards
  const gapY = CARD_HEIGHT + 30; // 30px between cards

  const rows = Math.ceil(CONTACTS.length / cols);
  const col = index % cols;
  const row = Math.floor(index / cols);

  const gridWidth = (cols - 1) * gapX;
  const gridHeight = (rows - 1) * gapY;

  return {
    x: centerX - gridWidth / 2 + col * gapX,
    y: centerY - gridHeight / 2 + row * gapY,
    rotation: 0,
    scale: 1,
  };
};

// Categorized: 3 columns, 4 cards stacked vertically per column, no overlap
const getCategorizedPosition = (
  entry: ContactEntry,
  centerX: number,
  centerY: number
): { x: number; y: number; rotation: number; scale: number } => {
  const categoryOrder: CategoryType[] = ["hotLeads", "activeClients", "followUp"];
  const categoryColumn = categoryOrder.indexOf(entry.category);

  const contactsInCategory = CONTACTS.filter((c) => c.category === entry.category);
  const indexInCategory = contactsInCategory.findIndex((c) => c.id === entry.id);

  const catScale = 0.72;
  const scaledH = CARD_HEIGHT * catScale;
  const rowGap = 6;
  const colGap = 330; // center-to-center between category columns
  const headerOffset = 45; // space below the category header

  const totalWidth = (categoryOrder.length - 1) * colGap;
  const startX = centerX - totalWidth / 2;

  // 4 cards stacked vertically per column
  const totalStackHeight = 4 * scaledH + 3 * rowGap;
  const stackStartY = centerY - totalStackHeight / 2 + headerOffset;

  return {
    x: startX + categoryColumn * colGap,
    y: stackStartY + indexInCategory * (scaledH + rowGap),
    rotation: 0,
    scale: catScale,
  };
};

// ============================================
// PHASE HEADLINE COMPONENT
// ============================================
const PhaseHeadline: React.FC<{
  headline: string;
  subtext?: string;
  startFrame: number;
  endFrame: number;
  position?: "center" | "bottom";
}> = ({ headline, subtext, startFrame, endFrame, position = "center" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (frame < startFrame || frame > endFrame) return null;

  const localFrame = frame - startFrame;

  const entrance = spring({
    frame: localFrame,
    fps,
    config: springs.smooth,
  });

  const exitProgress = interpolate(
    frame,
    [endFrame - 12, endFrame],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const opacity =
    interpolate(entrance, [0, 0.5], [0, 1], {
      extrapolateRight: "clamp",
    }) * (1 - exitProgress);

  const translateY = interpolate(entrance, [0, 1], [30, 0]);

  const positionStyles =
    position === "center"
      ? {
          top: "6%",
          left: "50%",
          transform: `translateX(-50%) translateY(${translateY}px)`,
        }
      : {
          bottom: 100,
          left: "50%",
          transform: `translateX(-50%) translateY(${translateY}px)`,
        };

  return (
    <div
      style={{
        position: "absolute",
        ...positionStyles,
        opacity,
        textAlign: "center",
        zIndex: 100,
      }}
    >
      <div
        style={{
          fontFamily: geist,
          fontSize: 56,
          fontWeight: 600,
          color: "#09090B",
          marginBottom: subtext ? 16 : 0,
          letterSpacing: "-0.02em",
        }}
      >
        {headline}
      </div>
      {subtext && (
        <div
          style={{
            fontFamily: geist,
            fontSize: 28,
            fontWeight: 500,
            color: "#52525B",
          }}
        >
          {subtext}
        </div>
      )}
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================
export const ActDocumentSplit: React.FC<ActDocumentSplitProps> = ({ config }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const centerX = width / 2;
  const centerY = height / 2;

  const getContactTransform = (entry: ContactEntry, index: number) => {
    const centerPos = { x: centerX, y: centerY, rotation: 0, scale: 1 };
    const stackPos = getStackPosition(index, centerX, centerY);
    const gridPos = getGridPosition(index, centerX, centerY);
    const categorizedPos = getCategorizedPosition(entry, centerX, centerY);

    const staggerDelay = index * 1;

    // Phase 1: Single → Stack
    if (frame < PHASES.stack.end) {
      const stackProgress = spring({
        frame: frame - PHASES.single.end - staggerDelay,
        fps,
        config: springs.smooth,
      });

      if (frame < PHASES.single.end && index > 0) {
        return { ...centerPos, opacity: 0 };
      }

      return {
        x: interpolate(stackProgress, [0, 1], [centerPos.x, stackPos.x]),
        y: interpolate(stackProgress, [0, 1], [centerPos.y, stackPos.y]),
        rotation: interpolate(stackProgress, [0, 1], [0, stackPos.rotation]),
        scale: interpolate(stackProgress, [0, 1], [1, stackPos.scale]),
        opacity:
          index === 0
            ? 1
            : interpolate(stackProgress, [0, 0.3], [0, 1], {
                extrapolateRight: "clamp",
              }),
      };
    }

    // Phase 2: Stack → Grid
    if (frame < PHASES.grid.end) {
      const gridProgress = spring({
        frame: frame - PHASES.stack.end - staggerDelay,
        fps,
        config: { damping: 20, stiffness: 120, mass: 0.8 },
      });

      // Scale down slightly mid-transition to reduce overlap, then back to 1
      const midScale = interpolate(gridProgress, [0, 0.4, 1], [stackPos.scale, 0.85, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

      return {
        x: interpolate(gridProgress, [0, 1], [stackPos.x, gridPos.x]),
        y: interpolate(gridProgress, [0, 1], [stackPos.y, gridPos.y]),
        rotation: interpolate(gridProgress, [0, 1], [stackPos.rotation, 0]),
        scale: midScale,
        opacity: 1,
      };
    }

    // Phase 3: Grid → Categorized
    const categorizeProgress = spring({
      frame: frame - PHASES.grid.end - staggerDelay,
      fps,
      config: springs.smooth,
    });

    return {
      x: interpolate(categorizeProgress, [0, 1], [gridPos.x, categorizedPos.x]),
      y: interpolate(categorizeProgress, [0, 1], [gridPos.y, categorizedPos.y]),
      rotation: 0,
      scale: interpolate(
        categorizeProgress,
        [0, 1],
        [gridPos.scale, categorizedPos.scale]
      ),
      opacity: 1,
    };
  };

  // Scene entrance
  const sceneEntrance = spring({ frame, fps, config: springs.smooth });
  const entranceOpacity = interpolate(sceneEntrance, [0, 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Scene exit fade (last 15 frames)
  const sceneEnd = PHASES.categorize.end;
  const exitOpacity = interpolate(
    frame,
    [sceneEnd - 15, sceneEnd],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const sceneOpacity = entranceOpacity * exitOpacity;

  // Header opacity: hidden during single/stack, fade in during grid transition
  const headerOpacity = interpolate(
    frame,
    [PHASES.stack.end, PHASES.stack.end + 15],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Category headers
  const showHeaders = frame >= PHASES.categorize.start;
  const categoryOrder: CategoryType[] = ["hotLeads", "activeClients", "followUp"];
  const catColGap = 330;
  const totalCatWidth = (categoryOrder.length - 1) * catColGap;
  const catStartX = centerX - totalCatWidth / 2;

  const categoryConfig = config.actDocumentSplit?.categories;

  // Header Y: above the first card row in categorized view
  const catScale = 0.72;
  const scaledH = CARD_HEIGHT * catScale;
  const totalStackHeight = 4 * scaledH + 3 * 6;
  const headerY = centerY - totalStackHeight / 2 + 45 - scaledH / 2 - 30;

  return (
    <AbsoluteFill style={{ backgroundColor: CREAM_BG }}>
      <BrandOverlay startFrame={-100} />

      {/* Phase 1 headline */}
      <PhaseHeadline
        headline="Your contacts are scattered."
        subtext="WhatsApp, email, calls — you shouldn't have to piece it together."
        startFrame={2}
        endFrame={55}
        position="center"
      />

      {/* Phase 2 headline */}
      <PhaseHeadline
        headline="Not your problem anymore."
        subtext="Every name, deal, and conversation — organized while you sleep."
        startFrame={60}
        endFrame={115}
        position="center"
      />

      <div style={{ position: "absolute", inset: 0, opacity: sceneOpacity }}>
        {/* Category Headers */}
        {showHeaders &&
          categoryOrder.map((category, colIndex) => {
            const headerStartFrame = PHASES.categorize.start + colIndex * 5;
            const catConfig = categoryConfig?.[category];

            return (
              <div
                key={category}
                style={{
                  position: "absolute",
                  left: catStartX + colIndex * catColGap,
                  top: headerY,
                  transform: "translateX(-50%)",
                }}
              >
                <CategoryHeader
                  category={category}
                  startFrame={headerStartFrame}
                  color={catConfig?.color}
                  label={catConfig?.label}
                />
              </div>
            );
          })}

        {/* Contact Cards */}
        {CONTACTS.map((entry, index) => {
          const transform = getContactTransform(entry, index);
          const opacity = transform.opacity ?? 1;

          return (
            <div
              key={entry.id}
              style={{
                position: "absolute",
                left: transform.x,
                top: transform.y,
                transform: `translate(-50%, -50%) rotate(${transform.rotation}deg) scale(${transform.scale})`,
                opacity,
                zIndex: CONTACTS.length - index,
              }}
            >
              <ContactCard contact={entry.contact} width={CARD_WIDTH} headerOpacity={headerOpacity} />
            </div>
          );
        })}
      </div>

      {/* Bottom caption */}
      <BottomCaption
        text="Organized. Followed-up. Done."
        startFrame={170}
        style={{ bottom: 140 }}
      />

      {/* Sound effects */}
      <Sequence from={2}>
        <HeadlineSFX />
      </Sequence>
      <Sequence from={60}>
        <HeadlineSFX />
      </Sequence>
      <Sequence from={170}>
        <HeadlineSFX />
      </Sequence>
    </AbsoluteFill>
  );
};
