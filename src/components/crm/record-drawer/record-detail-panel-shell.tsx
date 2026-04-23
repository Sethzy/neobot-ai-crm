/**
 * Shared tabbed shell for inline CRM record side panels.
 * Compact header, tab overflow dropdown, and optional pinned footer
 * inspired by Twenty CRM's detail panel design.
 * @module components/crm/record-drawer/record-detail-panel-shell
 */
"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Pencil } from "lucide-react";

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
  /** Optional avatar element rendered before the title. */
  avatar?: ReactNode;
  /** Optional actions rendered on the header row. */
  headerActions?: ReactNode;
  /**
   * When set, the title becomes click-to-edit. Called with the trimmed new
   * value on Enter or blur; throw from this callback to abort the save and
   * revert to the previous value.
   */
  onTitleSave?: (nextTitle: string) => void | Promise<void>;
  /** Optional badge or status chip shown below the header row. */
  badge?: ReactNode;
  /** Available tabs for the side panel. */
  tabs: RecordDetailPanelTab<TId>[];
  /** Currently active tab id. */
  activeTab: TId;
  /** Called when a different tab is selected. */
  onTabChange: (tabId: TId) => void;
  /** Maximum tabs to show inline before overflow dropdown. */
  maxVisibleTabs?: number; // Default: 4
  /** Optional footer node rendered pinned at the panel bottom. */
  footer?: ReactNode;
  /** Reserve room for the drawer close button on the trailing edge. */
  reserveTrailingSpace?: boolean;
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
  avatar,
  headerActions,
  onTitleSave,
  badge,
  tabs,
  activeTab,
  onTabChange,
  maxVisibleTabs = 4,
  footer,
  reserveTrailingSpace = true,
  children,
}: RecordDetailPanelShellProps<TId>) {
  const visibleTabs = tabs.slice(0, maxVisibleTabs);
  const overflowTabs = tabs.slice(maxVisibleTabs);
  const isOverflowTabActive = overflowTabs.some((tab) => tab.id === activeTab);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  // Reset draft whenever the live title changes (e.g. another tab edited it).
  useEffect(() => {
    if (!isEditingTitle) setTitleDraft(title);
  }, [isEditingTitle, title]);

  // Focus + select on entering edit mode for immediate typing.
  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  async function commitTitle(nextValue: string) {
    const trimmed = nextValue.trim();
    if (!onTitleSave || trimmed.length === 0 || trimmed === title.trim()) {
      setIsEditingTitle(false);
      setTitleDraft(title);
      return;
    }
    try {
      setIsSavingTitle(true);
      await onTitleSave(trimmed);
      setIsEditingTitle(false);
    } catch {
      // Callback rejected — keep the editor open so the user can retry.
    } finally {
      setIsSavingTitle(false);
    }
  }

  function handleTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitTitle(titleDraft);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIsEditingTitle(false);
      setTitleDraft(title);
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {/* Scrollable area: header + tabs + content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 p-5">
          {/* Compact header row — right padding reserves space for the Sheet's
              absolute-positioned close button so the meta text doesn't collide. */}
          <header className={cn("space-y-2", reserveTrailingSpace && "pr-10")}>
            <div className="flex items-center gap-2.5">
              {avatar ? (
                <div className="shrink-0">{avatar}</div>
              ) : null}
              {isEditingTitle && onTitleSave ? (
                <input
                  ref={titleInputRef}
                  value={titleDraft}
                  disabled={isSavingTitle}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onBlur={() => void commitTitle(titleDraft)}
                  onKeyDown={handleTitleKeyDown}
                  className="min-w-0 flex-1 rounded-md border border-border/50 bg-transparent px-2 py-1 text-sm font-semibold text-foreground outline-none focus:border-ring"
                  aria-label="Edit record title"
                />
              ) : (
                <button
                  type="button"
                  disabled={!onTitleSave}
                  onClick={() => {
                    if (onTitleSave) setIsEditingTitle(true);
                  }}
                  className={cn(
                    "group/title inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-md text-left text-sm font-semibold text-foreground",
                    onTitleSave && "cursor-text px-1 -mx-1 transition-colors duration-[var(--duration-hover)] hover:bg-app-hover/60",
                  )}
                  title={onTitleSave ? "Click to rename" : undefined}
                >
                  <span className="min-w-0 flex-1 truncate">{title}</span>
                  {onTitleSave ? (
                    <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100" />
                  ) : null}
                </button>
              )}
              {headerActions ? <div className="shrink-0">{headerActions}</div> : null}
              {isSavingTitle ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
              ) : null}
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
                    "inline-flex h-10 items-center gap-1.5 border-b-2 px-0 text-sm font-medium whitespace-nowrap transition-colors duration-[var(--duration-hover)]",
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
                        "inline-flex h-10 items-center gap-1 border-b-2 px-0 text-sm font-medium whitespace-nowrap transition-colors duration-[var(--duration-hover)]",
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
