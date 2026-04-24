/**
 * Global search panel styled after Attio's split search dialog.
 * Replaces the older compact command palette with a richer left-list /
 * right-preview workflow for companies, contacts, deals, tasks, and threads.
 *
 * @module components/command-menu
 */
"use client";

import { Command as CommandPrimitive } from "cmdk";
import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useThreads as useThreadContext } from "@/contexts/thread-context";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useClientId } from "@/hooks/use-client-id";
import {
  trackRecentSearchRecord,
  useGlobalSearchRecords,
  type GlobalSearchRecord,
} from "@/hooks/use-global-search";
import { useContact } from "@/hooks/use-contacts";
import { useCrmTask } from "@/hooks/use-crm-tasks";
import { useDeal } from "@/hooks/use-deals";
import { useCompany as useCompanyDetail } from "@/hooks/use-companies";
import {
  avatarColorFor,
  formatCompactCurrency,
  formatContactFullName,
  formatCrmDate,
  formatCrmEnumLabel,
  formatCrmPrice,
  formatDealStageLabel,
} from "@/lib/crm/display";
import { cn } from "@/lib/utils";

import { AppIcon, type AppIconName } from "@/components/icons/app-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

interface CommandMenuProps {
  /** Whether the command menu dialog is open. */
  open: boolean;
  /** Callback used to toggle dialog open state. */
  onOpenChange: (open: boolean) => void;
}

const resultBadgeClassMap = {
  company: "border-info/15 bg-info/10 text-info",
  contact: "border-info/15 bg-info/10 text-info",
  deal: "border-warning/15 bg-warning/10 text-foreground/85",
  task: "border-success/15 bg-success/10 text-foreground/85",
  thread: "border-border/60 bg-background text-muted-foreground",
} as const;

function getInitials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function FooterKbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded bg-muted/60 px-1.5 py-0.5 text-caption font-medium text-foreground/80">
      {children}
    </kbd>
  );
}

function ResultAvatar({ record }: { record: GlobalSearchRecord }) {
  const shapeClassName =
    record.entityType === "company" ? "rounded-[8px]" : "rounded-full";
  const imageUrl = record.imageUrl ?? "";
  const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);

  const shouldRenderImage = imageUrl.length > 0 && failedImageUrl !== imageUrl;
  const hasLoadedImage = loadedImageUrl === imageUrl;

  return (
      <div
        className={cn(
          "relative flex size-7 shrink-0 items-center justify-center overflow-hidden border border-border/45 text-caption font-semibold shadow-xs",
          shapeClassName,
          avatarColorFor(record.title),
        )}
    >
      <span
        className={cn(
          "transition-opacity duration-150",
          hasLoadedImage ? "opacity-0" : "opacity-100",
        )}
      >
        {getInitials(record.title)}
      </span>

      {shouldRenderImage ? (
        <img
          src={imageUrl}
          alt=""
          className={cn(
            "absolute inset-0 m-auto size-4 transition-opacity duration-150",
            shapeClassName,
            hasLoadedImage ? "opacity-100" : "opacity-0",
          )}
          decoding="async"
          onLoad={() => {
            setLoadedImageUrl(imageUrl);
            setFailedImageUrl(null);
          }}
          onError={() => {
            setLoadedImageUrl(null);
            setFailedImageUrl(imageUrl);
          }}
        />
      ) : null}
    </div>
  );
}

function SearchResultItem({
  record,
  onSelect,
}: {
  record: GlobalSearchRecord;
  onSelect: (record: GlobalSearchRecord) => void;
}) {
  return (
    <CommandPrimitive.Item
      value={record.key}
      onSelect={() => onSelect(record)}
      className={cn(
        "group relative mx-2 flex cursor-default items-start gap-3 rounded-[16px] border border-transparent px-3 py-2 text-left outline-none select-none transition",
        "data-[selected=true]:border-border/60 data-[selected=true]:bg-muted/45",
      )}
    >
      <ResultAvatar record={record} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-1.5 text-meta font-medium text-foreground">
              <span className="min-w-0 truncate">{record.title}</span>
              {record.subtitle ? (
                <span className="shrink truncate text-caption font-normal text-muted-foreground">
                  {record.subtitle}
                </span>
              ) : null}
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "h-6 shrink-0 rounded-full border px-2.5 text-caption font-medium shadow-none",
              resultBadgeClassMap[record.entityType],
            )}
          >
            {record.badgeLabel}
          </Badge>
        </div>
      </div>
    </CommandPrimitive.Item>
  );
}

function PreviewSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="size-8 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-5/6 rounded-md" />
        <Skeleton className="h-4 w-4/6 rounded-md" />
      </div>
    </div>
  );
}

function PreviewMetaRow({
  iconName,
  children,
}: {
  iconName: AppIconName;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 py-1 text-meta">
      <AppIcon
        name={iconName}
        className="mt-0.5 size-3.5 text-muted-foreground"
      />
      <div className="min-w-0 flex-1 text-meta text-foreground">
        {children}
      </div>
    </div>
  );
}

function PreviewChip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "info";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-caption font-medium",
        tone === "info"
          ? "border-info/15 bg-info/10 text-info"
          : "border-border/60 bg-background text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function PreviewShell({
  record,
  title,
  chips,
  statusLabel,
  children,
}: {
  record: GlobalSearchRecord;
  title: string;
  chips?: React.ReactNode;
  statusLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border/60 px-5 py-4">
        <div className="flex items-start gap-3">
          <ResultAvatar record={record} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="type-toolbar-title">
                {title}
              </div>
            </div>
          </div>
          {statusLabel ? <PreviewChip>{statusLabel}</PreviewChip> : null}
        </div>
        {chips ? <div className="mt-3 flex flex-wrap gap-1.5">{chips}</div> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="space-y-1.5">{children}</div>
      </div>
    </div>
  );
}

function CompanyPreview({ record }: { record: GlobalSearchRecord }) {
  const { data: company, isLoading } = useCompanyDetail(record.id);

  if (isLoading || !company) {
    return <PreviewSkeleton />;
  }

  return (
    <PreviewShell
      record={record}
      title={company.name}
      statusLabel="No communication found"
      chips={
        <>
          <PreviewChip>{record.badgeLabel}</PreviewChip>
          {company.industry ? (
            <PreviewChip tone="info">
              {formatCrmEnumLabel(company.industry)}
            </PreviewChip>
          ) : null}
        </>
      }
    >
      {company.website ? (
        <PreviewMetaRow iconName="globe">
          <a
            href={company.website}
            target="_blank"
            rel="noreferrer"
            className="truncate hover:underline"
          >
            {company.website}
          </a>
        </PreviewMetaRow>
      ) : null}
      {company.email ? (
        <PreviewMetaRow iconName="email">{company.email}</PreviewMetaRow>
      ) : null}
      {company.phone ? (
        <PreviewMetaRow iconName="phone">{company.phone}</PreviewMetaRow>
      ) : null}
      {company.address ? (
        <PreviewMetaRow iconName="mapPin">{company.address}</PreviewMetaRow>
      ) : null}
      {record.meta && (!company.industry || record.meta !== formatCrmEnumLabel(company.industry)) ? (
        <PreviewMetaRow iconName="note">{record.meta}</PreviewMetaRow>
      ) : null}
    </PreviewShell>
  );
}

function ContactPreview({ record }: { record: GlobalSearchRecord }) {
  const { data: contact, isLoading } = useContact(record.id);

  if (isLoading || !contact) {
    return <PreviewSkeleton />;
  }

  return (
    <PreviewShell
      record={record}
      title={formatContactFullName(contact)}
      statusLabel="No communication found"
      chips={
        <>
          <PreviewChip>{record.badgeLabel}</PreviewChip>
          <PreviewChip tone="info">
            {formatCrmEnumLabel(contact.type)}
          </PreviewChip>
          {contact.companies?.name ? (
            <PreviewChip>{contact.companies.name}</PreviewChip>
          ) : null}
        </>
      }
    >
      {contact.companies?.name ? (
        <PreviewMetaRow iconName="building">
          {contact.companies.name}
        </PreviewMetaRow>
      ) : null}
      {contact.email ? (
        <PreviewMetaRow iconName="email">{contact.email}</PreviewMetaRow>
      ) : null}
      {contact.phone ? (
        <PreviewMetaRow iconName="phone">{contact.phone}</PreviewMetaRow>
      ) : null}
      {record.meta ? (
        <PreviewMetaRow iconName="note">{record.meta}</PreviewMetaRow>
      ) : null}
    </PreviewShell>
  );
}

function DealPreview({ record }: { record: GlobalSearchRecord }) {
  const { data: deal, isLoading } = useDeal(record.id);

  if (isLoading || !deal) {
    return <PreviewSkeleton />;
  }

  const primaryContact =
    deal.deal_contacts.find((dealContact) => dealContact.is_primary)
    ?? deal.deal_contacts[0];

  return (
    <PreviewShell
      record={record}
      title={deal.address}
      statusLabel="No communication found"
      chips={
        <>
          <PreviewChip>{record.badgeLabel}</PreviewChip>
          <PreviewChip tone="info">{formatDealStageLabel(deal.stage)}</PreviewChip>
          {deal.amount ? (
            <PreviewChip>{formatCompactCurrency(deal.amount)}</PreviewChip>
          ) : null}
        </>
      }
    >
      {deal.companies?.name ? (
        <PreviewMetaRow iconName="building">
          {deal.companies.name}
        </PreviewMetaRow>
      ) : null}
      <PreviewMetaRow iconName="deals">
        {formatCrmPrice(deal.amount)}
      </PreviewMetaRow>
      {primaryContact?.contacts ? (
        <PreviewMetaRow iconName="person">
          {formatContactFullName(primaryContact.contacts)}
        </PreviewMetaRow>
      ) : null}
      {record.meta ? (
        <PreviewMetaRow iconName="note">{record.meta}</PreviewMetaRow>
      ) : null}
    </PreviewShell>
  );
}

function TaskPreview({ record }: { record: GlobalSearchRecord }) {
  const { data: task, isLoading } = useCrmTask(record.id);

  if (isLoading || !task) {
    return <PreviewSkeleton />;
  }

  return (
    <PreviewShell
      record={record}
      title={task.title}
      statusLabel="Task"
      chips={
        <>
          <PreviewChip>{record.badgeLabel}</PreviewChip>
          <PreviewChip tone="info">
            {formatCrmEnumLabel(task.status)}
          </PreviewChip>
          {task.due_date ? (
            <PreviewChip>Due {formatCrmDate(task.due_date)}</PreviewChip>
          ) : null}
        </>
      }
    >
      {task.deals?.address ? (
        <PreviewMetaRow iconName="deals">{task.deals.address}</PreviewMetaRow>
      ) : null}
      {task.contacts ? (
        <PreviewMetaRow iconName="person">
          {formatContactFullName(task.contacts)}
        </PreviewMetaRow>
      ) : null}
      {task.description ? (
        <PreviewMetaRow iconName="note">
          <span className="line-clamp-3 whitespace-pre-wrap">
            {task.description}
          </span>
        </PreviewMetaRow>
      ) : null}
      {!task.description && record.meta ? (
        <PreviewMetaRow iconName="note">{record.meta}</PreviewMetaRow>
      ) : null}
    </PreviewShell>
  );
}

function ThreadPreview({ record }: { record: GlobalSearchRecord }) {
  const { threads } = useThreadContext();
  const thread = threads.find((threadItem) => threadItem.id === record.id) ?? null;

  return (
    <PreviewShell
      record={record}
      title={thread?.title ?? record.title}
      statusLabel="Chat thread"
      chips={
        <>
          <PreviewChip>{record.badgeLabel}</PreviewChip>
          {thread?.sourceType ? (
            <PreviewChip tone="info">
              {formatCrmEnumLabel(thread.sourceType)}
            </PreviewChip>
          ) : null}
        </>
      }
    >
      <PreviewMetaRow iconName="chat">
        Open this thread to continue the conversation.
      </PreviewMetaRow>
      <PreviewMetaRow iconName="clock">
        Last activity {formatCrmDate(record.updatedAt)}
      </PreviewMetaRow>
      {record.meta ? (
        <PreviewMetaRow iconName="note">{record.meta}</PreviewMetaRow>
      ) : null}
    </PreviewShell>
  );
}

function SearchPreview({
  record,
  isLoading,
}: {
  record: GlobalSearchRecord | null;
  isLoading: boolean;
}) {
  if (isLoading && !record) {
    return <PreviewSkeleton />;
  }

  if (!record) {
      return (
      <div className="flex h-full items-center justify-center bg-background px-6 text-center">
        <div className="max-w-xs">
          <div className="mx-auto flex size-10 items-center justify-center rounded-2xl border border-border/60 bg-background shadow-xs">
            <Sparkles className="size-5 text-muted-foreground" />
          </div>
          <h3 className="mt-4 type-section-title">
            Start exploring records
          </h3>
          <p className="mt-2 type-empty-copy text-muted-foreground">
            Search contacts, companies, deals, tasks, and threads from one place.
          </p>
        </div>
      </div>
    );
  }

  switch (record.entityType) {
    case "company":
      return <CompanyPreview record={record} />;
    case "contact":
      return <ContactPreview record={record} />;
    case "deal":
      return <DealPreview record={record} />;
    case "task":
      return <TaskPreview record={record} />;
    case "thread":
      return <ThreadPreview record={record} />;
  }
}

export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  return (
    <CommandMenuContent
      key={open ? "command-open" : "command-closed"}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}

function CommandMenuContent({ open, onOpenChange }: CommandMenuProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: clientId } = useClientId();
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const debouncedQuery = useDebouncedValue(query, 180);
  const {
    data: records = [],
    isLoading,
    isError,
  } = useGlobalSearchRecords({ open, query: debouncedQuery });
  const activeSelectedKey = useMemo(() => {
    if (records.length === 0) {
      return "";
    }

    return records.some((record) => record.key === selectedKey)
      ? selectedKey
      : (records[0]?.key ?? "");
  }, [records, selectedKey]);

  const selectedRecord = useMemo(() => {
    if (records.length === 0) {
      return null;
    }

    return records.find((record) => record.key === activeSelectedKey) ?? records[0] ?? null;
  }, [activeSelectedKey, records]);

  useEffect(() => {
    if (open) {
      posthog.capture("command_menu_opened");
    }
  }, [open]);

  useEffect(() => {
    if (!clientId || typeof window === "undefined") {
      return;
    }

    const handleStorageUpdate = (event: Event) => {
      const detail =
        event instanceof CustomEvent
          ? (event.detail as { clientId?: string } | undefined)
          : undefined;

      if (detail?.clientId && detail.clientId !== clientId) {
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: ["global-search", clientId, ""],
      });
    };

    window.addEventListener("global-search-recents-updated", handleStorageUpdate);

    return () => {
      window.removeEventListener(
        "global-search-recents-updated",
        handleStorageUpdate,
      );
    };
  }, [clientId, queryClient]);

  const handleSelect = useCallback(
    (record: GlobalSearchRecord) => {
      trackRecentSearchRecord(clientId, record);
      if (clientId) {
        void queryClient.invalidateQueries({
          queryKey: ["global-search", clientId, ""],
        });
      }

      onOpenChange(false);
      setQuery("");
      setSelectedKey("");
      router.push(record.href);
    },
    [clientId, onOpenChange, queryClient, router],
  );

  const handleAskSunder = useCallback(() => {
    const trimmedQuery = query.trim();

    onOpenChange(false);
    setQuery("");
    setSelectedKey("");

    if (trimmedQuery.length === 0) {
      router.push("/chat");
      return;
    }

    const params = new URLSearchParams({
      prompt: trimmedQuery,
    });
    router.push(`/chat?${params.toString()}`);
  }, [onOpenChange, query, router]);

  const handleCommandMenuKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing) {
      return;
    }

    const isCommandShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
    if (isCommandShortcut) {
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
      return;
    }

    const isAskShortcut =
      event.key === "Tab"
      && !event.shiftKey
      && !event.altKey
      && !event.metaKey
      && !event.ctrlKey;

    if (!isAskShortcut) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleAskSunder();
  }, [handleAskSunder, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>Search records</DialogTitle>
        <DialogDescription>
          Search across contacts, companies, deals, tasks, and chat threads.
        </DialogDescription>
      </DialogHeader>

      <DialogContent
        showCloseButton={false}
        className={cn(
          "top-[10vh] w-[calc(100vw-2rem)] max-w-[832px] translate-y-0 overflow-hidden rounded-[24px] border border-border/65 bg-background p-0 shadow-2xl ring-0 sm:max-w-[832px]",
          "h-[min(544px,calc(100vh-4rem))]",
        )}
      >
        <CommandPrimitive
          value={activeSelectedKey}
          onValueChange={setSelectedKey}
          onKeyDown={handleCommandMenuKeyDown}
          shouldFilter={false}
          loop
          className="flex h-full min-h-0 flex-col"
        >
          <div className="flex items-center gap-3 border-b border-border/60 bg-background pl-4 pr-3 py-3">
            <CommandPrimitive.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search records..."
              className="min-w-0 flex-1 border-0 bg-transparent text-base font-normal text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={handleAskSunder}
              className="flex shrink-0 items-center gap-2 rounded-md px-2 py-1 text-caption text-muted-foreground transition-colors hover:text-foreground"
            >
              <span>Ask AI</span>
              <FooterKbd>Tab</FooterKbd>
            </button>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.03fr)_minmax(0,0.97fr)]">
            <div className="flex min-h-0 flex-col border-r border-border/60 bg-background">
              <div className="px-4 pb-2 pt-3 text-caption font-medium text-muted-foreground">
                Records
              </div>

              <CommandPrimitive.List className="min-h-0 flex-1 overflow-y-auto pb-3">
                {isError ? (
                  <div className="px-4 py-6 text-meta text-muted-foreground">
                    Unable to load search results right now.
                  </div>
                ) : null}

                {!isError && !isLoading && records.length === 0 ? (
                  <div className="px-4 py-6 text-meta text-muted-foreground">
                    {debouncedQuery.trim().length > 0
                      ? `No results for “${debouncedQuery.trim()}”.`
                      : "No recent records yet."}
                  </div>
                ) : null}

                {records.map((record) => (
                  <SearchResultItem
                    key={record.key}
                    record={record}
                    onSelect={handleSelect}
                  />
                ))}

                {isLoading ? (
                  <div className="flex items-center gap-2 px-4 py-3 text-caption text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    Loading records
                  </div>
                ) : null}
              </CommandPrimitive.List>
            </div>

            <div className="min-h-0 bg-background">
              <SearchPreview record={selectedRecord} isLoading={isLoading} />
            </div>
          </div>
        </CommandPrimitive>

        <div className="flex items-center justify-between border-t border-border/60 bg-background px-4 py-2.5">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <FooterKbd>↑</FooterKbd>
            <FooterKbd>↓</FooterKbd>
            <span className="ml-1 text-caption">Navigate</span>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!selectedRecord}
            onClick={() => {
              if (selectedRecord) {
                handleSelect(selectedRecord);
              }
            }}
            className="pl-3 pr-1.5"
          >
            <span>Open record</span>
            <span className="ml-1 inline-flex size-4 items-center justify-center rounded bg-primary-foreground/15 text-caption font-medium leading-none">
              ↵
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
