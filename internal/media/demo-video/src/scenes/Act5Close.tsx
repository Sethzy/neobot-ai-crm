// Act 5: The Close
// Clean, confident logo reveal on paper texture
// Emotion: Trust, professionalism - not pushy

// Export duration for use in composition setup (3 seconds at 30fps)
export const CLOSE_DURATION = 90;

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { NeobotLogo } from "../components/NeobotLogo";
import { springs } from "../theme";

import { geist } from "../fonts";
import type { DemoConfig } from "../config";

type Act5Props = {
  config: DemoConfig;
};

export const Act5Close: React.FC<Act5Props> = ({ config }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Scene entrance
  const sceneEntrance = spring({
    frame,
    fps,
    config: springs.smooth,
  });
  const sceneOpacity = interpolate(sceneEntrance, [0, 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Tagline entrance - delayed after logo
  const taglineEntrance = spring({
    frame: frame - 25,
    fps,
    config: springs.smooth,
  });
  const taglineOpacity = interpolate(taglineEntrance, [0, 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });
  const taglineY = interpolate(taglineEntrance, [0, 1], [20, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#1b4332" }}>
      {/* Radial gradient overlay for depth */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.3) 100%)`,
        }}
      />

      {/* Content container - logo + tagline */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 30,
          opacity: sceneOpacity,
        }}
      >
        <div style={{ color: "white" }}>
          <NeobotLogo startFrame={5} />
        </div>
        <div
          style={{
            fontFamily: geist,
            fontSize: 28,
            fontWeight: 500,
            color: "rgba(255, 255, 255, 0.85)",
            letterSpacing: "-0.01em",
            opacity: taglineOpacity,
            transform: `translateY(${taglineY}px)`,
          }}
        >
          The AI assistant that actually does stuff.
        </div>
      </div>

    </AbsoluteFill>
  );
};
