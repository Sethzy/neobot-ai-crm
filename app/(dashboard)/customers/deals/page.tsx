/**
 * Unified customers deals workspace with table and board views.
 * @module app/(dashboard)/customers/deals/page
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Handshake, Plus } from "lucide-react";
import posthog from "posthog-js";

import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { CrmListPanelLayout } from "@/components/crm/crm-list-panel-layout";
import { DealKanbanCard } from "@/components/crm/deal-kanban-card";
import { KanbanBoard } from "@/components/crm/kanban-board";
import { QuickEditCell } from "@/components/crm/quick-edit-cell";
import { DealDrawerContent } from "@/components/crm/record-drawer/deal-drawer-content";
import { ViewToggle } from "@/components/crm/view-toggle";
import { Button } from "@/components/ui/button";

import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import type { DateRangeFilterValue, FilterDef, FilterValues } from "@/components/ui/filter-overlay";
import { useClientId } from "@/hooks/use-client-id";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { useRecordDrawer } from "@/hooks/use-record-drawer";
import { dealKeys, type DealWithContact, useDeals, usePaginatedDeals } from "@/hooks/use-deals";
import { useUpdateDeal } from "@/hooks/use-update-deal";
import { useViewPreference, type ViewType } from "@/hooks/use-view-preference";
import { buildColumnsFromConfig } from "@/lib/crm/build-columns";
import { matchVocabularyValue } from "@/lib/crm/config";
import { DEAL_DEFAULT_FIELDS } from "@/lib/crm/field-definitions";
import { dealStageValues, type Deal } from "@/lib/crm/schemas";
import {
  formatCompactCurrency,
  formatContactFullName,
  formatCrmDate,
  formatCrmEnumLabel,
  formatCrmPrice,
  formatDealStageLabel,
  getDealStageToneClass,
  getDealStageTopBorderClass,
} from "@/lib/crm/display";
import { supabase } from "@/lib/supabase";

const pageSize = 20;

const pipelineSortOptions = {
  amount_desc: "Price (high to low)",
  amount_asc: "Price (low to high)",
  updated_desc: "Updated (newest first)",
  address_asc: "Address (A-Z)",
} as const;

type PipelineSortOption = keyof typeof pipelineSortOptions;

interface DealStageCellProps {
  dealId: string;
  stage: Deal["stage"];
  stages: string[];
}

interface DealAmountCellProps {
  dealId: string;
  amount: number | null;
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

  return primaryContact?.contacts ? formatContactFullName(primaryContact.contacts) : "";
}

function sortDealsByOption(sortBy: PipelineSortOption) {
  return (
    leftDeal: Pick<DealWithContact, "address" | "amount" | "updated_at">,
    rightDeal: Pick<DealWithContact, "address" | "amount" | "updated_at">,
  ) => {
    if (sortBy === "amount_desc") {
      return (rightDeal.amount ?? Number.NEGATIVE_INFINITY) - (leftDeal.amount ?? Number.NEGATIVE_INFINITY);
    }

    if (sortBy === "amount_asc") {
      return (leftDeal.amount ?? Number.POSITIVE_INFINITY) - (rightDeal.amount ?? Number.POSITIVE_INFINITY);
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

function DealAmountCell({ dealId, amount }: DealAmountCellProps) {
  const updateDeal = useUpdateDeal(dealId);

  return (
    <QuickEditCell
      ariaLabel="Price"
      value={amount}
      displayValue={formatCrmPrice(amount)}
      type="number"
      onSave={async (nextValue) => {
        await updateDeal.mutateAsync({
          amount: typeof nextValue === "number" ? nextValue : null,
        });
      }}
    />
  );
}

export default function DealsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { recordId, open } = useRecordDrawer();
  const queryClient = useQueryClient();
  const { data: clientId } = useClientId();
  const { data: crmConfigResult } = useCrmConfig();
  const { view, setView } = useViewPreference("deals");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<PipelineSortOption>("amount_desc");
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
  } = usePaginatedDeals(tableFilters, { enabled: activeView === "table" });
  const {
    data: boardData = [],
    isLoading: isBoardLoading,
    isError: isBoardError,
  } = useDeals(sharedFilters, { enabled: activeView === "kanban" });

  const createDeal = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("deals")
        .insert({ client_id: clientId, address: "Untitled Deal", stage: stages[0] })
        .select("deal_id")
        .single();
      if (error) throw error;
      return data.deal_id;
    },
    onSuccess: async (dealId: string) => {
      await queryClient.invalidateQueries({ queryKey: dealKeys.all });
      open(dealId);
    },
    onError: () => {
      toast.error("Unable to create deal.");
    },
  });

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

  const updateDealStage = useMutation({
    mutationFn: async ({
      dealId,
      fromStage,
      toStage,
    }: {
      dealId: string;
      fromStage: string;
      toStage: string;
    }) => {
      const { error } = await supabase
        .from("deals")
        .update({ stage: toStage })
        .eq("deal_id", dealId);

      if (error) {
        throw error;
      }

      posthog.capture("deal_stage_changed", {
        from_stage: fromStage,
        to_stage: toStage,
        deal_value: boardData.find((deal) => deal.deal_id === dealId)?.amount ?? null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dealKeys.all });
    },
    onError: () => {
      toast.error("Unable to update deal stage.");
    },
  });

  const tableRows = tableData?.rows ?? [];
  const sortedBoardDeals = useMemo(
    () => [...boardData].sort(sortDealsByOption(sortBy)),
    [boardData, sortBy],
  );
  const handleBoardColumnChange = useCallback(
    async (dealId: string, fromStage: string, toStage: string) => {
      await updateDealStage.mutateAsync({
        dealId,
        fromStage,
        toStage,
      });
    },
    [updateDealStage],
  );

  /**
   * Build columns from the config-driven field definition array, then override
   * specific keys with the existing rich cell renderers.
   *
   * Field key mapping notes:
   * - `name`        → renders as the deal address link (deals use `address` as display name)
   * - `amount`      → maps to the `amount` DB column via DealAmountCell
   * - `stage`       → DealStageCell with inline quick-edit
   * - `company_id`  → reads from the joined `companies` object
   * - `point_of_contact` → reads from `deal_contacts` join as primary contact label
   * - `address`     → plain text (secondary address field)
   * - `updated_at`  → formatted date
   */
  const crmConfig = crmConfigResult?.config;
  const columns = useMemo<ColumnDef<DealWithContact>[]>(() => {
    const dealFields = crmConfig?.deal_fields ?? DEAL_DEFAULT_FIELDS;
    const base = buildColumnsFromConfig<DealWithContact>(dealFields, "deals");

    return base.map((col) => {
      switch (col.id) {
        case "name":
          /** The deal "name" field renders the address as the primary link. */
          return {
            ...col,
            accessorFn: (row: DealWithContact) => row.address,
            cell: ({ row }: { row: { original: DealWithContact } }) => (
              <button
                type="button"
                className="block max-w-[250px] truncate font-medium text-foreground hover:underline"
                onClick={(event) => {
                  event.stopPropagation();
                  open(row.original.deal_id);
                }}
              >
                {row.original.address}
              </button>
            ),
          };
        case "amount":
          /** `amount` in field definitions maps to the `amount` column in the DB. */
          return {
            ...col,
            accessorFn: (row: DealWithContact) => row.amount,
            cell: ({ row }: { row: { original: DealWithContact } }) => (
              <DealAmountCell dealId={row.original.deal_id} amount={row.original.amount} />
            ),
          };
        case "stage":
          return {
            ...col,
            cell: ({ row }: { row: { original: DealWithContact } }) => (
              <DealStageCell
                dealId={row.original.deal_id}
                stage={row.original.stage}
                stages={stages}
              />
            ),
          };
        case "company_id":
          return {
            ...col,
            accessorFn: (row: DealWithContact) => row.companies?.name ?? "",
            enableSorting: false,
            cell: undefined,
          };
        case "point_of_contact":
          return {
            ...col,
            accessorFn: (row: DealWithContact) => getPrimaryContactLabel(row),
            enableSorting: false,
            cell: undefined,
          };
        case "address":
          /** Secondary address field — plain text, no link override needed. */
          return col;
        case "updated_at":
          return {
            ...col,
            cell: ({ row }: { row: { original: DealWithContact } }) => (
              <span className="whitespace-nowrap text-muted-foreground">
                {formatCrmDate(row.original.updated_at)}
              </span>
            ),
          };
        default:
          return col;
      }
    });
  }, [crmConfig, open, stages]);

  const stageColumns = useMemo(
    () =>
      stages.map((stage) => ({
        key: stage,
        label: formatDealStageLabel(stage as Deal["stage"]),
        toneClassName: getDealStageToneClass(stage),
        topBorderClassName: getDealStageTopBorderClass(stage),
      })),
    [stages],
  );

  /** Maps a raw deal.stage value to the matching config key, tolerating case/delimiter differences. */
  const matchStageToConfigKey = useCallback(
    (rawStage: string) => matchVocabularyValue(rawStage, stages),
    [stages],
  );

  const getColumnSummary = useCallback(
    (_columnKey: string, columnItems: DealWithContact[]) => {
      const total = columnItems.reduce((sum, deal) => sum + (deal.amount ?? 0), 0);
      return total > 0 ? formatCompactCurrency(total) : undefined;
    },
    [],
  );

  const isBoardView = activeView === "kanban";
  return (
    <CrmListPanelLayout
      objectType="deal"
      icon={<Handshake className="h-4 w-4 text-muted-foreground" />}
      title="Deals"
      bodyClassName="space-y-6"
      headerActions={
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
          <ViewToggle current={activeView} views={["table", "kanban"]} onChange={(nextView) => {
            setView(nextView);
            router.replace(buildDealsHref(searchParams, nextView));
          }} />
          <Button size="sm" onClick={() => createDeal.mutate()} disabled={!clientId || createDeal.isPending}>
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>
      }
      renderPanelContent={(id, { closeButton }) => (
        <DealDrawerContent key={id} dealId={id} closeButton={closeButton} />
      )}
    >
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
              groupBy={(deal) => matchStageToConfigKey(deal.stage)}
              getItemId={(deal) => deal.deal_id}
              getColumnSummary={getColumnSummary}
              renderCard={(deal) => <DealKanbanCard deal={deal} />}
              onCardClick={(dealId) => open(dealId)}
              onColumnChange={handleBoardColumnChange}
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
              { id: "view", label: "View", onSelect: () => open(row.deal_id) },
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
            onRowClick={(row) => open(row.deal_id)}
            selectedRowId={recordId ?? undefined}
            getRowId={(row) => row.deal_id}
            />
          )}
    </CrmListPanelLayout>
  );
}
