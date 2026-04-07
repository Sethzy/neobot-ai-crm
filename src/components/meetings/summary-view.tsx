/**
 * Summary renderer for one meeting detail page.
 * Renders structured JSON sections extracted by the ingest pipeline.
 * @module components/meetings/summary-view
 */
"use client";

interface StructuredSummary {
  key_discussion_points: string[];
  action_items: string[];
  client_concerns: string[];
  personal_details: string[];
  next_steps: string[];
}

const SECTION_LABELS: Record<keyof StructuredSummary, string> = {
  key_discussion_points: "Key Discussion Points",
  action_items: "Action Items",
  client_concerns: "Client Concerns",
  personal_details: "Personal Details",
  next_steps: "Next Steps",
};

const SECTION_ORDER: (keyof StructuredSummary)[] = [
  "key_discussion_points",
  "action_items",
  "client_concerns",
  "personal_details",
  "next_steps",
];

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

  const data = JSON.parse(summary) as StructuredSummary;
  const nonEmptySections = SECTION_ORDER.filter(
    (key) => data[key] && data[key].length > 0,
  );

  if (nonEmptySections.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">No summary content extracted.</p>;
  }

  return (
    <div className="space-y-4">
      {nonEmptySections.map((key) => (
        <div key={key}>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {SECTION_LABELS[key]}
          </h3>
          <ul className="space-y-1">
            {data[key].map((item, index) => (
              <li key={index} className="flex gap-2 text-sm text-foreground">
                <span className="mt-1 shrink-0 text-muted-foreground">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
