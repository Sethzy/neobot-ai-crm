/**
 * Shared contact detail surface used by both the drawer and full page.
 * @module components/crm/record-detail/contact-detail-content
 */
"use client";

import { type ReactNode, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Building2, Clock3, House, ListTodo, Mail, Paperclip, Phone, StickyNote, Tag } from "lucide-react";

import { LinkedTasksSection } from "@/components/crm/detail/linked-tasks-section";
import { CrmRecordDetailSkeleton } from "@/components/crm/crm-record-detail-skeleton";
import { InlineEditField } from "@/components/crm/inline-edit-field";
import { StageBadge } from "@/components/crm/stage-badge";
import { UnifiedTimeline } from "@/components/crm/timeline/unified-timeline";
import { useCurrentCrmWorkspaceHref } from "@/components/crm/use-record-open-behavior";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useContactDeals, useContactTasks } from "@/hooks/use-contact-relations";
import { useCompanies } from "@/hooks/use-companies";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { useContact } from "@/hooks/use-contacts";
import { useUpdateContact } from "@/hooks/use-update-contact";
import type { ContactWithCompany } from "@/lib/crm/contact-record";
import {
  buildCrmSelectOptions,
  contactTypeBadgeVariantMap,
  formatContactFullName,
  formatCrmEnumLabel,
  parseCustomFieldInputValue,
  toNullableValue,
} from "@/lib/crm/display";
import { getCrmRecordHref } from "@/lib/crm/navigation";
import {
  validateEmailForSave,
  validatePhoneForSave,
} from "@/lib/crm/normalize";
import { contactTypeValues, type Contact } from "@/lib/crm/schemas";

import { DrawerFilesTab } from "../record-drawer/drawer-files-tab";
import { DrawerNotesTab } from "../record-drawer/drawer-notes-tab";
import { CollapsibleFieldGroup } from "../record-drawer/collapsible-field-group";
import { CustomFieldEditors } from "../record-drawer/custom-field-editors";
import { DrawerSection } from "../record-drawer/drawer-section";
import { RecordDetailPanelFooter } from "../record-drawer/record-detail-panel-footer";
import { RecordDetailPanelShell } from "../record-drawer/record-detail-panel-shell";

interface ContactDetailContentProps {
  /** Contact id selected in the current detail surface. */
  contactId: string;
  /** Drawer keeps quick inspection; page mode is for deeper work. */
  surface?: "drawer" | "page";
  /** Server-fetched detail record used to avoid a cold page transition. */
  initialContact?: ContactWithCompany;
}

type ContactDrawerTab = "home" | "timeline" | "tasks" | "notes" | "files";

/**
 * Renders contact details, linked deals, and the unified activity timeline.
 */
export function ContactDetailContent({
  contactId,
  surface = "drawer",
  initialContact,
}: ContactDetailContentProps) {
  const [activeTab, setActiveTab] = useState<ContactDrawerTab>("home");
  const { data: contact, isLoading, isError } = useContact(contactId, {
    initialData: initialContact,
  });
  const { data: linkedDeals = [] } = useContactDeals(contactId);
  const { data: linkedTasks = [] } = useContactTasks(contactId, {
    enabled: activeTab === "tasks",
  });
  const { data: companies = [] } = useCompanies({});
  const { data: crmConfigResult } = useCrmConfig();
  const updateContact = useUpdateContact(contactId);
  const isDrawerSurface = surface === "drawer";
  const currentWorkspaceHref = useCurrentCrmWorkspaceHref();

  if (isLoading) {
    return <CrmRecordDetailSkeleton tabCount={5} />;
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
    { id: "files", label: "Files", icon: <Paperclip className="h-4 w-4" /> },
  ];

  return (
    <RecordDetailPanelShell
      title={fullName}
      onTitleSave={async (next) => {
        // Split on first whitespace: first token is first_name, rest is last_name.
        // Mirrors Attio/Linear behavior on full-name edits.
        const [firstToken, ...restTokens] = next.split(/\s+/);
        await updateContact.mutateAsync({
          first_name: firstToken ?? next,
          last_name: restTokens.join(" "),
        });
      }}
      meta={`Updated ${formatDistanceToNow(new Date(contact.updated_at), { addSuffix: true })}`}
      avatar={
        <Avatar size="lg">
          <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
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
      maxVisibleTabs={5}
      reserveTrailingSpace={isDrawerSurface}
      footer={
        <RecordDetailPanelFooter
          openHref={
            isDrawerSurface
              ? getCrmRecordHref("contact", contactId, { returnTo: currentWorkspaceHref })
              : undefined
          }
        />
      }
    >
      {activeTab === "home" ? (
        <div className="space-y-5">
          <DrawerSection title="Fields">
            <CollapsibleFieldGroup label="General">
              <InlineEditField
                icon={<Phone className="h-4 w-4" />}
                label="Phone"
                value={contact.phone}
                inputType="tel"
                parseValue={validatePhoneForSave}
                onSave={async (nextValue) => {
                  await updateContact.mutateAsync({ phone: toNullableValue(nextValue) });
                }}
              />
              <InlineEditField
                icon={<Mail className="h-4 w-4" />}
                label="Email"
                value={contact.email}
                inputType="email"
                parseValue={validateEmailForSave}
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
          <UnifiedTimeline
            recordType="contact"
            recordId={contactId}
          />
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

      {activeTab === "files" ? (
        <DrawerFilesTab
          recordType="contact"
          recordId={contactId}
        />
      ) : null}
    </RecordDetailPanelShell>
  );
}
