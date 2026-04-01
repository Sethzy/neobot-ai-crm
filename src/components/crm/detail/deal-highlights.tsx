/**
 * Header and highlight grid for deal detail pages.
 * @module components/crm/detail/deal-highlights
 */
"use client";

import Link from "next/link";

import { AppIcon } from "@/components/icons/app-icons";
import { InlineEditField } from "@/components/crm/inline-edit-field";
import { formatContactFullName, formatCrmPrice, buildCrmSelectOptions } from "@/lib/crm/display";
import type { DealWithContact } from "@/hooks/use-deals";

import { DetailPageHeader } from "./detail-page-header";
import { HighlightFieldCard } from "./highlight-field-card";

interface DealHighlightsProps {
  deal: DealWithContact;
  stageOptions: string[];
  onAddressSave: (value: string) => Promise<void>;
  onDelete: () => void;
  onPriceSave: (value: string) => Promise<void>;
  onStageSave: (value: string) => Promise<void>;
  isDeleting?: boolean;
}

function getPrimaryContactLabel(deal: DealWithContact) {
  const primaryContact = deal.deal_contacts.find((dealContact) => dealContact.is_primary)
    ?? deal.deal_contacts[0];

  return primaryContact?.contacts ? formatContactFullName(primaryContact.contacts) : "—";
}

/**
 * Brings deal detail into the same single-column rhythm as people and companies.
 */
export function DealHighlights({
  deal,
  stageOptions,
  onAddressSave,
  onDelete,
  onPriceSave,
  onStageSave,
  isDeleting = false,
}: DealHighlightsProps) {
  return (
    <div className="space-y-6">
      <DetailPageHeader
        backHref="/customers/deals"
        backLabel="Back to Deals"
        deleteLabel="Delete deal"
        isDeleting={isDeleting}
        onDelete={onDelete}
      />

      <InlineEditField
        label="Address"
        value={deal.address}
        hideLabel
        containerClassName="rounded-none px-0 py-0 hover:bg-transparent"
        displayClassName="text-3xl font-semibold tracking-tight text-foreground"
        editorClassName="w-full max-w-full"
        onSave={onAddressSave}
      />

      <div className="rounded-lg border border-border/40 bg-muted/30 p-3 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
          Company
        </p>
        {deal.companies?.company_id ? (
          <Link
            href={`/customers/companies/${deal.companies.company_id}`}
            className="mt-3 inline-flex items-center text-sm font-medium text-foreground transition-colors hover:text-foreground/80"
          >
            <AppIcon name="building" className="mr-2 h-4 w-4 text-muted-foreground" />
            {deal.companies.name}
          </Link>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No linked company</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <HighlightFieldCard label="Stage">
          <InlineEditField
            label="Stage"
            value={deal.stage}
            type="select"
            options={buildCrmSelectOptions(stageOptions, deal.stage)}
            onSave={onStageSave}
          />
        </HighlightFieldCard>
        <HighlightFieldCard label="Price">
          <InlineEditField
            label="Price"
            value={deal.amount === null ? null : String(deal.amount)}
            displayValue={formatCrmPrice(deal.amount)}
            type="number"
            onSave={onPriceSave}
          />
        </HighlightFieldCard>
        <HighlightFieldCard label="Company">
          <p className="text-sm text-foreground/80">{deal.companies?.name ?? "—"}</p>
        </HighlightFieldCard>
        <HighlightFieldCard label="Primary Contact">
          <p className="text-sm text-foreground/80">{getPrimaryContactLabel(deal)}</p>
        </HighlightFieldCard>
      </div>
    </div>
  );
}
