/**
 * Contact-specific record drawer body.
 * @module components/crm/record-drawer/contact-drawer-content
 */
"use client";

import { ContactTimeline } from "@/components/crm/contact-timeline";
import { InlineEditField } from "@/components/crm/inline-edit-field";
import { StageBadge } from "@/components/crm/stage-badge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useContactDeals } from "@/hooks/use-contact-relations";
import { useCompanies } from "@/hooks/use-companies";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { useContact } from "@/hooks/use-contacts";
import { useUpdateContact } from "@/hooks/use-update-contact";
import {
  buildCrmSelectOptions,
  contactTypeBadgeVariantMap,
  formatContactFullName,
  formatCrmEnumLabel,
  parseCustomFieldInputValue,
  toNullableValue,
} from "@/lib/crm/display";
import { contactTypeValues, type Contact } from "@/lib/crm/schemas";

import { CustomFieldEditors } from "./custom-field-editors";
import { DrawerSection } from "./drawer-section";

interface ContactDrawerContentProps {
  /** Contact id selected in the drawer. */
  contactId: string;
}

/**
 * Renders contact details, linked deals, and activity timeline.
 */
export function ContactDrawerContent({ contactId }: ContactDrawerContentProps) {
  const { data: contact, isLoading, isError } = useContact(contactId);
  const { data: linkedDeals = [] } = useContactDeals(contactId);
  const { data: companies = [] } = useCompanies({});
  const { data: crmConfigResult } = useCrmConfig();
  const updateContact = useUpdateContact(contactId);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  if (isError || !contact) {
    return <div className="p-6 text-sm text-destructive">Failed to load contact.</div>;
  }

  const contactTypeOptions = buildCrmSelectOptions(
    crmConfigResult?.config.contact_types ?? contactTypeValues,
    contact.type,
  );
  const companyOptions = [
    { value: "__none__", label: "No company" },
    ...companies.map((company) => ({
      value: company.company_id,
      label: company.name,
    })),
  ];
  const contactCustomFields = crmConfigResult?.config.contact_custom_fields ?? [];

  return (
    <div className="space-y-6 overflow-y-auto p-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">{formatContactFullName(contact)}</h2>
        <Badge variant={contactTypeBadgeVariantMap[contact.type] ?? "secondary"}>
          {formatCrmEnumLabel(contact.type)}
        </Badge>
      </header>

      <DrawerSection title="Details">
        <div className="space-y-0.5">
          <InlineEditField
            label="Phone"
            value={contact.phone}
            onSave={async (nextValue) => {
              await updateContact.mutateAsync({ phone: toNullableValue(nextValue) });
            }}
          />
          <InlineEditField
            label="Email"
            value={contact.email}
            onSave={async (nextValue) => {
              await updateContact.mutateAsync({ email: toNullableValue(nextValue) });
            }}
          />
          <InlineEditField
            label="Company"
            value={contact.company_id}
            type="select"
            options={companyOptions}
            onSave={async (nextValue) => {
              await updateContact.mutateAsync({
                company_id: nextValue === "__none__" ? null : nextValue,
              });
            }}
          />
          <InlineEditField
            label="Type"
            value={contact.type}
            type="select"
            options={contactTypeOptions}
            onSave={async (nextValue) => {
              await updateContact.mutateAsync({ type: nextValue as Contact["type"] });
            }}
          />
          <InlineEditField
            label="Notes"
            value={contact.notes}
            type="textarea"
            onSave={async (nextValue) => {
              await updateContact.mutateAsync({ notes: toNullableValue(nextValue) });
            }}
          />
        </div>
      </DrawerSection>

      {contactCustomFields.length > 0 ? (
        <DrawerSection title="Custom Fields">
          <CustomFieldEditors
            definitions={contactCustomFields}
            values={(contact.custom_fields as Record<string, unknown> | null | undefined) ?? {}}
            onSaveField={async (definition, nextValue) => {
              await updateContact.mutateAsync({
                custom_fields: {
                  [definition.key]: parseCustomFieldInputValue(definition.type, nextValue),
                },
              });
            }}
          />
        </DrawerSection>
      ) : null}

      <DrawerSection title="Deals">
        {linkedDeals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No linked deals.</p>
        ) : (
          <div className="space-y-2">
            {linkedDeals.map((dealLink) => (
              <div
                key={dealLink.deal_contact_id}
                className="flex items-center justify-between rounded-lg border border-border/30 px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground/90">{dealLink.deals?.address ?? "—"}</span>
                {dealLink.deals?.stage ? <StageBadge stage={dealLink.deals.stage} /> : null}
              </div>
            ))}
          </div>
        )}
      </DrawerSection>

      <DrawerSection title="Activity">
        <ContactTimeline contactId={contactId} />
      </DrawerSection>
    </div>
  );
}
