import { Composition, Folder } from "remotion";
import { NeobotDemoVideo, NEOBOT_VIDEO_DURATION } from "./SunderDemoVideo";
import { CombinedIntro, COMBINED_INTRO_DURATION } from "./scenes/CombinedIntro";
import { Act4DocumentProcessing, DOCUMENT_PROCESSING_DURATION } from "./scenes/Act4DocumentProcessing";
import { Act4ROI, ROI_DURATION } from "./scenes/Act4ROI";
import { Act5Close, CLOSE_DURATION } from "./scenes/Act5Close";
import { ActDocumentSplit, DOCUMENT_SPLIT_DURATION } from "./scenes/ActDocumentSplit";
import {
  LandingDocumentProcessingLoop,
  LANDING_DOCUMENT_PROCESSING_DURATION,
} from "./scenes/LandingDocumentProcessingLoop";
import { defaultConfig } from "./config";

// Video specs: ~23 seconds at 30fps, 1920x1080 (16:9) resolution
const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Full demo video with all scenes */}
      <Composition
        id="NeobotDemo"
        component={NeobotDemoVideo}
        durationInFrames={NEOBOT_VIDEO_DURATION}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{
          config: defaultConfig,
        }}
      />

      {/* Individual scenes for testing/previewing */}
      <Folder name="Scenes">
        <Composition
          id="Scene1-Intro"
          component={CombinedIntro}
          durationInFrames={COMBINED_INTRO_DURATION}
          fps={FPS}
          width={1920}
          height={1080}
        />

        <Composition
          id="Scene2-DocumentSplit"
          component={ActDocumentSplit}
          durationInFrames={DOCUMENT_SPLIT_DURATION}
          fps={FPS}
          width={1920}
          height={1080}
          defaultProps={{
            config: defaultConfig,
          }}
        />

        <Composition
          id="Scene3-DocumentProcessing"
          component={Act4DocumentProcessing}
          durationInFrames={DOCUMENT_PROCESSING_DURATION}
          fps={FPS}
          width={1920}
          height={1080}
          defaultProps={{
            config: defaultConfig,
          }}
        />

        <Composition
          id="Landing-DocumentProcessingLoop"
          component={LandingDocumentProcessingLoop}
          durationInFrames={LANDING_DOCUMENT_PROCESSING_DURATION}
          fps={FPS}
          width={1600}
          height={650}
        />

        <Composition
          id="Scene4-ROI"
          component={Act4ROI}
          durationInFrames={ROI_DURATION}
          fps={FPS}
          width={1920}
          height={1080}
          defaultProps={{
            config: defaultConfig,
          }}
        />

        <Composition
          id="Scene5-Close"
          component={Act5Close}
          durationInFrames={CLOSE_DURATION}
          fps={FPS}
          width={1920}
          height={1080}
          defaultProps={{
            config: defaultConfig,
          }}
        />
      </Folder>
    </>
  );
};
