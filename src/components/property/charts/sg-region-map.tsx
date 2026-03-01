/** 55-polygon planning area choropleth map of Singapore. */
"use client";

import { useState } from "react";
import {
  PLANNING_AREA_PATHS,
  PLANNING_AREA_VIEWBOX,
} from "./sg-planning-area-paths";

type SgPlanningAreaMapProps = {
  /** Map of planning area name (uppercase) → transaction count. */
  highlights: Map<string, number>;
  /** Maximum count value for the legend. */
  maxCount?: number;
};

/** Color scale: blue shades matching the reference design. */
const FILL_COLOR = "37, 99, 235"; // rgb(37, 99, 235) — blue-600

export function SgPlanningAreaMap({ highlights, maxCount: maxCountProp }: SgPlanningAreaMapProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const maxCount = maxCountProp ?? Math.max(...highlights.values(), 1);
  const legendMax = Math.round(maxCount);
  const buckets = 5;
  const step = legendMax > 0 ? Math.ceil(legendMax / buckets) : 1;

  return (
    <div className="relative">
      <svg
        viewBox={PLANNING_AREA_VIEWBOX}
        className="w-full"
        role="img"
        aria-label="Singapore planning area map"
      >
        {PLANNING_AREA_PATHS.map((area) => {
          const count = highlights.get(area.name) ?? 0;
          const intensity = maxCount > 0 ? count / maxCount : 0;
          const isHovered = hovered === area.name;

          return (
            <path
              key={area.code || area.name}
              d={area.d}
              fill={
                count > 0
                  ? `rgba(${FILL_COLOR}, ${Math.max(intensity * 0.7, 0.1)})`
                  : "#f4f4f5"
              }
              stroke={isHovered ? "#2563eb" : "#d4d4d8"}
              strokeWidth={isHovered ? 1.5 : 0.5}
              className="cursor-pointer transition-all duration-150"
              onMouseEnter={() => setHovered(area.name)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hovered ? (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-center shadow-md">
          <p className="text-xs font-semibold text-zinc-900">
            {formatName(hovered)}
          </p>
          <p className="text-xs text-zinc-500">
            {highlights.get(hovered) ?? 0} transactions
          </p>
        </div>
      ) : null}

      {/* Legend overlay — bottom-left inside the map */}
      {legendMax > 0 ? (
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-white/90 px-2 py-1.5 text-[10px] text-zinc-500 backdrop-blur-sm">
          <span>0</span>
          {Array.from({ length: buckets }, (_, i) => (
            <div
              key={i}
              className="h-2.5 w-5 rounded-sm"
              style={{
                backgroundColor: `rgba(${FILL_COLOR}, ${Math.max(((i + 1) / buckets) * 0.7, 0.1)})`,
              }}
            />
          ))}
          <span>{step * buckets}+</span>
        </div>
      ) : null}
    </div>
  );
}

/** Title-case a planning area name: "ANG MO KIO" → "Ang Mo Kio". */
function formatName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
