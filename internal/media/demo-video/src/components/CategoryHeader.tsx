// CategoryHeader - Category label badges for document split animation
// Shows icon + text for Hot Leads, Active Clients, and Follow Up categories

import React from "react";
import { spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { springs } from "../theme";
import { geist } from "../fonts";

export type CategoryType = "hotLeads" | "activeClients" | "followUp";

export type CategoryHeaderProps = {
  category: CategoryType;
  startFrame?: number;
  color?: string;
  label?: string;
};

// Default category configurations
const CATEGORY_DEFAULTS: Record<
  CategoryType,
  { color: string; label: string }
> = {
  hotLeads: { color: "#EF4444", label: "HOT LEADS" },
  activeClients: { color: "#10B981", label: "ACTIVE CLIENTS" },
  followUp: { color: "#F59E0B", label: "FOLLOW UP" },
};

// Icon components for each category
const HotLeadsIcon: React.FC<{ color: string; size: number }> = ({
  color,
  size,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {/* Flame icon */}
    <path
      d="M12 2C12 2 7 8 7 13C7 15.8 9.2 18 12 18C14.8 18 17 15.8 17 13C17 8 12 2 12 2Z"
      fill={color}
      opacity={0.2}
    />
    <path
      d="M12 2C12 2 7 8 7 13C7 15.8 9.2 18 12 18C14.8 18 17 15.8 17 13C17 8 12 2 12 2Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 18C12 18 10 15 10 13.5C10 12.1 11.1 11 12 11C12.9 11 14 12.1 14 13.5C14 15 12 18 12 18Z"
      fill={color}
      opacity={0.4}
    />
  </svg>
);

const ActiveClientsIcon: React.FC<{ color: string; size: number }> = ({
  color,
  size,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {/* Person with checkmark */}
    <circle cx="10" cy="8" r="4" fill={color} opacity={0.2} />
    <circle cx="10" cy="8" r="4" stroke={color} strokeWidth="2" />
    <path
      d="M3 20C3 16.1 6.1 13 10 13"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M16 15L18 17L22 13"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const FollowUpIcon: React.FC<{ color: string; size: number }> = ({
  color,
  size,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {/* Clock icon */}
    <circle cx="12" cy="12" r="9" fill={color} opacity={0.2} />
    <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
    <line x1="12" y1="7" x2="12" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <line x1="12" y1="12" x2="16" y2="14" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const ICONS: Record<CategoryType, React.FC<{ color: string; size: number }>> = {
  hotLeads: HotLeadsIcon,
  activeClients: ActiveClientsIcon,
  followUp: FollowUpIcon,
};

export const CategoryHeader: React.FC<CategoryHeaderProps> = ({
  category,
  startFrame = 0,
  color,
  label,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const defaults = CATEGORY_DEFAULTS[category];
  const finalColor = color || defaults.color;
  const finalLabel = label || defaults.label;

  const Icon = ICONS[category];

  // Entrance animation
  const entrance = spring({
    frame: frame - startFrame,
    fps,
    config: springs.snappy,
  });

  const opacity = interpolate(entrance, [0, 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });

  const y = interpolate(entrance, [0, 1], [15, 0]);
  const scale = interpolate(entrance, [0, 1], [0.9, 1]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        opacity,
        transform: `translateY(${y}px) scale(${scale})`,
      }}
    >
      <Icon color={finalColor} size={22} />
      <span
        style={{
          fontFamily: geist,
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: finalColor,
        }}
      >
        {finalLabel}
      </span>
    </div>
  );
};
