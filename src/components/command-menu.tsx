/**
 * Global command menu for quick search across CRM records and chat threads.
 * @module components/command-menu
 */
"use client";

import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppIcon, type AppIconName } from "@/components/icons/app-icons";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useSearchRecords, type SearchResult } from "@/hooks/use-search-records";

interface CommandMenuProps {
  /** Whether the command menu dialog is open. */
  open: boolean;
  /** Callback used to toggle dialog open state. */
  onOpenChange: (open: boolean) => void;
}

const typeIconMap: Record<SearchResult["type"], AppIconName> = {
  contact: "contacts",
  deal: "deals",
  task: "tasks",
  thread: "chat",
};

const typeLabelMap: Record<SearchResult["type"], string> = {
  contact: "Contacts",
  deal: "Deals",
  task: "Tasks",
  thread: "Threads",
};

const typeRouteMap: Record<SearchResult["type"], (id: string) => string> = {
  contact: (id) => `/customers/people/${id}`,
  deal: (id) => `/customers/deals/${id}`,
  task: (id) => `/tasks?detail=${id}`,
  thread: (id) => `/chat/${id}`,
};

export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  return <CommandMenuContent key={open ? "command-open" : "command-closed"} open={open} onOpenChange={onOpenChange} />;
}

function CommandMenuContent({ open, onOpenChange }: CommandMenuProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const { data: results = [], isLoading, isError } = useSearchRecords(debouncedQuery);
  const hasActiveQuery = query.trim().length >= 2;

  useEffect(() => {
    if (!open) {
      return;
    }

    posthog.capture("command_menu_opened");
  }, [open]);

  const groupedResults = useMemo(() => {
    const groups = new Map<SearchResult["type"], SearchResult[]>();
    for (const result of results) {
      const groupedItems = groups.get(result.type) ?? [];
      groupedItems.push(result);
      groups.set(result.type, groupedItems);
    }
    return groups;
  }, [results]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      onOpenChange(false);
      setQuery("");
      router.push(typeRouteMap[result.type](result.id));
    },
    [onOpenChange, router],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" showCloseButton={false}>
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search contacts, deals, tasks, threads..."
          value={query}
          onValueChange={setQuery}
        />

        <CommandList>
          {hasActiveQuery && debouncedQuery.length >= 2 && isError ? (
            <CommandEmpty>Unable to search right now. Please try again.</CommandEmpty>
          ) : null}

          {hasActiveQuery && debouncedQuery.length >= 2 && !isError && !isLoading && results.length === 0 ? (
            <CommandEmpty>No results for &ldquo;{debouncedQuery}&rdquo;</CommandEmpty>
          ) : null}

          {hasActiveQuery
            ? (["contact", "deal", "task", "thread"] as const).map((type) => {
                const items = groupedResults.get(type);
                if (!items?.length) {
                  return null;
                }

                return (
                  <CommandGroup key={type} heading={typeLabelMap[type]}>
                    {items.map((result) => {
                      return (
                        <CommandItem key={`${type}-${result.id}`} onSelect={() => handleSelect(result)}>
                          <AppIcon
                            name={typeIconMap[type]}
                            className="mr-2 h-4 w-4 text-muted-foreground"
                          />
                          <span>{result.title}</span>
                          {result.subtitle ? (
                            <span className="ml-2 text-xs text-muted-foreground">{result.subtitle}</span>
                          ) : null}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                );
              })
            : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
