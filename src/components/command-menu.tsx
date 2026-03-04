/**
 * Global command menu for quick search across CRM records and chat threads.
 * @module components/command-menu
 */
"use client";

import { CheckSquare, Handshake, MessageCircle, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ElementType } from "react";

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

const typeIconMap: Record<SearchResult["type"], ElementType> = {
  contact: User,
  deal: Handshake,
  task: CheckSquare,
  thread: MessageCircle,
};

const typeLabelMap: Record<SearchResult["type"], string> = {
  contact: "Contacts",
  deal: "Deals",
  task: "Tasks",
  thread: "Threads",
};

const typeRouteMap: Record<SearchResult["type"], (id: string) => string> = {
  contact: (id) => `/crm/contacts?detail=${id}`,
  deal: (id) => `/crm/deals?detail=${id}`,
  task: (id) => `/tasks?detail=${id}`,
  thread: (id) => `/chat/${id}`,
};

export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const { data: results = [], isLoading } = useSearchRecords(debouncedQuery);

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
          {debouncedQuery.length >= 2 && !isLoading && results.length === 0 ? (
            <CommandEmpty>No results for &ldquo;{debouncedQuery}&rdquo;</CommandEmpty>
          ) : null}

          {(["contact", "deal", "task", "thread"] as const).map((type) => {
            const items = groupedResults.get(type);
            if (!items?.length) {
              return null;
            }

            return (
              <CommandGroup key={type} heading={typeLabelMap[type]}>
                {items.map((result) => {
                  const Icon = typeIconMap[type];

                  return (
                    <CommandItem key={`${type}-${result.id}`} onSelect={() => handleSelect(result)}>
                      <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                      <span>{result.title}</span>
                      {result.subtitle ? (
                        <span className="ml-2 text-xs text-muted-foreground">{result.subtitle}</span>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            );
          })}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
