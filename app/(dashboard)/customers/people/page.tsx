/**
 * Customers people list page.
 * @module app/(dashboard)/customers/people/page
 */
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Users } from "lucide-react";
import { RefreshCw } from "@/components/icons/lucide-compat";
import { toast } from "sonner";

import { CrmListPanelLayout } from "@/components/crm/crm-list-panel-layout";
import { DictionaryValue, contactTypeDictionaryMap } from "@/components/crm/dictionary-value";
import { QuickEditCell } from "@/components/crm/quick-edit-cell";
import { ContactDrawerContent } from "@/components/crm/record-drawer/contact-drawer-content";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import type { DateRangeFilterValue, FilterDef, FilterValues } from "@/components/ui/filter-overlay";
import { Button } from "@/components/ui/button";
import { contactKeys, type ContactWithCompany, type ContactType, usePaginatedContacts } from "@/hooks/use-contacts";
import { type CompanyWithCounts, useCompanies } from "@/hooks/use-companies";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { useRecordDrawer } from "@/hooks/use-record-drawer";
import { useUpdateContact } from "@/hooks/use-update-contact";
import { buildColumnsFromConfig } from "@/lib/crm/build-columns";
import { CONTACT_DEFAULT_FIELDS } from "@/lib/crm/field-definitions";
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
  onSave: (nextValue: string | number | null) => void | Promise<void>;
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
    <QuickEditCell
      ariaLabel={ariaLabel}
      value={value}
      onSave={onSave}
    >
      {value ? (
        <a
          href={hrefBuilder(value)}
          className={linkClassName}
          onClick={(event) => event.stopPropagation()}
        >
          {value}
        </a>
      ) : null}
    </QuickEditCell>
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
        const val = nextValue != null ? String(nextValue) : null;
        await updateContact.mutateAsync({ phone: val });
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
        const val = nextValue != null ? String(nextValue) : null;
        await updateContact.mutateAsync({ email: val });
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
    <QuickEditCell
      ariaLabel="Type"
      value={type}
      type="select"
      options={options}
      onSave={async (nextValue) => {
        const nextType = toNullableTextValue(nextValue);

        if (!nextType) {
          return;
        }

        await updateContact.mutateAsync({ type: nextType });
      }}
    >
      <DictionaryValue
        value={type}
        map={contactTypeDictionaryMap}
        fallback={<span>{formatCrmEnumLabel(type)}</span>}
        className="text-sm"
      />
    </QuickEditCell>
  );
}

/**
 * Preserves the linked company in read mode and allows reassignment from the list.
 */
function ContactCompanyCell({ contactId, company, companies }: ContactCompanyCellProps) {
  const updateContact = useUpdateContact(contactId);
  const options = useMemo(() => buildCompanyOptions(companies, company), [companies, company]);

  return (
    <QuickEditCell
      ariaLabel="Company"
      value={company?.company_id ?? noCompanyOptionValue}
      type="select"
      options={options}
      onSave={async (nextValue) => {
        const nextCompanyId = typeof nextValue === "string" && nextValue !== noCompanyOptionValue
          ? nextValue
          : null;

        await updateContact.mutateAsync({ company_id: nextCompanyId });
      }}
    >
      {company?.company_id ? (
        <Link
          href={`/customers/companies/${company.company_id}`}
          className="block max-w-[220px] truncate text-foreground/80 hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {company.name}
        </Link>
      ) : null}
    </QuickEditCell>
  );
}

export default function PeoplePage() {
  const { recordId, open } = useRecordDrawer();
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

  /**
   * Build columns from the config-driven field definition array, then override
   * specific column keys to restore the rich cell renderers (links, quick-edit,
   * badges). The field definitions use logical keys (`emails`, `phones`,
   * `company_id`) that don't always match actual DB column names, so each
   * override reads from `row.original` directly instead of relying on the base
   * accessorFn.
   */
  const crmConfig = crmConfigResult?.config;
  const columns = useMemo<ColumnDef<ContactWithCompany>[]>(() => {
    const contactFields = crmConfig?.contact_fields ?? CONTACT_DEFAULT_FIELDS;
    const base = buildColumnsFromConfig<ContactWithCompany>(contactFields, "contacts");

    return base.map((col) => {
      switch (col.id) {
        case "name":
          return {
            ...col,
            /** Sort by the rendered full name rather than the raw column value. */
            sortingFn: (rowA: { original: ContactWithCompany }, rowB: { original: ContactWithCompany }) =>
              formatContactFullName(rowA.original).localeCompare(formatContactFullName(rowB.original)),
            cell: ({ row }: { row: { original: ContactWithCompany } }) => (
              <Link
                href={`/customers/people/${row.original.contact_id}`}
                className="block max-w-[250px] truncate font-medium text-foreground hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                {formatContactFullName(row.original)}
              </Link>
            ),
          };
        case "emails":
          return {
            ...col,
            cell: ({ row }: { row: { original: ContactWithCompany } }) => (
              <ContactEmailCell contactId={row.original.contact_id} email={row.original.email} />
            ),
          };
        case "phones":
          return {
            ...col,
            cell: ({ row }: { row: { original: ContactWithCompany } }) => (
              <ContactPhoneCell contactId={row.original.contact_id} phone={row.original.phone} />
            ),
          };
        case "company_id":
          return {
            ...col,
            /** Read from the joined companies object rather than the raw FK. */
            accessorFn: (row: ContactWithCompany) => row.companies?.name ?? "",
            cell: ({ row }: { row: { original: ContactWithCompany } }) => (
              <ContactCompanyCell
                contactId={row.original.contact_id}
                company={row.original.companies}
                companies={companies}
              />
            ),
          };
        case "type":
          return {
            ...col,
            cell: ({ row }: { row: { original: ContactWithCompany } }) => (
              <ContactTypeCell
                contactId={row.original.contact_id}
                type={row.original.type}
                contactTypes={contactTypes}
              />
            ),
          };
        case "updated_at":
          return {
            ...col,
            cell: ({ row }: { row: { original: ContactWithCompany } }) => (
              <span className="whitespace-nowrap text-muted-foreground">
                {formatCrmDate(row.original.updated_at)}
              </span>
            ),
          };
        default:
          return col;
      }
    });
  }, [crmConfig, companies, contactTypes]);

  return (
    <CrmListPanelLayout
      objectType="contact"
      fullPageRoutePrefix="/customers/people"
      renderPanelContent={(id) => <ContactDrawerContent contactId={id} />}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="flex items-center justify-between bg-sidebar px-4 py-3 md:px-8">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-sm font-medium text-foreground">People</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" aria-label="Refresh people" onClick={() => void refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="More table actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="sm">Export</Button>
          </div>
        </div>
        <div className="mr-2 flex-1 rounded-t-xl border-l border-t border-border/60 bg-card px-3 pt-3 md:px-4">
        <DataTable
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
          rowActions={(row) => [
            {
              id: "view",
              label: "View",
              onSelect: () => open(row.contact_id),
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
          onRowClick={(row) => open(row.contact_id)}
          selectedRowId={recordId ?? undefined}
          getRowId={(row) => row.contact_id}
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
      </div>
    </CrmListPanelLayout>
  );
}
