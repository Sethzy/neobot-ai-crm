/**
 * Company-specific record drawer body.
 * @module components/crm/record-drawer/company-drawer-content
 */
"use client";

import { type ReactNode, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { BriefcaseBusiness, Building2, Clock3, Globe, House, Mail, MapPin, Paperclip, Phone, StickyNote, Users } from "lucide-react";

import { DrawerFilesTab } from "./drawer-files-tab";
import { DrawerNotesTab } from "./drawer-notes-tab";

import { LinkedContactsSection } from "@/components/crm/detail/linked-contacts-section";
import { LinkedDealsSection } from "@/components/crm/detail/linked-deals-section";
import { InlineEditField } from "@/components/crm/inline-edit-field";
import { UnifiedTimeline } from "@/components/crm/timeline/unified-timeline";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyContacts, useCompanyDeals } from "@/hooks/use-company-relations";
import { useCompany } from "@/hooks/use-companies";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { useUpdateCompany } from "@/hooks/use-update-company";
import { CRM_DEFAULTS } from "@/lib/crm/config";
import {
  buildCrmSelectOptions,
  formatContactFullName,
  formatCrmEnumLabel,
  getCompanyIndustryBadgeVariant,
  parseCustomFieldInputValue,
  toNullableValue,
} from "@/lib/crm/display";

import { CollapsibleFieldGroup } from "./collapsible-field-group";
import { CustomFieldEditors } from "./custom-field-editors";
import { DrawerSection } from "./drawer-section";
import { RecordDetailPanelFooter } from "./record-detail-panel-footer";
import { RecordDetailPanelShell } from "./record-detail-panel-shell";

interface CompanyDrawerContentProps {
  /** Company id selected in the drawer. */
  companyId: string;
}

type CompanyDrawerTab = "home" | "contacts" | "deals" | "timeline" | "notes" | "files";

/**
 * Renders company details together with linked records and the unified activity timeline.
 */
export function CompanyDrawerContent({ companyId }: CompanyDrawerContentProps) {
  const { data: company, isLoading, isError } = useCompany(companyId);
  const { data: linkedContacts = [] } = useCompanyContacts(companyId);
  const { data: linkedDeals = [] } = useCompanyDeals(companyId);
  const { data: crmConfigResult } = useCrmConfig();
  const updateCompany = useUpdateCompany(companyId);
  const [activeTab, setActiveTab] = useState<CompanyDrawerTab>("home");

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-4 p-5">
            <header className="space-y-2">
              <div className="flex items-center gap-2.5">
                <Skeleton className="size-7 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-36" />
                <Skeleton className="ml-auto h-3 w-24 shrink-0" />
              </div>
              <Skeleton className="h-5 w-24 rounded-full" />
            </header>
            <div className="-mx-5 border-b border-border/60 px-5">
              <div className="flex items-center gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex h-10 items-center">
                    <Skeleton className="h-3 w-12" />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-px pt-1">
              <Skeleton className="mb-4 h-3 w-10" />
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <Skeleton className="size-4 shrink-0" />
                  <Skeleton className="h-3 w-16 shrink-0" />
                  <Skeleton className="h-3 max-w-[160px] flex-1" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !company) {
    return <div className="p-6 text-sm text-destructive">Failed to load company.</div>;
  }

  const companyIndustryValues = crmConfigResult?.config.company_industries?.length
    ? crmConfigResult.config.company_industries
    : CRM_DEFAULTS.company_industries;
  const companyIndustryOptions = buildCrmSelectOptions(companyIndustryValues, company.industry);
  const companyCustomFields = crmConfigResult?.config.company_custom_fields ?? [];
  const tabs: Array<{ id: CompanyDrawerTab; label: string; icon: ReactNode }> = [
    { id: "home", label: "Home", icon: <House className="h-4 w-4" /> },
    { id: "contacts", label: "Contacts", icon: <Users className="h-4 w-4" /> },
    { id: "deals", label: "Deals", icon: <BriefcaseBusiness className="h-4 w-4" /> },
    { id: "timeline", label: "Timeline", icon: <Clock3 className="h-4 w-4" /> },
    { id: "notes", label: "Notes", icon: <StickyNote className="h-4 w-4" /> },
    { id: "files", label: "Files", icon: <Paperclip className="h-4 w-4" /> },
  ];

  return (
    <RecordDetailPanelShell
      title={company.name}
      onTitleSave={async (next) => {
        await updateCompany.mutateAsync({ name: next });
      }}
      meta={`Updated ${formatDistanceToNow(new Date(company.updated_at), { addSuffix: true })}`}
      avatar={
        <Avatar size="lg">
          <AvatarFallback className="bg-emerald-500/10 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            {company.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      }
      badge={company.industry ? (
        <Badge variant={getCompanyIndustryBadgeVariant(company.industry)}>
          {formatCrmEnumLabel(company.industry)}
        </Badge>
      ) : null}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      maxVisibleTabs={6}
      footer={<RecordDetailPanelFooter />}
    >
      {activeTab === "home" ? (
        <div className="space-y-5">
          <DrawerSection title="Fields">
            <CollapsibleFieldGroup label="General">
              <InlineEditField
                icon={<Building2 className="h-4 w-4" />}
                label="Name"
                value={company.name}
                onSave={async (nextValue) => {
                  await updateCompany.mutateAsync({ name: nextValue.trim() });
                }}
              />
              <InlineEditField
                icon={<BriefcaseBusiness className="h-4 w-4" />}
                label="Industry"
                value={company.industry}
                type="select"
                options={companyIndustryOptions}
                onSave={async (nextValue) => {
                  await updateCompany.mutateAsync({ industry: nextValue });
                }}
              />
              <InlineEditField
                icon={<Globe className="h-4 w-4" />}
                label="Website"
                value={company.website}
                onSave={async (nextValue) => {
                  await updateCompany.mutateAsync({ website: toNullableValue(nextValue) });
                }}
              />
              <InlineEditField
                icon={<Phone className="h-4 w-4" />}
                label="Phone"
                value={company.phone}
                onSave={async (nextValue) => {
                  await updateCompany.mutateAsync({ phone: toNullableValue(nextValue) });
                }}
              />
              <InlineEditField
                icon={<Mail className="h-4 w-4" />}
                label="Email"
                value={company.email}
                onSave={async (nextValue) => {
                  await updateCompany.mutateAsync({ email: toNullableValue(nextValue) });
                }}
              />
              <InlineEditField
                icon={<MapPin className="h-4 w-4" />}
                label="Address"
                value={company.address}
                onSave={async (nextValue) => {
                  await updateCompany.mutateAsync({ address: toNullableValue(nextValue) });
                }}
              />
            </CollapsibleFieldGroup>
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
        </div>
      ) : null}

      {activeTab === "contacts" ? (
        <DrawerSection title="Contacts">
          <LinkedContactsSection
            contacts={linkedContacts.map((contact) => ({
              id: contact.contact_id,
              name: formatContactFullName(contact),
              badge: formatCrmEnumLabel(contact.type),
              href: `/customers/people?detail=${contact.contact_id}`,
            }))}
            emptyLabel="No linked contacts."
          />
        </DrawerSection>
      ) : null}

      {activeTab === "notes" ? (
        <DrawerNotesTab
          recordType="company"
          recordId={companyId}
        />
      ) : null}

      {activeTab === "files" ? (
        <DrawerFilesTab
          recordType="company"
          recordId={companyId}
        />
      ) : null}

      {activeTab === "timeline" ? (
        <DrawerSection title="Activity">
          <UnifiedTimeline
            recordType="company"
            recordId={companyId}
          />
        </DrawerSection>
      ) : null}

      {activeTab === "deals" ? (
        <DrawerSection title="Deals">
          <LinkedDealsSection
            deals={linkedDeals.map((deal) => ({
              id: deal.deal_id,
              address: deal.address,
              stage: deal.stage,
              amount: deal.amount,
              href: `/customers/deals?detail=${deal.deal_id}`,
            }))}
            emptyLabel="No linked deals."
          />
        </DrawerSection>
      ) : null}
    </RecordDetailPanelShell>
  );
}
