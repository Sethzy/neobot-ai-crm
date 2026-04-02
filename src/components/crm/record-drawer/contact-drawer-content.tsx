/**
 * Contact-specific record drawer body.
 * @module components/crm/record-drawer/contact-drawer-content
 */
"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Clock3, House, ListTodo } from "lucide-react";

import { ContactTimeline } from "@/components/crm/contact-timeline";
import { LinkedTasksSection } from "@/components/crm/detail/linked-tasks-section";
import { InlineEditField } from "@/components/crm/inline-edit-field";
import { StageBadge } from "@/components/crm/stage-badge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useContactDeals, useContactTasks } from "@/hooks/use-contact-relations";
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
import { RecordDetailPanelShell } from "./record-detail-panel-shell";

interface ContactDrawerContentProps {
  /** Contact id selected in the drawer. */
  contactId: string;
}

type ContactDrawerTab = "home" | "timeline" | "tasks";

/**
 * Renders contact details, linked deals, and activity timeline.
 */
export function ContactDrawerContent({ contactId }: ContactDrawerContentProps) {
  const { data: contact, isLoading, isError } = useContact(contactId);
  const { data: linkedDeals = [] } = useContactDeals(contactId);
  const { data: linkedTasks = [] } = useContactTasks(contactId);
  const { data: companies = [] } = useCompanies({});
  const { data: crmConfigResult } = useCrmConfig();
  const updateContact = useUpdateContact(contactId);
  const [activeTab, setActiveTab] = useState<ContactDrawerTab>("home");

  useEffect(() => {
    setActiveTab("home");
  }, [contactId]);

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
  const tabs = [
    { id: "home", label: "Home", icon: <House className="h-4 w-4" /> },
    { id: "timeline", label: "Timeline", icon: <Clock3 className="h-4 w-4" /> },
    { id: "tasks", label: "Tasks", icon: <ListTodo className="h-4 w-4" /> },
  ] satisfies Array<{ id: ContactDrawerTab; label: string; icon: React.ReactNode }>;

  return (
    <div className="min-h-0 overflow-y-auto">
      <RecordDetailPanelShell
        title={formatContactFullName(contact)}
        meta={`Updated ${formatDistanceToNow(new Date(contact.updated_at), { addSuffix: true })}`}
        badge={(
          <Badge variant={contactTypeBadgeVariantMap[contact.type] ?? "secondary"}>
            {formatCrmEnumLabel(contact.type)}
          </Badge>
        )}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {activeTab === "home" ? (
          <div className="space-y-6">
            <DrawerSection title="Fields">
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
          </div>
        ) : null}

        {activeTab === "timeline" ? (
          <DrawerSection title="Activity">
            <ContactTimeline contactId={contactId} />
          </DrawerSection>
        ) : null}

        {activeTab === "tasks" ? (
          <DrawerSection title="Tasks">
            <LinkedTasksSection tasks={linkedTasks} emptyLabel="No linked tasks." />
          </DrawerSection>
        ) : null}
      </RecordDetailPanelShell>
    </div>
  );
}
