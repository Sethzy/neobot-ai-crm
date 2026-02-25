// TransitionPivot - "meet neobot" typing animation scene
// CuaBench-style typing with blinking cursor, then logo reveal

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  Easing,
  Sequence,
  staticFile,
  Img,
} from "remotion";
import { Audio } from "@remotion/media";
import { geist } from "../fonts";
import { colors } from "../theme";
import { BrandOverlay } from "../components/BrandOverlay";

// Solid cream background
const CREAM_BG = "#FFFFFF";

// Text content - confident solution intro
const TYPING_TEXT = "meet";
const REVEAL_TEXT = "neobot";
const FONT_SIZE = 72;

// Typing speed (frames per character)
const FRAMES_PER_CHAR = 5;
const START_DELAY = 8;

// Phase timings (scene is 70 frames total)
const TYPING_DURATION = TYPING_TEXT.length * FRAMES_PER_CHAR; // 20 frames
const TYPING_END = START_DELAY + TYPING_DURATION; // 28
const HOLD_AFTER_TYPING = 12;
const REVEAL_START = TYPING_END + HOLD_AFTER_TYPING; // 40
const REVEAL_SLIDE_DURATION = 10;

// Accent color for neobot brand
const NEOBOT_DARK = "#2B2B2B";

export const TransitionPivot: React.FC = () => {
  const frame = useCurrentFrame();

  // === TYPING PHASE ===
  const typingFrame = Math.max(0, frame - START_DELAY);
  const charsToShow = Math.min(
    Math.floor(typingFrame / FRAMES_PER_CHAR),
    TYPING_TEXT.length
  );
  const displayedText = TYPING_TEXT.slice(0, charsToShow);
  const isTypingComplete = charsToShow >= TYPING_TEXT.length;

  // Cursor blink (every 15 frames)
  const cursorVisible = Math.floor(frame / 15) % 2 === 0 || !isTypingComplete;

  // Hide cursor after reveal starts
  const showCursor = frame < REVEAL_START + 5;

  // === REVEAL PHASE ===
  const revealProgress =
    frame >= REVEAL_START
      ? interpolate(
          frame,
          [REVEAL_START, REVEAL_START + REVEAL_SLIDE_DURATION],
          [0, 1],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }
        )
      : 0;

  const revealTranslateY = interpolate(revealProgress, [0, 1], [40, 0]);
  const revealOpacity = interpolate(revealProgress, [0, 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });

  // "meet" moves up slightly when neobot appears
  const topTextTranslateY =
    frame >= REVEAL_START
      ? interpolate(
          frame,
          [REVEAL_START, REVEAL_START + REVEAL_SLIDE_DURATION],
          [0, -20],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.quad),
          }
        )
      : 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: CREAM_BG,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Persistent brand logo */}
      <BrandOverlay />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        {/* "so we built" text with typing cursor */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontFamily: geist,
            fontSize: FONT_SIZE,
            fontWeight: 600,
            color: colors.gray800,
            transform: `translateY(${topTextTranslateY}px)`,
          }}
        >
          <span>{displayedText}</span>
          {showCursor && (
            <span
              style={{
                display: "inline-block",
                width: 4,
                height: FONT_SIZE * 0.85,
                backgroundColor: cursorVisible ? colors.gray800 : "transparent",
                marginLeft: 3,
                borderRadius: 2,
              }}
            />
          )}
        </div>

        {/* "neobot" with logo - slides up and fades in */}
        {frame >= REVEAL_START && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              transform: `translateY(${revealTranslateY}px)`,
              opacity: revealOpacity,
            }}
          >
            <Img
              src={staticFile("neobot-icon.svg")}
              style={{
                height: FONT_SIZE * 0.9,
                width: "auto",
              }}
            />
            <span
              style={{
                fontFamily: geist,
                fontSize: FONT_SIZE,
                fontWeight: 700,
                color: NEOBOT_DARK,
                letterSpacing: "-0.02em",
              }}
            >
              {REVEAL_TEXT}
            </span>
          </div>
        )}
      </div>

      {/* Typing sound */}
      <Sequence from={START_DELAY} durationInFrames={TYPING_DURATION}>
        <Audio src={staticFile("audio/typing.wav")} volume={0.4} />
      </Sequence>

      {/* Reveal sound */}
      <Sequence from={REVEAL_START}>
        <Audio src={staticFile("audio/whoosh.wav")} volume={0.5} />
      </Sequence>
    </AbsoluteFill>
  );
};
