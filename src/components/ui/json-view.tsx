/**
 * Lightweight recursive JSON viewer with type-appropriate coloring.
 * Replaces raw JSON.stringify in tool output displays.
 * @module components/ui/json-view
 */
"use client";

import { cn } from "@/lib/utils";

interface JsonViewProps {
  /** The data to render. Accepts any JSON-serializable value. */
  data: unknown;
  className?: string;
}

/**
 * Renders arbitrary JSON data as a formatted key-value tree.
 * Strings are green, numbers blue, booleans amber, null muted.
 * Objects and arrays are rendered as indented blocks.
 */
export function JsonView({ data, className }: JsonViewProps) {
  return (
    <div data-testid="json-view" className={cn("font-mono text-xs", className)}>
      <JsonNode value={data} />
    </div>
  );
}

function JsonNode({ value }: { value: unknown }) {
  if (value === null) {
    return <span className="text-muted-foreground/60">null</span>;
  }

  if (value === undefined) {
    return <span className="text-muted-foreground/60">undefined</span>;
  }

  if (typeof value === "string") {
    return (
      <span className="text-syntax-string">
        &quot;{value}&quot;
      </span>
    );
  }

  if (typeof value === "number") {
    return (
      <span className="text-syntax-number">{String(value)}</span>
    );
  }

  if (typeof value === "boolean") {
    return (
      <span className="text-syntax-boolean">
        {String(value)}
      </span>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>{"[]"}</span>;
    return (
      <div className="pl-3">
        {value.map((item, index) => (
          <div key={index} className="flex gap-1">
            <span className="shrink-0 select-none text-muted-foreground">
              {index}:
            </span>
            <JsonNode value={item} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return <span>{"{}"}</span>;
    return (
      <div className="pl-3">
        {entries.map(([key, val]) => (
          <div key={key} className="flex gap-1">
            <span className="shrink-0 text-muted-foreground">{key}:</span>
            <JsonNode value={val} />
          </div>
        ))}
      </div>
    );
  }

  return <span>{String(value)}</span>;
}
