/**
 * Cell value extractors and display formatters for config-driven CRM columns.
 * Used by buildColumnsFromConfig to render table cells per field type.
 * Returns React nodes for rich rendering (links, badges, etc).
 * @module lib/crm/field-renderers
 */
import type { ReactNode } from "react";

import type { FieldSource, FieldType } from "./field-definitions";

/**
 * Extract the raw value from a row based on field key and source.
 * Column fields read directly from the row; custom fields read from the JSONB custom_fields column.
 */
export function getFieldValue(
  row: Record<string, unknown>,
  key: string,
  source: FieldSource,
): unknown {
  if (source === "custom") {
    const cf = row.custom_fields;
    if (cf && typeof cf === "object" && !Array.isArray(cf)) {
      return (cf as Record<string, unknown>)[key];
    }
    return undefined;
  }
  return row[key];
}

/**
 * Format a field value as a plain string (for non-React contexts like sorting, export, etc).
 * Returns null if value is null/undefined.
 */
export function formatFieldDisplay(type: FieldType, value: unknown): string | null {
  if (value === null || value === undefined) return null;

  switch (type) {
    case "currency": {
      const num = typeof value === "string" ? Number(value) : value;
      if (typeof num !== "number" || Number.isNaN(num)) return String(value);
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num);
    }
    case "number": {
      const num = typeof value === "string" ? Number(value) : value;
      if (typeof num !== "number" || Number.isNaN(num)) return String(value);
      return new Intl.NumberFormat("en-US").format(num);
    }
    case "date": {
      const d = new Date(value as string);
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
    }
    case "boolean":
      return value ? "Yes" : "No";
    default:
      return String(value);
  }
}

/**
 * Render a field value as a React node with proper rich formatting per type.
 * Used as the default cell renderer in buildColumnsFromConfig.
 */
export function renderFieldCell(type: FieldType, value: unknown): ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }

  switch (type) {
    case "email":
      return (
        <a
          href={`mailto:${String(value)}`}
          className="block max-w-[250px] truncate text-foreground/80 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {String(value)}
        </a>
      );

    case "phone":
      return (
        <a
          href={`tel:${String(value)}`}
          className="block max-w-[180px] truncate text-foreground/80 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {String(value)}
        </a>
      );

    case "url": {
      const urlStr = String(value);
      const displayUrl = urlStr.replace(/^https?:\/\//, "").replace(/\/$/, "");
      return (
        <a
          href={urlStr.startsWith("http") ? urlStr : `https://${urlStr}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block max-w-[200px] truncate text-foreground/80 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {displayUrl}
        </a>
      );
    }

    case "currency": {
      const num = typeof value === "string" ? Number(value) : value;
      if (typeof num !== "number" || Number.isNaN(num)) return <span>{String(value)}</span>;
      return (
        <span className="tabular-nums">
          {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num)}
        </span>
      );
    }

    case "number": {
      const num = typeof value === "string" ? Number(value) : value;
      if (typeof num !== "number" || Number.isNaN(num)) return <span>{String(value)}</span>;
      return <span className="tabular-nums">{new Intl.NumberFormat("en-US").format(num)}</span>;
    }

    case "date": {
      const d = new Date(value as string);
      if (Number.isNaN(d.getTime())) return <span>{String(value)}</span>;
      return (
        <span className="whitespace-nowrap text-muted-foreground">
          {d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
        </span>
      );
    }

    case "boolean":
      return <span>{value ? "Yes" : "No"}</span>;

    case "select":
      return (
        <span className="inline-flex items-center rounded-md bg-muted/50 px-2 py-0.5 text-xs font-medium">
          {String(value)}
        </span>
      );

    case "tags": {
      const tags = Array.isArray(value) ? value : [value];
      return (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={String(tag)}
              className="inline-flex items-center rounded-full bg-muted/50 px-2 py-0.5 text-xs"
            >
              {String(tag)}
            </span>
          ))}
        </div>
      );
    }

    case "relation":
      return <span className="truncate">{String(value)}</span>;

    case "richtext": {
      const plain = String(value).replace(/<[^>]*>/g, "").replace(/[#*_~`]/g, "");
      return <span className="block max-w-[250px] truncate">{plain}</span>;
    }

    case "file":
      return <span className="truncate text-foreground/80">{String(value)}</span>;

    case "full_name":
      return <span className="font-medium">{String(value)}</span>;

    case "text":
    default:
      return <span className="block max-w-[250px] truncate">{String(value)}</span>;
  }
}
