/**
 * Customers companies list page.
 * @module app/(dashboard)/customers/companies/page
 */
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { RefreshCw } from "@/components/icons/lucide-compat";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QuickEditCell } from "@/components/crm/quick-edit-cell";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import type { DateRangeFilterValue, FilterDef, FilterValues } from "@/components/ui/filter-overlay";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { companyKeys, type CompanyWithCounts, usePaginatedCompanies } from "@/hooks/use-companies";
import { useUpdateCompany } from "@/hooks/use-update-company";
import { CRM_DEFAULTS } from "@/lib/crm/config";
import { formatCrmDate, formatCrmEnumLabel, getCompanyIndustryBadgeVariant } from "@/lib/crm/display";
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
    <div className="flex min-w-0 items-center gap-2">
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
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
      <QuickEditCell
        ariaLabel={ariaLabel}
        value={value}
        hideDisplayValue
        onSave={onSave}
      />
    </div>
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
    <div className="flex min-w-0 items-center gap-2">
      {industry ? (
        <Badge variant={getCompanyIndustryBadgeVariant(industry)}>
          {formatCrmEnumLabel(industry)}
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
      <QuickEditCell
        ariaLabel="Industry"
        value={industry}
        hideDisplayValue
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
      />
    </div>
  );
}

export default function CompaniesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: crmConfigResult } = useCrmConfig();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<FilterValues>({});

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
      search: search.trim() || undefined,
      industry: typeof filterValues.industry === "string" ? filterValues.industry : undefined,
      hasEmail: typeof filterValues.hasEmail === "boolean" ? filterValues.hasEmail : undefined,
      hasPhone: typeof filterValues.hasPhone === "boolean" ? filterValues.hasPhone : undefined,
      createdAt: getDateRangeValue(filterValues.createdAt),
      page,
      pageSize,
    }),
    [filterValues.createdAt, filterValues.hasEmail, filterValues.hasPhone, filterValues.industry, page, search],
  );

  const { data, isLoading, isError, refetch } = usePaginatedCompanies(queryFilters);
  const deleteCompany = useMutation({
    mutationFn: async ({ companyId }: { companyId: string }) => {
      const { error } = await supabase.from("companies").delete().eq("company_id", companyId);

      if (error) {
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: companyKeys.all });
      toast.success("Company deleted.");
    },
    onError: () => {
      toast.error("Unable to delete this company.");
    },
  });

  const rows = data?.rows ?? [];
  const columns = useMemo<ColumnDef<CompanyWithCounts>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            href={`/customers/companies/${row.original.company_id}`}
            className="block max-w-[250px] truncate font-medium text-foreground hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "industry",
        header: "Industry",
        cell: ({ row }) => (
          <CompanyIndustryCell
            companyId={row.original.company_id}
            industry={row.original.industry}
            industryOptions={industryOptions}
          />
        ),
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => (
          <CompanyPhoneCell companyId={row.original.company_id} phone={row.original.phone} />
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <CompanyEmailCell companyId={row.original.company_id} email={row.original.email} />
        ),
      },
      {
        accessorKey: "website",
        header: "Website",
        cell: ({ row }) => (
          <CompanyWebsiteCell companyId={row.original.company_id} website={row.original.website} />
        ),
      },
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
    [industryOptions],
  );

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <DataTable
        title={(
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Companies</h1>
        )}
        columns={columns}
        data={rows}
        isLoading={isLoading}
        error={isError ? <span>Unable to load companies.</span> : null}
        emptyState={(
          <EmptyState
            iconName="building"
            title={search.trim() || Object.keys(filterValues).length > 0 ? "No results match your filters" : "No companies yet"}
            description={search.trim() || Object.keys(filterValues).length > 0
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
        refreshButton={(
          <Button type="button" variant="ghost" size="icon" aria-label="Refresh companies" onClick={() => void refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
        rowActions={(row) => [
          { id: "view", label: "View", href: `/customers/companies/${row.company_id}` },
          {
            id: "open",
            label: "Open in New Tab",
            href: `/customers/companies/${row.company_id}`,
            newTab: true,
          },
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
        onRowClick={(row) => router.push(`/customers/companies/${row.company_id}`)}
        searchValue={search}
        onSearchChange={(value) => {
          setPage(1);
          setSearch(value);
        }}
        searchPlaceholder="Search companies..."
        filters={filters}
        filterValues={filterValues}
        onFiltersApply={(nextValues) => {
          setPage(1);
          setFilterValues(nextValues);
        }}
        onFiltersClear={() => {
          setPage(1);
          setFilterValues({});
        }}
      />
    </div>
  );
}
