// FileCard component - represents a chaotic document in Act 1
import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Img,
} from "remotion";
import { figtree, jetbrains } from "../fonts";
import { colors, springs } from "../theme";
import type { FileItem } from "../config";

type FileCardProps = {
  file: FileItem;
  index: number;
  totalFiles: number;
};

const getFileIcon = (type: FileItem["type"]) => {
  switch (type) {
    case "pdf":
      return "📄";
    case "image":
      return "🖼️";
    case "excel":
      return "📊";
    default:
      return "📁";
  }
};

const getFileColor = (type: FileItem["type"]) => {
  switch (type) {
    case "pdf":
      return "#EF4444";
    case "image":
      return "#8B5CF6";
    case "excel":
      return "#10B981";
    default:
      return colors.gray400;
  }
};

export const FileCard: React.FC<FileCardProps> = ({
  file,
  index,
  totalFiles,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Staggered entrance - each card delayed by 3 frames
  const delay = index * 3;
  const entrance = spring({
    frame: frame - delay,
    fps,
    config: springs.bouncy,
  });

  // Slight chaos - rotation and position offset
  const baseRotation = interpolate(index, [0, totalFiles - 1], [-3, 3]);
  const rotation = baseRotation * entrance;

  // Starting positions - files fly in from different edges
  const startPositions = [
    { x: -400, y: -200 },
    { x: width + 400, y: -100 },
    { x: -350, y: height / 2 },
    { x: width + 350, y: height / 3 },
    { x: -300, y: height - 200 },
    { x: width + 300, y: height / 2 },
    { x: 0, y: -300 },
    { x: width, y: -250 },
    { x: -200, y: height + 100 },
    { x: width + 200, y: height - 100 },
  ];
  const startPos = startPositions[index % startPositions.length];

  // Final stacked positions - slight overlap for chaos
  const cardWidth = 380;
  const cardHeight = 60;
  const cols = 2;
  const col = index % cols;
  const row = Math.floor(index / cols);
  
  const centerX = width / 2;
  const centerY = height / 2 - 50;
  const gapX = 420;
  const gapY = 75;
  
  const finalX = centerX + (col - 0.5) * gapX - cardWidth / 2;
  const finalY = centerY + (row - 2) * gapY;

  // Interpolate position
  const x = interpolate(entrance, [0, 1], [startPos.x, finalX]);
  const y = interpolate(entrance, [0, 1], [startPos.y, finalY]);

  // Opacity
  const opacity = interpolate(entrance, [0, 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Scale with slight bounce
  const scale = interpolate(entrance, [0, 1], [0.8, 1]);

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: cardWidth,
        height: cardHeight,
        backgroundColor: colors.gray800,
        borderRadius: 12,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        opacity,
        transform: `rotate(${rotation}deg) scale(${scale})`,
        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        border: `1px solid ${colors.gray600}`,
      }}
    >
      {/* File type icon */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          backgroundColor: getFileColor(file.type) + "20",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
        }}
      >
        {getFileIcon(file.type)}
      </div>

      {/* Filename */}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            fontFamily: jetbrains,
            fontSize: 14,
            color: colors.white,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {file.name}
        </div>
        <div
          style={{
            fontFamily: figtree,
            fontSize: 11,
            color: colors.gray400,
            marginTop: 2,
          }}
        >
          {file.type.toUpperCase()}
        </div>
      </div>
    </div>
  );
};
