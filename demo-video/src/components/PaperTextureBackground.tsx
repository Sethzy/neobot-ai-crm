// Paper texture background using CSS (WebGL-free for Remotion compatibility)

import React from "react";

type PaperTextureBackgroundProps = {
  colorBack?: string;
  colorFront?: string;
  seed?: number;
};

export const PaperTextureBackground: React.FC<PaperTextureBackgroundProps> = ({
  colorBack = "#0c4a44",
  colorFront = "#3a8a7e",
}) => {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: colorBack,
        overflow: "hidden",
      }}
    >
      {/* Base gradient layer */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(ellipse at 30% 20%, ${colorFront}22 0%, transparent 50%),
            radial-gradient(ellipse at 70% 80%, ${colorFront}18 0%, transparent 50%),
            radial-gradient(ellipse at 50% 50%, ${colorFront}10 0%, transparent 70%)
          `,
        }}
      />

      {/* Subtle noise texture using CSS */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.15,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundSize: "150px 150px",
        }}
      />

      {/* Paper fiber lines */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.05,
          backgroundImage: `
            repeating-linear-gradient(
              90deg,
              ${colorFront} 0px,
              transparent 1px,
              transparent 30px
            ),
            repeating-linear-gradient(
              0deg,
              ${colorFront} 0px,
              transparent 1px,
              transparent 40px
            )
          `,
        }}
      />
    </div>
  );
};
