/**
 * Customers people list page.
 * @module app/(dashboard)/customers/people/page
 */
"use client";

import Link from "next/link";
import { memo, useCallback, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { applyViewColumns } from "@/components/crm/apply-view-columns";
import {
  EmailQuickEditCell,
  PhoneQuickEditCell,
  SelectQuickEditCell,
} from "@/components/crm/crm-inline-cells";
import { CrmWorkspaceShell } from "@/components/crm/crm-workspace-shell";
import { RecordLinkCell } from "@/components/crm/record-link-cell";
import { RecordDrawer } from "@/components/crm/record-drawer";
import { useActiveCrmViewState } from "@/components/crm/use-active-crm-view-state";
import { useCrmListRouteState } from "@/components/crm/use-crm-list-route-state";
import { useRecordOpenBehavior } from "@/components/crm/use-record-open-behavior";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { EmptyState } from "@/components/ui/empty-state";
import type { DateRangeFilterValue, FilterDef, FilterValues } from "@/components/ui/filter-overlay";

import { contactKeys, type ContactWithCompany, type ContactType, usePaginatedContacts } from "@/hooks/use-contacts";
import { EMPTY_COMPANY_FILTERS, type CompanyWithCounts, useCompanies } from "@/hooks/use-companies";
import { useClientId } from "@/hooks/use-client-id";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { useCrmViews } from "@/hooks/use-crm-views";
import { useRecordDrawer } from "@/hooks/use-record-drawer";
import { useUpdateFieldWidth } from "@/hooks/use-update-field-width";
import { useUpdateContact } from "@/hooks/use-update-contact";
import { captureRecordCacheSnapshot, removeCachedRecord, restoreRecordCacheSnapshot } from "@/hooks/crm-cache-updates";
import { buildColumnsFromConfig } from "@/lib/crm/build-columns";
import { CONTACT_DEFAULT_FIELDS } from "@/lib/crm/field-definitions";
import { buildCrmSelectOptions, formatContactFullName, formatCrmDate, formatCrmEnumLabel } from "@/lib/crm/display";
import { captureTimelineActivity } from "@/lib/crm/timeline-capture";
import { timelineActivityKeys } from "@/hooks/use-unified-timeline";
import { contactTypeValues } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

const pageSize = 20;
const noCompanyOptionValue = "__none__";

interface ContactTypeCellProps {
  contactId: string;
  type: ContactType;
  contactTypes: readonly string[];
}

interface ContactCompanyCellProps {
  contactId: string;
  companyId: string | null;
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
 * Handles inline phone edits while preserving the tel: link in read mode.
 */
const ContactPhoneCell = memo(function ContactPhoneCell({
  contactId,
  phone,
}: {
  contactId: string;
  phone: string | null;
}) {
  const { mutateAsync: updateContactAsync } = useUpdateContact(contactId);
  const handleSavePhone = useCallback(
    async (nextValue: string | number | null) => {
      const val = nextValue != null ? String(nextValue) : null;
      await updateContactAsync({ phone: val });
    },
    [updateContactAsync],
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
const ContactEmailCell = memo(function ContactEmailCell({
  contactId,
  email,
}: {
  contactId: string;
  email: string | null;
}) {
  const { mutateAsync: updateContactAsync } = useUpdateContact(contactId);
  const handleSaveEmail = useCallback(
    async (nextValue: string | number | null) => {
      const val = nextValue != null ? String(nextValue) : null;
      await updateContactAsync({ email: val });
    },
    [updateContactAsync],
  );

  return (
    <EmailQuickEditCell
      ariaLabel="Email"
      value={email}
      linkClassName="block max-w-[250px] truncate text-foreground/80 hover:underline"
      onSave={handleSaveEmail}
    />
  );
});

/**
 * Keeps the contact type badge visible in read mode and delegates changes to the quick-edit control.
 */
const ContactTypeCell = memo(function ContactTypeCell({
  contactId,
  type,
  contactTypes,
}: ContactTypeCellProps) {
  const { mutateAsync: updateContactAsync } = useUpdateContact(contactId);
  const options = useMemo(() => buildCrmSelectOptions(contactTypes, type), [contactTypes, type]);
  const displayValue = useMemo(() => formatCrmEnumLabel(type), [type]);
  const handleSaveType = useCallback(
    async (nextValue: string | number | null) => {
      const nextType = toNullableTextValue(nextValue);

      if (!nextType) {
        return;
      }

      await updateContactAsync({ type: nextType });
    },
    [updateContactAsync],
  );

  return (
    <SelectQuickEditCell
      ariaLabel="Type"
      value={type}
      displayValue={displayValue}
      options={options}
      onSave={handleSaveType}
    />
  );
});

/**
 * Preserves the linked company in read mode and allows reassignment from the list.
 */
const ContactCompanyCell = memo(function ContactCompanyCell({
  contactId,
  companyId,
  company,
  companies,
}: ContactCompanyCellProps) {
  const { mutateAsync: updateContactAsync } = useUpdateContact(contactId);
  const options = useMemo(() => buildCompanyOptions(companies, company), [companies, company]);
  const companyLabel = useMemo(() => {
    if (!companyId) {
      return null;
    }

    return options.find((option) => option.value === companyId)?.label ?? company?.name ?? null;
  }, [company?.name, companyId, options]);
  const linkContent = useMemo(() => {
    if (!companyId || !companyLabel) {
      return null;
    }

    return (
      <Link
        href={`/customers/companies/${companyId}`}
        className="block max-w-[220px] truncate text-foreground/80 hover:underline"
        onClick={(event) => event.stopPropagation()}
      >
        {companyLabel}
      </Link>
    );
  }, [companyId, companyLabel]);
  const handleSaveCompany = useCallback(
    async (nextValue: string | number | null) => {
      const nextCompanyId = typeof nextValue === "string" && nextValue !== noCompanyOptionValue
        ? nextValue
        : null;

      await updateContactAsync({ company_id: nextCompanyId });
    },
    [updateContactAsync],
  );

  return (
    <SelectQuickEditCell
      ariaLabel="Company"
      value={companyId ?? noCompanyOptionValue}
      displayValue={companyLabel}
      options={options}
      onSave={handleSaveCompany}
    >
      {linkContent}
    </SelectQuickEditCell>
  );
});

export default function PeoplePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { recordId, open, close, isOpen: isDrawerOpen } = useRecordDrawer();
  const queryClient = useQueryClient();
  const { data: clientId } = useClientId();
  const { data: crmConfigResult } = useCrmConfig();
  const { data: companies = [] } = useCompanies(EMPTY_COMPANY_FILTERS);
  const { data: views } = useCrmViews("contacts");
  const [page, setPage] = useState(1);
  const [filterValues, setFilterValues] = useState<FilterValues>({});
  const {
    savedViewId,
    handleSavedViewChange: handleSavedViewRouteChange,
  } = useCrmListRouteState({
    basePath: "/customers/people",
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
    objectType: "contact",
    openDrawer: open,
    openMode,
  });

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
      ...(isSavedViewActive
        ? {
            viewFilters: activeState?.filters ?? {},
            viewSort: activeState?.sort ?? undefined,
          }
        : {
            type: typeof filterValues.type === "string" ? (filterValues.type as ContactType) : undefined,
            hasEmail: typeof filterValues.hasEmail === "boolean" ? filterValues.hasEmail : undefined,
            hasPhone: typeof filterValues.hasPhone === "boolean" ? filterValues.hasPhone : undefined,
            createdAt: getDateRangeValue(filterValues.createdAt),
          }),
      page,
      pageSize,
    }),
    [activeState?.filters, activeState?.sort, filterValues.createdAt, filterValues.hasEmail, filterValues.hasPhone, filterValues.type, isSavedViewActive, page],
  );

  const contactTypes = crmConfigResult?.config.contact_types ?? contactTypeValues;
  const { data, isLoading, isError } = usePaginatedContacts(queryFilters);
  const hasLocalFilters = Object.keys(filterValues).length > 0;
  const hasActiveFiltering = isSavedViewActive || hasLocalFilters;

  const createContact = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("contacts")
        .insert({ client_id: clientId, first_name: "New", last_name: "Contact", type: contactTypes[0] })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (createdContact) => {
      // Seed the detail cache with the freshly-inserted row so the drawer
      // mounts with data and skips its skeleton flicker.
      queryClient.setQueryData(contactKeys.detail(createdContact.contact_id), {
        ...createdContact,
        companies: null,
      });
      open(createdContact.contact_id);
      void queryClient.invalidateQueries({ queryKey: contactKeys.all });
      void captureTimelineActivity({
        supabase,
        clientId: createdContact.client_id,
        recordType: "contact",
        recordId: createdContact.contact_id,
        action: "created",
        actorType: "user",
        after: createdContact,
      }).then((ok) => {
        if (ok) {
          void queryClient.invalidateQueries({
            queryKey: timelineActivityKeys.record("contact", createdContact.contact_id),
          });
        }
      });
    },
    onError: () => {
      toast.error("Unable to create contact.");
    },
  });

  const deletePerson = useMutation({
    mutationFn: async ({ contactId }: { contactId: string }) => {
      const { data: existingContact, error: readError } = await supabase
        .from("contacts")
        .select("*")
        .eq("contact_id", contactId)
        .single();

      if (readError) {
        throw readError;
      }

      const { error } = await supabase.from("contacts").delete().eq("contact_id", contactId);

      if (error) {
        throw error;
      }

      return existingContact;
    },
    onMutate: async ({ contactId }: { contactId: string }) => {
      await queryClient.cancelQueries({ queryKey: contactKeys.all });

      const cacheSnapshot = captureRecordCacheSnapshot({
        queryClient,
        detailKey: contactKeys.detail(contactId),
        listKeyPrefix: contactKeys.lists(),
      });

      removeCachedRecord<ContactWithCompany>({
        queryClient,
        detailKey: contactKeys.detail(contactId),
        listKeyPrefix: contactKeys.lists(),
        idKey: "contact_id",
        recordId: contactId,
      });

      return { cacheSnapshot };
    },
    onSuccess: async (deletedContact) => {
      void captureTimelineActivity({
        supabase,
        clientId: deletedContact.client_id,
        recordType: "contact",
        recordId: deletedContact.contact_id,
        action: "deleted",
        actorType: "user",
        before: deletedContact,
      }).then((ok) => {
        if (ok) {
          void queryClient.invalidateQueries({
            queryKey: timelineActivityKeys.record("contact", deletedContact.contact_id),
          });
        }
      });

      toast.success("Person deleted.");
    },
    onError: (_error, { contactId }, context) => {
      if (context) {
        restoreRecordCacheSnapshot({
          queryClient,
          detailKey: contactKeys.detail(contactId),
          ...context.cacheSnapshot,
        });
      }

      toast.error("Unable to delete this person.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: contactKeys.all });
    },
  });
  const { mutate: deletePersonMutation } = deletePerson;

  function handleSavedViewChange(viewId: string | null) {
    setPage(1);
    handleSavedViewRouteChange(viewId);
  }

  const rows = data?.rows ?? [];
  const handleContactRowClick = useCallback((row: ContactWithCompany) => {
    openRecord(row.contact_id);
  }, [openRecord]);
  const getContactRowId = useCallback((row: ContactWithCompany) => row.contact_id, []);
  const getContactRowActions = useCallback((row: ContactWithCompany) => [
    { id: "view", label: "View", onSelect: () => openRecord(row.contact_id) },
    {
      id: "delete",
      label: "Delete",
      destructive: true,
      onSelect: () => {
        if (!window.confirm(`Delete ${formatContactFullName(row)}? This cannot be undone.`)) return;
        deletePersonMutation({ contactId: row.contact_id });
      },
    },
  ], [deletePersonMutation, openRecord]);
  const { mutate: updateContactFieldWidth } = useUpdateFieldWidth("contacts");
  const handleContactColumnResize = useCallback(
    (columnId: string, width: number) => {
      updateContactFieldWidth({ columnId, width });
    },
    [updateContactFieldWidth],
  );

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
              <RecordLinkCell
                label={formatContactFullName(row.original)}
                onOpen={() => openRecord(row.original.contact_id)}
              />
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
                companyId={row.original.company_id}
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
  }, [crmConfig, companies, contactTypes, openRecord]);
  const visibleColumns = useMemo(
    () => applyViewColumns(columns, activeState),
    [activeState, columns],
  );

  const newContactButton = (
    <Button
      size="sm"
      onClick={() => createContact.mutate()}
      disabled={!clientId || createContact.isPending}
    >
      <Plus className="h-4 w-4" />
      New
    </Button>
  );

  return (
    <CrmWorkspaceShell
      title="People"
      entityType="contacts"
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
      primaryAction={newContactButton}
      viewType="table"
      bodyByView={{
        table: (
          <ListTable
            columns={visibleColumns}
            data={rows}
            pinFirstColumn
            isLoading={isLoading}
            error={isError ? <span>Unable to load people.</span> : null}
            emptyState={
              <EmptyState
                iconName="contacts"
                title={hasActiveFiltering ? "No results match your filters" : "No people yet"}
                description={
                  hasActiveFiltering
                    ? "Try adjusting or clearing your filters."
                    : "Your AI agent will create contacts as it processes conversations."
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
            rowActions={getContactRowActions}
            onRowClick={handleContactRowClick}
            onColumnResize={handleContactColumnResize}
            selectedRowId={recordId ?? undefined}
            getRowId={getContactRowId}
          />
        ),
      }}
      drawer={(
        <RecordDrawer
          isOpen={isDrawerOpen}
          recordId={recordId}
          objectType="contact"
          onClose={close}
        />
      )}
    />
  );
}
