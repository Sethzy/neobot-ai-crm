// BottomCaption - Explanatory text for self-explanatory video
// CuaBench-style bottom caption with slide-up animation

import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { geist } from "../fonts";

type BottomCaptionProps = {
  text: string;
  subtext?: string;
  startFrame?: number;
  style?: React.CSSProperties;
};

export const BottomCaption: React.FC<BottomCaptionProps> = ({
  text,
  subtext,
  startFrame = 20,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 200 },
  });

  const opacity = interpolate(entrance, [0, 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });
  const y = interpolate(entrance, [0, 1], [30, 0]);

  // Subtext appears slightly delayed
  const subtextEntrance = spring({
    frame: frame - startFrame - 8,
    fps,
    config: { damping: 200 },
  });
  const subtextOpacity = interpolate(subtextEntrance, [0, 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: 80,
        left: 0,
        right: 0,
        textAlign: "center",
        opacity,
        transform: `translateY(${y}px)`,
        zIndex: 50,
        ...style,
      }}
    >
      <div
        style={{
          fontFamily: geist,
          fontSize: 56,
          fontWeight: 600,
          color: "#09090B",
          letterSpacing: "-0.02em",
        }}
      >
        {text}
      </div>
      {subtext && (
        <div
          style={{
            fontFamily: geist,
            fontSize: 28,
            fontWeight: 500,
            color: "#52525B",
            marginTop: 16,
            opacity: subtextOpacity,
          }}
        >
          {subtext}
        </div>
      )}
    </div>
  );
};
