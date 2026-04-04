/**
 * Contact-specific record drawer body.
 * @module components/crm/record-drawer/contact-drawer-content
 */
"use client";

import { type ReactNode, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Building2, Clock3, House, ListTodo, Mail, Phone, StickyNote, Tag } from "lucide-react";

import { DrawerNotesTab } from "./drawer-notes-tab";

import { ContactTimeline } from "@/components/crm/contact-timeline";
import { LinkedTasksSection } from "@/components/crm/detail/linked-tasks-section";
import { InlineEditField } from "@/components/crm/inline-edit-field";
import { StageBadge } from "@/components/crm/stage-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

import { CollapsibleFieldGroup } from "./collapsible-field-group";
import { CustomFieldEditors } from "./custom-field-editors";
import { DrawerSection } from "./drawer-section";
import { RecordDetailPanelFooter } from "./record-detail-panel-footer";
import { RecordDetailPanelShell } from "./record-detail-panel-shell";

interface ContactDrawerContentProps {
  /** Contact id selected in the drawer. */
  contactId: string;
  /** Optional close control for inline desktop panels. */
  closeButton?: ReactNode;
}

type ContactDrawerTab = "home" | "timeline" | "tasks" | "notes";

/**
 * Renders contact details, linked deals, and activity timeline.
 */
export function ContactDrawerContent({ contactId, closeButton }: ContactDrawerContentProps) {
  const { data: contact, isLoading, isError } = useContact(contactId);
  const { data: linkedDeals = [] } = useContactDeals(contactId);
  const { data: linkedTasks = [] } = useContactTasks(contactId);
  const { data: companies = [] } = useCompanies({});
  const { data: crmConfigResult } = useCrmConfig();
  const updateContact = useUpdateContact(contactId);
  const [activeTab, setActiveTab] = useState<ContactDrawerTab>("home");

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

  const fullName = formatContactFullName(contact);
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
  const tabs: Array<{ id: ContactDrawerTab; label: string; icon: ReactNode }> = [
    { id: "home", label: "Home", icon: <House className="h-4 w-4" /> },
    { id: "timeline", label: "Timeline", icon: <Clock3 className="h-4 w-4" /> },
    { id: "tasks", label: "Tasks", icon: <ListTodo className="h-4 w-4" /> },
    { id: "notes", label: "Notes", icon: <StickyNote className="h-4 w-4" /> },
  ];

  return (
    <RecordDetailPanelShell
      title={fullName}
      meta={`Updated ${formatDistanceToNow(new Date(contact.updated_at), { addSuffix: true })}`}
      closeButton={closeButton}
      avatar={
        <Avatar size="sm">
          <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
            {fullName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      }
      badge={(
        <Badge variant={contactTypeBadgeVariantMap[contact.type] ?? "secondary"}>
          {formatCrmEnumLabel(contact.type)}
        </Badge>
      )}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      footer={<RecordDetailPanelFooter />}
    >
      {activeTab === "home" ? (
        <div className="space-y-5">
          <DrawerSection title="Fields">
            <CollapsibleFieldGroup label="General">
              <InlineEditField
                icon={<Phone className="h-4 w-4" />}
                label="Phone"
                value={contact.phone}
                onSave={async (nextValue) => {
                  await updateContact.mutateAsync({ phone: toNullableValue(nextValue) });
                }}
              />
              <InlineEditField
                icon={<Mail className="h-4 w-4" />}
                label="Email"
                value={contact.email}
                onSave={async (nextValue) => {
                  await updateContact.mutateAsync({ email: toNullableValue(nextValue) });
                }}
              />
              <InlineEditField
                icon={<Building2 className="h-4 w-4" />}
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
                icon={<Tag className="h-4 w-4" />}
                label="Type"
                value={contact.type}
                type="select"
                options={contactTypeOptions}
                onSave={async (nextValue) => {
                  await updateContact.mutateAsync({ type: nextValue as Contact["type"] });
                }}
              />
            </CollapsibleFieldGroup>
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

      {activeTab === "notes" ? (
        <DrawerNotesTab
          recordType="contact"
          recordId={contactId}
        />
      ) : null}
    </RecordDetailPanelShell>
  );
}
