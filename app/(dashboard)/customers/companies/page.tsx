/**
 * Customers companies list page.
 * @module app/(dashboard)/customers/companies/page
 */
"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";

import { CrmListPanelLayout } from "@/components/crm/crm-list-panel-layout";
import { QuickEditCell } from "@/components/crm/quick-edit-cell";
import { CompanyDrawerContent } from "@/components/crm/record-drawer/company-drawer-content";
import { ViewPicker } from "@/components/crm/view-picker";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import type { DateRangeFilterValue, FilterDef, FilterValues } from "@/components/ui/filter-overlay";
import { useClientId } from "@/hooks/use-client-id";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { useCrmViews } from "@/hooks/use-crm-views";
import { useRecordDrawer } from "@/hooks/use-record-drawer";
import { companyKeys, type CompanyWithCounts, usePaginatedCompanies } from "@/hooks/use-companies";
import { useUpdateCompany } from "@/hooks/use-update-company";
import { buildColumnsFromConfig } from "@/lib/crm/build-columns";
import { CRM_DEFAULTS } from "@/lib/crm/config";
import { COMPANY_DEFAULT_FIELDS } from "@/lib/crm/field-definitions";
import { formatCrmDate, formatCrmEnumLabel, getCompanyIndustryBadgeVariant } from "@/lib/crm/display";
import { captureTimelineActivity } from "@/lib/crm/timeline-capture";
import { timelineActivityKeys } from "@/hooks/use-unified-timeline";
import { type Company } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

const pageSize = 20;

/**
 * Shared contract for company cells that keep a read-mode link beside a quick-edit trigger.
 */
interface CompanyLinkEditCellProps {
  ariaLabel: string;
  value: string | null;
  hrefBuilder: (value: string) => string;
  onSave: (nextValue: string | number | null) => void | Promise<void>;
  linkClassName: string;
  linkTarget?: string;
  linkRel?: string;
  displayValue?: (value: string) => string;
}

interface CompanyIndustryCellProps {
  companyId: string;
  industry: Company["industry"];
  industryOptions: string[];
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
function toNullableTextValue(nextValue: string | number | null): string | null {
  return typeof nextValue === "string" ? nextValue : null;
}

/**
 * Strips protocol-only noise from website labels while preserving the destination URL.
 */
function getWebsiteDisplayValue(website: string) {
  return website.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * Ensures website links remain absolute when users enter a bare domain.
 */
function normalizeWebsiteValue(nextValue: string | null): string | null {
  if (!nextValue) {
    return null;
  }

  const normalizedValue = nextValue.trim();

  if (/^[a-z][a-z\d+\-.]*:\/\//i.test(normalizedValue)) {
    return normalizedValue;
  }

  return `https://${normalizedValue}`;
}

/**
 * Renders a read-mode link plus an explicit edit affordance for one company field.
 */
function CompanyLinkEditCell({
  ariaLabel,
  value,
  hrefBuilder,
  onSave,
  linkClassName,
  linkTarget,
  linkRel,
  displayValue,
}: CompanyLinkEditCellProps) {
  return (
    <QuickEditCell
      ariaLabel={ariaLabel}
      value={value}
      onSave={onSave}
    >
      {value ? (
        <a
          href={hrefBuilder(value)}
          target={linkTarget}
          rel={linkRel}
          className={linkClassName}
          onClick={(event) => event.stopPropagation()}
        >
          {displayValue ? displayValue(value) : value}
        </a>
      ) : null}
    </QuickEditCell>
  );
}

/**
 * Handles inline phone edits while preserving the tel: link in read mode.
 */
function CompanyPhoneCell({ companyId, phone }: { companyId: string; phone: string | null }) {
  const updateCompany = useUpdateCompany(companyId);

  return (
    <CompanyLinkEditCell
      ariaLabel="Phone"
      value={phone}
      hrefBuilder={(value) => `tel:${value}`}
      linkClassName="block max-w-[180px] truncate text-foreground/80 hover:underline"
      onSave={async (nextValue) => {
        const val = nextValue != null ? String(nextValue) : null;
        await updateCompany.mutateAsync({ phone: val });
      }}
    />
  );
}

/**
 * Handles inline email edits while preserving the mailto: link in read mode.
 */
function CompanyEmailCell({ companyId, email }: { companyId: string; email: string | null }) {
  const updateCompany = useUpdateCompany(companyId);

  return (
    <CompanyLinkEditCell
      ariaLabel="Email"
      value={email}
      hrefBuilder={(value) => `mailto:${value}`}
      linkClassName="block max-w-[220px] truncate text-foreground/80 hover:underline"
      onSave={async (nextValue) => {
        const val = nextValue != null ? String(nextValue) : null;
        await updateCompany.mutateAsync({ email: val });
      }}
    />
  );
}

/**
 * Handles inline website edits while preserving the outbound link in read mode.
 */
function CompanyWebsiteCell({ companyId, website }: { companyId: string; website: string | null }) {
  const updateCompany = useUpdateCompany(companyId);

  return (
    <CompanyLinkEditCell
      ariaLabel="Website"
      value={website}
      hrefBuilder={(value) => value}
      linkClassName="block max-w-[220px] truncate text-foreground/80 hover:underline"
      linkTarget="_blank"
      linkRel="noreferrer"
      displayValue={getWebsiteDisplayValue}
      onSave={async (nextValue) => {
        const val = nextValue != null ? String(nextValue) : null;
        await updateCompany.mutateAsync({ website: normalizeWebsiteValue(val) });
      }}
    />
  );
}

/**
 * Keeps the industry badge visible in read mode and delegates changes to the quick-edit control.
 */
function CompanyIndustryCell({ companyId, industry, industryOptions }: CompanyIndustryCellProps) {
  const updateCompany = useUpdateCompany(companyId);

  return (
    <QuickEditCell
      ariaLabel="Industry"
      value={industry}
      type="select"
      options={industryOptions.map((option) => ({
        value: option,
        label: formatCrmEnumLabel(option),
      }))}
      onSave={async (nextValue) => {
        await updateCompany.mutateAsync({
          industry: toNullableTextValue(nextValue) as Company["industry"],
        });
      }}
    >
      {industry ? (
        <Badge variant={getCompanyIndustryBadgeVariant(industry)}>
          {formatCrmEnumLabel(industry)}
        </Badge>
      ) : null}
    </QuickEditCell>
  );
}

export default function CompaniesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { recordId, open } = useRecordDrawer();
  const queryClient = useQueryClient();
  const { data: clientId } = useClientId();
  const { data: crmConfigResult } = useCrmConfig();
  const { data: views } = useCrmViews("companies");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<FilterValues>({});
  const savedViewId = searchParams?.get("savedView") ?? null;
  const activeSavedView = views?.find((view) => view.view_id === savedViewId) ?? null;

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
    ],
    [industryOptions],
  );

  const queryFilters = useMemo(
    () => ({
      ...(activeSavedView
        ? {
            viewFilters: activeSavedView.filters as Record<string, unknown>,
            viewSort: activeSavedView.sort as { column: string; ascending: boolean } | undefined,
          }
        : {
            search: search.trim() || undefined,
            industry: typeof filterValues.industry === "string" ? filterValues.industry : undefined,
            hasEmail: typeof filterValues.hasEmail === "boolean" ? filterValues.hasEmail : undefined,
            hasPhone: typeof filterValues.hasPhone === "boolean" ? filterValues.hasPhone : undefined,
            createdAt: getDateRangeValue(filterValues.createdAt),
          }),
      page,
      pageSize,
    }),
    [activeSavedView, filterValues.createdAt, filterValues.hasEmail, filterValues.hasPhone, filterValues.industry, page, search],
  );

  const { data, isLoading, isError } = usePaginatedCompanies(queryFilters);
  const hasLocalFilters = search.trim().length > 0 || Object.keys(filterValues).length > 0;
  const hasActiveFiltering = Boolean(activeSavedView) || hasLocalFilters;

  const createCompany = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("companies")
        .insert({ client_id: clientId, name: "New Company" })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (createdCompany) => {
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

      await queryClient.invalidateQueries({ queryKey: companyKeys.all });
      open(createdCompany.company_id);
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

      await queryClient.invalidateQueries({ queryKey: companyKeys.all });
      toast.success("Company deleted.");
    },
    onError: () => {
      toast.error("Unable to delete this company.");
    },
  });

  function handleSavedViewChange(viewId: string | null) {
    setPage(1);
    const params = new URLSearchParams(searchParams?.toString() ?? "");

    if (viewId) {
      params.set("savedView", viewId);
    } else {
      params.delete("savedView");
    }

    const nextQuery = params.toString();
    router.replace(
      nextQuery.length > 0 ? "/customers/companies?" + nextQuery : "/customers/companies",
    );
  }

  const rows = data?.rows ?? [];

  /**
   * Build columns from config, then override specific keys with the existing
   * rich cell renderers. The companies field definitions include the standard
   * CRM fields; columns not covered by field definitions (contact_count,
   * deal_count) are appended as static columns after the config-driven set.
   */
  const crmConfig = crmConfigResult?.config;
  const columns = useMemo<ColumnDef<CompanyWithCounts>[]>(() => {
    const companyFields = crmConfig?.company_fields ?? COMPANY_DEFAULT_FIELDS;
    const base = buildColumnsFromConfig<CompanyWithCounts>(companyFields, "companies");

    const configured = base.map((col) => {
      switch (col.id) {
        case "name":
          return {
            ...col,
            cell: ({ row }: { row: { original: CompanyWithCounts } }) => (
              <button
                type="button"
                className="block max-w-[250px] truncate font-medium text-foreground hover:underline"
                onClick={(event) => {
                  event.stopPropagation();
                  open(row.original.company_id);
                }}
              >
                {row.original.name}
              </button>
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
        cell: ({ row }) => <span className="tabular-nums">{row.original.contact_count}</span>,
      },
      {
        accessorKey: "deal_count",
        header: "Deals",
        cell: ({ row }) => <span className="tabular-nums">{row.original.deal_count}</span>,
      },
    ];

    return [...configured, ...countColumns];
  }, [crmConfig, industryOptions, open]);

  return (
    <CrmListPanelLayout
      objectType="company"
      icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
      title="Companies"
      headerActions={
        <div className="flex items-center gap-2">
          <ViewPicker
            entityType="companies"
            activeViewId={activeSavedView?.view_id ?? null}
            onViewChange={handleSavedViewChange}
          />
          <Button size="sm" onClick={() => createCompany.mutate()} disabled={!clientId || createCompany.isPending}>
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>
      }
      renderPanelContent={(id, { closeButton }) => (
        <CompanyDrawerContent key={id} companyId={id} closeButton={closeButton} />
      )}
    >

        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          error={isError ? <span>Unable to load companies.</span> : null}
          emptyState={(
            <EmptyState
              iconName="building"
              title={hasActiveFiltering ? "No results match your filters" : "No companies yet"}
              description={hasActiveFiltering
                ? "Try adjusting or clearing your filters."
                : "Your AI agent will create companies as it processes conversations."}
            />
          )}
          pagination={data
            ? {
                page: data.page,
                pageSize: data.pageSize,
                total: data.total,
                totalPages: data.totalPages,
                onPageChange: setPage,
              }
            : undefined}
          rowActions={(row) => [
            { id: "view", label: "View", onSelect: () => open(row.company_id) },
            {
              id: "delete",
              label: "Delete",
              destructive: true,
              onSelect: () => {
                if (!window.confirm(`Delete ${row.name}? This cannot be undone.`)) {
                  return;
                }

                deleteCompany.mutate({ companyId: row.company_id });
              },
            },
          ]}
          onRowClick={(row) => open(row.company_id)}
          selectedRowId={recordId ?? undefined}
          getRowId={(row) => row.company_id}
          searchValue={activeSavedView ? undefined : search}
          onSearchChange={activeSavedView ? undefined : (value) => {
            setPage(1);
            setSearch(value);
          }}
          searchPlaceholder="Search companies..."
          filters={activeSavedView ? [] : filters}
          filterValues={activeSavedView ? {} : filterValues}
          onFiltersApply={activeSavedView ? undefined : (nextValues) => {
            setPage(1);
            setFilterValues(nextValues);
          }}
          onFiltersClear={activeSavedView ? undefined : () => {
            setPage(1);
            setFilterValues({});
          }}
        />
    </CrmListPanelLayout>
  );
}
