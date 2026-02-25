// Act 4B: The ROI
// Animated calculation showing money recovered
// Emotion: Financial impact, "this is real money"

// Export duration for use in composition setup (5.1 seconds at 30fps)
export const ROI_DURATION = 143;

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
import { figtree, jetbrains, playfair } from "../fonts";
import { colors, springs } from "../theme";
import { BrandOverlay } from "../components/BrandOverlay";
import { BottomCaption } from "../components/BottomCaption";
import type { DemoConfig } from "../config";

// Solid cream background color (CuaBench style)
const CREAM_BG = "#FFFFFF";

type Act4ROIProps = {
  config: DemoConfig;
};

// Animated number counter
const AnimatedNumber: React.FC<{
  value: number;
  prefix?: string;
  suffix?: string;
  startFrame: number;
  format?: "currency" | "percent" | "number";
}> = ({ value, prefix = "", suffix = "", startFrame, format = "number" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 50 },
    durationInFrames: 12,
  });

  const currentValue = Math.floor(value * progress);

  let formattedValue = currentValue.toString();
  if (format === "currency") {
    formattedValue = "$" + currentValue.toLocaleString();
  } else if (format === "percent") {
    formattedValue = currentValue + "%";
  } else {
    formattedValue = currentValue.toLocaleString();
  }

  return (
    <span>
      {prefix}
      {formattedValue}
      {suffix}
    </span>
  );
};

export const Act4ROI: React.FC<Act4ROIProps> = ({ config }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Time savings calculation: 45 min + 1.2 hrs ≈ 2 hrs/day → 500 hrs/year
  const totalRecovered = 500;

  // Timeline (let the big number breathe):
  // 0-8: Scene entrance
  // 8-18: Line 1 appears (45 min meeting admin)
  // 18-28: Line 2 appears (1.2 hrs inbox)
  // 28-38: Divider line draws
  // 38: Big result appears with glow
  // 83: Caption (1.5s after result to let it sink in)
  // 143: Scene end (2s caption linger)

  const line1Start = 8;
  const line2Start = 18;
  const dividerStart = 28;
  const resultStart = 38;

  // Scene entrance
  const sceneEntrance = spring({
    frame,
    fps,
    config: springs.smooth,
  });
  const sceneOpacity = interpolate(sceneEntrance, [0, 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Line entrances
  const lineEntrances = [line1Start, line2Start].map((start) =>
    spring({
      frame: frame - start,
      fps,
      config: springs.snappy,
    })
  );

  // Divider animation
  const dividerProgress = interpolate(
    frame,
    [dividerStart, dividerStart + 15],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Result entrance with glow
  const resultEntrance = spring({
    frame: frame - resultStart,
    fps,
    config: springs.bouncy,
  });
  const resultOpacity = interpolate(resultEntrance, [0, 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });
  const resultScale = interpolate(resultEntrance, [0, 1], [0.9, 1]);

  // Glow pulse
  const glowIntensity = frame >= resultStart + 30
    ? 0.5 + 0.3 * Math.sin((frame - resultStart - 30) * 0.15)
    : interpolate(frame, [resultStart, resultStart + 30], [0, 0.5], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  const lines = [
    { label: "on meeting admin /day", displayValue: "45 min", startFrame: line1Start },
    { label: "lost to your inbox /day", displayValue: "+ 1.2 hrs", startFrame: line2Start },
  ];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: CREAM_BG,
        opacity: sceneOpacity,
      }}
    >
      {/* Persistent brand logo */}
      <BrandOverlay />


      {/* Calculator container */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 600,
        }}
      >
        {/* Calculation lines */}
        {lines.map((line, i) => {
          const entrance = lineEntrances[i];
          const opacity = interpolate(entrance, [0, 0.5], [0, 1], {
            extrapolateRight: "clamp",
          });
          const x = interpolate(entrance, [0, 1], [-30, 0]);

          return (
            <div
              key={line.label}
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "baseline",
                gap: 20,
                marginBottom: 20,
                opacity,
                transform: `translateX(${x}px)`,
              }}
            >
              <span
                style={{
                  fontFamily: jetbrains,
                  fontSize: 32,
                  color: colors.gray800,
                  fontWeight: 500,
                }}
              >
                {line.displayValue}
              </span>
              <span
                style={{
                  fontFamily: figtree,
                  fontSize: 18,
                  color: colors.gray600,
                  width: 200,
                }}
              >
                {line.label}
              </span>
            </div>
          );
        })}

        {/* Divider */}
        <div
          style={{
            height: 3,
            backgroundColor: colors.brandGreen,
            marginTop: 20,
            marginBottom: 30,
            transformOrigin: "left",
            transform: `scaleX(${dividerProgress})`,
          }}
        />

        {/* Result */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "baseline",
            gap: 20,
            opacity: resultOpacity,
            transform: `scale(${resultScale})`,
            position: "relative",
          }}
        >
          {/* Subtle glow effect */}
          <div
            style={{
              position: "absolute",
              inset: -40,
              background: `radial-gradient(ellipse at center, ${colors.brandGreen}${Math.floor(glowIntensity * 25).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
              pointerEvents: "none",
            }}
          />

          <span
            style={{
              fontFamily: playfair,
              fontSize: 20,
              color: colors.brandGreen,
              marginRight: 8,
            }}
          >
            =
          </span>
          <span
            style={{
              fontFamily: jetbrains,
              fontSize: 56,
              color: colors.brandGreen,
              fontWeight: 700,
            }}
          >
            <AnimatedNumber
              value={totalRecovered}
              startFrame={resultStart}
              format="number"
            />
          </span>
          <span
            style={{
              fontFamily: figtree,
              fontSize: 20,
              color: colors.gray600,
              width: 160,
            }}
          >
            hrs /year back
          </span>
        </div>
      </div>

      {/* Bottom caption - 1.5s after big number lands to let it sink in */}
      <BottomCaption text="That's 62 working days back." startFrame={83} style={{ bottom: 140 }} />

      {/* Whoosh for bottom caption */}
      <Sequence from={83}>
        <Audio src={staticFile("audio/whoosh.wav")} volume={0.65} />
      </Sequence>
    </AbsoluteFill>
  );
};
