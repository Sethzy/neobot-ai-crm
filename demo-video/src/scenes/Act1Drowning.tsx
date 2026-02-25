// Act1Drowning - CuaBench-style intro with big headline + stat counter + floating docs
// "Most documents contain costly errors" with 25-30% stat and scattered document icons

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  Sequence,
  staticFile,
} from "remotion";
import { Audio } from "@remotion/media";
import { geist } from "../fonts";
import { colors } from "../theme";
import { BrandOverlay } from "../components/BrandOverlay";
import type { DemoConfig } from "../config";

// Parchment background for better contrast
const CREAM_BG = "#FFFFFF";

// Word data with custom appear times (in frames)
const WORD_DATA = [
  { word: "Most", appearFrame: 0 },
  { word: "documents", appearFrame: 6 },
  { word: "contain", appearFrame: 14 },
  { word: "costly", appearFrame: 22 },
  { word: "errors.", appearFrame: 30 },
];

// Animation constants
const FONT_SIZE = 72;
const LINE_HEIGHT = 100;
const WORD_GAP = 20;
const MAX_LINE_WIDTH = 1200;
const SLIDE_UP_DURATION = 6;
const SHIFT_DURATION = 10;

// Counter timing
const COUNTER_START = 20;
const COUNTER_DURATION = 40;
const COUNTER_TARGET_MIN = 25;
const COUNTER_TARGET_MAX = 30;
const ACCENT_COLOR = "#DC2626"; // Red for error emphasis

// Document icons configuration - positioned as tasteful framing elements
// Key principles:
// 1. Stay at far edges, partially off-screen for dynamic feel
// 2. Clear safe zones: center text, bottom-right stats, top-left logo
// 3. Lower opacity, subtle presence
// 4. Fewer documents = more elegant
type DocIcon = {
  type: string;
  color: string;
  bgColor: string;
  x: number; // percentage from left
  y: number; // percentage from top
  rotation: number;
  scale: number;
  opacity: number; // max opacity
  appearFrame: number;
};

const DOC_ICONS: DocIcon[] = [
  // Top edge - partially cropped, framing the scene
  { type: ".PDF", color: "#DC2626", bgColor: "#FEE2E2", x: -3, y: 25, rotation: -12, scale: 0.85, opacity: 0.7, appearFrame: 8 },
  { type: ".XLSX", color: "#16A34A", bgColor: "#DCFCE7", x: -2, y: 65, rotation: 8, scale: 0.9, opacity: 0.6, appearFrame: 18 },

  // Right edge - high up, away from stats
  { type: ".DOCX", color: "#2563EB", bgColor: "#DBEAFE", x: 103, y: 20, rotation: 10, scale: 0.95, opacity: 0.7, appearFrame: 12 },
  { type: ".CSV", color: "#059669", bgColor: "#D1FAE5", x: 102, y: 45, rotation: -6, scale: 0.8, opacity: 0.5, appearFrame: 25 },

  // Bottom left - away from center text
  { type: ".PNG", color: "#7C3AED", bgColor: "#EDE9FE", x: 8, y: 95, rotation: -8, scale: 0.75, opacity: 0.6, appearFrame: 30 },

  // Top scattered - very subtle, high up
  { type: ".PDF", color: "#DC2626", bgColor: "#FEE2E2", x: 35, y: -5, rotation: 5, scale: 0.65, opacity: 0.4, appearFrame: 40 },
  { type: ".XLSX", color: "#16A34A", bgColor: "#DCFCE7", x: 65, y: -3, rotation: -4, scale: 0.6, opacity: 0.35, appearFrame: 45 },
];

// Measure word width helper
const measureWordWidth = (word: string): number => {
  if (typeof document === "undefined") {
    return word.length * FONT_SIZE * 0.55;
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = `600 ${FONT_SIZE}px Geist, sans-serif`;
    return ctx.measureText(word).width;
  }
  return word.length * FONT_SIZE * 0.55;
};

// Pre-calculate line assignments
const getLineAssignments = () => {
  const assignments: number[] = [];
  let currentLine = 0;
  let currentWidth = 0;

  WORD_DATA.forEach((wordData, idx) => {
    const wordWidth = measureWordWidth(wordData.word);
    const needed = idx === 0 || currentWidth === 0 ? wordWidth : wordWidth + WORD_GAP;

    if (currentWidth + needed > MAX_LINE_WIDTH && currentWidth > 0) {
      currentLine++;
      currentWidth = wordWidth;
    } else {
      currentWidth += needed;
    }
    assignments.push(currentLine);
  });

  return assignments;
};

const LINE_ASSIGNMENTS = getLineAssignments();
const TOTAL_LINES = Math.max(...LINE_ASSIGNMENTS) + 1;

// Document Icon Component - elegant framing element
const DocumentIcon: React.FC<{
  type: string;
  color: string;
  bgColor: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  opacity: number;
  appearFrame: number;
}> = ({ type, color, bgColor, x, y, rotation, scale, opacity: maxOpacity, appearFrame }) => {
  const frame = useCurrentFrame();
  const localFrame = frame - appearFrame;

  if (localFrame < 0) return null;

  // Smooth entrance
  const slideProgress = interpolate(localFrame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const entranceOpacity = interpolate(localFrame, [0, 8], [0, maxOpacity], {
    extrapolateRight: "clamp",
  });

  const translateY = interpolate(slideProgress, [0, 1], [30, 0]);
  const scaleAnim = interpolate(slideProgress, [0, 1], [0.9, 1]);

  // Very subtle floating animation
  const floatY = Math.sin((frame + appearFrame * 10) * 0.03) * 2;
  const floatRotation = Math.sin((frame + appearFrame * 15) * 0.02) * 1;

  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) translateY(${translateY + floatY}px) rotate(${rotation + floatRotation}deg) scale(${scale * scaleAnim})`,
        opacity: entranceOpacity,
        pointerEvents: "none",
      }}
    >
      {/* Document card - softer shadow for subtlety */}
      <div
        style={{
          width: 110,
          height: 140,
          backgroundColor: bgColor,
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Document lines - more subtle */}
        <div style={{ width: "65%", marginBottom: 24 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                width: `${95 - i * 8}%`,
                height: 3,
                backgroundColor: color,
                opacity: 0.15,
                marginBottom: 5,
                borderRadius: 2,
              }}
            />
          ))}
        </div>

        {/* File type badge */}
        <div
          style={{
            position: "absolute",
            bottom: 12,
            backgroundColor: color,
            color: "white",
            padding: "5px 12px",
            borderRadius: 5,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: geist,
            letterSpacing: "0.02em",
          }}
        >
          {type}
        </div>
      </div>
    </div>
  );
};

type Act1Props = {
  config: DemoConfig;
};

export const Act1Drowning: React.FC<Act1Props> = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Counter animation
  const counterProgress = frame >= COUNTER_START
    ? interpolate(
        frame,
        [COUNTER_START, COUNTER_START + COUNTER_DURATION],
        [0, 1],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        }
      )
    : 0;

  const counterMin = counterProgress * COUNTER_TARGET_MIN;
  const counterMax = counterProgress * COUNTER_TARGET_MAX;

  const counterOpacity = frame >= COUNTER_START
    ? interpolate(frame, [COUNTER_START, COUNTER_START + 10], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  // Group words by line
  const lineGroups: number[][] = Array.from({ length: TOTAL_LINES }, () => []);
  LINE_ASSIGNMENTS.forEach((lineIdx, wordIdx) => {
    lineGroups[lineIdx].push(wordIdx);
  });

  // Calculate vertical center
  const totalHeight = TOTAL_LINES * LINE_HEIGHT;
  const baseY = (height - totalHeight) / 2;

  // Build word elements
  const wordElements: React.ReactElement[] = [];

  lineGroups.forEach((wordIndices, lineIdx) => {
    const visibleIndices = wordIndices.filter((i) => frame >= WORD_DATA[i].appearFrame);
    if (visibleIndices.length === 0) return;

    const wordWidths = wordIndices.map((i) => measureWordWidth(WORD_DATA[i].word));

    const latestVisibleIdx = visibleIndices[visibleIndices.length - 1];
    const latestAppearFrame = WORD_DATA[latestVisibleIdx].appearFrame;
    const framesSinceLatest = frame - latestAppearFrame;

    const prevVisibleIndices = visibleIndices.slice(0, -1);

    let prevTotalWidth = 0;
    prevVisibleIndices.forEach((wordIdx, i) => {
      prevTotalWidth += wordWidths[wordIndices.indexOf(wordIdx)];
      if (i > 0) prevTotalWidth += WORD_GAP;
    });

    let currentTotalWidth = 0;
    visibleIndices.forEach((wordIdx, i) => {
      currentTotalWidth += wordWidths[wordIndices.indexOf(wordIdx)];
      if (i > 0) currentTotalWidth += WORD_GAP;
    });

    const shiftProgress = interpolate(framesSinceLatest, [0, SHIFT_DURATION], [0, 1], {
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.quad),
    });

    const animatedTotalWidth =
      prevVisibleIndices.length > 0
        ? interpolate(shiftProgress, [0, 1], [prevTotalWidth, currentTotalWidth])
        : currentTotalWidth;

    const lineStartX = (width - animatedTotalWidth) / 2;

    let xOffset = 0;
    visibleIndices.forEach((wordIdx) => {
      const wordData = WORD_DATA[wordIdx];
      const wordWidth = wordWidths[wordIndices.indexOf(wordIdx)];
      const wordAppearFrame = wordData.appearFrame;
      const framesSinceAppear = frame - wordAppearFrame;

      const slideProgress = interpolate(framesSinceAppear, [0, SLIDE_UP_DURATION], [0, 1], {
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      });

      const appearTranslateY = interpolate(slideProgress, [0, 1], [50, 0]);
      const appearOpacity = interpolate(framesSinceAppear, [0, SLIDE_UP_DURATION * 0.5], [0, 1], {
        extrapolateRight: "clamp",
      });

      const x = lineStartX + xOffset;
      const y = baseY + lineIdx * LINE_HEIGHT;

      wordElements.push(
        <span
          key={wordIdx}
          style={{
            position: "absolute",
            left: x,
            top: y,
            transform: `translateY(${appearTranslateY}px)`,
            opacity: appearOpacity,
            fontSize: FONT_SIZE,
            fontWeight: 600,
            color: colors.gray800,
            whiteSpace: "nowrap",
            fontFamily: geist,
          }}
        >
          {wordData.word}
        </span>
      );

      xOffset += wordWidth + WORD_GAP;
    });
  });

  return (
    <AbsoluteFill style={{ backgroundColor: CREAM_BG }}>
      {/* Persistent brand logo */}
      <BrandOverlay />

      {/* Floating document icons */}
      {DOC_ICONS.map((doc, idx) => (
        <DocumentIcon key={idx} {...doc} />
      ))}

      {/* Word-by-word headline */}
      {wordElements}

      {/* Counter animation - bottom right */}
      {frame >= COUNTER_START && (
        <div
          style={{
            position: "absolute",
            bottom: 80,
            right: 100,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            opacity: counterOpacity,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <span
              style={{
                fontFamily: geist,
                fontSize: 140,
                fontWeight: 700,
                color: colors.gray800,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {Math.round(counterMin)}–{Math.round(counterMax)}
            </span>
            <span
              style={{
                fontFamily: geist,
                fontSize: 60,
                fontWeight: 600,
                color: colors.gray800,
                marginLeft: 6,
              }}
            >
              %
            </span>
          </div>
          <span
            style={{
              fontFamily: geist,
              fontSize: 28,
              fontWeight: 600,
              color: ACCENT_COLOR,
              marginTop: 8,
            }}
          >
            error rate
          </span>
          <span
            style={{
              fontFamily: geist,
              fontSize: 18,
              fontWeight: 400,
              color: colors.gray600,
              marginTop: 6,
            }}
          >
            Industry average
          </span>
        </div>
      )}

      {/* Sound effects for each word */}
      {WORD_DATA.map((wordData, idx) => (
        <Sequence key={`sound-${idx}`} from={wordData.appearFrame}>
          <Audio src={staticFile("audio/whoosh.wav")} volume={0.3} />
        </Sequence>
      ))}

      {/* Pop sound for documents */}
      {DOC_ICONS.map((doc, idx) => (
        <Sequence key={`pop-${idx}`} from={doc.appearFrame}>
          <Audio src={staticFile("audio/pop.wav")} volume={0.15} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
