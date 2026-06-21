import React, { useMemo } from "react";
import { useCurrentFrame, interpolate, interpolateColors, useVideoConfig, spring, Easing } from "remotion";
import { colors } from "../theme";

type AnimationVariant = "drop" | "slideUp";

type StaggeredTextProps = {
  text: string;
  startFrame?: number;
  className?: string;
  style?: React.CSSProperties;
  staggerDelay?: number; // Frames between each word starting
  type?: "word" | "char";
  variant?: AnimationVariant; // "drop" (original) or "slideUp" (CuaBench style)
  // Cinematic Focus-In Props (for "drop" variant)
  animationDuration?: number; // How many frames for the animation
  initialScale?: number; // Starting scale (default: 1.5)
  initialBlur?: number; // Starting blur in px (default: 15)
  withBloom?: boolean;
  color?: string;
  bloomIntensity?: number;
  // SlideUp variant props
  slideDistance?: number; // How far to slide up in px (default: 50)
};

export const StaggeredText: React.FC<StaggeredTextProps> = ({
  text,
  startFrame = 0,
  style = {},
  staggerDelay = 3, // ~100ms at 30fps between words
  type = "word",
  variant = "drop",
  animationDuration = 10,
  initialScale = 1.5,
  initialBlur = 15,
  withBloom = true,
  color = colors.white,
  bloomIntensity = 1.8,
  slideDistance = 50,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Split into individual words - EACH WORD IS ITS OWN OBJECT
  const items = useMemo(() => {
    return type === "word" ? text.split(" ") : text.split("");
  }, [text, type]);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", ...style }}>
      {items.map((item, index) => {
        // Each word starts at a different time (THE STAGGER)
        const wordStartFrame = startFrame + index * staggerDelay;

        if (variant === "slideUp") {
          // CuaBench-style: slide up with cubic easing
          const localFrame = frame - wordStartFrame;

          // 6 frames by default for the slide animation
          const slideProgress = interpolate(
            localFrame,
            [0, animationDuration],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }
          );

          // Opacity fades in during first 3 frames
          const opacity = interpolate(
            localFrame,
            [0, Math.max(1, animationDuration / 2)],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          // Slide up from slideDistance to 0
          const translateY = interpolate(slideProgress, [0, 1], [slideDistance, 0]);

          return (
            <span
              key={index}
              style={{
                opacity,
                transform: `translateY(${translateY}px)`,
                color,
                display: "inline-block",
                marginRight: type === "word" ? "0.3em" : "0em",
                willChange: "transform, opacity",
              }}
            >
              {item}
            </span>
          );
        }

        // Original "drop" variant with spring physics
        const progress = spring({
          frame,
          fps,
          config: {
            damping: 15,
            stiffness: 80,
            mass: 0.5,
          },
          delay: wordStartFrame,
        });

        const opacity = interpolate(progress, [0, 0.2], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        const scale = interpolate(progress, [0, 1], [initialScale, 1]);
        const translateY = interpolate(progress, [0, 1], [4, 0]);
        const blur = interpolate(progress, [0, 1], [initialBlur, 0]);

        const brightness = withBloom
          ? interpolate(progress, [0, 0.5, 1], [bloomIntensity, 1.2, 1])
          : 1;

        const effectiveColor = withBloom
          ? interpolateColors(progress, [0, 0.7], ["#ffffff", color])
          : color;

        const filter = `blur(${blur}px) brightness(${brightness})`;

        return (
          <span
            key={index}
            style={{
              opacity,
              transform: `scale(${scale}) translateY(${translateY}px)`,
              filter,
              color: effectiveColor,
              display: "inline-block",
              marginRight: type === "word" ? "0.3em" : "0em",
              willChange: "transform, opacity, filter",
              transformOrigin: "center center",
            }}
          >
            {item}
          </span>
        );
      })}
    </div>
  );
};
