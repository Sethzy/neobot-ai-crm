// GridBackground - Unified subtle grid pattern for all scenes
// Provides consistent visual language across the video

import React from "react";

type GridBackgroundProps = {
  /** Background color - defaults to light (#FAFAFA) */
  backgroundColor?: string;
  /** Grid line color - defaults to subtle gray */
  lineColor?: string;
  /** Grid cell size in pixels - defaults to 60 */
  cellSize?: number;
  /** Line opacity - defaults to 0.15 */
  lineOpacity?: number;
  /** Preset theme - overrides individual color props */
  theme?: "light" | "dark";
};

export const GridBackground: React.FC<GridBackgroundProps> = ({
  backgroundColor,
  lineColor,
  cellSize = 60,
  lineOpacity = 0.15,
  theme,
}) => {
  // Theme presets
  const themes = {
    light: {
      background: "#FAFAFA",
      line: "200,200,200",
    },
    dark: {
      background: "#18181B", // colors.zincDarker
      line: "63,63,70", // zinc-700
    },
  };

  const resolvedTheme = theme ? themes[theme] : null;
  const bgColor = backgroundColor ?? resolvedTheme?.background ?? "#FAFAFA";
  const gridLineColor = lineColor ?? resolvedTheme?.line ?? "200,200,200";

  return (
    <>
      {/* Solid background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: bgColor,
        }}
      />

      {/* Grid pattern overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(${gridLineColor},${lineOpacity}) 1px, transparent 1px),
            linear-gradient(90deg, rgba(${gridLineColor},${lineOpacity}) 1px, transparent 1px)
          `,
          backgroundSize: `${cellSize}px ${cellSize}px`,
        }}
      />
    </>
  );
};
