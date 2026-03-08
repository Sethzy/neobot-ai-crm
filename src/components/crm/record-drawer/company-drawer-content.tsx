/**
 * Company-specific record drawer body.
 * @module components/crm/record-drawer/company-drawer-content
 */
"use client";

import { InlineEditField } from "@/components/crm/inline-edit-field";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyContacts, useCompanyDeals } from "@/hooks/use-company-relations";
import { useCompany } from "@/hooks/use-companies";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { useUpdateCompany } from "@/hooks/use-update-company";
import {
  buildCrmSelectOptions,
  formatContactFullName,
  formatCrmEnumLabel,
  parseCustomFieldInputValue,
  toNullableValue,
} from "@/lib/crm/display";

import { CustomFieldEditors } from "./custom-field-editors";
import { DrawerSection } from "./drawer-section";

interface CompanyDrawerContentProps {
  /** Company id selected in the drawer. */
  companyId: string;
}

/**
 * Renders company details together with linked contacts and deals.
 */
export function CompanyDrawerContent({ companyId }: CompanyDrawerContentProps) {
  const { data: company, isLoading, isError } = useCompany(companyId);
  const { data: linkedContacts = [] } = useCompanyContacts(companyId);
  const { data: linkedDeals = [] } = useCompanyDeals(companyId);
  const { data: crmConfigResult } = useCrmConfig();
  const updateCompany = useUpdateCompany(companyId);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  if (isError || !company) {
    return <div className="p-6 text-sm text-destructive">Failed to load company.</div>;
  }

  const companyIndustryOptions = buildCrmSelectOptions(
    crmConfigResult?.config.company_industries ?? [],
    company.industry,
  );
  const companyCustomFields = crmConfigResult?.config.company_custom_fields ?? [];

  return (
    <div className="space-y-6 overflow-y-auto p-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">{company.name}</h2>
        {company.industry ? <Badge variant="secondary">{formatCrmEnumLabel(company.industry)}</Badge> : null}
      </header>

      <DrawerSection title="Details">
        <div className="space-y-0.5">
          <InlineEditField
            label="Name"
            value={company.name}
            onSave={async (nextValue) => {
              await updateCompany.mutateAsync({ name: nextValue.trim() });
            }}
          />
          <InlineEditField
            label="Industry"
            value={company.industry}
            type="select"
            options={companyIndustryOptions}
            onSave={async (nextValue) => {
              await updateCompany.mutateAsync({ industry: nextValue });
            }}
          />
          <InlineEditField
            label="Website"
            value={company.website}
            onSave={async (nextValue) => {
              await updateCompany.mutateAsync({ website: toNullableValue(nextValue) });
            }}
          />
          <InlineEditField
            label="Phone"
            value={company.phone}
            onSave={async (nextValue) => {
              await updateCompany.mutateAsync({ phone: toNullableValue(nextValue) });
            }}
          />
          <InlineEditField
            label="Email"
            value={company.email}
            onSave={async (nextValue) => {
              await updateCompany.mutateAsync({ email: toNullableValue(nextValue) });
            }}
          />
          <InlineEditField
            label="Address"
            value={company.address}
            onSave={async (nextValue) => {
              await updateCompany.mutateAsync({ address: toNullableValue(nextValue) });
            }}
          />
          <InlineEditField
            label="Notes"
            value={company.notes}
            type="textarea"
            onSave={async (nextValue) => {
              await updateCompany.mutateAsync({ notes: toNullableValue(nextValue) });
            }}
          />
        </div>
      </DrawerSection>

      {companyCustomFields.length > 0 ? (
        <DrawerSection title="Custom Fields">
          <CustomFieldEditors
            definitions={companyCustomFields}
            values={(company.custom_fields as Record<string, unknown> | null | undefined) ?? {}}
            onSaveField={async (definition, nextValue) => {
              await updateCompany.mutateAsync({
                custom_fields: {
                  [definition.key]: parseCustomFieldInputValue(definition.type, nextValue),
                },
              });
            }}
          />
        </DrawerSection>
      ) : null}

      <DrawerSection title="Contacts">
        {linkedContacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No linked contacts.</p>
        ) : (
          <div className="space-y-2">
            {linkedContacts.map((contact) => (
              <div
                key={contact.contact_id}
                className="flex items-center justify-between rounded-lg border border-border/30 px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground/90">{formatContactFullName(contact)}</span>
                <span className="text-xs text-muted-foreground">{formatCrmEnumLabel(contact.type)}</span>
              </div>
            ))}
          </div>
        )}
      </DrawerSection>

      <DrawerSection title="Deals">
        {linkedDeals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No linked deals.</p>
        ) : (
          <div className="space-y-2">
            {linkedDeals.map((deal) => (
              <div
                key={deal.deal_id}
                className="flex items-center justify-between rounded-lg border border-border/30 px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground/90">{deal.address}</span>
                <span className="text-xs text-muted-foreground">{formatCrmEnumLabel(deal.stage)}</span>
              </div>
            ))}
          </div>
        )}
      </DrawerSection>
    </div>
  );
}
