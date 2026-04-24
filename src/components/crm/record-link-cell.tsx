/**
 * Reusable first-column record link cell for CRM list tables.
 * @module components/crm/record-link-cell
 */
"use client";

import { OpenRecordHint } from "@/components/crm/open-record-hint";

interface RecordLinkCellProps {
  label: string;
  onOpen: () => void;
}

/**
 * Renders the primary list-cell label together with the standard open-record hint.
 */
export function RecordLinkCell({ label, onOpen }: RecordLinkCellProps) {
  return (
    <span className="flex w-full min-w-0 items-center">
      <button
        type="button"
        className="block max-w-[250px] truncate font-medium text-foreground hover:underline"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        {label}
      </button>
      <OpenRecordHint />
    </span>
  );
}
