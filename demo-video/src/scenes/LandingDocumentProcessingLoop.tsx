import React from "react";
import { AbsoluteFill } from "remotion";
import { Act4DocumentProcessing } from "../../../src/components/remotion/Act4DocumentProcessing";

// 19.0s at 30fps: 1.5x faster than the previous 28.5s loop, still seamless.
export const LANDING_DOCUMENT_PROCESSING_DURATION = 570;

export const LandingDocumentProcessingLoop: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: "#FDF7E5",
      }}
    >
      <Act4DocumentProcessing />
    </AbsoluteFill>
  );
};
