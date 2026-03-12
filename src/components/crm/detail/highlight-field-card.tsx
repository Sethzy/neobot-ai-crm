/**
 * Compact highlight card used inside customer detail headers.
 * @module components/crm/detail/highlight-field-card
 */
"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface HighlightFieldCardProps {
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * Wraps one highlight field in the subdued Open Mercato-style card chrome.
 */
export function HighlightFieldCard({
  label,
  children,
  className,
}: HighlightFieldCardProps) {
  return (
    <div className={cn("rounded-lg border border-border/40 bg-muted/30 p-3 shadow-sm", className)}>
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
        {label}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  );
}
