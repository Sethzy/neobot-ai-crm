// CombinedIntro - Wholesale copy of CuaBench's CombinedIntroScene pattern
// Phase 1: Word-by-word headline + counter animates 0 → 25-30%
// Phase 2: "so we built" typing + counter holds → reveals "neobot" + counter climbs to 99%

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  Sequence,
  staticFile,
  Img,
  spring,
} from "remotion";
import { Audio as RemotionAudio } from "@remotion/media";
import { geist } from "../fonts";
import { colors } from "../theme";
import { BrandOverlay } from "../components/BrandOverlay";

// =====================
// PHASE 1: Word-by-word intro
// =====================
const WORD_DATA = [
  { word: "Most", appearFrame: 0 },
  { word: "agents", appearFrame: 4 },
  { word: "buy", appearFrame: 8 },
  { word: "a", appearFrame: 11 },
  { word: "CRM.", appearFrame: 14 },
  { word: "Then", appearFrame: 20 },
  { word: "never", appearFrame: 24 },
  { word: "open", appearFrame: 27 },
  { word: "it.", appearFrame: 30 },
];

const WORD_GAP = 18;
const FONT_SIZE = 72;
const LINE_HEIGHT = 100;
const MAX_LINE_WIDTH = 1200;
const SLIDE_UP_DURATION = 6;
const SHIFT_DURATION = 10;

// Intro phase timing
const LAST_WORD_APPEAR = 30;
const INTRO_HOLD_DURATION = 25;
const INTRO_EXIT_START = LAST_WORD_APPEAR + SLIDE_UP_DURATION + INTRO_HOLD_DURATION; // ~61
const INTRO_EXIT_DURATION = 8;

// Counter for intro phase (error rate: 0 → 25-30%)
const COUNTER_START = 18;
const COUNTER_DURATION = 35;
const COUNTER_TARGET = 13; // CRM usage rate (low = bad)
const ACCENT_RED = "#DC2626";

// =====================
// PHASE 2: Typing "so we built neobot"
// =====================
const PHASE2_START = INTRO_EXIT_START + INTRO_EXIT_DURATION; // ~69

const TEXT = "so we built";
const REVEAL_TEXT = "neobot";
const NEOBOT_DARK = "#2B2B2B";

// Typing speed (frames per character)
const FRAMES_PER_CHAR = 4;
const TYPING_START_DELAY = 5;

// Phase 2 timings (relative to PHASE2_START)
const TYPING_DURATION = TEXT.length * FRAMES_PER_CHAR; // 44 frames
const TYPING_END = TYPING_START_DELAY + TYPING_DURATION; // 49
const HOLD_AFTER_TYPING = 15;
const MOVE_UP_START = TYPING_END + HOLD_AFTER_TYPING; // 64
const MOVE_UP_DURATION = 8;
const REVEAL_START = MOVE_UP_START + 4; // 68

// Counter climbs to 99% when neobot is revealed (CRM usage increases)
const COUNTER_CLIMB_START = REVEAL_START;
const COUNTER_CLIMB_DURATION = 40;
const COUNTER_END_VALUE = 100; // CRM usage climbs to 100%

// "so we built" fade out timing
const TOP_TEXT_FADE_START = REVEAL_START + 20;
const TOP_TEXT_FADE_DURATION = 12;

// Center logo fade out - let 0.1% error rate linger ~1s
const LOGO_FADE_START = TOP_TEXT_FADE_START + TOP_TEXT_FADE_DURATION + 35;
const LOGO_FADE_DURATION = 8; // Quick fade

// Total duration
const PHASE2_DURATION = LOGO_FADE_START + LOGO_FADE_DURATION + 5;
export const COMBINED_INTRO_DURATION = PHASE2_START + PHASE2_DURATION;

// Background
const CREAM_BG = "#FFFFFF";

// Measure word width
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

export const CombinedIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Determine which phase we're in
  const isPhase1 = frame < PHASE2_START;
  const phase2Frame = Math.max(0, frame - PHASE2_START);

  // =====================
  // PHASE 1: Intro words exit animation
  // =====================
  const introExitProgress =
    frame >= INTRO_EXIT_START
      ? interpolate(
          frame,
          [INTRO_EXIT_START, INTRO_EXIT_START + INTRO_EXIT_DURATION],
          [0, 1],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.in(Easing.quad),
          }
        )
      : 0;

  const introExitTranslateY = interpolate(introExitProgress, [0, 1], [0, -120]);
  const introExitOpacity = interpolate(introExitProgress, [0, 1], [1, 0]);

  // =====================
  // UNIFIED COUNTER (continuous across both phases)
  // =====================
  const phase1CounterEnd = COUNTER_START + COUNTER_DURATION;
  const phase2CounterStart = PHASE2_START + COUNTER_CLIMB_START;
  const phase2CounterEnd = phase2CounterStart + COUNTER_CLIMB_DURATION;

  let unifiedCounterValue: number;
  let counterLabel: string;
  let counterColor: string;

  if (frame < COUNTER_START) {
    unifiedCounterValue = 0;
    counterLabel = "CRM usage";
    counterColor = ACCENT_RED;
  } else if (frame < phase1CounterEnd) {
    // Phase 1: 0 → 13% (low usage)
    const progress = interpolate(frame, [COUNTER_START, phase1CounterEnd], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
    unifiedCounterValue = progress * COUNTER_TARGET;
    counterLabel = "CRM usage";
    counterColor = ACCENT_RED;
  } else if (frame < phase2CounterStart) {
    // Hold at 13%
    unifiedCounterValue = COUNTER_TARGET;
    counterLabel = "CRM usage";
    counterColor = ACCENT_RED;
  } else if (frame < phase2CounterEnd) {
    // Phase 2: CRM usage climbs from 13% → 99%
    const progress = interpolate(frame, [phase2CounterStart, phase2CounterEnd], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
    unifiedCounterValue = COUNTER_TARGET + progress * (COUNTER_END_VALUE - COUNTER_TARGET);
    counterLabel = "CRM usage";
    counterColor = "#107066"; // Green as usage climbs
  } else {
    // Hold at 99%
    unifiedCounterValue = COUNTER_END_VALUE;
    counterLabel = "CRM usage";
    counterColor = "#107066";
  }

  // Counter opacity
  const counterFadeIn = frame >= COUNTER_START
    ? interpolate(frame, [COUNTER_START, COUNTER_START + 10], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  // Scale bounce when counter hits target (0.1%)
  const counterAtTarget = frame >= phase2CounterEnd;
  const BOUNCE_DURATION = 15;
  const bounceProgress = counterAtTarget
    ? interpolate(frame, [phase2CounterEnd, phase2CounterEnd + BOUNCE_DURATION], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  const counterScale = counterAtTarget
    ? 1 + 0.08 * Math.sin(bounceProgress * Math.PI) * (1 - bounceProgress)
    : 1;

  // =====================
  // PHASE 2: Typing scene
  // =====================
  const typingFrame = Math.max(0, phase2Frame - TYPING_START_DELAY);
  const charsToShow = Math.min(Math.floor(typingFrame / FRAMES_PER_CHAR), TEXT.length);
  const displayedText = TEXT.slice(0, charsToShow);
  const isTypingComplete = charsToShow >= TEXT.length;

  // Cursor blink
  const cursorVisible = Math.floor(phase2Frame / 15) % 2 === 0 || !isTypingComplete;

  // Move up phase - smooth easing for "so we built"
  const moveUpProgress =
    phase2Frame >= MOVE_UP_START
      ? interpolate(phase2Frame, [MOVE_UP_START, MOVE_UP_START + MOVE_UP_DURATION], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.inOut(Easing.quad), // Smooth both start and end
        })
      : 0;

  const topTextTranslateY = interpolate(moveUpProgress, [0, 1], [0, -50]);

  // Top text fade out - gradual fade
  const topTextFadeProgress =
    phase2Frame >= TOP_TEXT_FADE_START
      ? interpolate(
          phase2Frame,
          [TOP_TEXT_FADE_START, TOP_TEXT_FADE_START + TOP_TEXT_FADE_DURATION],
          [1, 0],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.quad), // Smooth fade out
          }
        )
      : 1;

  // NeoBot logo - simple animation:
  // 1. Reveal: slide up from +40 to 0, fade in
  // 2. Center: slide up from 0 to -20 (when "so we built" fades)
  // 3. Fade out: gentle fade at end of scene
  const { fps } = useVideoConfig();

  // Phase 1: Initial reveal (slide up from +40 to 0)
  const revealSpring = spring({
    frame: phase2Frame - REVEAL_START,
    fps,
    config: { damping: 200 },
  });

  // Phase 2: Center (slide up from 0 to -20)
  const centerSpring = spring({
    frame: phase2Frame - TOP_TEXT_FADE_START,
    fps,
    config: { damping: 200 },
  });

  // Calculate positions
  const revealY = interpolate(revealSpring, [0, 1], [40, 0]);
  const centerY = interpolate(centerSpring, [0, 1], [0, -20]);
  const logoRevealY = revealY + centerY;

  // Opacity: fade in on reveal, then fade out at end
  const fadeInOpacity = interpolate(revealSpring, [0, 0.4], [0, 1], {
    extrapolateRight: "clamp",
  });
  const fadeOutOpacity = interpolate(
    phase2Frame,
    [LOGO_FADE_START, LOGO_FADE_START + LOGO_FADE_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const logoRevealOpacity = fadeInOpacity * fadeOutOpacity;

  const showCursor = phase2Frame < MOVE_UP_START + 5;

  // =====================
  // PHASE 1: Word elements
  // =====================
  const lineGroups: number[][] = Array.from({ length: TOTAL_LINES }, () => []);
  LINE_ASSIGNMENTS.forEach((lineIdx, wordIdx) => {
    lineGroups[lineIdx].push(wordIdx);
  });

  const totalHeight = TOTAL_LINES * LINE_HEIGHT;
  const baseY = (height - totalHeight) / 2;

  const wordElements: React.ReactElement[] = [];

  if (frame < PHASE2_START) {
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

        const totalTranslateY = appearTranslateY + introExitTranslateY;
        const totalOpacity = appearOpacity * introExitOpacity;

        const x = lineStartX + xOffset;
        const y = baseY + lineIdx * LINE_HEIGHT;

        wordElements.push(
          <span
            key={wordIdx}
            suppressHydrationWarning
            style={{
              position: "absolute",
              left: x,
              top: y,
              transform: `translateY(${totalTranslateY}px)`,
              opacity: totalOpacity,
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
  }

  const showCounter = frame >= COUNTER_START && counterFadeIn > 0;

  return (
    <AbsoluteFill style={{ backgroundColor: CREAM_BG }}>
      {/* Brand logo - top left, consistent across scenes */}
      <BrandOverlay />

      {/* Phase 1: Word elements */}
      {wordElements}

      {/* Phase 2: Typing content */}
      {!isPhase1 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {/* "so we built" text */}
          {/* Keep in DOM even when faded to prevent reflow jump */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontFamily: geist,
              fontSize: FONT_SIZE,
              fontWeight: 600,
              color: colors.gray800,
              transform: `translateY(${topTextTranslateY}px)`,
              opacity: topTextFadeProgress,
              visibility: topTextFadeProgress > 0.01 ? "visible" : "hidden",
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

          {/* "neobot" with logo - gentle fade out at end */}
          {phase2Frame >= REVEAL_START && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                transform: `translateY(${logoRevealY}px)`,
                opacity: logoRevealOpacity,
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
      )}

      {/* Counter animation - unified across both phases */}
      {showCounter && (
        <div
          style={{
            position: "absolute",
            bottom: 80,
            right: 100,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            opacity: counterFadeIn,
            transform: `scale(${counterScale})`,
            transformOrigin: "bottom right",
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
              {unifiedCounterValue.toFixed(1)}
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
              color: counterColor,
              marginTop: 8,
            }}
          >
            {counterLabel}
          </span>
          <span
            style={{
              fontFamily: geist,
              fontSize: 16,
              fontWeight: 400,
              color: colors.gray600,
              marginTop: 4,
            }}
          >
            Industry average
          </span>
        </div>
      )}

      {/* Sound effects for intro words */}
      {WORD_DATA.map((wordData, idx) => (
        <Sequence key={`sound-${idx}`} from={wordData.appearFrame}>
          <RemotionAudio src={staticFile("audio/whoosh.wav")} volume={0.3} />
        </Sequence>
      ))}

      {/* Typing sound */}
      <Sequence from={PHASE2_START + TYPING_START_DELAY} durationInFrames={TYPING_DURATION}>
        <RemotionAudio src={staticFile("audio/typing.wav")} volume={0.4} />
      </Sequence>

      {/* Counter climb sound */}
      <Sequence from={phase2CounterStart}>
        <RemotionAudio src={staticFile("audio/ascending-ticks.wav")} volume={0.3} />
      </Sequence>
    </AbsoluteFill>
  );
};
