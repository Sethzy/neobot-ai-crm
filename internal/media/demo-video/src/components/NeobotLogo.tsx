// NeobotLogo component - Animated logo reveal
import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  staticFile,
  Img,
} from "remotion";
import { geist } from "../fonts";
import { springs } from "../theme";

type NeobotLogoProps = {
  startFrame?: number;
  scale?: number;
  glowIntensity?: number;
  frame?: number; // Optional frame override for external control
};

export const NeobotLogo: React.FC<NeobotLogoProps> = ({ 
  startFrame = 0,
  scale: externalScale = 1,
  glowIntensity = 0,
  frame: externalFrame,
}) => {
  const currentFrame = useCurrentFrame();
  const frame = externalFrame ?? currentFrame;
  const { fps } = useVideoConfig();

  const adjustedFrame = frame - startFrame;

  // Icon entrance - scale up with bounce
  const iconEntrance = spring({
    frame: adjustedFrame,
    fps,
    config: springs.bouncy,
  });

  // Wordmark entrance - delayed slightly after icon
  const wordmarkDelay = 10;
  const wordmarkEntrance = spring({
    frame: adjustedFrame - wordmarkDelay,
    fps,
    config: springs.smooth,
  });

  // Icon animations
  const iconScale = interpolate(iconEntrance, [0, 1], [0, 1]);
  const iconOpacity = interpolate(iconEntrance, [0, 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Wordmark animations
  const wordmarkOpacity = interpolate(wordmarkEntrance, [0, 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });
  const wordmarkX = interpolate(wordmarkEntrance, [0, 1], [-20, 0]);

  // Optional glow effect for the icon container
  const glowStyle = glowIntensity > 0 ? {
    boxShadow: `0 0 ${20 * glowIntensity}px ${5 * glowIntensity}px rgba(16, 185, 129, ${0.4 * glowIntensity})`, // Using emerald/green glow
    borderRadius: 16, // Matches the icon's rounded corners
  } : {};

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 24,
        transform: `scale(${externalScale})`, // Apply external scale to container
      }}
    >
      {/* Logo Icon */}
      <div
        style={{
          width: 80,
          height: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: iconOpacity,
          transform: `scale(${iconScale})`, // Use internal scale only (external handled by container)
          ...glowStyle,
        }}
      >
        <Img
          src={staticFile("neobot-icon.svg")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />
      </div>

      {/* Wordmark */}
      <div
        style={{
          fontFamily: geist,
          fontSize: 72,
          fontWeight: 700, // Matching the bold look of the logo text
          color: "inherit", // Inherit from parent for light/dark contexts
          letterSpacing: "-0.03em", // Tighter tracking per logo design
          opacity: wordmarkOpacity,
          transform: `translateX(${wordmarkX}px)`,
        }}
      >
        neobot
      </div>
    </div>
  );
};
