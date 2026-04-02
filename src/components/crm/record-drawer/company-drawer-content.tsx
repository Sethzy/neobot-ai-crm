/**
 * Company-specific record drawer body.
 * @module components/crm/record-drawer/company-drawer-content
 */
"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { BriefcaseBusiness, House, Users } from "lucide-react";

import { LinkedContactsSection } from "@/components/crm/detail/linked-contacts-section";
import { LinkedDealsSection } from "@/components/crm/detail/linked-deals-section";
import { InlineEditField } from "@/components/crm/inline-edit-field";
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

import { CustomFieldEditors } from "./custom-field-editors";
import { DrawerSection } from "./drawer-section";
import { RecordDetailPanelShell } from "./record-detail-panel-shell";

interface CompanyDrawerContentProps {
  /** Company id selected in the drawer. */
  companyId: string;
}

type CompanyDrawerTab = "home" | "contacts" | "deals";

/**
 * Renders company details together with linked contacts and deals.
 */
export function CompanyDrawerContent({ companyId }: CompanyDrawerContentProps) {
  const { data: company, isLoading, isError } = useCompany(companyId);
  const { data: linkedContacts = [] } = useCompanyContacts(companyId);
  const { data: linkedDeals = [] } = useCompanyDeals(companyId);
  const { data: crmConfigResult } = useCrmConfig();
  const updateCompany = useUpdateCompany(companyId);
  const [activeTab, setActiveTab] = useState<CompanyDrawerTab>("home");

  useEffect(() => {
    setActiveTab("home");
  }, [companyId]);

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

  const companyIndustryValues = crmConfigResult?.config.company_industries?.length
    ? crmConfigResult.config.company_industries
    : CRM_DEFAULTS.company_industries;
  const companyIndustryOptions = buildCrmSelectOptions(companyIndustryValues, company.industry);
  const companyCustomFields = crmConfigResult?.config.company_custom_fields ?? [];
  const tabs = [
    { id: "home", label: "Home", icon: <House className="h-4 w-4" /> },
    { id: "contacts", label: "Contacts", icon: <Users className="h-4 w-4" /> },
    { id: "deals", label: "Deals", icon: <BriefcaseBusiness className="h-4 w-4" /> },
  ] satisfies Array<{ id: CompanyDrawerTab; label: string; icon: React.ReactNode }>;

  return (
    <div className="min-h-0 overflow-y-auto">
      <RecordDetailPanelShell
        title={company.name}
        meta={`Updated ${formatDistanceToNow(new Date(company.updated_at), { addSuffix: true })}`}
        badge={company.industry ? (
          <Badge variant={getCompanyIndustryBadgeVariant(company.industry)}>
            {formatCrmEnumLabel(company.industry)}
          </Badge>
        ) : null}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {activeTab === "home" ? (
          <div className="space-y-6">
            <DrawerSection title="Fields">
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
    </div>
  );
}
