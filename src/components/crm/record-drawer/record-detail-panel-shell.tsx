/**
 * Shared tabbed shell for inline CRM record side panels.
 * @module components/crm/record-drawer/record-detail-panel-shell
 */
"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface RecordDetailPanelTab<TId extends string = string> {
  /** Stable tab id used for active-state rendering. */
  id: TId;
  /** Visible tab label. */
  label: string;
  /** Optional leading icon. */
  icon?: ReactNode;
}

interface RecordDetailPanelShellProps<TId extends string = string> {
  /** Primary heading shown at the top of the side panel. */
  title: string;
  /** Secondary metadata line, typically a relative timestamp. */
  meta?: ReactNode;
  /** Optional badge or status chip shown below the title. */
  badge?: ReactNode;
  /** Available tabs for the side panel. */
  tabs: RecordDetailPanelTab<TId>[];
  /** Currently active tab id. */
  activeTab: TId;
  /** Called when a different tab is selected. */
  onTabChange: (tabId: TId) => void;
  /** Active tab content. */
  children: ReactNode;
}

/**
 * Provides the compact, reference-style side panel structure used across
 * contacts, companies, and deals.
 */
export function RecordDetailPanelShell<TId extends string = string>({
  title,
  meta,
  badge,
  tabs,
  activeTab,
  onTabChange,
  children,
}: RecordDetailPanelShellProps<TId>) {
  return (
    <div className="min-h-0 min-w-0 space-y-5 p-5">
      <header className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 text-[1.85rem] font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            {meta ? (
              <p className="shrink-0 pt-1 text-xs text-muted-foreground">
                {meta}
              </p>
            ) : null}
          </div>
          {badge ? <div>{badge}</div> : null}
        </div>

        <div className="-mx-5 border-b border-border/60 px-5">
          <nav
            aria-label="Record detail sections"
            className="flex min-w-0 items-center gap-5 overflow-x-auto"
            role="tablist"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 border-b-2 px-0 text-sm font-medium whitespace-nowrap transition-colors",
                  activeTab === tab.id
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="min-h-0 min-w-0">{children}</div>
    </div>
  );
}
