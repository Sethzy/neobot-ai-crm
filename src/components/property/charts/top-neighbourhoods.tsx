/** Top neighbourhood section with planning area choropleth and ranked list. */
"use client";

import { useMemo, useState } from "react";
import {
  DISTRICT_LABELS,
  DISTRICT_TO_PLANNING_AREAS,
  TOWN_TO_PLANNING_AREA,
} from "@/lib/property/sg-regions";
import { formatAreaName } from "@/lib/property/utils";
import { CHART_COLORS } from "@/lib/property/chart-colors";
import { SgPlanningAreaMap } from "./sg-region-map";

type Transaction = {
  town: string | null;
  district: string | null;
};

type NeighbourhoodEntry = {
  name: string;
  count: number;
  percentage: number;
};

/** Aggregate transactions by town name. Exported for tests. */
export function aggregateNeighbourhoods(
  transactions: Transaction[]
): NeighbourhoodEntry[] {
  const map = new Map<string, number>();
  for (const row of transactions) {
    const name = row.town?.trim() || row.district?.trim();
    if (!name) continue;
    map.set(name, (map.get(name) ?? 0) + 1);
  }

  const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
  return Array.from(map.entries())
    .map(([name, count]) => ({
      name,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/** Aggregate HDB transactions by town, return map of planning area → count. */
function buildHdbHighlights(transactions: Transaction[]): {
  highlights: Map<string, number>;
  ranked: NeighbourhoodEntry[];
} {
  const townCounts = new Map<string, number>();
  for (const row of transactions) {
    const town = row.town?.trim();
    if (!town) continue;
    townCounts.set(town, (townCounts.get(town) ?? 0) + 1);
  }

  // Map town names to planning area names for the choropleth
  const highlights = new Map<string, number>();
  for (const [town, count] of townCounts) {
    const upperTown = town.toUpperCase();
    const areas = TOWN_TO_PLANNING_AREA[upperTown];
    if (areas) {
      // Split count evenly across mapped planning areas
      const share = count / areas.length;
      for (const area of areas) {
        highlights.set(area, (highlights.get(area) ?? 0) + share);
      }
    } else {
      // Direct 1:1 match (e.g. BEDOK → BEDOK)
      highlights.set(upperTown, (highlights.get(upperTown) ?? 0) + count);
    }
  }

  const total = Array.from(townCounts.values()).reduce((a, b) => a + b, 0);
  const ranked = Array.from(townCounts.entries())
    .map(([name, count]) => ({
      name,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { highlights, ranked };
}

/** Aggregate private transactions by district, return map of planning area → count. */
function buildDistrictHighlights(transactions: Transaction[]): {
  highlights: Map<string, number>;
  ranked: NeighbourhoodEntry[];
} {
  const districtCounts = new Map<string, number>();
  for (const row of transactions) {
    const district = row.district?.trim();
    if (!district) continue;
    // Normalise "D09" or "09" to just "09"
    const code = district.replace(/^D/i, "").padStart(2, "0");
    districtCounts.set(code, (districtCounts.get(code) ?? 0) + 1);
  }

  // Map districts to planning areas for the choropleth
  const highlights = new Map<string, number>();
  for (const [code, count] of districtCounts) {
    const areas = DISTRICT_TO_PLANNING_AREAS[code];
    if (areas) {
      const share = count / areas.length;
      for (const area of areas) {
        highlights.set(area, (highlights.get(area) ?? 0) + share);
      }
    }
  }

  const total = Array.from(districtCounts.values()).reduce((a, b) => a + b, 0);
  const ranked = Array.from(districtCounts.entries())
    .map(([code, count]) => ({
      name: code,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { highlights, ranked };
}

type TopNeighbourhoodsProps = {
  transactions: Transaction[];
};

export function TopNeighbourhoods({ transactions }: TopNeighbourhoodsProps) {
  const [view, setView] = useState<"hdb" | "private">("hdb");

  const hdbData = useMemo(() => buildHdbHighlights(transactions), [transactions]);
  const districtData = useMemo(
    () => buildDistrictHighlights(transactions),
    [transactions]
  );

  const { highlights, ranked } =
    view === "hdb" ? hdbData : districtData;

  if (ranked.length === 0) {
    return null;
  }

  const maxCount = Math.max(...highlights.values(), 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 lg:p-8">
      {/* Header row: title left, toggle right */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Top Neighbourhoods
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Geographic distribution of transactions
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-card p-0.5">
          <button
            type="button"
            onClick={() => setView("hdb")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition ${
              view === "hdb"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            HDB Towns
          </button>
          <button
            type="button"
            onClick={() => setView("private")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition ${
              view === "private"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Private Districts
          </button>
        </div>
      </div>

      {/* Map (55%) + ranked list (45%) — side by side from md up */}
      <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-[1.2fr_1fr]">
        {/* Map with legend overlay */}
        <SgPlanningAreaMap
          highlights={highlights}
          maxCount={Math.round(maxCount)}
        />

        {/* Ranked list */}
        <div className="divide-y divide-border">
          {ranked.map((entry, i) => (
            <div
              key={entry.name}
              className="flex items-center gap-3 py-2.5 first:pt-0"
            >
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
              />
              <span className="flex-1 text-sm text-muted-foreground">
                {view === "private"
                  ? `D${entry.name}: ${DISTRICT_LABELS[entry.name] ?? "Unknown"}`
                  : formatAreaName(entry.name)}
              </span>
              <span className="tabular-nums text-sm font-semibold text-foreground">
                {entry.count}
              </span>
              <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                ({entry.percentage}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
