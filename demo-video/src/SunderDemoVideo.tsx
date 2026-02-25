// NeobotDemoVideo - Main composition with slide-up transitions between scenes
// Narrative: CombinedIntro → Document Split → Doc Processing → ROI → Close
// Transition: slide from bottom with spring timing (damping: 200) - smooth, no bounce

import React from "react";
import { AbsoluteFill, Sequence, staticFile, useCurrentFrame, interpolate } from "remotion";
import { TransitionSeries, springTiming, linearTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";
import { Audio } from "@remotion/media";
import { CombinedIntro, COMBINED_INTRO_DURATION } from "./scenes/CombinedIntro";
import { Act4DocumentProcessing, DOCUMENT_PROCESSING_DURATION } from "./scenes/Act4DocumentProcessing";
import { Act4ROI, ROI_DURATION } from "./scenes/Act4ROI";
import { Act5Close, CLOSE_DURATION } from "./scenes/Act5Close";
import { ActDocumentSplit, DOCUMENT_SPLIT_DURATION } from "./scenes/ActDocumentSplit";
import type { DemoConfig } from "./config";

type NeobotDemoVideoProps = {
  config: DemoConfig;
};

// Frame durations for each scene (30fps) - imported from scene files
const SCENE_DURATIONS = {
  combinedIntro: COMBINED_INTRO_DURATION,       // ~170 frames - Word intro + typing + neobot reveal
  documentSplit: DOCUMENT_SPLIT_DURATION,       // 150 frames - Document categorization (compressed)
  documentProcessing: DOCUMENT_PROCESSING_DURATION, // 150 frames - Conveyor belt processing
  roi: ROI_DURATION,                            // 105 frames - ROI calculator
  close: CLOSE_DURATION,                        // 90 frames - Logo close
};

// Calculate scene start frames for SFX timing
const SCENE_STARTS = {
  combinedIntro: 0,
  documentSplit: SCENE_DURATIONS.combinedIntro,
  documentProcessing: SCENE_DURATIONS.combinedIntro + SCENE_DURATIONS.documentSplit,
  roi: SCENE_DURATIONS.combinedIntro + SCENE_DURATIONS.documentSplit + SCENE_DURATIONS.documentProcessing,
  close: SCENE_DURATIONS.combinedIntro + SCENE_DURATIONS.documentSplit + SCENE_DURATIONS.documentProcessing + SCENE_DURATIONS.roi,
};

const TOTAL_FRAMES = Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0);

// Transition durations (frames) - used by TransitionSeries
const TRANSITION_DURATIONS = {
  fade: 2,      // Quick fade between intro/split and roi/close
  slide: 18,    // Spring slide-up between major scenes
};

// Total transition overlap: 2 fade + 18 slide + 18 slide + 2 fade = 40 frames
const TOTAL_TRANSITION_OVERLAP =
  TRANSITION_DURATIONS.fade +      // Intro → DocumentSplit
  TRANSITION_DURATIONS.slide +     // DocumentSplit → DocumentProcessing
  TRANSITION_DURATIONS.slide +     // DocumentProcessing → ROI
  TRANSITION_DURATIONS.fade;       // ROI → Close

// Export the calculated video duration for Root.tsx
export const NEOBOT_VIDEO_DURATION = TOTAL_FRAMES - TOTAL_TRANSITION_OVERLAP;

// Background music with fade envelope
// Audio files should be placed in public/audio/
// Copy from launchpad: packages/shared/videos/cuabench/public/
const BackgroundMusic: React.FC = () => {
  const frame = useCurrentFrame();

  const volume = (() => {
    const fadeIn = interpolate(frame, [0, 30], [0, 0.25], { extrapolateRight: "clamp" });
    const fadeOut = interpolate(frame, [TOTAL_FRAMES - 45, TOTAL_FRAMES], [0.25, 0], { extrapolateLeft: "clamp" });
    return Math.min(fadeIn, fadeOut);
  })();

  return <Audio src={staticFile("audio/background-music.wav")} volume={volume} />;
};

// Whoosh SFX for scene transitions
// Uses a short fade-in (3 frames) to prevent audio click/pop artifacts
const TransitionSFXAudio: React.FC = () => {
  const frame = useCurrentFrame();
  // Fade in over 3 frames to avoid click from abrupt audio start
  const volume = interpolate(frame, [0, 3], [0, 0.4], {
    extrapolateRight: "clamp",
  });
  return <Audio src={staticFile("audio/whoosh.wav")} volume={volume} />;
};

const TransitionSFX: React.FC<{ frame: number }> = ({ frame: startFrame }) => {
  return (
    <Sequence from={startFrame}>
      <TransitionSFXAudio />
    </Sequence>
  );
};

export const NeobotDemoVideo: React.FC<NeobotDemoVideoProps> = ({ config }) => {
  // Toggle audio on/off
  const enableAudio = true; // Audio files available in public/audio/

  return (
    <AbsoluteFill style={{ backgroundColor: "#FFFFFF" }}>
      {/* Audio Layer */}
      {enableAudio && (
        <>
          {/* Background Music */}
          <BackgroundMusic />
        </>
      )}

      {/* Video Content with fade transitions */}
      <TransitionSeries>
        {/* Scene 1: Combined Intro (word-by-word + typing + neobot reveal) */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.combinedIntro}>
          <CombinedIntro />
        </TransitionSeries.Sequence>

        {/* Clean cut (quick fade) between intro and document split */}
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATIONS.fade })}
        />

        {/* Scene 2: Document Split */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.documentSplit}>
          <ActDocumentSplit config={config} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: TRANSITION_DURATIONS.slide })}
        />

        {/* Scene 3: Document Processing Animation */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.documentProcessing}>
          <Act4DocumentProcessing config={config} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: TRANSITION_DURATIONS.slide })}
        />

        {/* Scene 4: ROI */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.roi}>
          <Act4ROI config={config} />
        </TransitionSeries.Sequence>

        {/* Clean cut to close */}
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATIONS.fade })}
        />

        {/* Scene 5: Close (Logo) */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.close}>
          <Act5Close config={config} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
