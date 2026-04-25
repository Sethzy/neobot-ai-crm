/**
 * Unified customers deals workspace with table and board views.
 * @module app/(dashboard)/customers/deals/page
 */
"use client";

import { memo, useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import dynamic from "next/dynamic";
import posthog from "posthog-js";

import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { applyViewColumns } from "@/components/crm/apply-view-columns";
import type { KanbanBoardProps } from "@/components/crm/kanban-board";
import {
  BooleanQuickEditCell,
  NumberQuickEditCell,
  SelectQuickEditCell,
  TextQuickEditCell,
} from "@/components/crm/crm-inline-cells";
import { CrmWorkspaceShell } from "@/components/crm/crm-workspace-shell";
import { DealKanbanCard } from "@/components/crm/deal-kanban-card";
import { MobileRecordCard } from "@/components/crm/mobile-record-card";
import { RecordLinkCell } from "@/components/crm/record-link-cell";
import { RecordDrawer } from "@/components/crm/record-drawer";
import { useActiveCrmViewState } from "@/components/crm/use-active-crm-view-state";
import { useCrmListRouteState } from "@/components/crm/use-crm-list-route-state";
import { useRecordOpenBehavior } from "@/components/crm/use-record-open-behavior";
import { Button } from "@/components/ui/button";

import { ListTable } from "@/components/ui/list-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { DateRangeFilterValue, FilterDef, FilterValues } from "@/components/ui/filter-overlay";
import { useClientId } from "@/hooks/use-client-id";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { useCrmViews } from "@/hooks/use-crm-views";
import { useRecordDrawer } from "@/hooks/use-record-drawer";
import { useUpdateFieldWidth } from "@/hooks/use-update-field-width";
import { EMPTY_COMPANY_FILTERS, useCompanies, type CompanyWithCounts } from "@/hooks/use-companies";
import { dealKeys, type DealWithContact, useDeals, usePaginatedDeals } from "@/hooks/use-deals";
import { useUpdateDeal } from "@/hooks/use-update-deal";
import { useViewPreference, type ViewType } from "@/hooks/use-view-preference";
import { buildColumnsFromConfig } from "@/lib/crm/build-columns";
import { matchVocabularyValue, type CustomFieldDefinition } from "@/lib/crm/config";
import {
  getBooleanCustomFields,
  getCustomFieldFilterKeys,
  pickBooleanCustomFieldFilters,
} from "@/lib/crm/custom-field-filters";
import { DEAL_DEFAULT_FIELDS } from "@/lib/crm/field-definitions";
import { dealStageValues, type Deal } from "@/lib/crm/schemas";
import { captureTimelineActivity } from "@/lib/crm/timeline-capture";
import { timelineActivityKeys } from "@/hooks/use-unified-timeline";
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
import { captureRecordCacheSnapshot, removeCachedRecord, restoreRecordCacheSnapshot } from "@/hooks/crm-cache-updates";

const pageSize = 20;

function DealViewLoading() {
  return (
    <div className="h-48 animate-pulse rounded-md border border-app-border-subtle bg-app-surface" />
  );
}

const KanbanBoard = dynamic<KanbanBoardProps<DealWithContact>>(
  () =>
    import("@/components/crm/kanban-board").then(
      (module) =>
        module.KanbanBoard as ComponentType<KanbanBoardProps<DealWithContact>>,
    ),
  { loading: () => <DealViewLoading /> },
);

interface DealStageCellProps {
  dealId: string;
  stage: Deal["stage"];
  stages: string[];
}

interface DealAmountCellProps {
  dealId: string;
  amount: number | null;
}

interface DealAddressCellProps {
  dealId: string;
  address: string;
}

interface DealCompanyCellProps {
  dealId: string;
  companyId: string | null;
  company: DealWithContact["companies"];
  companies: CompanyWithCounts[];
}

interface DealBooleanCustomFieldCellProps {
  dealId: string;
  definition: Pick<CustomFieldDefinition, "key" | "label">;
  value: unknown;
}

const noCompanyOptionValue = "__none__";

/**
 * Builds the company picker options list, preserving the currently linked
 * company even when it's missing from the live company fetch.
 */
function buildDealCompanyOptions(
  companies: CompanyWithCounts[],
  currentCompany: DealWithContact["companies"],
) {
  const nextOptions = companies.map((company) => ({
    value: company.company_id,
    label: company.name,
  }));

  if (
    currentCompany?.company_id
    && !nextOptions.some((option) => option.value === currentCompany.company_id)
  ) {
    nextOptions.push({
      value: currentCompany.company_id,
      label: currentCompany.name,
    });
  }

  return [
    { value: noCompanyOptionValue, label: "No company" },
    ...nextOptions.sort((left, right) => left.label.localeCompare(right.label)),
  ];
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

function compareDealsByAmountDesc(
  leftDeal: Pick<DealWithContact, "amount">,
  rightDeal: Pick<DealWithContact, "amount">,
) {
  return (
    (rightDeal.amount ?? Number.NEGATIVE_INFINITY)
    - (leftDeal.amount ?? Number.NEGATIVE_INFINITY)
  );
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

const DealStageCell = memo(function DealStageCell({ dealId, stage, stages }: DealStageCellProps) {
  const { mutateAsync: updateDealAsync } = useUpdateDeal(dealId);
  const stageOptions = useMemo(
    () =>
      stages.map((nextStage) => ({
        value: nextStage,
        label: formatCrmEnumLabel(nextStage),
      })),
    [stages],
  );
  const handleSaveStage = useCallback(
    async (nextValue: string | number | boolean | null) => {
      await updateDealAsync({ stage: nextValue as Deal["stage"] });
    },
    [updateDealAsync],
  );

  return (
    <SelectQuickEditCell
      ariaLabel="Stage"
      value={stage}
      displayValue={formatDealStageLabel(stage)}
      options={stageOptions}
      onSave={handleSaveStage}
    />
  );
});

const DealAmountCell = memo(function DealAmountCell({ dealId, amount }: DealAmountCellProps) {
  const { mutateAsync: updateDealAsync } = useUpdateDeal(dealId);
  const displayValue = useMemo(() => formatCrmPrice(amount), [amount]);
  const handleSaveAmount = useCallback(
    async (nextValue: string | number | boolean | null) => {
      await updateDealAsync({
        amount: typeof nextValue === "number" ? nextValue : null,
      });
    },
    [updateDealAsync],
  );

  return (
    <NumberQuickEditCell
      ariaLabel="Price"
      value={amount}
      displayValue={displayValue}
      onSave={handleSaveAmount}
    />
  );
});

/**
 * Inline editor for the deal's secondary address field. The primary column
 * (Name / address) opens the record drawer, so this sits alongside it for
 * quick corrections without leaving the list.
 */
const DealAddressCell = memo(function DealAddressCell({ dealId, address }: DealAddressCellProps) {
  const { mutateAsync: updateDealAsync } = useUpdateDeal(dealId);
  const handleSaveAddress = useCallback(
    async (nextValue: string | number | boolean | null) => {
      const next = typeof nextValue === "string" ? nextValue.trim() : "";
      if (next.length === 0) return;
      await updateDealAsync({ address: next });
    },
    [updateDealAsync],
  );

  return (
    <TextQuickEditCell
      ariaLabel="Address"
      value={address}
      onSave={handleSaveAddress}
    />
  );
});

/**
 * Keeps the linked company visible as a link and allows reassignment via a
 * select picker — mirrors ContactCompanyCell on the People list.
 */
const DealCompanyCell = memo(function DealCompanyCell({
  dealId,
  companyId,
  company,
  companies,
}: DealCompanyCellProps) {
  const { mutateAsync: updateDealAsync } = useUpdateDeal(dealId);
  const options = useMemo(() => buildDealCompanyOptions(companies, company), [companies, company]);
  const displayValue = companyId ? undefined : "";
  const handleSaveCompany = useCallback(
    async (nextValue: string | number | boolean | null) => {
      const nextCompanyId = typeof nextValue === "string" && nextValue !== noCompanyOptionValue
        ? nextValue
        : null;
      await updateDealAsync({ company_id: nextCompanyId });
    },
    [updateDealAsync],
  );

  return (
    <SelectQuickEditCell
      ariaLabel="Company"
      value={companyId ?? noCompanyOptionValue}
      displayValue={displayValue}
      options={options}
      onSave={handleSaveCompany}
    />
  );
});

/**
 * Lets boolean custom fields toggle directly from the deals list table.
 */
const DealBooleanCustomFieldCell = memo(function DealBooleanCustomFieldCell({
  dealId,
  definition,
  value,
}: DealBooleanCustomFieldCellProps) {
  const { mutateAsync: updateDealAsync } = useUpdateDeal(dealId);
  const handleSaveValue = useCallback(
    async (nextValue: string | number | boolean | null) => {
      await updateDealAsync({
        custom_fields: {
          [definition.key]: typeof nextValue === "boolean" ? nextValue : null,
        },
      });
    },
    [definition.key, updateDealAsync],
  );

  return (
    <BooleanQuickEditCell
      ariaLabel={definition.label}
      value={typeof value === "boolean" ? value : null}
      onSave={handleSaveValue}
    />
  );
});

export default function DealsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { recordId, open, close, isOpen: isDrawerOpen } = useRecordDrawer();
  const queryClient = useQueryClient();
  const { data: clientId } = useClientId();
  const { data: crmConfigResult } = useCrmConfig();
  const { data: companies = [] } = useCompanies(EMPTY_COMPANY_FILTERS);
  const { view, setView } = useViewPreference("deals");
  const {
    savedViewId,
    handleSavedViewChange: handleSavedViewRouteChange,
  } = useCrmListRouteState({
    basePath: "/customers/deals",
    replace: router.replace,
    searchParams,
  });
  const { data: views } = useCrmViews("deals");
  const [page, setPage] = useState(1);
  const [filterValues, setFilterValues] = useState<FilterValues>(() => {
    const stageQuery = searchParams?.get("stage")?.trim();

    return stageQuery ? { stage: stageQuery } : {};
  });

  const rawViewParam = searchParams?.get("view") ?? null;
  const queryView = normalizeDealsView(rawViewParam);
  const {
    activeSavedView,
    activeState,
    activeViewType,
    isSavedViewActive,
    openMode,
  } = useActiveCrmViewState({
    activeViewId: savedViewId,
    adHocViewType: queryView ?? (view === "kanban" ? "kanban" : "table"),
    allowPageOpen: true,
    supportedViewTypes: ["table", "kanban"],
    views,
  });
  const activeLayout = activeViewType === "kanban" ? "kanban" : "table";
  const { openRecord } = useRecordOpenBehavior({
    objectType: "deal",
    openDrawer: open,
    openMode,
  });
  const crmConfig = crmConfigResult?.config;
  const dealBooleanCustomFields = useMemo(
    () => getBooleanCustomFields(crmConfig?.deal_custom_fields),
    [crmConfig?.deal_custom_fields],
  );
  const dealCustomFieldFilterKeys = useMemo(
    () => getCustomFieldFilterKeys(crmConfig?.deal_custom_fields),
    [crmConfig?.deal_custom_fields],
  );

  useEffect(() => {
    if (isSavedViewActive) {
      return;
    }

    if (!queryView) {
      return;
    }

    if (queryView !== view) {
      setView(queryView);
    }

    if (rawViewParam === "board") {
      router.replace(buildDealsHref(searchParams, "kanban"));
    }
  }, [isSavedViewActive, queryView, rawViewParam, router, searchParams, setView, view]);

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
      ...dealBooleanCustomFields.map((field) => ({
        id: field.key,
        label: field.label,
        type: "checkbox" as const,
      })),
    ],
    [dealBooleanCustomFields, stages],
  );

  const sharedFilters = useMemo(
    () => ({
      ...(isSavedViewActive
        ? {
            viewFilters: activeState?.filters ?? {},
            viewSort: activeState?.sort ?? undefined,
            customFieldFilterKeys: dealCustomFieldFilterKeys,
          }
        : {
            stage: typeof filterValues.stage === "string" ? (filterValues.stage as Deal["stage"]) : undefined,
            createdAt: getDateRangeValue(filterValues.createdAt),
            viewFilters: pickBooleanCustomFieldFilters(filterValues, dealBooleanCustomFields),
            customFieldFilterKeys: dealCustomFieldFilterKeys,
          }),
    }),
    [activeState?.filters, activeState?.sort, dealBooleanCustomFields, dealCustomFieldFilterKeys, filterValues, isSavedViewActive],
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
  } = usePaginatedDeals(tableFilters, { enabled: activeLayout === "table" });
  const {
    data: boardData = [],
    isLoading: isBoardLoading,
    isError: isBoardError,
  } = useDeals(sharedFilters, { enabled: activeLayout === "kanban" });

  const createDeal = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("deals")
        .insert({ client_id: clientId, address: "Untitled Deal", stage: stages[0] })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (createdDeal) => {
      // Seed the detail cache with the freshly-inserted row so the drawer
      // mounts with data and skips its skeleton flicker. A new deal has no
      // joined contacts or company yet.
      queryClient.setQueryData(dealKeys.detail(createdDeal.deal_id), {
        ...createdDeal,
        deal_contacts: [],
        companies: null,
      });
      open(createdDeal.deal_id);
      void queryClient.invalidateQueries({ queryKey: dealKeys.all });
      void captureTimelineActivity({
        supabase,
        clientId: createdDeal.client_id,
        recordType: "deal",
        recordId: createdDeal.deal_id,
        action: "created",
        actorType: "user",
        after: createdDeal,
      }).then((ok) => {
        if (ok) {
          void queryClient.invalidateQueries({
            queryKey: timelineActivityKeys.record("deal", createdDeal.deal_id),
          });
        }
      });
    },
    onError: () => {
      toast.error("Unable to create deal.");
    },
  });

  const deleteDeal = useMutation({
    mutationFn: async ({ dealId }: { dealId: string }) => {
      const { data: existingDeal, error: readError } = await supabase
        .from("deals")
        .select("*")
        .eq("deal_id", dealId)
        .single();

      if (readError) {
        throw readError;
      }

      const { error } = await supabase.from("deals").delete().eq("deal_id", dealId);

      if (error) {
        throw error;
      }

      return existingDeal;
    },
    onMutate: async ({ dealId }: { dealId: string }) => {
      await queryClient.cancelQueries({ queryKey: dealKeys.all });

      const cacheSnapshot = captureRecordCacheSnapshot({
        queryClient,
        detailKey: dealKeys.detail(dealId),
        listKeyPrefix: dealKeys.lists(),
      });

      removeCachedRecord<DealWithContact>({
        queryClient,
        detailKey: dealKeys.detail(dealId),
        listKeyPrefix: dealKeys.lists(),
        idKey: "deal_id",
        recordId: dealId,
      });

      return { cacheSnapshot };
    },
    onSuccess: async (deletedDeal) => {
      void captureTimelineActivity({
        supabase,
        clientId: deletedDeal.client_id,
        recordType: "deal",
        recordId: deletedDeal.deal_id,
        action: "deleted",
        actorType: "user",
        before: deletedDeal,
      }).then((ok) => {
        if (ok) {
          void queryClient.invalidateQueries({
            queryKey: timelineActivityKeys.record("deal", deletedDeal.deal_id),
          });
        }
      });

      toast.success("Deal deleted.");
    },
    onError: (_error, { dealId }, context) => {
      if (context) {
        restoreRecordCacheSnapshot({
          queryClient,
          detailKey: dealKeys.detail(dealId),
          ...context.cacheSnapshot,
        });
      }

      toast.error("Unable to delete this deal.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
  const { mutate: deleteDealMutation } = deleteDeal;

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
    () =>
      activeSavedView?.state.sort
        ? boardData
        : [...boardData].sort(compareDealsByAmountDesc),
    [activeSavedView?.state.sort, boardData],
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
  const columns = useMemo<ColumnDef<DealWithContact>[]>(() => {
    const dealFields = crmConfig?.deal_fields ?? DEAL_DEFAULT_FIELDS;
    const base = buildColumnsFromConfig<DealWithContact>(dealFields, "deals");

    return base.map((col) => {
      const field = dealFields.find((candidate) => candidate.key === col.id);
      switch (col.id) {
        case "name":
          /** The deal "name" field renders the address as the primary link. */
          return {
            ...col,
            accessorFn: (row: DealWithContact) => row.address,
            cell: ({ row }: { row: { original: DealWithContact } }) => (
              <RecordLinkCell
                label={row.original.address}
                onOpen={() => openRecord(row.original.deal_id)}
              />
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
            cell: ({ row }: { row: { original: DealWithContact } }) => (
              <DealCompanyCell
                dealId={row.original.deal_id}
                companyId={row.original.company_id}
                company={row.original.companies}
                companies={companies}
              />
            ),
          };
        case "point_of_contact":
          /**
           * Point of contact lives on the `deal_contacts` junction table and
           * requires a separate mutation to reassign. Keep it read-only in
           * the list for now; editing happens via the record drawer.
           */
          return {
            ...col,
            accessorFn: (row: DealWithContact) => getPrimaryContactLabel(row),
            enableSorting: false,
            cell: undefined,
          };
        case "address":
          return {
            ...col,
            cell: ({ row }: { row: { original: DealWithContact } }) => (
              <DealAddressCell dealId={row.original.deal_id} address={row.original.address} />
            ),
          };
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
          if (field?.source === "custom" && field.type === "boolean") {
            return {
              ...col,
              cell: ({ row }: { row: { original: DealWithContact } }) => (
                <DealBooleanCustomFieldCell
                  dealId={row.original.deal_id}
                  definition={field}
                  value={(row.original.custom_fields as Record<string, unknown> | null | undefined)?.[field.key]}
                />
              ),
            };
          }

          return col;
      }
    });
  }, [companies, crmConfig, openRecord, stages]);
  const visibleColumns = useMemo(
    () => applyViewColumns(columns, activeState),
    [activeState, columns],
  );

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
  const handleDealCardClick = useCallback((dealId: string) => {
    openRecord(dealId);
  }, [openRecord]);
  const getDealBoardColumn = useCallback((deal: DealWithContact) => {
    return matchStageToConfigKey(deal.stage);
  }, [matchStageToConfigKey]);
  const getDealItemId = useCallback((deal: DealWithContact) => deal.deal_id, []);
  const handleDealRowClick = useCallback((row: DealWithContact) => {
    openRecord(row.deal_id);
  }, [openRecord]);
  const getDealRowId = useCallback((row: DealWithContact) => row.deal_id, []);
  const getDealRowActions = useCallback((row: DealWithContact) => [
    { id: "view", label: "View", onSelect: () => openRecord(row.deal_id) },
    {
      id: "delete",
      label: "Delete",
      destructive: true,
      onSelect: () => {
        if (!window.confirm(`Delete ${row.address}? This cannot be undone.`)) {
          return;
        }

        deleteDealMutation({ dealId: row.deal_id });
      },
    },
  ], [deleteDealMutation, openRecord]);
  const { mutate: updateDealFieldWidth } = useUpdateFieldWidth("deals");
  const handleDealColumnResize = useCallback(
    (columnId: string, width: number) => {
      updateDealFieldWidth({ columnId, width });
    },
    [updateDealFieldWidth],
  );

  const getColumnSummary = useCallback(
    (_columnKey: string, columnItems: DealWithContact[]) => {
      const total = columnItems.reduce((sum, deal) => sum + (deal.amount ?? 0), 0);
      return total > 0 ? formatCompactCurrency(total) : undefined;
    },
    [],
  );

  const hasLocalFilters = Object.keys(filterValues).length > 0;
  const hasActiveFiltering = isSavedViewActive || hasLocalFilters;

  function handleSavedViewChange(viewId: string | null) {
    setPage(1);
    handleSavedViewRouteChange(viewId);
  }

  const dealCount =
    activeLayout === "table"
      ? tableData?.total
      : isBoardLoading
        ? undefined
        : sortedBoardDeals.length;

  const newDealButton = (
    <Button
      size="sm"
      onClick={() => createDeal.mutate()}
      disabled={!clientId || createDeal.isPending}
    >
      <Plus className="h-4 w-4" />
      New
    </Button>
  );

  return (
    <CrmWorkspaceShell
      title="Deals"
      entityType="deals"
      activeViewId={activeSavedView?.view_id ?? null}
      onViewChange={handleSavedViewChange}
      count={dealCount}
      filters={filters}
      filterValues={filterValues}
      isSavedViewActive={isSavedViewActive}
      onFilterApply={(nextValues: FilterValues) => {
        setPage(1);
        setFilterValues(nextValues);
      }}
      onFilterClear={() => {
        setPage(1);
        setFilterValues({});
      }}
      primaryAction={newDealButton}
      viewType={activeLayout}
      views={["table", "kanban"]}
      onViewTypeChange={(nextView) => {
        setView(nextView);
        router.replace(buildDealsHref(searchParams, nextView));
      }}
      bodyByView={{
        kanban: isBoardLoading ? (
          <div className="grid gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, colIndex) => (
              <div key={colIndex} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
                <Skeleton className="mb-1 h-4 w-24" style={{ animationDelay: `${colIndex * 30}ms` }} />
                {Array.from({ length: 3 }).map((_, cardIndex) => (
                  <div key={cardIndex} className="space-y-2 rounded-md border border-border bg-background p-3">
                    <Skeleton className="h-3.5 w-3/4" style={{ animationDelay: `${colIndex * 30 + cardIndex * 50}ms` }} />
                    <Skeleton className="h-3 w-1/2" style={{ animationDelay: `${colIndex * 30 + cardIndex * 50 + 20}ms` }} />
                    <Skeleton className="h-3 w-1/3" style={{ animationDelay: `${colIndex * 30 + cardIndex * 50 + 40}ms` }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : isBoardError ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6">
            <p className="type-control text-destructive">Unable to load pipeline data.</p>
          </div>
        ) : sortedBoardDeals.length === 0 ? (
          <EmptyState
            iconName="deals"
            title={hasActiveFiltering ? "No results match your filters" : "No deals yet"}
            description={hasActiveFiltering
              ? "Try adjusting or clearing your filters."
              : "Your AI agent will create deals as it processes conversations."}
          />
        ) : (
          <KanbanBoard
            boardLabel="By Stage"
            items={sortedBoardDeals}
            columns={stageColumns}
            groupBy={getDealBoardColumn}
            getItemId={getDealItemId}
            getColumnSummary={getColumnSummary}
            renderCard={(deal) => <DealKanbanCard deal={deal} />}
            onCardClick={handleDealCardClick}
            onColumnChange={handleBoardColumnChange}
            emptyStateMessage="No deals in this stage yet."
          />
        ),
        table: (
          <ListTable
            columns={visibleColumns}
            data={tableRows}
            pinFirstColumn
            isLoading={isTableLoading}
            error={isTableError ? <span>Unable to load deals.</span> : null}
            emptyState={(
              <EmptyState
                iconName="deals"
                title={hasActiveFiltering ? "No results match your filters" : "No deals yet"}
                description={hasActiveFiltering
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
            rowActions={getDealRowActions}
            onRowClick={handleDealRowClick}
            onColumnResize={handleDealColumnResize}
            selectedRowId={recordId ?? undefined}
            getRowId={getDealRowId}
            mobileCardRenderer={(deal, helpers) => (
              <MobileRecordCard
                title={deal.address}
                eyebrow={formatDealStageLabel(deal.stage)}
                meta={formatCompactCurrency(deal.amount)}
                isSelected={helpers.isSelected}
                actions={helpers.actions}
                onOpen={helpers.openRow}
                fields={[
                  { label: "Address", value: deal.address },
                  {
                    label: "Company",
                    value: deal.companies?.name ?? <span className="text-muted-foreground">None</span>,
                  },
                  {
                    label: "Contact",
                    value: getPrimaryContactLabel(deal) || <span className="text-muted-foreground">None</span>,
                  },
                  { label: "Updated", value: formatCrmDate(deal.updated_at) },
                ]}
              />
            )}
          />
        ),
      }}
      drawer={(
        <RecordDrawer
          isOpen={isDrawerOpen}
          recordId={recordId}
          objectType="deal"
          onClose={close}
        />
      )}
    />
  );
}
