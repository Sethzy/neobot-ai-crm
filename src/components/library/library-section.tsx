/**
 * Library section component for the case page Library tab.
 * Displays generated reports grouped by date with search and view toggle.
 * @module components/library/library-section
 */
import { useMemo, useState } from "react";
import { FileSpreadsheet, Search, LayoutGrid, List } from "@/components/icons/lucide-compat";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useReportHistory, useDownloadReport } from "@/hooks/use-docgen";
import { useClientConfigId } from "@/hooks/use-client-config";
import { getClientConfig } from "@/config/loader";
import { LibraryFileCard } from "./library-file-card";
import type { ReportHistoryItem } from "@/components/docgen/report-history";

interface LibrarySectionProps {
  /** Case ID to fetch reports for */
  caseId: string;
}

/** Date group labels for organizing files */
type DateGroup = "today" | "thisWeek" | "older";

interface GroupedReports {
  today: ReportHistoryItem[];
  thisWeek: ReportHistoryItem[];
  older: ReportHistoryItem[];
}

/**
 * Determines which date group a report belongs to based on generated_at.
 * @param dateStr - ISO date string from report.generated_at
 * @returns Date group: "today", "thisWeek", or "older"
 */
function getDateGroup(dateStr: string): DateGroup {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  if (date >= today) {
    return "today";
  } else if (date >= weekAgo) {
    return "thisWeek";
  }
  return "older";
}

/**
 * Groups reports by date (Today, This Week, Older).
 * @param reports - Array of reports to group
 * @returns Grouped reports object
 */
function groupReportsByDate(reports: ReportHistoryItem[]): GroupedReports {
  const grouped: GroupedReports = { today: [], thisWeek: [], older: [] };

  for (const report of reports) {
    const group = getDateGroup(report.generated_at);
    grouped[group].push(report);
  }

  return grouped;
}

/**
 * Human-readable labels for date groups.
 */
const DATE_GROUP_LABELS: Record<DateGroup, string> = {
  today: "Today",
  thisWeek: "This Week",
  older: "Older",
};

/**
 * Library section displaying generated reports in a grid or list view.
 * Features:
 * - Search filtering by filename
 * - Date grouping (Today, This Week, Older)
 * - Grid/List view toggle
 * - Click to download
 */
export function LibrarySection({ caseId }: LibrarySectionProps) {
  const { data: reports } = useReportHistory(caseId);
  const downloadMutation = useDownloadReport();
  const { data: clientConfigId } = useClientConfigId();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");

  // Build tag ID to display name map for descriptions
  const tagNameMap = useMemo(() => {
    const config = getClientConfig(clientConfigId ?? null);
    return new Map(config.tags.map((t) => [t.id, t.displayName]));
  }, [clientConfigId]);

  /**
   * Filter and group reports based on search query.
   * Memoized to avoid recalculating on every render.
   */
  const { groupedReports, totalCount } = useMemo(() => {
    if (!reports) {
      return { groupedReports: { today: [], thisWeek: [], older: [] }, totalCount: 0 };
    }

    // Filter by search query (case-insensitive)
    const filtered = searchQuery
      ? reports.filter((r) =>
          r.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : reports;

    return {
      groupedReports: groupReportsByDate(filtered),
      totalCount: filtered.length,
    };
  }, [reports, searchQuery]);

  const handleDownload = (filePath: string) => {
    downloadMutation.mutate(filePath);
  };

  // Empty state - no reports at all
  if (!reports || reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16">
        <div className="p-4 rounded-full bg-muted/50 mb-4">
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground/50" />
        </div>
        <p className="text-lg font-medium text-muted-foreground">No reports yet</p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Use AI Analyst to generate reports
        </p>
      </div>
    );
  }

  // No results after search
  const noSearchResults =
    searchQuery && totalCount === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Content area - centered like AI Analyst */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-4">
          {/* Header toolbar */}
          <div className="flex items-center gap-3 mb-6 pt-2 px-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* View toggle */}
            <div className="flex border rounded-md overflow-hidden">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("list")}
                aria-label="List view"
                className={cn(
                  "rounded-none px-2",
                  viewMode === "list" && "bg-muted"
                )}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                className={cn(
                  "rounded-none px-2",
                  viewMode === "grid" && "bg-muted"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {noSearchResults ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Search className="h-8 w-8 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">No files match "{searchQuery}"</p>
              <Button
                variant="link"
                size="sm"
                onClick={() => setSearchQuery("")}
                className="mt-1"
              >
                Clear search
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
            {(["today", "thisWeek", "older"] as DateGroup[]).map((group) => {
              const groupReports = groupedReports[group];
              if (groupReports.length === 0) return null;

              return (
                <section key={group}>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3 px-3">
                    {DATE_GROUP_LABELS[group]}
                  </h3>
                  {viewMode === "grid" ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {groupReports.map((report) => (
                        <LibraryFileCard
                          key={report.id}
                          report={report}
                          onDownload={handleDownload}
                          viewMode={viewMode}
                          tagNameMap={tagNameMap}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {groupReports.map((report) => (
                        <LibraryFileCard
                          key={report.id}
                          report={report}
                          onDownload={handleDownload}
                          viewMode={viewMode}
                          tagNameMap={tagNameMap}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
