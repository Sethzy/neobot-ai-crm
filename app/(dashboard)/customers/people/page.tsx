/**
 * Customers people list page.
 * @module app/(dashboard)/customers/people/page
 */
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { RefreshCw } from "@/components/icons/lucide-compat";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { DictionaryValue, contactTypeDictionaryMap } from "@/components/crm/dictionary-value";
import { QuickEditCell } from "@/components/crm/quick-edit-cell";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import type { DateRangeFilterValue, FilterDef, FilterValues } from "@/components/ui/filter-overlay";
import { Button } from "@/components/ui/button";
import { contactKeys, type ContactWithCompany, type ContactType, usePaginatedContacts } from "@/hooks/use-contacts";
import { type CompanyWithCounts, useCompanies } from "@/hooks/use-companies";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { useUpdateContact } from "@/hooks/use-update-contact";
import { buildCrmSelectOptions, formatContactFullName, formatCrmDate, formatCrmEnumLabel } from "@/lib/crm/display";
import { contactTypeValues } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

const pageSize = 20;
const noCompanyOptionValue = "__none__";

/**
 * Shared contract for contact cells that keep a read-mode link beside a quick-edit trigger.
 */
interface ContactLinkEditCellProps {
  ariaLabel: string;
  value: string | null;
  hrefBuilder: (value: string) => string;
  onSave: (nextValue: string | null) => Promise<void>;
  linkClassName: string;
}

interface ContactTypeCellProps {
  contactId: string;
  type: ContactType;
  contactTypes: readonly string[];
}

interface ContactCompanyCellProps {
  contactId: string;
  company: ContactWithCompany["companies"];
  companies: CompanyWithCounts[];
}

function getDateRangeValue(value: unknown): DateRangeFilterValue | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const nextValue = value as DateRangeFilterValue;
  return nextValue.from || nextValue.to ? nextValue : undefined;
}

/**
 * Converts quick-edit payloads to the nullable text shape expected by contact updates.
 */
function toNullableTextValue(nextValue: string | number | null): string | null {
  return typeof nextValue === "string" ? nextValue : null;
}

/**
 * Builds a stable set of company select options, preserving the current linked company when needed.
 */
function buildCompanyOptions(
  companies: CompanyWithCounts[],
  currentCompany: ContactWithCompany["companies"],
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

/**
 * Renders a read-mode link plus an explicit edit affordance for one contact field.
 */
function ContactLinkEditCell({
  ariaLabel,
  value,
  hrefBuilder,
  onSave,
  linkClassName,
}: ContactLinkEditCellProps) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {value ? (
        <a
          href={hrefBuilder(value)}
          className={linkClassName}
          onClick={(event) => event.stopPropagation()}
        >
          {value}
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
function ContactPhoneCell({ contactId, phone }: { contactId: string; phone: string | null }) {
  const updateContact = useUpdateContact(contactId);

  return (
    <ContactLinkEditCell
      ariaLabel="Phone"
      value={phone}
      hrefBuilder={(value) => `tel:${value}`}
      linkClassName="block max-w-[180px] truncate text-foreground/80 hover:underline"
      onSave={async (nextValue) => {
        await updateContact.mutateAsync({ phone: nextValue });
      }}
    />
  );
}

/**
 * Handles inline email edits while preserving the mailto: link in read mode.
 */
function ContactEmailCell({ contactId, email }: { contactId: string; email: string | null }) {
  const updateContact = useUpdateContact(contactId);

  return (
    <ContactLinkEditCell
      ariaLabel="Email"
      value={email}
      hrefBuilder={(value) => `mailto:${value}`}
      linkClassName="block max-w-[250px] truncate text-foreground/80 hover:underline"
      onSave={async (nextValue) => {
        await updateContact.mutateAsync({ email: nextValue });
      }}
    />
  );
}

/**
 * Keeps the contact type badge visible in read mode and delegates changes to the quick-edit control.
 */
function ContactTypeCell({ contactId, type, contactTypes }: ContactTypeCellProps) {
  const updateContact = useUpdateContact(contactId);
  const options = useMemo(() => buildCrmSelectOptions(contactTypes, type), [contactTypes, type]);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <DictionaryValue
        value={type}
        map={contactTypeDictionaryMap}
        fallback={<span>{formatCrmEnumLabel(type)}</span>}
        className="text-sm"
      />
      <QuickEditCell
        ariaLabel="Type"
        value={type}
        hideDisplayValue
        type="select"
        options={options}
        onSave={async (nextValue) => {
          const nextType = toNullableTextValue(nextValue);

          if (!nextType) {
            return;
          }

          await updateContact.mutateAsync({ type: nextType });
        }}
      />
    </div>
  );
}

/**
 * Preserves the linked company in read mode and allows reassignment from the list.
 */
function ContactCompanyCell({ contactId, company, companies }: ContactCompanyCellProps) {
  const updateContact = useUpdateContact(contactId);
  const options = useMemo(() => buildCompanyOptions(companies, company), [companies, company]);

  return (
    <div className="flex min-w-0 items-center gap-2">
      {company?.company_id ? (
        <Link
          href={`/customers/companies/${company.company_id}`}
          className="block max-w-[220px] truncate text-foreground/80 hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {company.name}
        </Link>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
      <QuickEditCell
        ariaLabel="Company"
        value={company?.company_id ?? noCompanyOptionValue}
        hideDisplayValue
        type="select"
        options={options}
        onSave={async (nextValue) => {
          const nextCompanyId = typeof nextValue === "string" && nextValue !== noCompanyOptionValue
            ? nextValue
            : null;

          await updateContact.mutateAsync({ company_id: nextCompanyId });
        }}
      />
    </div>
  );
}

export default function PeoplePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: crmConfigResult } = useCrmConfig();
  const { data: companies = [] } = useCompanies({});
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<FilterValues>({});

  const filters = useMemo<FilterDef[]>(
    () => [
      {
        id: "type",
        label: "Type",
        type: "select",
        options: (crmConfigResult?.config.contact_types ?? contactTypeValues).map((type) => ({
          value: type,
          label: formatCrmEnumLabel(type),
        })),
      },
      {
        id: "hasEmail",
        label: "Has Email",
        type: "checkbox",
      },
      {
        id: "hasPhone",
        label: "Has Phone",
        type: "checkbox",
      },
      {
        id: "createdAt",
        label: "Created At",
        type: "dateRange",
      },
    ],
    [crmConfigResult?.config.contact_types],
  );

  const queryFilters = useMemo(
    () => ({
      search: search.trim() || undefined,
      type: typeof filterValues.type === "string" ? (filterValues.type as ContactType) : undefined,
      hasEmail: typeof filterValues.hasEmail === "boolean" ? filterValues.hasEmail : undefined,
      hasPhone: typeof filterValues.hasPhone === "boolean" ? filterValues.hasPhone : undefined,
      createdAt: getDateRangeValue(filterValues.createdAt),
      page,
      pageSize,
    }),
    [filterValues.createdAt, filterValues.hasEmail, filterValues.hasPhone, filterValues.type, page, search],
  );

  const contactTypes = crmConfigResult?.config.contact_types ?? contactTypeValues;
  const { data, isLoading, isError, refetch } = usePaginatedContacts(queryFilters);
  const deletePerson = useMutation({
    mutationFn: async ({ contactId }: { contactId: string }) => {
      const { error } = await supabase.from("contacts").delete().eq("contact_id", contactId);

      if (error) {
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: contactKeys.all });
      toast.success("Person deleted.");
    },
    onError: () => {
      toast.error("Unable to delete this person.");
    },
  });

  const rows = data?.rows ?? [];
  const columns = useMemo<ColumnDef<ContactWithCompany>[]>(
    () => [
      {
        accessorKey: "contact_id",
        header: "Name",
        sortingFn: (rowA, rowB) =>
          formatContactFullName(rowA.original).localeCompare(formatContactFullName(rowB.original)),
        cell: ({ row }) => (
          <Link
            href={`/customers/people/${row.original.contact_id}`}
            className="block max-w-[250px] truncate font-medium text-foreground hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {formatContactFullName(row.original)}
          </Link>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <ContactEmailCell contactId={row.original.contact_id} email={row.original.email} />
        ),
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => (
          <ContactPhoneCell contactId={row.original.contact_id} phone={row.original.phone} />
        ),
      },
      {
        id: "company",
        header: "Company",
        accessorFn: (row) => row.companies?.name ?? "",
        cell: ({ row }) => (
          <ContactCompanyCell
            contactId={row.original.contact_id}
            company={row.original.companies}
            companies={companies}
          />
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
          <ContactTypeCell
            contactId={row.original.contact_id}
            type={row.original.type}
            contactTypes={contactTypes}
          />
        ),
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
    [companies, contactTypes],
  );

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <DataTable
        title={(
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">People</h1>
        )}
        columns={columns}
        data={rows}
        isLoading={isLoading}
        error={isError ? <span>Unable to load people.</span> : null}
        emptyState={(
          <EmptyState
            iconName="contacts"
            title={search.trim() || Object.keys(filterValues).length > 0 ? "No results match your filters" : "No people yet"}
            description={search.trim() || Object.keys(filterValues).length > 0
              ? "Try adjusting or clearing your filters."
              : "Your AI agent will create contacts as it processes conversations."}
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
          <Button type="button" variant="ghost" size="icon" aria-label="Refresh people" onClick={() => void refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
        rowActions={(row) => [
          {
            id: "view",
            label: "View",
            href: `/customers/people/${row.contact_id}`,
          },
          {
            id: "open",
            label: "Open in New Tab",
            href: `/customers/people/${row.contact_id}`,
            newTab: true,
          },
          {
            id: "delete",
            label: "Delete",
            destructive: true,
            onSelect: () => {
              if (!window.confirm(`Delete ${formatContactFullName(row)}? This cannot be undone.`)) {
                return;
              }

              deletePerson.mutate({ contactId: row.contact_id });
            },
          },
        ]}
        onRowClick={(row) => router.push(`/customers/people/${row.contact_id}`)}
        searchValue={search}
        onSearchChange={(value) => {
          setPage(1);
          setSearch(value);
        }}
        searchPlaceholder="Search people..."
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
