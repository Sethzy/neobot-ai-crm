/**
 * Summary renderer for one meeting detail page.
 * @module components/meetings/summary-view
 */
"use client";

import ReactMarkdown from "react-markdown";

interface SummaryViewProps {
  summary: string | null;
  status: string;
}

export function SummaryView({ summary, status }: SummaryViewProps) {
  if (status === "summarizing") {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span className="text-sm">Generating summary...</span>
      </div>
    );
  }

  if (!summary) {
    return <p className="py-4 text-sm text-muted-foreground">No summary available.</p>;
  }

  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown>{summary}</ReactMarkdown>
    </div>
  );
}
