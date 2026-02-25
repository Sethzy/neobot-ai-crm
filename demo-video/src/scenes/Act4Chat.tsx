// Act 4A: The Chat (22-26s, 120 frames)
// Chat interface with AI response + Excel download
// Emotion: Empowerment, "I can ask for anything"

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { TypewriterText } from "../components/TypewriterText";
import { GridBackground } from "../components/GridBackground";
import { figtree, jetbrains } from "../fonts";
import { colors, springs } from "../theme";
import type { DemoConfig } from "../config";

type Act4ChatProps = {
  config: DemoConfig;
};

export const Act4Chat: React.FC<Act4ChatProps> = ({ config }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Timeline:
  // 0-15: Scene entrance
  // 15-50: User types prompt
  // 50-70: Thinking animation
  // 70-100: AI response appears
  // 100-120: Download animation + tagline

  const userTypingStart = 15;
  const thinkingStart = 50;
  const responseStart = 70;
  const downloadStart = 100;

  // Scene entrance
  const sceneEntrance = spring({
    frame,
    fps,
    config: springs.smooth,
  });
  const sceneOpacity = interpolate(sceneEntrance, [0, 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });

  // User message bubble entrance
  const userBubbleEntrance = spring({
    frame: frame - userTypingStart,
    fps,
    config: springs.snappy,
  });
  const userBubbleOpacity = interpolate(userBubbleEntrance, [0, 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Thinking dots animation
  const thinkingOpacity = interpolate(
    frame,
    [thinkingStart, thinkingStart + 5, responseStart - 5, responseStart],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const dotPhase = (frame - thinkingStart) * 0.3;

  // AI response entrance
  const aiEntrance = spring({
    frame: frame - responseStart,
    fps,
    config: springs.snappy,
  });
  const aiOpacity = interpolate(aiEntrance, [0, 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });
  const aiY = interpolate(aiEntrance, [0, 1], [20, 0]);

  // Download button animation
  const downloadEntrance = spring({
    frame: frame - downloadStart,
    fps,
    config: springs.bouncy,
  });
  const downloadScale = interpolate(downloadEntrance, [0, 1], [0.8, 1]);
  const downloadOpacity = interpolate(downloadEntrance, [0, 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Tagline
  const taglineEntrance = spring({
    frame: frame - downloadStart - 10,
    fps,
    config: springs.smooth,
  });
  const taglineOpacity = interpolate(taglineEntrance, [0, 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        opacity: sceneOpacity,
      }}
    >
      {/* Background with grid */}
      <GridBackground theme="light" cellSize={60} />
      {/* Chat container */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 800,
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* User message */}
        <div
          style={{
            alignSelf: "flex-end",
            maxWidth: "80%",
            opacity: userBubbleOpacity,
          }}
        >
          <div
            style={{
              backgroundColor: colors.brandGreen,
              borderRadius: "20px 20px 4px 20px",
              padding: "16px 24px",
            }}
          >
            <TypewriterText
              text={config.act4.chatPrompt}
              startFrame={userTypingStart + 5}
              charFrames={1}
              showCursor={false}
              style={{
                fontFamily: figtree,
                fontSize: 18,
                color: colors.white,
              }}
            />
          </div>
        </div>

        {/* Thinking indicator */}
        <div
          style={{
            alignSelf: "flex-start",
            opacity: thinkingOpacity,
          }}
        >
          <div
            style={{
              backgroundColor: colors.gray100,
              borderRadius: "20px 20px 20px 4px",
              padding: "16px 24px",
              display: "flex",
              gap: 8,
            }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: colors.gray400,
                  opacity: 0.5 + 0.5 * Math.sin(dotPhase + i * 1.5),
                }}
              />
            ))}
          </div>
        </div>

        {/* AI Response */}
        {frame >= responseStart && (
          <div
            style={{
              alignSelf: "flex-start",
              maxWidth: "85%",
              opacity: aiOpacity,
              transform: `translateY(${aiY}px)`,
            }}
          >
            <div
              style={{
                backgroundColor: colors.gray100,
                borderRadius: "20px 20px 20px 4px",
                padding: "20px 24px",
              }}
            >
              <div
                style={{
                  fontFamily: figtree,
                  fontSize: 17,
                  color: colors.gray800,
                  lineHeight: 1.5,
                  marginBottom: 16,
                }}
              >
                {config.act4.chatResponse}
              </div>

              {/* Download button */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 20px",
                  backgroundColor: colors.brandGreen,
                  borderRadius: 10,
                  opacity: downloadOpacity,
                  transform: `scale(${downloadScale})`,
                }}
              >
                <span style={{ fontSize: 18 }}>📊</span>
                <span
                  style={{
                    fontFamily: figtree,
                    fontSize: 14,
                    fontWeight: 600,
                    color: colors.white,
                  }}
                >
                  january_summary.xlsx
                </span>
                <span
                  style={{
                    fontFamily: jetbrains,
                    fontSize: 12,
                    color: colors.white,
                    opacity: 0.7,
                  }}
                >
                  ↓
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tagline */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: figtree,
          fontSize: 24,
          color: colors.brandGreen,
          opacity: taglineOpacity,
        }}
      >
        {config.act4.reportTagline}
      </div>
    </AbsoluteFill>
  );
};
