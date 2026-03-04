/**
 * CRM deals list page with search and read-only table.
 * @module app/(dashboard)/crm/deals/page
 */
"use client";

import { Handshake, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { CalendarGrid } from "@/components/crm/calendar-grid";
import { DealKanbanCard } from "@/components/crm/deal-kanban-card";
import { DealsTable } from "@/components/crm/deals-table";
import { KanbanBoard } from "@/components/crm/kanban-board";
import { RecordDrawer } from "@/components/crm/record-drawer";
import { dealStageLabelMap } from "@/components/crm/stage-badge";
import { ViewToggle } from "@/components/crm/view-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeals } from "@/hooks/use-deals";
import { useRecordDrawer } from "@/hooks/use-record-drawer";
import { useViewPreference } from "@/hooks/use-view-preference";
import { dealStageValues } from "@/lib/crm/schemas";

export default function DealsPage() {
  const [search, setSearch] = useState("");
  const { isOpen, recordId, open, close } = useRecordDrawer();
  const { view, setView } = useViewPreference("deals");

  const filters = useMemo(() => {
    const normalizedSearch = search.trim();

    return {
      search: normalizedSearch.length > 0 ? normalizedSearch : undefined,
    };
  }, [search]);

  const { data: deals = [], isLoading, isError, refetch } = useDeals(filters);
  const firstDealDate = deals[0] ? new Date(deals[0].updated_at) : undefined;

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

        <ViewToggle current={view} views={["table", "kanban", "calendar"]} onChange={setView} />
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
        ) : view === "table" ? (
          <DealsTable deals={deals} onRowClick={open} />
        ) : view === "kanban" ? (
          <KanbanBoard
            items={deals}
            columns={dealStageValues.map((stage) => ({ key: stage, label: dealStageLabelMap[stage] }))}
            groupBy={(deal) => deal.stage}
            getItemId={(deal) => deal.deal_id}
            renderCard={(deal) => <DealKanbanCard deal={deal} />}
            onCardClick={open}
          />
        ) : (
          <CalendarGrid
            items={deals}
            getDate={(deal) => new Date(deal.updated_at)}
            getItemId={(deal) => deal.deal_id}
            renderItem={(deal) => <DealKanbanCard deal={deal} />}
            initialMonth={firstDealDate}
            onItemClick={open}
          />
        )}
      </div>

      <RecordDrawer isOpen={isOpen} recordId={recordId} objectType="deal" onClose={close} />
    </div>
  );
}
