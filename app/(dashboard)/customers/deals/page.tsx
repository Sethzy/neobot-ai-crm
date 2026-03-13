/**
 * Unified customers deals workspace with table and board views.
 * @module app/(dashboard)/customers/deals/page
 */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { RefreshCw } from "@/components/icons/lucide-compat";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { DealKanbanCard } from "@/components/crm/deal-kanban-card";
import { DealStageMenu } from "@/components/crm/deal-stage-menu";
import { KanbanBoard } from "@/components/crm/kanban-board";
import { QuickEditCell } from "@/components/crm/quick-edit-cell";
import { ViewToggle } from "@/components/crm/view-toggle";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import type { DateRangeFilterValue, FilterDef, FilterValues } from "@/components/ui/filter-overlay";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { dealKeys, type DealWithContact, useDeals, usePaginatedDeals } from "@/hooks/use-deals";
import { useUpdateDeal } from "@/hooks/use-update-deal";
import { useViewPreference, type ViewType } from "@/hooks/use-view-preference";
import { dealStageValues, type Deal } from "@/lib/crm/schemas";
import { formatContactFullName, formatCrmDate, formatCrmEnumLabel, formatCrmPrice, formatDealStageLabel } from "@/lib/crm/display";
import { supabase } from "@/lib/supabase";

const pageSize = 20;

const pipelineSortOptions = {
  price_desc: "Price (high to low)",
  price_asc: "Price (low to high)",
  updated_desc: "Updated (newest first)",
  address_asc: "Address (A-Z)",
} as const;

type PipelineSortOption = keyof typeof pipelineSortOptions;

interface DealStageCellProps {
  dealId: string;
  stage: Deal["stage"];
  stages: string[];
}

interface DealPriceCellProps {
  dealId: string;
  price: number | null;
}

interface DealBoardCardProps {
  deal: DealWithContact;
  stages: string[];
}

function getDateRangeValue(value: unknown): DateRangeFilterValue | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const nextValue = value as DateRangeFilterValue;
  return nextValue.from || nextValue.to ? nextValue : undefined;
}

function getPrimaryContactLabel(deal: DealWithContact) {
  const primaryContact =
    deal.deal_contacts.find((dealContact) => dealContact.is_primary) ??
    deal.deal_contacts[0];

  return primaryContact?.contacts ? formatContactFullName(primaryContact.contacts) : "—";
}

function sortDealsByOption(sortBy: PipelineSortOption) {
  return (
    leftDeal: Pick<DealWithContact, "address" | "price" | "updated_at">,
    rightDeal: Pick<DealWithContact, "address" | "price" | "updated_at">,
  ) => {
    if (sortBy === "price_desc") {
      return (rightDeal.price ?? Number.NEGATIVE_INFINITY) - (leftDeal.price ?? Number.NEGATIVE_INFINITY);
    }

    if (sortBy === "price_asc") {
      return (leftDeal.price ?? Number.POSITIVE_INFINITY) - (rightDeal.price ?? Number.POSITIVE_INFINITY);
    }

    if (sortBy === "address_asc") {
      return leftDeal.address.localeCompare(rightDeal.address);
    }

    return new Date(rightDeal.updated_at).getTime() - new Date(leftDeal.updated_at).getTime();
  };
}

function normalizeDealsView(rawView: string | null): ViewType | null {
  if (rawView === "table") {
    return "table";
  }

  if (rawView === "board" || rawView === "kanban") {
    return "kanban";
  }

  return null;
}

function buildDealsHref(searchParams: URLSearchParams | null, nextView: ViewType): string {
  const nextSearchParams = new URLSearchParams(searchParams?.toString() ?? "");

  if (nextView === "kanban") {
    nextSearchParams.set("view", "kanban");
  } else {
    nextSearchParams.delete("view");
  }

  const nextQuery = nextSearchParams.toString();
  return nextQuery.length > 0 ? `/customers/deals?${nextQuery}` : "/customers/deals";
}

function DealStageCell({ dealId, stage, stages }: DealStageCellProps) {
  const updateDeal = useUpdateDeal(dealId);

  return (
    <QuickEditCell
      ariaLabel="Stage"
      value={stage}
      displayValue={formatDealStageLabel(stage)}
      type="select"
      options={stages.map((nextStage) => ({
        value: nextStage,
        label: formatCrmEnumLabel(nextStage),
      }))}
      onSave={async (nextValue) => {
        await updateDeal.mutateAsync({ stage: nextValue as Deal["stage"] });
      }}
    />
  );
}

function DealPriceCell({ dealId, price }: DealPriceCellProps) {
  const updateDeal = useUpdateDeal(dealId);

  return (
    <QuickEditCell
      ariaLabel="Price"
      value={price}
      displayValue={formatCrmPrice(price)}
      type="number"
      onSave={async (nextValue) => {
        await updateDeal.mutateAsync({
          price: typeof nextValue === "number" ? nextValue : null,
        });
      }}
    />
  );
}

function DealBoardCard({ deal, stages }: DealBoardCardProps) {
  const updateDeal = useUpdateDeal(deal.deal_id);

  return (
    <DealKanbanCard
      deal={deal}
      footer={
        <DealStageMenu
          currentStage={deal.stage}
          stages={stages}
          onChange={async (nextStage) => {
            try {
              await updateDeal.mutateAsync({ stage: nextStage as Deal["stage"] });
            } catch (error) {
              toast.error("Unable to update deal stage.");
              throw error;
            }
          }}
        />
      }
    />
  );
}

export default function DealsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: crmConfigResult } = useCrmConfig();
  const { view, setView } = useViewPreference("deals");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<PipelineSortOption>("price_desc");
  const [filterValues, setFilterValues] = useState<FilterValues>(() => {
    const stageQuery = searchParams?.get("stage")?.trim();

    return stageQuery ? { stage: stageQuery } : {};
  });

  const rawViewParam = searchParams?.get("view") ?? null;
  const queryView = normalizeDealsView(rawViewParam);
  const activeView = queryView ?? (view === "kanban" ? "kanban" : "table");

  useEffect(() => {
    if (!queryView) {
      return;
    }

    if (queryView !== view) {
      setView(queryView);
    }

    if (rawViewParam === "board") {
      router.replace(buildDealsHref(searchParams, "kanban"));
    }
  }, [queryView, rawViewParam, router, searchParams, setView, view]);

  const stages = useMemo(
    () => crmConfigResult?.config.deal_stages ?? [...dealStageValues],
    [crmConfigResult?.config.deal_stages],
  );

  const filters = useMemo<FilterDef[]>(
    () => [
      {
        id: "stage",
        label: "Stage",
        type: "select",
        options: stages.map((stage) => ({
          value: stage,
          label: formatCrmEnumLabel(stage),
        })),
      },
      { id: "createdAt", label: "Created At", type: "dateRange" },
    ],
    [stages],
  );

  const sharedFilters = useMemo(
    () => ({
      search: search.trim() || undefined,
      stage: typeof filterValues.stage === "string" ? (filterValues.stage as Deal["stage"]) : undefined,
      createdAt: getDateRangeValue(filterValues.createdAt),
    }),
    [filterValues.createdAt, filterValues.stage, search],
  );

  const tableFilters = useMemo(
    () => ({
      ...sharedFilters,
      page,
      pageSize,
    }),
    [page, sharedFilters],
  );

  const {
    data: tableData,
    isLoading: isTableLoading,
    isError: isTableError,
    refetch: refetchTable,
  } = usePaginatedDeals(tableFilters, { enabled: activeView === "table" });
  const {
    data: boardData = [],
    isLoading: isBoardLoading,
    isError: isBoardError,
    refetch: refetchBoard,
  } = useDeals(sharedFilters, { enabled: activeView === "kanban" });

  const deleteDeal = useMutation({
    mutationFn: async ({ dealId }: { dealId: string }) => {
      const { error } = await supabase.from("deals").delete().eq("deal_id", dealId);

      if (error) {
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dealKeys.all });
      toast.success("Deal deleted.");
    },
    onError: () => {
      toast.error("Unable to delete this deal.");
    },
  });

  const tableRows = tableData?.rows ?? [];
  const sortedBoardDeals = useMemo(
    () => [...boardData].sort(sortDealsByOption(sortBy)),
    [boardData, sortBy],
  );

  const columns = useMemo<ColumnDef<DealWithContact>[]>(
    () => [
      {
        accessorKey: "address",
        header: "Address",
        cell: ({ row }) => (
          <Link
            href={`/customers/deals/${row.original.deal_id}`}
            className="block max-w-[250px] truncate font-medium text-foreground hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {row.original.address}
          </Link>
        ),
      },
      {
        accessorKey: "stage",
        header: "Stage",
        cell: ({ row }) => (
          <DealStageCell
            dealId={row.original.deal_id}
            stage={row.original.stage}
            stages={stages}
          />
        ),
      },
      {
        accessorKey: "price",
        header: "Price",
        cell: ({ row }) => (
          <DealPriceCell dealId={row.original.deal_id} price={row.original.price} />
        ),
      },
      {
        id: "contact",
        accessorFn: (row) => getPrimaryContactLabel(row),
        header: "Contact",
        enableSorting: false,
      },
      {
        id: "company",
        accessorFn: (row) => row.companies?.name ?? "",
        header: "Company",
        enableSorting: false,
      },
      {
        accessorKey: "updated_at",
        header: "Updated",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {formatCrmDate(row.original.updated_at)}
          </span>
        ),
      },
    ],
    [stages],
  );

  const stageColumns = useMemo(
    () =>
      stages.map((stage) => ({
        key: stage,
        label: formatDealStageLabel(stage as Deal["stage"]),
      })),
    [stages],
  );

  const isBoardView = activeView === "kanban";
  const activeRefetch = isBoardView ? refetchBoard : refetchTable;

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div className="space-y-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Deals</h1>
              <p className="text-sm text-muted-foreground">
                {isBoardView
                  ? "Track the pipeline and move deals forward from the board."
                  : "Track the pipeline and update deal progress in place."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isBoardView ? (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Sort by</span>
                  <select
                    aria-label="Sort deals"
                    className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value as PipelineSortOption)}
                  >
                    {Object.entries(pipelineSortOptions).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Refresh deals"
                onClick={() => void activeRefetch()}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <ViewToggle current={activeView} views={["table", "kanban"]} onChange={(nextView) => {
                setView(nextView);
                router.replace(buildDealsHref(searchParams, nextView));
              }} />
            </div>
          </div>

          <FilterBar
            searchValue={search}
            onSearchChange={(value) => {
              setPage(1);
              setSearch(value);
            }}
            searchPlaceholder="Search deals..."
            filters={filters}
            values={filterValues}
            onApply={(nextValues) => {
              setPage(1);
              setFilterValues(nextValues);
            }}
            onClear={() => {
              setPage(1);
              setFilterValues({});
            }}
          />
        </div>

        {isBoardView ? (
          isBoardLoading ? (
            <div className="grid gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-64 animate-pulse rounded-lg border border-border bg-card" />
              ))}
            </div>
          ) : isBoardError ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6">
              <p className="text-sm text-destructive">Unable to load pipeline data.</p>
            </div>
          ) : sortedBoardDeals.length === 0 ? (
            <EmptyState
              iconName="deals"
              title={search.trim() || Object.keys(filterValues).length > 0 ? "No results match your filters" : "No deals yet"}
              description={search.trim() || Object.keys(filterValues).length > 0
                ? "Try adjusting or clearing your filters."
                : "Your AI agent will create deals as it processes conversations."}
            />
          ) : (
            <KanbanBoard
              boardLabel="By Stage"
              items={sortedBoardDeals}
              columns={stageColumns}
              groupBy={(deal) => deal.stage}
              getItemId={(deal) => deal.deal_id}
              renderCard={(deal) => <DealBoardCard deal={deal} stages={stages} />}
              onCardClick={(dealId) => router.push(`/customers/deals/${dealId}`)}
              emptyStateMessage="No deals in this stage yet."
            />
          )
        ) : (
          <DataTable
            columns={columns}
            data={tableRows}
            isLoading={isTableLoading}
            error={isTableError ? <span>Unable to load deals.</span> : null}
            emptyState={(
              <EmptyState
                iconName="deals"
                title={search.trim() || Object.keys(filterValues).length > 0 ? "No results match your filters" : "No deals yet"}
                description={search.trim() || Object.keys(filterValues).length > 0
                  ? "Try adjusting or clearing your filters."
                  : "Your AI agent will create deals as it processes conversations."}
              />
            )}
            pagination={tableData
              ? {
                  page: tableData.page,
                  pageSize: tableData.pageSize,
                  total: tableData.total,
                  totalPages: tableData.totalPages,
                  onPageChange: setPage,
                }
              : undefined}
            rowActions={(row) => [
              { id: "view", label: "View", href: `/customers/deals/${row.deal_id}` },
              {
                id: "open",
                label: "Open in New Tab",
                href: `/customers/deals/${row.deal_id}`,
                newTab: true,
              },
              {
                id: "delete",
                label: "Delete",
                destructive: true,
                onSelect: () => {
                  if (!window.confirm(`Delete ${row.address}? This cannot be undone.`)) {
                    return;
                  }

                  deleteDeal.mutate({ dealId: row.deal_id });
                },
              },
            ]}
            onRowClick={(row) => router.push(`/customers/deals/${row.deal_id}`)}
          />
        )}
      </div>
    </div>
  );
}
