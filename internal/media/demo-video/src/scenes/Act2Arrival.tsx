// Act 2: The Arrival (5-8s, 90 frames)
// Emotion: Hope, brand recognition, "who are these people?"
// Gradient wash → Logo unfold → Tagline typewriter

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { NeobotLogo } from "../components/NeobotLogo";
import { TypewriterText } from "../components/TypewriterText";
import { GridBackground } from "../components/GridBackground";
import { figtree } from "../fonts";
import { colors, springs } from "../theme";
import type { DemoConfig } from "../config";

type Act2Props = {
  config: DemoConfig;
};

export const Act2Arrival: React.FC<Act2Props> = ({ config }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Gradient wash animation - sweeps across
  const gradientProgress = spring({
    frame,
    fps,
    config: { damping: 100 },
    durationInFrames: 30,
  });

  // Background gradient position
  const gradientX = interpolate(gradientProgress, [0, 1], [-100, 0]);

  // Logo starts appearing after gradient settles (around frame 15)
  const logoStartFrame = 15;

  // Tagline starts after logo (around frame 45)
  const taglineStartFrame = 45;
  const taglineEntrance = spring({
    frame: frame - taglineStartFrame,
    fps,
    config: springs.smooth,
  });
  const taglineOpacity = interpolate(taglineEntrance, [0, 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });
  const taglineY = interpolate(taglineEntrance, [0, 1], [20, 0]);

  return (
    <AbsoluteFill>
      {/* Background with grid */}
      <GridBackground theme="light" cellSize={60} />

      {/* Animated gradient overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(
            135deg,
            ${colors.deepTeal}DD 0%,
            ${colors.brandGreen}DD 50%,
            ${colors.deepTeal}DD 100%
          )`,
          backgroundSize: "200% 200%",
          backgroundPosition: `${gradientX}% 50%`,
        }}
      />

      {/* Subtle radial overlay for depth */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(
            ellipse at center,
            transparent 0%,
            rgba(0,0,0,0.3) 100%
          )`,
        }}
      />

      {/* Center content container */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 40,
        }}
      >
        {/* Logo with origami unfold */}
        <NeobotLogo startFrame={logoStartFrame} />

        {/* Tagline */}
        <div
          style={{
            opacity: taglineOpacity,
            transform: `translateY(${taglineY}px)`,
          }}
        >
          <TypewriterText
            text={config.act2.tagline}
            startFrame={taglineStartFrame + 5}
            charFrames={2}
            style={{
              fontFamily: figtree,
              fontSize: 32,
              fontWeight: 500,
              color: colors.white,
              opacity: 0.9,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
