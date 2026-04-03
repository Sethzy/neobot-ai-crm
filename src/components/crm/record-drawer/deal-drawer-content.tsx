/**
 * Deal-specific record drawer body.
 * @module components/crm/record-drawer/deal-drawer-content
 */
"use client";

import { type ReactNode, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Banknote, Building2, Clock3, House, Kanban, ListTodo, MapPin, StickyNote, Users } from "lucide-react";

import { LinkedContactsSection } from "@/components/crm/detail/linked-contacts-section";
import { LinkedTasksSection } from "@/components/crm/detail/linked-tasks-section";
import { InteractionTimeline } from "@/components/crm/interaction-timeline";
import { InlineEditField } from "@/components/crm/inline-edit-field";
import { StageBadge } from "@/components/crm/stage-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useDealInteractions, useDealTasks } from "@/hooks/use-contact-relations";
import { useCompanies } from "@/hooks/use-companies";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { useDeal } from "@/hooks/use-deals";
import { useUpdateDeal } from "@/hooks/use-update-deal";
import {
  buildCrmSelectOptions,
  formatContactFullName,
  formatCrmEnumLabel,
  formatCrmPrice,
  parseCustomFieldInputValue,
  toNullableValue,
} from "@/lib/crm/display";
import { dealStageValues, type Deal } from "@/lib/crm/schemas";

import { CollapsibleFieldGroup } from "./collapsible-field-group";
import { CustomFieldEditors } from "./custom-field-editors";
import { DrawerSection } from "./drawer-section";
import { RecordDetailPanelFooter } from "./record-detail-panel-footer";
import { RecordDetailPanelShell } from "./record-detail-panel-shell";

interface DealDrawerContentProps {
  /** Deal id selected in the drawer. */
  dealId: string;
  /** Optional close control for inline desktop panels. */
  closeButton?: ReactNode;
}

type DealDrawerTab = "home" | "contacts" | "timeline" | "tasks";

/**
 * Renders deal details, linked contacts, and interaction timeline.
 */
export function DealDrawerContent({ dealId, closeButton }: DealDrawerContentProps) {
  const { data: deal, isLoading, isError } = useDeal(dealId);
  const { data: interactions = [] } = useDealInteractions(dealId);
  const { data: linkedTasks = [] } = useDealTasks(dealId);
  const { data: companies = [] } = useCompanies({});
  const { data: crmConfigResult } = useCrmConfig();
  const updateDeal = useUpdateDeal(dealId);
  const [activeTab, setActiveTab] = useState<DealDrawerTab>("home");

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }

  if (isError || !deal) {
    return <div className="p-6 text-sm text-destructive">Failed to load deal.</div>;
  }

  const dealStageOptions = buildCrmSelectOptions(
    crmConfigResult?.config.deal_stages ?? dealStageValues,
    deal.stage,
  );
  const companyOptions = [
    { value: "__none__", label: "No company" },
    ...companies.map((company) => ({
      value: company.company_id,
      label: company.name,
    })),
  ];
  const dealCustomFields = crmConfigResult?.config.deal_custom_fields ?? [];
  const tabs: Array<{ id: DealDrawerTab; label: string; icon: ReactNode }> = [
    { id: "home", label: "Home", icon: <House className="h-4 w-4" /> },
    { id: "contacts", label: "Contacts", icon: <Users className="h-4 w-4" /> },
    { id: "timeline", label: "Timeline", icon: <Clock3 className="h-4 w-4" /> },
    { id: "tasks", label: "Tasks", icon: <ListTodo className="h-4 w-4" /> },
  ];

  return (
    <RecordDetailPanelShell
      title={deal.address}
      meta={`Updated ${formatDistanceToNow(new Date(deal.updated_at), { addSuffix: true })}`}
      closeButton={closeButton}
      avatar={
        <Avatar size="sm">
          <AvatarFallback className="bg-amber-500/10 text-xs font-medium text-amber-700 dark:text-amber-400">
            {deal.address.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      }
      badge={<StageBadge stage={deal.stage} />}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      footer={<RecordDetailPanelFooter />}
    >
      {activeTab === "home" ? (
        <div className="space-y-6">
          <DrawerSection title="Fields">
            <CollapsibleFieldGroup label="General">
              <InlineEditField
                icon={<MapPin className="h-4 w-4" />}
                label="Address"
                value={deal.address}
                onSave={async (nextValue) => {
                  await updateDeal.mutateAsync({ address: nextValue.trim() });
                }}
              />
              <InlineEditField
                icon={<Kanban className="h-4 w-4" />}
                label="Stage"
                value={deal.stage}
                type="select"
                options={dealStageOptions}
                onSave={async (nextValue) => {
                  await updateDeal.mutateAsync({ stage: nextValue as Deal["stage"] });
                }}
              />
              <InlineEditField
                icon={<Building2 className="h-4 w-4" />}
                label="Company"
                value={deal.company_id}
                type="select"
                options={companyOptions}
                onSave={async (nextValue) => {
                  await updateDeal.mutateAsync({
                    company_id: nextValue === "__none__" ? null : nextValue,
                  });
                }}
              />
              <InlineEditField
                icon={<Banknote className="h-4 w-4" />}
                label="Price"
                value={formatCrmPrice(deal.amount)}
                onSave={async (nextValue) => {
                  const numericPriceString = nextValue.replace(/[^\d.-]/g, "");
                  if (!numericPriceString) {
                    await updateDeal.mutateAsync({ amount: null });
                    return;
                  }

                  const parsedPrice = Number(numericPriceString);
                  if (Number.isNaN(parsedPrice)) {
                    throw new Error("Price must be a valid number.");
                  }

                  await updateDeal.mutateAsync({ amount: Math.round(parsedPrice) });
                }}
              />
              <InlineEditField
                icon={<StickyNote className="h-4 w-4" />}
                label="Notes"
                value={deal.notes}
                type="textarea"
                onSave={async (nextValue) => {
                  await updateDeal.mutateAsync({ notes: toNullableValue(nextValue) });
                }}
              />
            </CollapsibleFieldGroup>
          </DrawerSection>

          {dealCustomFields.length > 0 ? (
            <DrawerSection title="Custom Fields">
              <CustomFieldEditors
                definitions={dealCustomFields}
                values={(deal.custom_fields as Record<string, unknown> | null | undefined) ?? {}}
                onSaveField={async (definition, nextValue) => {
                  await updateDeal.mutateAsync({
                    custom_fields: {
                      [definition.key]: parseCustomFieldInputValue(definition.type, nextValue),
                    },
                  });
                }}
              />
            </DrawerSection>
          ) : null}
        </div>
      ) : null}

      {activeTab === "contacts" ? (
        <DrawerSection title="Contacts">
          <LinkedContactsSection
            contacts={deal.deal_contacts.map((dealContact) => ({
              id: dealContact.contact_id,
              name: dealContact.contacts ? formatContactFullName(dealContact.contacts) : "—",
              badge: formatCrmEnumLabel(dealContact.role),
              meta: dealContact.is_primary ? "Primary contact" : null,
              href: `/customers/people?detail=${dealContact.contact_id}`,
            }))}
            emptyLabel="No linked contacts."
          />
        </DrawerSection>
      ) : null}

      {activeTab === "timeline" ? (
        <DrawerSection title="Activity">
          <InteractionTimeline interactions={interactions} />
        </DrawerSection>
      ) : null}

      {activeTab === "tasks" ? (
        <DrawerSection title="Tasks">
          <LinkedTasksSection tasks={linkedTasks} emptyLabel="No linked tasks." />
        </DrawerSection>
      ) : null}
    </RecordDetailPanelShell>
  );
}
