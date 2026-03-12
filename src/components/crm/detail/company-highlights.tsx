/**
 * Header and highlight grid for company detail pages.
 * @module components/crm/detail/company-highlights
 */
"use client";

import { InlineEditField } from "@/components/crm/inline-edit-field";
import type { Company } from "@/lib/crm/schemas";
import { buildCrmSelectOptions } from "@/lib/crm/display";

import { DetailPageHeader } from "./detail-page-header";
import { HighlightFieldCard } from "./highlight-field-card";

interface CompanyHighlightsProps {
  company: Company;
  industryOptions: string[];
  onDelete: () => void;
  onEmailSave: (value: string) => Promise<void>;
  onIndustrySave: (value: string) => Promise<void>;
  onNameSave: (value: string) => Promise<void>;
  onPhoneSave: (value: string) => Promise<void>;
  onWebsiteSave: (value: string) => Promise<void>;
  isDeleting?: boolean;
}

/**
 * Mirrors the shared detail-page rhythm without the company panel used by person/deal pages.
 */
export function CompanyHighlights({
  company,
  industryOptions,
  onDelete,
  onEmailSave,
  onIndustrySave,
  onNameSave,
  onPhoneSave,
  onWebsiteSave,
  isDeleting = false,
}: CompanyHighlightsProps) {
  return (
    <div className="space-y-6">
      <DetailPageHeader
        backHref="/customers/companies"
        backLabel="Back to Companies"
        deleteLabel="Delete company"
        isDeleting={isDeleting}
        onDelete={onDelete}
      />

      <InlineEditField
        label="Name"
        value={company.name}
        hideLabel
        containerClassName="rounded-none px-0 py-0 hover:bg-transparent"
        displayClassName="text-3xl font-semibold tracking-tight text-foreground"
        editorClassName="w-full max-w-full"
        onSave={onNameSave}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <HighlightFieldCard label="Industry">
          <InlineEditField
            label="Industry"
            value={company.industry}
            type="select"
            options={buildCrmSelectOptions(industryOptions, company.industry)}
            onSave={onIndustrySave}
          />
        </HighlightFieldCard>
        <HighlightFieldCard label="Phone">
          <InlineEditField
            label="Phone"
            value={company.phone}
            inputType="tel"
            onSave={onPhoneSave}
          />
        </HighlightFieldCard>
        <HighlightFieldCard label="Email">
          <InlineEditField
            label="Email"
            value={company.email}
            inputType="email"
            onSave={onEmailSave}
          />
        </HighlightFieldCard>
        <HighlightFieldCard label="Website">
          <InlineEditField
            label="Website"
            value={company.website}
            inputType="url"
            onSave={onWebsiteSave}
          />
        </HighlightFieldCard>
      </div>
    </div>
  );
}
