/** GitHub-style activity heatmap showing transaction density by month and year. */
"use client";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const HEATMAP_INTENSITY_STYLES = [
  { backgroundColor: "var(--muted)" },
  { backgroundColor: "var(--info)", opacity: 0.2 },
  { backgroundColor: "var(--info)", opacity: 0.4 },
  { backgroundColor: "var(--info)", opacity: 0.6 },
  { backgroundColor: "var(--info)", opacity: 0.8 },
  { backgroundColor: "var(--info)" },
] as const;

/** Groups date strings into YYYY-MM -> count. */
export function groupByMonthYear(dates: (string | null)[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of dates) {
    if (!d) continue;
    const key = d.slice(0, 7);
    if (key.length === 7) {
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return map;
}

type ActivityHeatmapProps = {
  dates: (string | null)[];
};

/** Returns an inline background-color style for the heatmap cell. */
function intensityStyle(count: number) {
  if (count === 0) return HEATMAP_INTENSITY_STYLES[0];
  if (count <= 1) return HEATMAP_INTENSITY_STYLES[1];
  if (count <= 3) return HEATMAP_INTENSITY_STYLES[2];
  if (count <= 5) return HEATMAP_INTENSITY_STYLES[3];
  if (count <= 8) return HEATMAP_INTENSITY_STYLES[4];
  return HEATMAP_INTENSITY_STYLES[5];
}

export function ActivityHeatmap({ dates }: ActivityHeatmapProps) {
  const grouped = groupByMonthYear(dates);
  if (grouped.size === 0) return null;

  const allKeys = Array.from(grouped.keys()).sort();
  const minYear = Number.parseInt(allKeys[0].slice(0, 4), 10);
  const maxYear = Number.parseInt(allKeys[allKeys.length - 1].slice(0, 4), 10);
  const years: number[] = [];

  for (let y = maxYear; y >= minYear; y -= 1) {
    years.push(y);
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">Activity Heatmap</h3>
        <p className="text-sm text-muted-foreground">Monthly transaction activity history</p>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[400px]">
          <div className="mb-1 flex">
            <div className="w-12 shrink-0" />
            {MONTHS.map((m, i) => (
              <div key={`${m}-${i}`} className="flex-1 text-center text-xs text-muted-foreground/70">
                {m}
              </div>
            ))}
          </div>

          {years.map((year) => (
            <div key={year} className="mb-1 flex items-center">
              <div className="w-12 shrink-0 text-xs text-muted-foreground">{year}</div>
              {Array.from({ length: 12 }, (_, monthIndex) => {
                const key = `${year}-${(monthIndex + 1).toString().padStart(2, "0")}`;
                const count = grouped.get(key) ?? 0;
                return (
                  <div key={key} className="flex-1 px-0.5">
                    <div
                      className="aspect-square w-full rounded-sm"
                      style={intensityStyle(count)}
                      title={`${key}: ${count} transaction${count !== 1 ? "s" : ""}`}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Less</span>
        {HEATMAP_INTENSITY_STYLES.map((style, index) => (
          <div key={index} className="h-3 w-3 rounded-sm" style={style} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
