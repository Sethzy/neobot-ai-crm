// BrandOverlay - Persistent top-left logo for brand consistency
// Appears on all scenes except final close

import React from "react";
import { staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { geist } from "../fonts";
import { colors } from "../theme";

type BrandOverlayProps = {
  startFrame?: number;
};

export const BrandOverlay: React.FC<BrandOverlayProps> = ({ startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Subtle entrance animation
  const entrance = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 200 },
  });

  const opacity = interpolate(entrance, [0, 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });
  const x = interpolate(entrance, [0, 1], [-20, 0]);

  return (
    <div
      style={{
        position: "absolute",
        top: 40,
        left: 50,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        gap: 12,
        opacity,
        transform: `translateX(${x}px)`,
      }}
    >
      <img
        src={staticFile("neobot-icon.svg")}
        width={36}
        height={36}
        style={{ objectFit: "contain" }}
      />
      <span
        style={{
          fontFamily: geist,
          fontSize: 22,
          fontWeight: 600,
          color: colors.gray800,
          letterSpacing: "-0.01em",
        }}
      >
        neobot
      </span>
    </div>
  );
};
