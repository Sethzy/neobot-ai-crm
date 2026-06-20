// TypewriterText component - character-by-character text reveal
import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

type TypewriterTextProps = {
  text: string;
  charFrames?: number; // Frames per character
  startFrame?: number; // When to start typing
  style?: React.CSSProperties;
  cursorStyle?: React.CSSProperties;
  showCursor?: boolean;
};

export const TypewriterText: React.FC<TypewriterTextProps> = ({
  text,
  charFrames = 2,
  startFrame = 0,
  style = {},
  cursorStyle = {},
  showCursor = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Calculate how many characters to show
  const adjustedFrame = Math.max(0, frame - startFrame);
  const typedChars = Math.min(
    text.length,
    Math.floor(adjustedFrame / charFrames)
  );
  const typedText = text.slice(0, typedChars);

  // Cursor blink (16 frame cycle)
  const cursorBlinkFrames = 16;
  const cursorOpacity = interpolate(
    frame % cursorBlinkFrames,
    [0, cursorBlinkFrames / 2, cursorBlinkFrames],
    [1, 0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Hide cursor after typing is complete
  const isTypingComplete = typedChars >= text.length;
  const shouldShowCursor = showCursor && !isTypingComplete;

  return (
    <span style={style}>
      {typedText}
      {shouldShowCursor && (
        <span
          style={{
            opacity: cursorOpacity,
            ...cursorStyle,
          }}
        >
          ▎
        </span>
      )}
    </span>
  );
};
