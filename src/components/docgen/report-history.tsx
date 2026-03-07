/**
 * Report history list component.
 * @module components/docgen/report-history
 */
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet } from "@/components/icons/lucide-compat";
import { useDownloadReport } from "@/hooks/use-docgen";
import { useClientConfigId } from "@/hooks/use-client-config";
import { getClientConfig } from "@/config/loader";
import { format } from "date-fns";

import type { ReactNode } from "react";

/** Custom markdown components for summary rendering (matches validation-rules table) */
const markdownComponents = {
  h2: ({ children }: { children?: ReactNode }) => (
    <h3 className="text-sm font-semibold mb-1 first:mt-0">{children}</h3>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h4 className="text-sm font-medium mt-2 mb-1">{children}</h4>
  ),
  p: ({ children }: { children?: ReactNode }) => <p className="my-2">{children}</p>,
  hr: () => <hr className="my-2 border-border/50" />,
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="list-disc pl-4 my-2 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="list-decimal pl-4 my-2 space-y-0.5">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li>{children}</li>,
};

export interface ReportHistoryItem {
  id: string;
  report_type: string;
  name: string;
  file_path: string;
  splits_count: number;
  tags_included: string[];
  generated_at: string;
  ai_summary?: string | null;
}

interface ReportHistoryProps {
  reports: ReportHistoryItem[] | null | undefined;
}

/**
 * Displays list of previously generated reports with download buttons.
 */
export function ReportHistory({ reports }: ReportHistoryProps) {
  const { data: clientConfigId } = useClientConfigId();
  const config = getClientConfig(clientConfigId ?? null);

  // Build tag ID to display name map
  const tagNameMap = new Map(config.tags.map((t) => [t.id, t.displayName]));

  if (!reports?.length) {
    return (
      <Card>
        <CardContent className="p-16 text-center">
          <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-6 text-muted-foreground">No reports generated yet</p>
          <p className="mt-2 text-sm text-muted-foreground/60">
            Generate your first report above
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Report History</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50">
              <th className="w-[240px] px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Title
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Summary
              </th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <ReportHistoryRow key={report.id} report={report} tagNameMap={tagNameMap} />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/**
 * Builds a descriptive summary for Quick Reports showing included document types.
 */
function buildQuickReportSummary(
  tagsIncluded: string[],
  splitsCount: number,
  tagNameMap: Map<string, string>
): string {
  const tagNames = tagsIncluded
    .map((id) => tagNameMap.get(id) || id)
    .join(", ");
  return `${tagNames} · ${splitsCount} record${splitsCount !== 1 ? "s" : ""}`;
}

const ReportHistoryRow = memo(function ReportHistoryRow({
  report,
  tagNameMap,
}: {
  report: ReportHistoryItem;
  tagNameMap: Map<string, string>;
}) {
  const downloadMutation = useDownloadReport();

  // For Quick Reports without AI summary, show included doc types
  const quickReportSummary =
    !report.ai_summary && report.tags_included?.length
      ? buildQuickReportSummary(report.tags_included, report.splits_count, tagNameMap)
      : null;

  return (
    <tr className="border-b border-border/30 last:border-b-0 hover:bg-muted/40 transition-colors">
      {/* Title column */}
      <td className="px-5 py-4 align-top">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="h-5 w-5 text-muted-foreground/60 shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground/80">
              {report.name}
            </p>
            <p className="text-xs text-muted-foreground/70">
              {format(new Date(report.generated_at), "MMM d, h:mm a")} ·{" "}
              {report.splits_count} records
            </p>
          </div>
        </div>
      </td>
      {/* Summary column */}
      <td className="px-5 py-4 align-top">
        {report.ai_summary ? (
          <div className="text-sm text-foreground/80">
            <ReactMarkdown components={markdownComponents}>
              {report.ai_summary}
            </ReactMarkdown>
          </div>
        ) : quickReportSummary ? (
          <p className="text-sm text-foreground/80">
            <strong className="font-semibold">{report.tags_included.map((id) => tagNameMap.get(id) || id).join(", ")}</strong>
            {" · "}
            {report.splits_count} record{report.splits_count !== 1 ? "s" : ""}
          </p>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </td>
      {/* Download column */}
      <td className="pl-2 pr-8 py-4 align-top text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => downloadMutation.mutate(report.file_path)}
          disabled={downloadMutation.isPending}
        >
          <Download className="h-6 w-6" />
        </Button>
      </td>
    </tr>
  );
});
