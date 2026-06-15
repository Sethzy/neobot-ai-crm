/**
 * Customers companies list page.
 * @module app/(dashboard)/customers/companies/page
 */
"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { applyViewColumns } from "@/components/crm/apply-view-columns";
import {
  BooleanQuickEditCell,
  EmailQuickEditCell,
  PhoneQuickEditCell,
  SelectQuickEditCell,
  WebsiteQuickEditCell,
} from "@/components/crm/crm-inline-cells";
import { CrmWorkspaceShell } from "@/components/crm/crm-workspace-shell";
import { MobileRecordCard } from "@/components/crm/mobile-record-card";
import { RecordLinkCell } from "@/components/crm/record-link-cell";
import { RecordDrawer } from "@/components/crm/record-drawer";
import { useActiveCrmViewState } from "@/components/crm/use-active-crm-view-state";
import { useCrmListRouteState } from "@/components/crm/use-crm-list-route-state";
import { useRecordOpenBehavior } from "@/components/crm/use-record-open-behavior";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListTable } from "@/components/ui/list-table";
import type { DateRangeFilterValue, FilterDef, FilterValues } from "@/components/ui/filter-overlay";
import { useClientId } from "@/hooks/use-client-id";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { useCrmViews } from "@/hooks/use-crm-views";
import { useRecordDrawer } from "@/hooks/use-record-drawer";
import { useUpdateFieldWidth } from "@/hooks/use-update-field-width";
import { companyKeys, type CompanyWithCounts, usePaginatedCompanies } from "@/hooks/use-companies";
import { useUpdateCompany } from "@/hooks/use-update-company";
import { buildColumnsFromConfig } from "@/lib/crm/build-columns";
import { CRM_DEFAULTS, type CustomFieldDefinition } from "@/lib/crm/config";
import {
  getBooleanCustomFields,
  getCustomFieldFilterKeys,
  pickBooleanCustomFieldFilters,
} from "@/lib/crm/custom-field-filters";
import { COMPANY_DEFAULT_FIELDS } from "@/lib/crm/field-definitions";
import { formatCrmDate, formatCrmEnumLabel } from "@/lib/crm/display";
import { captureTimelineActivity } from "@/lib/crm/timeline-capture";
import { timelineActivityKeys } from "@/hooks/use-unified-timeline";
import { type Company } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";
import { captureRecordCacheSnapshot, removeCachedRecord, restoreRecordCacheSnapshot } from "@/hooks/crm-cache-updates";

const pageSize = 20;

interface CompanyIndustryCellProps {
  companyId: string;
  industry: Company["industry"];
  industryOptions: string[];
}

interface CompanyBooleanCustomFieldCellProps {
  companyId: string;
  definition: Pick<CustomFieldDefinition, "key" | "label">;
  value: unknown;
}

/**
 * Normalizes filter overlay date-range values before query construction.
 */
function getDateRangeValue(value: unknown): DateRangeFilterValue | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const nextValue = value as DateRangeFilterValue;
  return nextValue.from || nextValue.to ? nextValue : undefined;
}

/**
 * Converts QuickEditCell payloads to the nullable text shape expected by company updates.
 */
function toNullableTextValue(nextValue: string | number | boolean | null): string | null {
  return typeof nextValue === "string" ? nextValue : null;
}

/**
 * Strips protocol-only noise from website labels while preserving the destination URL.
 */
function getWebsiteDisplayValue(website: string) {
  return website.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * Handles inline phone edits while preserving the tel: link in read mode.
 */
const CompanyPhoneCell = memo(function CompanyPhoneCell({
  companyId,
  phone,
}: {
  companyId: string;
  phone: string | null;
}) {
  const { mutateAsync: updateCompanyAsync } = useUpdateCompany(companyId);
  const handleSavePhone = useCallback(
    async (nextValue: string | number | boolean | null) => {
      const val = nextValue != null ? String(nextValue) : null;
      await updateCompanyAsync({ phone: val });
    },
    [updateCompanyAsync],
  );

  return (
    <PhoneQuickEditCell
      ariaLabel="Phone"
      value={phone}
      linkClassName="block max-w-[180px] truncate text-foreground/80 hover:underline"
      onSave={handleSavePhone}
    />
  );
});

/**
 * Handles inline email edits while preserving the mailto: link in read mode.
 */
const CompanyEmailCell = memo(function CompanyEmailCell({
  companyId,
  email,
}: {
  companyId: string;
  email: string | null;
}) {
  const { mutateAsync: updateCompanyAsync } = useUpdateCompany(companyId);
  const handleSaveEmail = useCallback(
    async (nextValue: string | number | boolean | null) => {
      const val = nextValue != null ? String(nextValue) : null;
      await updateCompanyAsync({ email: val });
    },
    [updateCompanyAsync],
  );

  return (
    <EmailQuickEditCell
      ariaLabel="Email"
      value={email}
      linkClassName="block max-w-[220px] truncate text-foreground/80 hover:underline"
      onSave={handleSaveEmail}
    />
  );
});

/**
 * Handles inline website edits while preserving the outbound link in read mode.
 */
const CompanyWebsiteCell = memo(function CompanyWebsiteCell({
  companyId,
  website,
}: {
  companyId: string;
  website: string | null;
}) {
  const { mutateAsync: updateCompanyAsync } = useUpdateCompany(companyId);
  const handleSaveWebsite = useCallback(
    async (nextValue: string | number | boolean | null) => {
      const val = nextValue != null ? String(nextValue) : null;
      await updateCompanyAsync({ website: val });
    },
    [updateCompanyAsync],
  );

  return (
    <WebsiteQuickEditCell
      ariaLabel="Website"
      value={website}
      linkClassName="block max-w-[220px] truncate text-foreground/80 hover:underline"
      displayValue={website ? getWebsiteDisplayValue(website) : null}
      onSave={handleSaveWebsite}
    />
  );
});

/**
 * Keeps the industry badge visible in read mode and delegates changes to the quick-edit control.
 */
const CompanyIndustryCell = memo(function CompanyIndustryCell({
  companyId,
  industry,
  industryOptions,
}: CompanyIndustryCellProps) {
  const { mutateAsync: updateCompanyAsync } = useUpdateCompany(companyId);
  const options = useMemo(
    () =>
      industryOptions.map((option) => ({
        value: option,
        label: formatCrmEnumLabel(option),
      })),
    [industryOptions],
  );
  const displayValue = useMemo(
    () => (industry ? formatCrmEnumLabel(industry) : null),
    [industry],
  );
  const handleSaveIndustry = useCallback(
    async (nextValue: string | number | boolean | null) => {
      await updateCompanyAsync({
        industry: toNullableTextValue(nextValue) as Company["industry"],
      });
    },
    [updateCompanyAsync],
  );

  return (
    <SelectQuickEditCell
      ariaLabel="Industry"
      value={industry}
      displayValue={displayValue}
      options={options}
      onSave={handleSaveIndustry}
    />
  );
});

/**
 * Lets boolean custom fields toggle directly from the companies list table.
 */
const CompanyBooleanCustomFieldCell = memo(function CompanyBooleanCustomFieldCell({
  companyId,
  definition,
  value,
}: CompanyBooleanCustomFieldCellProps) {
  const { mutateAsync: updateCompanyAsync } = useUpdateCompany(companyId);
  const handleSaveValue = useCallback(
    async (nextValue: string | number | boolean | null) => {
      await updateCompanyAsync({
        custom_fields: {
          [definition.key]: typeof nextValue === "boolean" ? nextValue : null,
        },
      });
    },
    [definition.key, updateCompanyAsync],
  );

  return (
    <BooleanQuickEditCell
      ariaLabel={definition.label}
      value={typeof value === "boolean" ? value : null}
      onSave={handleSaveValue}
    />
  );
});

export default function CompaniesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { recordId, open, close, isOpen: isDrawerOpen } = useRecordDrawer();
  const queryClient = useQueryClient();
  const { data: clientId } = useClientId();
  const { data: crmConfigResult } = useCrmConfig();
  const { data: views } = useCrmViews("companies");
  const [page, setPage] = useState(1);
  const [filterValues, setFilterValues] = useState<FilterValues>({});
  const {
    savedViewId,
    handleSavedViewChange: handleSavedViewRouteChange,
  } = useCrmListRouteState({
    basePath: "/customers/companies",
    replace: router.replace,
    searchParams,
  });
  const {
    activeSavedView,
    activeState,
    isSavedViewActive,
    openMode,
  } = useActiveCrmViewState({
    activeViewId: savedViewId,
    adHocViewType: "table",
    allowPageOpen: true,
    supportedViewTypes: ["table"],
    views,
  });
  const { openRecord } = useRecordOpenBehavior({
    objectType: "company",
    openDrawer: open,
    openMode,
  });
  const crmConfig = crmConfigResult?.config;
  const companyBooleanCustomFields = useMemo(
    () => getBooleanCustomFields(crmConfig?.company_custom_fields),
    [crmConfig?.company_custom_fields],
  );
  const companyCustomFieldFilterKeys = useMemo(
    () => getCustomFieldFilterKeys(crmConfig?.company_custom_fields),
    [crmConfig?.company_custom_fields],
  );

  const industryOptions = crmConfigResult?.config.company_industries?.length
    ? crmConfigResult.config.company_industries
    : CRM_DEFAULTS.company_industries;

  const filters = useMemo<FilterDef[]>(
    () => [
      {
        id: "industry",
        label: "Industry",
        type: "select",
        options: industryOptions.map((industry) => ({
          value: industry,
          label: formatCrmEnumLabel(industry),
        })),
      },
      { id: "hasEmail", label: "Has Email", type: "checkbox" },
      { id: "hasPhone", label: "Has Phone", type: "checkbox" },
      { id: "createdAt", label: "Created At", type: "dateRange" },
      ...companyBooleanCustomFields.map((field) => ({
        id: field.key,
        label: field.label,
        type: "checkbox" as const,
      })),
    ],
    [companyBooleanCustomFields, industryOptions],
  );

  const queryFilters = useMemo(
    () => ({
      ...(isSavedViewActive
        ? {
            viewFilters: activeState?.filters ?? {},
            viewSort: activeState?.sort ?? undefined,
            customFieldFilterKeys: companyCustomFieldFilterKeys,
          }
        : {
            industry: typeof filterValues.industry === "string" ? filterValues.industry : undefined,
            hasEmail: typeof filterValues.hasEmail === "boolean" ? filterValues.hasEmail : undefined,
            hasPhone: typeof filterValues.hasPhone === "boolean" ? filterValues.hasPhone : undefined,
            createdAt: getDateRangeValue(filterValues.createdAt),
            viewFilters: pickBooleanCustomFieldFilters(filterValues, companyBooleanCustomFields),
            customFieldFilterKeys: companyCustomFieldFilterKeys,
          }),
      page,
      pageSize,
    }),
    [activeState?.filters, activeState?.sort, companyBooleanCustomFields, companyCustomFieldFilterKeys, filterValues, isSavedViewActive, page],
  );

  const { data, isLoading, isError } = usePaginatedCompanies(queryFilters);
  const hasLocalFilters = Object.keys(filterValues).length > 0;
  const hasActiveFiltering = isSavedViewActive || hasLocalFilters;

  const createCompany = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("companies")
        .insert({ client_id: clientId, name: "Company Draft" })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (createdCompany) => {
      // Seed the detail cache with the freshly-inserted row so the drawer
      // mounts with data and skips its skeleton flicker.
      queryClient.setQueryData(companyKeys.detail(createdCompany.company_id), createdCompany);
      open(createdCompany.company_id);
      void queryClient.invalidateQueries({ queryKey: companyKeys.all });
      void captureTimelineActivity({
        supabase,
        clientId: createdCompany.client_id,
        recordType: "company",
        recordId: createdCompany.company_id,
        action: "created",
        actorType: "user",
        after: createdCompany,
      }).then((ok) => {
        if (ok) {
          void queryClient.invalidateQueries({
            queryKey: timelineActivityKeys.record("company", createdCompany.company_id),
          });
        }
      });
    },
    onError: () => {
      toast.error("Unable to create company.");
    },
  });

  const deleteCompany = useMutation({
    mutationFn: async ({ companyId }: { companyId: string }) => {
      const { data: existingCompany, error: readError } = await supabase
        .from("companies")
        .select("*")
        .eq("company_id", companyId)
        .single();

      if (readError) {
        throw readError;
      }

      const { error } = await supabase.from("companies").delete().eq("company_id", companyId);

      if (error) {
        throw error;
      }

      return existingCompany;
    },
    onMutate: async ({ companyId }: { companyId: string }) => {
      await queryClient.cancelQueries({ queryKey: companyKeys.all });

      const cacheSnapshot = captureRecordCacheSnapshot({
        queryClient,
        detailKey: companyKeys.detail(companyId),
        listKeyPrefix: companyKeys.lists(),
      });

      removeCachedRecord<CompanyWithCounts>({
        queryClient,
        detailKey: companyKeys.detail(companyId),
        listKeyPrefix: companyKeys.lists(),
        idKey: "company_id",
        recordId: companyId,
      });

      return { cacheSnapshot };
    },
    onSuccess: async (deletedCompany) => {
      void captureTimelineActivity({
        supabase,
        clientId: deletedCompany.client_id,
        recordType: "company",
        recordId: deletedCompany.company_id,
        action: "deleted",
        actorType: "user",
        before: deletedCompany,
      }).then((ok) => {
        if (ok) {
          void queryClient.invalidateQueries({
            queryKey: timelineActivityKeys.record("company", deletedCompany.company_id),
          });
        }
      });

      toast.success("Company deleted.");
    },
    onError: (_error, { companyId }, context) => {
      if (context) {
        restoreRecordCacheSnapshot({
          queryClient,
          detailKey: companyKeys.detail(companyId),
          ...context.cacheSnapshot,
        });
      }

      toast.error("Unable to delete this company.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: companyKeys.all });
    },
  });
  const { mutate: deleteCompanyMutation } = deleteCompany;

  function handleSavedViewChange(viewId: string | null) {
    setPage(1);
    handleSavedViewRouteChange(viewId);
  }

  const rows = data?.rows ?? [];
  const handleCompanyRowClick = useCallback((row: CompanyWithCounts) => {
    openRecord(row.company_id);
  }, [openRecord]);
  const getCompanyRowId = useCallback((row: CompanyWithCounts) => row.company_id, []);
  const getCompanyRowActions = useCallback((row: CompanyWithCounts) => [
    { id: "view", label: "View", onSelect: () => openRecord(row.company_id) },
    {
      id: "delete",
      label: "Delete",
      destructive: true,
      onSelect: () => {
        if (!window.confirm(`Delete ${row.name}? This cannot be undone.`)) return;
        deleteCompanyMutation({ companyId: row.company_id });
      },
    },
  ], [deleteCompanyMutation, openRecord]);
  const { mutate: updateCompanyFieldWidth } = useUpdateFieldWidth("companies");
  const handleCompanyColumnResize = useCallback(
    (columnId: string, width: number) => {
      updateCompanyFieldWidth({ columnId, width });
    },
    [updateCompanyFieldWidth],
  );

  /**
   * Build columns from config, then override specific keys with the existing
   * rich cell renderers. The companies field definitions include the standard
   * CRM fields; columns not covered by field definitions (contact_count,
   * deal_count) are appended as static columns after the config-driven set.
   */
  const columns = useMemo<ColumnDef<CompanyWithCounts>[]>(() => {
    const companyFields = crmConfig?.company_fields ?? COMPANY_DEFAULT_FIELDS;
    const base = buildColumnsFromConfig<CompanyWithCounts>(companyFields, "companies");

    const configured = base.map((col) => {
      const field = companyFields.find((candidate) => candidate.key === col.id);
      switch (col.id) {
        case "name":
          return {
            ...col,
            cell: ({ row }: { row: { original: CompanyWithCounts } }) => (
              <RecordLinkCell
                label={row.original.name}
                onOpen={() => openRecord(row.original.company_id)}
              />
            ),
          };
        case "industry":
          return {
            ...col,
            cell: ({ row }: { row: { original: CompanyWithCounts } }) => (
              <CompanyIndustryCell
                companyId={row.original.company_id}
                industry={row.original.industry}
                industryOptions={industryOptions}
              />
            ),
          };
        case "phone":
          return {
            ...col,
            cell: ({ row }: { row: { original: CompanyWithCounts } }) => (
              <CompanyPhoneCell companyId={row.original.company_id} phone={row.original.phone} />
            ),
          };
        case "email":
          return {
            ...col,
            cell: ({ row }: { row: { original: CompanyWithCounts } }) => (
              <CompanyEmailCell companyId={row.original.company_id} email={row.original.email} />
            ),
          };
        case "website":
          return {
            ...col,
            cell: ({ row }: { row: { original: CompanyWithCounts } }) => (
              <CompanyWebsiteCell companyId={row.original.company_id} website={row.original.website} />
            ),
          };
        case "updated_at":
          return {
            ...col,
            cell: ({ row }: { row: { original: CompanyWithCounts } }) => (
              <span className="whitespace-nowrap text-muted-foreground">
                {formatCrmDate(row.original.updated_at)}
              </span>
            ),
          };
        default:
          if (field?.source === "custom" && field.type === "boolean") {
            return {
              ...col,
              cell: ({ row }: { row: { original: CompanyWithCounts } }) => (
                <CompanyBooleanCustomFieldCell
                  companyId={row.original.company_id}
                  definition={field}
                  value={(row.original.custom_fields as Record<string, unknown> | null | undefined)?.[field.key]}
                />
              ),
            };
          }

          return col;
      }
    });

    /**
     * Append the computed count columns that don't exist in the field
     * definitions (they come from a JOIN aggregate, not a direct column).
     */
    const countColumns: ColumnDef<CompanyWithCounts>[] = [
      {
        accessorKey: "contact_count",
        header: "Contacts",
        enableResizing: false,
        size: 112,
        cell: ({ row }) => <span className="tabular-nums">{row.original.contact_count}</span>,
      },
      {
        accessorKey: "deal_count",
        header: "Deals",
        enableResizing: false,
        size: 112,
        cell: ({ row }) => <span className="tabular-nums">{row.original.deal_count}</span>,
      },
    ];

    return [...configured, ...countColumns];
  }, [crmConfig, industryOptions, openRecord]);
  const visibleColumns = useMemo(
    () => applyViewColumns(columns, activeState),
    [activeState, columns],
  );

  const newCompanyButton = (
    <Button
      size="sm"
      onClick={() => createCompany.mutate()}
      disabled={!clientId || createCompany.isPending}
    >
      <Plus className="h-4 w-4" />
      New
    </Button>
  );

  return (
    <CrmWorkspaceShell
      title="Companies"
      entityType="companies"
      activeViewId={activeSavedView?.view_id ?? null}
      onViewChange={handleSavedViewChange}
      count={data?.total}
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
      primaryAction={newCompanyButton}
      viewType="table"
      bodyByView={{
        table: (
          <ListTable
            columns={visibleColumns}
            data={rows}
            pinFirstColumn
            isLoading={isLoading}
            error={isError ? <span>Unable to load companies.</span> : null}
            emptyState={
              <EmptyState
                iconName="building"
                title={hasActiveFiltering ? "No results match your filters" : "No companies yet"}
                description={
                  hasActiveFiltering
                    ? "Try adjusting or clearing your filters."
                    : "Your AI agent will create companies as it processes conversations."
                }
              />
            }
            pagination={
              data
                ? {
                    page: data.page,
                    pageSize: data.pageSize,
                    total: data.total,
                    totalPages: data.totalPages,
                    onPageChange: setPage,
                  }
                : undefined
            }
            rowActions={getCompanyRowActions}
            onRowClick={handleCompanyRowClick}
            onColumnResize={handleCompanyColumnResize}
            selectedRowId={recordId ?? undefined}
            getRowId={getCompanyRowId}
            mobileCardRenderer={(company, helpers) => (
              <MobileRecordCard
                title={company.name}
                meta={company.website ? getWebsiteDisplayValue(company.website) : "No website"}
                isSelected={helpers.isSelected}
                actions={helpers.actions}
                onOpen={helpers.openRow}
                fields={[
                  { label: "People", value: company.contact_count },
                  { label: "Deals", value: company.deal_count },
                  {
                    label: "Phone",
                    value: company.phone ? (
                      <a href={`tel:${company.phone}`} className="block truncate hover:underline">
                        {company.phone}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    ),
                  },
                  { label: "Updated", value: formatCrmDate(company.updated_at) },
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
          objectType="company"
          onClose={close}
        />
      )}
    />
  );
}
