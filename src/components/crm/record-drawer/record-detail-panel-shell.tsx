/**
 * Shared tabbed shell for inline CRM record side panels.
 * Compact header, tab overflow dropdown, and optional pinned footer
 * inspired by Twenty CRM's detail panel design.
 * @module components/crm/record-drawer/record-detail-panel-shell
 */
"use client";

import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  /** Optional close button rendered inline in the header (desktop panel mode). */
  closeButton?: ReactNode;
  /** Optional avatar element rendered between close button and title. */
  avatar?: ReactNode;
  /** Optional badge or status chip shown below the header row. */
  badge?: ReactNode;
  /** Available tabs for the side panel. */
  tabs: RecordDetailPanelTab<TId>[];
  /** Currently active tab id. */
  activeTab: TId;
  /** Called when a different tab is selected. */
  onTabChange: (tabId: TId) => void;
  /** Maximum tabs to show inline before overflow dropdown. */
  maxVisibleTabs?: number;
  /** Optional footer node rendered pinned at the panel bottom. */
  footer?: ReactNode;
  /** Active tab content. */
  children: ReactNode;
}

/**
 * Provides the compact, reference-style side panel structure used across
 * contacts, companies, and deals — with tab overflow and pinned footer.
 */
export function RecordDetailPanelShell<TId extends string = string>({
  title,
  meta,
  closeButton,
  avatar,
  badge,
  tabs,
  activeTab,
  onTabChange,
  maxVisibleTabs = 3,
  footer,
  children,
}: RecordDetailPanelShellProps<TId>) {
  const visibleTabs = tabs.slice(0, maxVisibleTabs);
  const overflowTabs = tabs.slice(maxVisibleTabs);
  const isOverflowTabActive = overflowTabs.some((tab) => tab.id === activeTab);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {/* Scrollable area: header + tabs + content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 p-5">
          {/* Compact header row */}
          <header className="space-y-2">
            <div className="flex items-center gap-2.5">
              {closeButton ? (
                <div className="shrink-0">{closeButton}</div>
              ) : null}
              {avatar ? (
                <div className="shrink-0">{avatar}</div>
              ) : null}
              <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                {title}
              </h2>
              {meta ? (
                <p className="shrink-0 text-xs text-muted-foreground">{meta}</p>
              ) : null}
            </div>
            {badge ? <div>{badge}</div> : null}
          </header>

          {/* Tab bar */}
          <div className="-mx-5 border-b border-border/60 px-5">
            <nav
              aria-label="Record detail sections"
              className="flex min-w-0 items-center gap-5 overflow-x-auto"
              role="tablist"
            >
              {visibleTabs.map((tab) => (
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

              {overflowTabs.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-10 items-center gap-1 border-b-2 px-0 text-sm font-medium whitespace-nowrap transition-colors",
                        isOverflowTabActive
                          ? "border-foreground text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      +{overflowTabs.length} More
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {overflowTabs.map((tab) => (
                      <DropdownMenuItem
                        key={tab.id}
                        onClick={() => onTabChange(tab.id)}
                      >
                        {tab.icon ? (
                          <span className="mr-2 h-4 w-4 shrink-0">{tab.icon}</span>
                        ) : null}
                        <span>{tab.label}</span>
                        {activeTab === tab.id ? (
                          <Check className="ml-auto h-4 w-4" />
                        ) : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </nav>
          </div>

          {/* Active tab content */}
          <div className="min-h-0 min-w-0">{children}</div>
        </div>
      </div>

      {/* Pinned footer */}
      {footer ? <div className="shrink-0">{footer}</div> : null}
    </div>
  );
}
