/**
 * Deal-specific record drawer body.
 * @module components/crm/record-drawer/deal-drawer-content
 */
"use client";

import { InteractionTimeline } from "@/components/crm/interaction-timeline";
import { InlineEditField } from "@/components/crm/inline-edit-field";
import { StageBadge } from "@/components/crm/stage-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDealInteractions } from "@/hooks/use-contact-relations";
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

import { CustomFieldEditors } from "./custom-field-editors";
import { DrawerSection } from "./drawer-section";

interface DealDrawerContentProps {
  /** Deal id selected in the drawer. */
  dealId: string;
}

/**
 * Renders deal details, linked contacts, and interaction timeline.
 */
export function DealDrawerContent({ dealId }: DealDrawerContentProps) {
  const { data: deal, isLoading, isError } = useDeal(dealId);
  const { data: interactions = [] } = useDealInteractions(dealId);
  const { data: companies = [] } = useCompanies({});
  const { data: crmConfigResult } = useCrmConfig();
  const updateDeal = useUpdateDeal(dealId);

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

  return (
    <div className="space-y-6 overflow-y-auto p-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">{deal.address}</h2>
        <StageBadge stage={deal.stage} />
      </header>

      <DrawerSection title="Details">
        <div className="space-y-0.5">
          <InlineEditField
            label="Address"
            value={deal.address}
            onSave={async (nextValue) => {
              await updateDeal.mutateAsync({ address: nextValue.trim() });
            }}
          />
          <InlineEditField
            label="Stage"
            value={deal.stage}
            type="select"
            options={dealStageOptions}
            onSave={async (nextValue) => {
              await updateDeal.mutateAsync({ stage: nextValue as Deal["stage"] });
            }}
          />
          <InlineEditField
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
            label="Notes"
            value={deal.notes}
            type="textarea"
            onSave={async (nextValue) => {
              await updateDeal.mutateAsync({ notes: toNullableValue(nextValue) });
            }}
          />
        </div>
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

      <DrawerSection title="Contacts">
        {deal.deal_contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No linked contacts.</p>
        ) : (
          <div className="space-y-2">
            {deal.deal_contacts.map((dealContact) => (
              <div
                key={dealContact.contact_id}
                className="flex items-center justify-between rounded-lg border border-border/30 px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground/90">
                  {dealContact.contacts ? formatContactFullName(dealContact.contacts) : "—"}
                </span>
                <span className="text-xs text-muted-foreground">{formatCrmEnumLabel(dealContact.role)}</span>
              </div>
            ))}
          </div>
        )}
      </DrawerSection>

      <DrawerSection title="Activity">
        <InteractionTimeline interactions={interactions} />
      </DrawerSection>
    </div>
  );
}
