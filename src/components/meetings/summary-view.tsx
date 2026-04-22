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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseSummary(summary: string): {
  kind: "structured";
  data: StructuredSummary;
} | {
  kind: "plain";
  text: string;
} {
  try {
    const parsed = JSON.parse(summary) as Partial<Record<keyof StructuredSummary, unknown>>;
    const data: StructuredSummary = {
      key_discussion_points: isStringArray(parsed.key_discussion_points)
        ? parsed.key_discussion_points
        : [],
      action_items: isStringArray(parsed.action_items) ? parsed.action_items : [],
      client_concerns: isStringArray(parsed.client_concerns) ? parsed.client_concerns : [],
      personal_details: isStringArray(parsed.personal_details) ? parsed.personal_details : [],
      next_steps: isStringArray(parsed.next_steps) ? parsed.next_steps : [],
    };

    return {
      kind: "structured",
      data,
    };
  } catch {
    return {
      kind: "plain",
      text: summary.trim(),
    };
  }
}

export function SummaryView({ summary, status }: SummaryViewProps) {
  if (status === "summarizing") {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span className="type-control">Generating summary...</span>
      </div>
    );
  }

  if (!summary) {
    return <p className="py-4 type-control-muted text-muted-foreground">No summary available.</p>;
  }

  const parsedSummary = parseSummary(summary);
  if (parsedSummary.kind === "plain") {
    if (!parsedSummary.text) {
      return <p className="py-4 type-control-muted text-muted-foreground">No summary available.</p>;
    }

    return (
      <p className="py-4 text-meta leading-relaxed whitespace-pre-wrap text-foreground">
        {parsedSummary.text}
      </p>
    );
  }

  const data = parsedSummary.data;
  const nonEmptySections = SECTION_ORDER.filter(
    (key) => data[key] && data[key].length > 0,
  );

  if (nonEmptySections.length === 0) {
    return <p className="py-4 type-control-muted text-muted-foreground">No summary content extracted.</p>;
  }

  return (
    <div className="space-y-5">
      {nonEmptySections.map((key) => (
        <div key={key}>
          <h3 className="mb-2 type-control text-foreground">
            {SECTION_LABELS[key]}
          </h3>
          <ul className="space-y-1.5">
            {data[key].map((item, index) => (
              <li key={index} className="flex gap-2 text-meta text-foreground">
                <span className="mt-[0.3rem] shrink-0 text-muted-foreground/60">•</span>
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
