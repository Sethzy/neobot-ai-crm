/**
 * Shared company detail surface used by both the drawer and full page.
 * @module components/crm/record-detail/company-detail-content
 */
"use client";

import { type ReactNode, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { BriefcaseBusiness, Building2, Clock3, Globe, House, Mail, MapPin, Paperclip, Phone, StickyNote, Users } from "lucide-react";

import { LinkedContactsSection } from "@/components/crm/detail/linked-contacts-section";
import { LinkedDealsSection } from "@/components/crm/detail/linked-deals-section";
import { CrmRecordDetailSkeleton } from "@/components/crm/crm-record-detail-skeleton";
import { InlineEditField } from "@/components/crm/inline-edit-field";
import { UnifiedTimeline } from "@/components/crm/timeline/unified-timeline";
import { useCurrentCrmWorkspaceHref } from "@/components/crm/use-record-open-behavior";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { getCrmRecordHref } from "@/lib/crm/navigation";
import {
  validateEmailForSave,
  validatePhoneForSave,
  validateWebsiteForSave,
} from "@/lib/crm/normalize";

import { DrawerFilesTab } from "../record-drawer/drawer-files-tab";
import { DrawerNotesTab } from "../record-drawer/drawer-notes-tab";
import { CollapsibleFieldGroup } from "../record-drawer/collapsible-field-group";
import { CustomFieldEditors } from "../record-drawer/custom-field-editors";
import { DrawerSection } from "../record-drawer/drawer-section";
import { RecordDetailPanelFooter } from "../record-drawer/record-detail-panel-footer";
import { RecordDetailPanelShell } from "../record-drawer/record-detail-panel-shell";

interface CompanyDetailContentProps {
  /** Company id selected in the current detail surface. */
  companyId: string;
  /** Drawer keeps quick inspection; page mode is for deeper work. */
  surface?: "drawer" | "page";
}

type CompanyDrawerTab = "home" | "contacts" | "deals" | "timeline" | "notes" | "files";

/**
 * Renders company details together with linked records and the unified activity timeline.
 */
export function CompanyDetailContent({
  companyId,
  surface = "drawer",
}: CompanyDetailContentProps) {
  const { data: company, isLoading, isError } = useCompany(companyId);
  const { data: linkedContacts = [] } = useCompanyContacts(companyId);
  const { data: linkedDeals = [] } = useCompanyDeals(companyId);
  const { data: crmConfigResult } = useCrmConfig();
  const updateCompany = useUpdateCompany(companyId);
  const [activeTab, setActiveTab] = useState<CompanyDrawerTab>("home");
  const isDrawerSurface = surface === "drawer";
  const currentWorkspaceHref = useCurrentCrmWorkspaceHref();

  if (isLoading) {
    return <CrmRecordDetailSkeleton tabCount={6} />;
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
          <AvatarFallback className="bg-success/10 text-sm font-medium text-success">
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
      reserveTrailingSpace={isDrawerSurface}
      footer={
        <RecordDetailPanelFooter
          openHref={
            isDrawerSurface
              ? getCrmRecordHref("company", companyId, { returnTo: currentWorkspaceHref })
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
                inputType="url"
                parseValue={validateWebsiteForSave}
                onSave={async (nextValue) => {
                  await updateCompany.mutateAsync({ website: toNullableValue(nextValue) });
                }}
              />
              <InlineEditField
                icon={<Phone className="h-4 w-4" />}
                label="Phone"
                value={company.phone}
                inputType="tel"
                parseValue={validatePhoneForSave}
                onSave={async (nextValue) => {
                  await updateCompany.mutateAsync({ phone: toNullableValue(nextValue) });
                }}
              />
              <InlineEditField
                icon={<Mail className="h-4 w-4" />}
                label="Email"
                value={company.email}
                inputType="email"
                parseValue={validateEmailForSave}
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
              href: isDrawerSurface
                ? `/customers/people?detail=${contact.contact_id}`
                : getCrmRecordHref("contact", contact.contact_id),
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
              href: isDrawerSurface
                ? `/customers/deals?detail=${deal.deal_id}`
                : getCrmRecordHref("deal", deal.deal_id),
            }))}
            emptyLabel="No linked deals."
          />
        </DrawerSection>
      ) : null}
    </RecordDetailPanelShell>
  );
}
