/**
 * Compact mobile card used by CRM list pages below the md breakpoint.
 * @module components/crm/mobile-record-card
 */
"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface MobileRecordCardField {
  label: string;
  value: ReactNode;
}

interface MobileRecordCardProps {
  actions?: ReactNode;
  className?: string;
  eyebrow?: ReactNode;
  fields?: MobileRecordCardField[];
  isSelected?: boolean;
  meta?: ReactNode;
  onOpen?: () => void;
  title: ReactNode;
}

export function MobileRecordCard({
  actions,
  className,
  eyebrow,
  fields = [],
  isSelected = false,
  meta,
  onOpen,
  title,
}: MobileRecordCardProps) {
  return (
    <article
      className={cn(
        "rounded-md border border-app-border-subtle bg-app-surface p-3 transition-colors",
        onOpen && "cursor-pointer hover:bg-app-hover/60",
        isSelected && "bg-[var(--selection)]",
        className,
      )}
      onClick={(event) => {
        if (!onOpen) return;
        if (
          (event.target as HTMLElement).closest(
            "a,button,input,select,textarea,label,[role='button'],[data-actions-cell]",
          )
        ) {
          return;
        }
        onOpen();
      }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow ? <div className="mb-1 text-caption text-muted-foreground">{eyebrow}</div> : null}
          <div className="type-row-title text-foreground">{title}</div>
          {meta ? <div className="mt-1 type-row-meta text-muted-foreground">{meta}</div> : null}
        </div>
        {actions ? <div data-actions-cell>{actions}</div> : null}
      </div>
      {fields.length > 0 ? (
        <dl className="mt-3 grid gap-2 text-control">
          {fields.map((field) => (
            <div key={field.label} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className="min-w-0 [overflow-wrap:anywhere] text-foreground [&_a]:min-h-11 [&_a]:items-center [&_a]:py-1.5">
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}
