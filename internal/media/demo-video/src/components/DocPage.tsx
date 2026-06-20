// DocPage - Reusable document page component for document split animation
// Renders a white document card with skeleton content (text lines or table patterns)

import React from "react";
import { random } from "remotion";

export type DocVariant = "text" | "table" | "mixed";

export type DocPageProps = {
  id: number;
  variant: DocVariant;
  width?: number;
  height?: number;
  opacity?: number;
};

// Generate deterministic skeleton lines based on doc ID
const generateTextLines = (id: number, count: number) => {
  const lines = [];
  for (let i = 0; i < count; i++) {
    const seed = id * 100 + i;
    const width = 60 + random(`line-width-${seed}`) * 35; // 60-95%
    lines.push({ width: `${width}%` });
  }
  return lines;
};

// Text-only document variant
const TextContent: React.FC<{ id: number }> = ({ id }) => {
  const paragraphs = [
    generateTextLines(id, 4),
    generateTextLines(id + 50, 3),
    generateTextLines(id + 100, 4),
  ];

  return (
    <div style={{ padding: 16 }}>
      {/* Header line */}
      <div
        style={{
          width: "45%",
          height: 8,
          backgroundColor: "#D4D4D4",
          borderRadius: 2,
          marginBottom: 16,
        }}
      />

      {/* Paragraph blocks */}
      {paragraphs.map((lines, pIndex) => (
        <div key={pIndex} style={{ marginBottom: 12 }}>
          {lines.map((line, lIndex) => (
            <div
              key={lIndex}
              style={{
                width: line.width,
                height: 5,
                backgroundColor: "#E5E5E5",
                borderRadius: 2,
                marginBottom: 6,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

// Table/grid document variant
const TableContent: React.FC<{ id: number }> = ({ id }) => {
  const rows = 6;
  const cols = 3;

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div
          style={{
            width: 28,
            height: 28,
            backgroundColor: "#F3F4F6",
            borderRadius: 4,
          }}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              width: "60%",
              height: 6,
              backgroundColor: "#D4D4D4",
              borderRadius: 2,
              marginBottom: 6,
            }}
          />
          <div
            style={{
              width: "40%",
              height: 5,
              backgroundColor: "#E5E5E5",
              borderRadius: 2,
            }}
          />
        </div>
      </div>

      {/* Table grid */}
      <div
        style={{
          backgroundColor: "#FAFAFA",
          border: "1px solid #F0F0F0",
          borderRadius: 4,
          padding: 10,
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 8,
            marginBottom: 8,
            paddingBottom: 8,
            borderBottom: "1px solid #E5E5E5",
          }}
        >
          {Array.from({ length: cols }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 6,
                backgroundColor: "#D4D4D4",
                borderRadius: 2,
              }}
            />
          ))}
        </div>

        {/* Data rows */}
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gap: 8,
              marginBottom: rowIndex < rows - 1 ? 6 : 0,
            }}
          >
            {Array.from({ length: cols }).map((_, colIndex) => {
              const seed = id * 1000 + rowIndex * 10 + colIndex;
              const width = 50 + random(`cell-${seed}`) * 45;
              return (
                <div
                  key={colIndex}
                  style={{
                    height: 5,
                    width: `${width}%`,
                    backgroundColor: "#E5E5E5",
                    borderRadius: 2,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer text */}
      <div style={{ marginTop: 12 }}>
        <div
          style={{
            width: "50%",
            height: 5,
            backgroundColor: "#E5E5E5",
            borderRadius: 2,
          }}
        />
      </div>
    </div>
  );
};

// Mixed content variant (text + small table)
const MixedContent: React.FC<{ id: number }> = ({ id }) => {
  const lines = generateTextLines(id, 5);

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div
        style={{
          width: "50%",
          height: 8,
          backgroundColor: "#D4D4D4",
          borderRadius: 2,
          marginBottom: 14,
        }}
      />

      {/* Text block */}
      <div style={{ marginBottom: 14 }}>
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              width: line.width,
              height: 5,
              backgroundColor: "#E5E5E5",
              borderRadius: 2,
              marginBottom: 6,
            }}
          />
        ))}
      </div>

      {/* Small inline table */}
      <div
        style={{
          backgroundColor: "#FAFAFA",
          border: "1px solid #F0F0F0",
          borderRadius: 4,
          padding: 10,
          marginBottom: 14,
        }}
      >
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            style={{
              display: "flex",
              gap: 8,
              marginBottom: row < 2 ? 6 : 0,
            }}
          >
            <div
              style={{
                flex: 1,
                height: 5,
                backgroundColor: "#E5E5E5",
                borderRadius: 2,
              }}
            />
            <div
              style={{
                flex: 2,
                height: 5,
                backgroundColor: "#EBEBEB",
                borderRadius: 2,
              }}
            />
          </div>
        ))}
      </div>

      {/* Bottom text */}
      <div
        style={{
          width: "35%",
          height: 5,
          backgroundColor: "#E5E5E5",
          borderRadius: 2,
        }}
      />
    </div>
  );
};

export const DocPage: React.FC<DocPageProps> = ({
  id,
  variant,
  width = 160,
  height = 210,
  opacity = 1,
}) => {
  const Content = {
    text: TextContent,
    table: TableContent,
    mixed: MixedContent,
  }[variant];

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: "white",
        borderRadius: 6,
        border: "1px solid #E5E5E5",
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        overflow: "hidden",
        opacity,
      }}
    >
      <Content id={id} />
    </div>
  );
};
