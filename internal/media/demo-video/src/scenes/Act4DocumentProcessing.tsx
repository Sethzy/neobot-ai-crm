// Act 4: AI Agent Workflow Pipeline
// Diverse inputs (WhatsApp, voice notes, email, calendar) scroll in from the left
// AI agent processes them → action cards slide out on the right
// Shows the breadth of what the AI agent handles

// Export duration for use in composition setup (5.5 seconds at 30fps)
export const DOCUMENT_PROCESSING_DURATION = 165;

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  random,
  spring,
  Sequence,
  staticFile,
} from "remotion";
import { Audio } from "@remotion/media";
import { jetbrains, geist } from "../fonts";
import { BrandOverlay } from "../components/BrandOverlay";
import { BottomCaption } from "../components/BottomCaption";
import { springs } from "../theme";
import type { DemoConfig } from "../config";

// Solid cream background color (CuaBench style)
const CREAM_BG = "#FFFFFF";

type Act4DocumentProcessingProps = {
  config?: DemoConfig;
};

// ============================================
// COLORS
// ============================================
const COLORS = {
  scanner: "#9333EA",
  brief: "#F59E0B",     // Morning briefing - warm amber
  gift: "#EC4899",      // Gift ordered - pink (delightful)
  referral: "#10B981",  // Referral ask - teal (growth)
  route: "#3B82F6",     // Route planned - blue (navigation)
  particles: ["#9333EA", "#F59E0B", "#0D9488", "#7C3AED", "#A21CAF"],
};

// ============================================
// ACTION ICONS (right-side output cards)
// ============================================
const ActionIcons: Record<string, React.FC<{ color: string }>> = {
  brief: ({ color }) => (
    // Sun/morning icon - daily briefing
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="5" stroke={color} strokeWidth="2" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  gift: ({ color }) => (
    // Gift box icon - relationship intelligence
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="8" width="18" height="4" rx="1" stroke={color} strokeWidth="2" />
      <rect x="5" y="12" width="14" height="9" rx="1" stroke={color} strokeWidth="2" />
      <path d="M12 8v13" stroke={color} strokeWidth="2" />
      <path d="M7.5 8C7.5 8 7 2 12 5c5-3 4.5 3 4.5 3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  referral: ({ color }) => (
    // Share/network icon - referral intelligence
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
      <circle cx="18" cy="5" r="3" stroke={color} strokeWidth="2" />
      <circle cx="6" cy="12" r="3" stroke={color} strokeWidth="2" />
      <circle cx="18" cy="19" r="3" stroke={color} strokeWidth="2" />
      <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  route: ({ color }) => (
    // Map pin + route icon - viewing optimization
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="10" r="3" stroke={color} strokeWidth="2" />
      <path d="M12 2a8 8 0 0 0-8 8c0 5.4 7.05 11.5 7.35 11.76a1 1 0 0 0 1.3 0C12.95 21.5 20 15.4 20 10a8 8 0 0 0-8-8z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

// ============================================
// Integration Logo Card - clean tile with big logo + name
// "We connect to all your tools" - reads instantly at speed
// ============================================
const LogoCard: React.FC<{
  name: string;
  color: string;
  bgTint: string;
  icon: React.ReactNode;
}> = ({ name, color, bgTint, icon }) => (
  <div
    style={{
      width: 200,
      height: 200,
      backgroundColor: "white",
      borderRadius: 16,
      border: `1px solid ${color}20`,
      boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
    }}
  >
    {/* Logo circle */}
    <div
      style={{
        width: 72,
        height: 72,
        borderRadius: 18,
        backgroundColor: bgTint,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {icon}
    </div>
    {/* Name */}
    <span style={{ fontFamily: geist, fontSize: 18, fontWeight: 600, color: "#3F3F46", letterSpacing: "-0.01em" }}>
      {name}
    </span>
  </div>
);

// ============================================
// INPUT 1: WhatsApp
// ============================================
const WhatsAppCard: React.FC = () => (
  <LogoCard
    name="WhatsApp"
    color="#25D366"
    bgTint="#25D36612"
    icon={
      <svg width="44" height="44" viewBox="0 0 24 24" fill="#25D366">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
        <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 0 1-4.076-1.112L4 20l1.112-3.924A8 8 0 1 1 12 20z" />
      </svg>
    }
  />
);

// ============================================
// INPUT 2: Gmail
// ============================================
const GmailCard: React.FC = () => (
  <LogoCard
    name="Gmail"
    color="#EA4335"
    bgTint="#EA433510"
    icon={
      <svg width="44" height="34" viewBox="0 0 75 56" fill="none">
        {/* Envelope body */}
        <rect x="5" y="10" width="65" height="42" rx="4" fill="white" stroke="#D5D5D5" strokeWidth="1.5" />
        {/* Left side - blue */}
        <path d="M5 14 L5 52 Q5 54 7 54 L9 54 L9 20 L37.5 40 L5 14Z" fill="#4285F4" />
        {/* Right side - green */}
        <path d="M70 14 L70 52 Q70 54 68 54 L66 54 L66 20 L37.5 40 L70 14Z" fill="#34A853" />
        {/* Top left triangle - red */}
        <path d="M9 12 Q5 10 5 14 L37.5 38 L9 12Z" fill="#EA4335" />
        {/* Top right triangle - yellow/red */}
        <path d="M66 12 Q70 10 70 14 L37.5 38 L66 12Z" fill="#FBBC05" />
        {/* M shape overlay for crisp top */}
        <path d="M9 12 L37.5 36 L66 12" stroke="#EA4335" strokeWidth="1" fill="none" />
      </svg>
    }
  />
);

// ============================================
// INPUT 3: LinkedIn
// ============================================
const LinkedInCard: React.FC = () => (
  <LogoCard
    name="LinkedIn"
    color="#0A66C2"
    bgTint="#0A66C210"
    icon={
      <svg width="40" height="40" viewBox="0 0 24 24" fill="#0A66C2">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    }
  />
);

// ============================================
// INPUT 4: Google Calendar
// ============================================
const CalendarCard: React.FC = () => (
  <LogoCard
    name="Calendar"
    color="#4285F4"
    bgTint="#4285F410"
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
);

// ============================================
// COMPONENT: Action Output Card
// ============================================
const ActionCard: React.FC<{
  label: string;
  color: string;
  icon: string;
  subtitle: string;
  xOffset: number;
  opacity: number;
  scale?: number;
}> = ({ label, color, icon, subtitle, xOffset, opacity, scale = 1 }) => {
  const IconComponent = ActionIcons[icon];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        opacity,
        transform: `translateX(${xOffset}px) scale(${scale})`,
        transformOrigin: "left center",
      }}
    >
      {/* Icon with tinted background */}
      <div
        style={{
          width: 48,
          height: 48,
          backgroundColor: `${color}20`,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {IconComponent && <IconComponent color={color} />}
      </div>
      <div>
        <div
          style={{
            backgroundColor: color,
            padding: "8px 20px",
            borderRadius: 6,
            marginBottom: 10,
            display: "inline-block",
          }}
        >
          <span style={{ fontFamily: jetbrains, fontSize: 17, fontWeight: 600, color: "white", textTransform: "uppercase", letterSpacing: "0.02em" }}>
            {label}
          </span>
        </div>
        <div
          style={{
            width: 220,
            height: 105,
            backgroundColor: "white",
            borderRadius: 10,
            border: "1px solid #E5E5E5",
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            padding: 20,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <div style={{ fontFamily: geist, fontSize: 17, fontWeight: 500, color: "#52525B", letterSpacing: "-0.01em", textAlign: "center" }}>
            {subtitle}
          </div>
          <div style={{ width: "70%", height: 7, backgroundColor: `${color}15`, borderRadius: 3, margin: "0 auto" }} />
          <div style={{ width: "45%", height: 7, backgroundColor: "#F5F5F5", borderRadius: 3, margin: "0 auto" }} />
        </div>
      </div>
    </div>
  );
};

// ============================================
// COMPONENT: Processing Hub Icon (NeoBot icon as center processor)
// ============================================
const ProcessingHub: React.FC<{ scale: number; glowIntensity: number }> = ({ scale, glowIntensity }) => {
  const jerkPulse = glowIntensity > 0 ? Math.pow(glowIntensity, 0.5) : 0;
  const pulseScale = 1 + jerkPulse * 0.15;

  return (
    <div
      style={{
        width: 120,
        height: 120,
        background: "#2B2B2B",
        borderRadius: 24,
        boxShadow: `
          0 8px 30px -6px rgba(0, 0, 0, 0.15),
          0 0 ${8 + jerkPulse * 15}px rgba(43, 43, 43, ${0.1 + jerkPulse * 0.15})
        `,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: `scale(${scale * pulseScale})`,
        position: "relative",
        zIndex: 100,
        border: "1px solid rgba(255, 255, 255, 0.06)",
      }}
    >
      {/* NeoBot N icon - 3D isometric */}
      <svg width="60" height="60" viewBox="0 0 80 80" fill="none">
        <g transform="translate(4, 4) scale(0.9)">
          <polygon points="15.5,20 26.5,20 59.5,64 48.5,64" fill="white"/>
          <polygon points="26.5,20 31.5,17 64.5,61 59.5,64" fill="#c8c8c8"/>
          <polygon points="26.5,20 31.5,17 31.5,61 26.5,64" fill="#c8c8c8"/>
          <polygon points="15.5,20 26.5,20 26.5,64 15.5,64" fill="white"/>
          <polygon points="15.5,20 26.5,20 31.5,17 20.5,17" fill="#e8e8e8"/>
          <polygon points="59.5,20 64.5,17 64.5,61 59.5,64" fill="#c8c8c8"/>
          <polygon points="48.5,20 59.5,20 59.5,64 48.5,64" fill="white"/>
          <polygon points="48.5,20 59.5,20 64.5,17 53.5,17" fill="#e8e8e8"/>
        </g>
      </svg>
    </div>
  );
};

// ============================================
// COMPONENT: Top Headline
// ============================================
const TopHeadline: React.FC<{
  text: string;
  startFrame: number;
}> = ({ text, startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (frame < startFrame) return null;

  const localFrame = frame - startFrame;

  const entrance = spring({
    frame: localFrame,
    fps,
    config: springs.smooth,
  });

  const opacity = interpolate(entrance, [0, 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(entrance, [0, 1], [-20, 0]);

  return (
    <div
      style={{
        position: "absolute",
        top: 120,
        left: "50%",
        transform: `translateX(-50%) translateY(${translateY}px)`,
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
          letterSpacing: "-0.02em",
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
    </div>
  );
};

// ============================================
// COMPONENT: Pixel Particle (smooth animated square)
// ============================================
const PixelParticle: React.FC<{
  x: number;
  y: number;
  progress: number;
  color: string;
  size: number;
  rotation: number;
}> = ({ x, y, progress, color, size, rotation }) => {
  const opacity = interpolate(
    progress,
    [0, 0.2, 0.6, 1],
    [0, 1, 0.8, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const scale = interpolate(
    progress,
    [0, 0.25, 1],
    [0.4, 1.2, 0.9],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const rot = rotation + progress * 40;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        backgroundColor: color,
        borderRadius: 3,
        opacity,
        transform: `scale(${scale}) rotate(${rot}deg)`,
        transformOrigin: "center center",
        zIndex: 5,
        boxShadow: `0 0 ${size * 0.5}px ${color}60`,
      }}
    />
  );
};

// ============================================
// MAIN COMPONENT
// ============================================
export const Act4DocumentProcessing: React.FC<Act4DocumentProcessingProps> = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // ============================================
  // LAYOUT
  // ============================================
  const centerX = width / 2;
  const centerY = height / 2;
  const logoSize = 120;

  // Scanner/logo position - where inputs vanish
  const scannerX = centerX;

  // Input card dimensions and scale
  const docScale = 1.0;
  const docWidth = 200 * docScale;

  // Vertical center for all content (shifted slightly up to sit between headline and bottom caption)
  const contentCenterY = centerY - 20;

  // ============================================
  // SLOW CONTINUOUS SCROLL - Individual card cycling
  // ============================================
  const scannerLineX = scannerX - 60;
  const spawnX = -350;
  const travelDistance = scannerLineX - spawnX;
  const scrollSpeed = 4.5;

  // Input card components in order
  const inputTypes = [WhatsAppCard, GmailCard, LinkedInCard, CalendarCard];
  const numDocs = inputTypes.length;

  const getDocPosition = (slotIndex: number) => {
    const phaseOffset = (slotIndex / numDocs) * travelDistance;
    const rawProgress = (frame * scrollSpeed + phaseOffset) % travelDistance;
    return spawnX + rawProgress;
  };

  const getDocState = (xPos: number) => {
    const docRightEdge = xPos + docWidth;
    const distanceToScanner = scannerLineX - docRightEdge;

    if (distanceToScanner < 0) {
      const consumeProgress = Math.min(1, -distanceToScanner / docWidth);
      return {
        opacity: 1,
        scale: 1,
        isConsuming: true,
        hidden: consumeProgress >= 1,
      };
    }

    if (distanceToScanner < 50) {
      return { opacity: 1, scale: 1, isConsuming: true, hidden: false };
    }

    return { opacity: 1, scale: 1, isConsuming: false, hidden: false };
  };

  // Logo pulse based on inputs being consumed
  const getLogoState = () => {
    for (let i = 0; i < 4; i++) {
      const xPos = getDocPosition(i);
      const docRightEdge = xPos + docWidth;
      const distanceToScanner = scannerLineX - docRightEdge;

      if (distanceToScanner < 0 && distanceToScanner > -docWidth) {
        const consumeProgress = Math.min(1, -distanceToScanner / docWidth);
        return { scale: 1, glow: consumeProgress };
      }
    }
    return { scale: 1, glow: 0 };
  };

  const logoState = getLogoState();

  // Output action cards
  const outputCards = [
    { label: "Morning Brief", color: COLORS.brief, icon: "brief", subtitle: "3 follow-ups, client meeting at 2pm" },
    { label: "Gift Ordered", color: COLORS.gift, icon: "gift", subtitle: "Flowers for Sarah's birthday" },
    { label: "Referral Ask", color: COLORS.referral, icon: "referral", subtitle: "Sarah just closed — time to ask?" },
    { label: "Route Planned", color: COLORS.route, icon: "route", subtitle: "5 viewings, optimal order" },
  ];

  const cardsContainerX = centerX + logoSize / 2;

  // Consumption state tracking
  const getConsumptionState = () => {
    const cycleCount = Math.floor((frame * scrollSpeed) / travelDistance);

    for (let i = 0; i < 4; i++) {
      const xPos = getDocPosition(i);
      const docRightEdge = xPos + docWidth;
      const distanceToScanner = scannerLineX - docRightEdge;

      if (distanceToScanner < 0 && distanceToScanner > -docWidth * 2.5) {
        const consumeProgress = Math.min(1, -distanceToScanner / docWidth);
        const holdProgress = consumeProgress >= 1 ? (-distanceToScanner - docWidth) / (docWidth * 1.5) : 0;
        return {
          active: true,
          consuming: consumeProgress < 1,
          progress: consumeProgress,
          holdProgress: Math.min(1, holdProgress),
          docIndex: i,
          cycleId: cycleCount * 4 + i,
        };
      }

      if (distanceToScanner >= 0 && distanceToScanner < 10) {
        return { active: true, consuming: true, progress: 0, holdProgress: 0, docIndex: i, cycleId: cycleCount * 4 + i };
      }
    }
    return { active: false, consuming: false, progress: 0, holdProgress: 0, docIndex: -1, cycleId: 0 };
  };

  const consumption = getConsumptionState();

  const getCardAnimation = (cardIndex: number) => {
    if (!consumption.active) {
      return { xOffset: 120, opacity: 0, scale: 1 };
    }

    const appearThreshold = 0.05 + cardIndex * 0.1;
    const cardProgress = interpolate(
      consumption.progress,
      [appearThreshold, appearThreshold + 0.15],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) }
    );

    const xOffset = interpolate(cardProgress, [0, 1], [60, 120]);

    const totalProgress = consumption.progress + consumption.holdProgress;
    const gentleFade = interpolate(
      totalProgress,
      [1.5, 3.0],
      [1, 0.15],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );

    return {
      xOffset,
      opacity: cardProgress * gentleFade,
      scale: 1,
    };
  };

  // Scene fade - 5.5s total
  const sceneOpacity = interpolate(frame, [145, 165], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Particle burst when inputs are consumed
  const renderParticles = () => {
    if (!consumption.active || consumption.progress < 0.02) {
      return null;
    }

    const particles: React.ReactNode[] = [];
    const colors = ["#9333EA", "#F59E0B", "#0D9488", "#7C3AED", "#EC4899", "#06B6D4", "#8B5CF6"];
    const visualCenterY = contentCenterY;
    const cycleSeed = consumption.cycleId;

    // WAVE 1: Initial burst (14 particles radiating RIGHTWARD only)
    for (let i = 0; i < 14; i++) {
      const seed = i + cycleSeed * 100;
      const angle = ((i / 14) - 0.5) * Math.PI * 0.7 + random(`ang-${seed}`) * 0.25;
      const distance = 80 + random(`dist-${seed}`) * 140;

      const startX = scannerLineX;
      const startY = visualCenterY;
      const endX = startX + Math.abs(Math.cos(angle)) * distance + 30;
      const endY = startY + Math.sin(angle) * distance;

      const particleProgress = interpolate(
        consumption.progress,
        [0, 0.65],
        [0, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      );

      const pX = interpolate(particleProgress, [0, 1], [startX, endX], {
        easing: Easing.out(Easing.quad),
      });
      const pY = interpolate(particleProgress, [0, 1], [startY, endY], {
        easing: Easing.out(Easing.quad),
      });

      particles.push(
        <PixelParticle
          key={`burst-${i}-${cycleSeed}`}
          x={pX}
          y={pY}
          progress={particleProgress}
          color={colors[i % colors.length]}
          size={10 + random(`sz1-${seed}`) * 10}
          rotation={random(`rot1-${seed}`) * 360}
        />
      );
    }

    // WAVE 2: Secondary scatter (12 particles, slightly delayed) - RIGHTWARD
    for (let j = 0; j < 12; j++) {
      const seed = j + 50 + cycleSeed * 100;

      const startX = scannerLineX;
      const startY = visualCenterY + (random(`sy2-${seed}`) - 0.5) * 100;
      const endX = scannerLineX + 80 + random(`ex2-${seed}`) * 160;
      const endY = startY + (random(`ey2-${seed}`) - 0.5) * 120;

      const particleDelay = 0.05 + j * 0.02;
      const particleProgress = interpolate(
        consumption.progress,
        [particleDelay, particleDelay + 0.55],
        [0, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      );

      const pX = interpolate(particleProgress, [0, 1], [startX, endX], {
        easing: Easing.out(Easing.quad),
      });
      const pY = interpolate(particleProgress, [0, 1], [startY, endY], {
        easing: Easing.out(Easing.quad),
      });

      particles.push(
        <PixelParticle
          key={`scatter-${j}-${cycleSeed}`}
          x={pX}
          y={pY}
          progress={particleProgress}
          color={colors[(j + 3) % colors.length]}
          size={8 + random(`sz2-${seed}`) * 8}
          rotation={random(`rot2-${seed}`) * 360}
        />
      );
    }

    // WAVE 3: Medium accents (10 particles) - RIGHTWARD
    for (let m = 0; m < 10; m++) {
      const seed = m + 100 + cycleSeed * 100;

      const angle = (random(`ang3-${seed}`) - 0.5) * Math.PI * 0.65;
      const distance = 60 + random(`dist3-${seed}`) * 110;

      const startX = scannerLineX;
      const startY = visualCenterY + (random(`sy3-${seed}`) - 0.5) * 70;
      const endX = startX + Math.abs(Math.cos(angle)) * distance + 15;
      const endY = startY + Math.sin(angle) * distance;

      const particleDelay = 0.08 + m * 0.025;
      const particleProgress = interpolate(
        consumption.progress,
        [particleDelay, particleDelay + 0.5],
        [0, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      );

      const pX = interpolate(particleProgress, [0, 1], [startX, endX], {
        easing: Easing.out(Easing.quad),
      });
      const pY = interpolate(particleProgress, [0, 1], [startY, endY], {
        easing: Easing.out(Easing.quad),
      });

      particles.push(
        <PixelParticle
          key={`sparkle-${m}-${cycleSeed}`}
          x={pX}
          y={pY}
          progress={particleProgress}
          color={colors[(m + 5) % colors.length]}
          size={6 + random(`sz3-${seed}`) * 6}
          rotation={random(`rot3-${seed}`) * 360}
        />
      );
    }

    return particles;
  };

  return (
    <AbsoluteFill style={{ backgroundColor: CREAM_BG }}>
      {/* Persistent brand logo */}
      <BrandOverlay />

      <div style={{ position: "absolute", inset: 0, opacity: sceneOpacity }}>
        {/* ============================================ */}
        {/* 4 INPUT CARDS - Individually clipped as they pass scanner */}
        {/* ============================================ */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: width,
            height: height,
            zIndex: 5,
          }}
        >
          {[0, 1, 2, 3].map((slotIndex) => {
            const xPos = getDocPosition(slotIndex);
            const state = getDocState(xPos);
            const InputComponent = inputTypes[slotIndex];

            if (xPos < -docWidth) return null;

            const docRightEdge = xPos + docWidth;
            const amountPastScanner = docRightEdge - scannerLineX;

            let clipPercent = 100;
            if (amountPastScanner > 0) {
              const visibleWidth = docWidth - amountPastScanner;
              clipPercent = Math.max(0, (visibleWidth / docWidth) * 100);
            }

            if (clipPercent <= 0) return null;

            return (
              <div
                key={`input-${slotIndex}`}
                style={{
                  position: "absolute",
                  left: xPos,
                  top: contentCenterY,
                  marginTop: -100 * docScale,
                  opacity: state.opacity,
                  transform: `scale(${state.scale * docScale})`,
                  transformOrigin: "left center",
                  clipPath: `inset(0 ${100 - clipPercent}% 0 0)`,
                }}
              >
                <InputComponent />
              </div>
            );
          })}
        </div>

        {/* Scanner Line */}
        <div
          style={{
            position: "absolute",
            left: scannerX - 60,
            top: contentCenterY - 280,
            width: 4,
            height: 560,
            background: `linear-gradient(to bottom,
              transparent 0%,
              ${COLORS.scanner}30 15%,
              ${COLORS.scanner} 50%,
              ${COLORS.scanner}30 85%,
              transparent 100%
            )`,
            boxShadow: `0 0 15px ${COLORS.scanner}50`,
            zIndex: 8,
          }}
        />

        {/* Particles */}
        {renderParticles()}

        {/* Center Logo */}
        <div
          style={{
            position: "absolute",
            left: scannerLineX,
            top: contentCenterY,
            transform: "translate(-50%, -50%)",
            zIndex: 50,
          }}
        >
          <ProcessingHub scale={logoState.scale} glowIntensity={logoState.glow} />
        </div>

        {/* Output Action Cards - Vertically centered with logo */}
        <div
          style={{
            position: "absolute",
            left: cardsContainerX,
            top: contentCenterY,
            transform: "translateY(-50%)",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "40px 50px",
            zIndex: 10,
          }}
        >
          {outputCards.map((card, i) => {
            const anim = getCardAnimation(i);
            return (
              <ActionCard
                key={card.label}
                label={card.label}
                color={card.color}
                icon={card.icon}
                subtitle={card.subtitle}
                xOffset={anim.xOffset}
                opacity={anim.opacity}
                scale={anim.scale}
              />
            );
          })}
        </div>
      </div>

      {/* Top headline - broader vision */}
      <TopHeadline text="One AI. Built for how you sell." startFrame={10} />

      {/* Bottom caption - 2s suspense gap */}
      <BottomCaption
        text="Any workflow you can imagine, automated."
        startFrame={70}
        style={{ bottom: 140 }}
      />

      {/* Sound effects for text appearing */}
      <Sequence from={10} premountFor={10}>
        <Audio src={staticFile("audio/deep-whoosh.wav")} volume={0.5} />
      </Sequence>
      <Sequence from={70} premountFor={10}>
        <Audio src={staticFile("audio/deep-whoosh.wav")} volume={0.5} />
      </Sequence>
    </AbsoluteFill>
  );
};
