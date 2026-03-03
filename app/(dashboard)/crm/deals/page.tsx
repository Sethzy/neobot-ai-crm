/**
 * CRM deals list page with search and read-only table.
 * @module app/(dashboard)/crm/deals/page
 */
"use client";

import { Handshake, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { DealsTable } from "@/components/crm/deals-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeals } from "@/hooks/use-deals";

export default function DealsPage() {
  const [search, setSearch] = useState("");

  const filters = useMemo(() => {
    const normalizedSearch = search.trim();

    return {
      search: normalizedSearch.length > 0 ? normalizedSearch : undefined,
    };
  }, [search]);

  const { data: deals = [], isLoading, isError, refetch } = useDeals(filters);

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Deals</h1>
        <p className="mt-2 text-sm text-muted-foreground/80">
          Browse and inspect deals created by your AI agent.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search deals by address or notes..."
            className="h-12 w-full border-border/50 pl-11 shadow-sm focus-visible:ring-1"
          />
        </div>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-14 rounded-lg bg-muted/30" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6">
            <p className="text-sm text-destructive">Unable to load deals</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                void refetch();
              }}
            >
              Retry
            </Button>
          </div>
        ) : deals.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card p-10 text-center shadow-sm md:p-20">
            <Handshake className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-6 text-muted-foreground">
              {filters.search ? "No deals match your search" : "No deals yet"}
            </p>
          </div>
        ) : (
          <DealsTable deals={deals} />
        )}
      </div>
    </div>
  );
}
