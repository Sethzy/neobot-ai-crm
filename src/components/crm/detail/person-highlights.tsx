/**
 * Header and highlight grid for person detail pages.
 * @module components/crm/detail/person-highlights
 */
"use client";

import Link from "next/link";

import { AppIcon } from "@/components/icons/app-icons";
import { InlineEditField } from "@/components/crm/inline-edit-field";
import { Button } from "@/components/ui/button";
import { type ContactWithCompany } from "@/hooks/use-contacts";
import { buildCrmSelectOptions, formatContactFullName } from "@/lib/crm/display";

import { DetailPageHeader } from "./detail-page-header";
import { HighlightFieldCard } from "./highlight-field-card";

interface PersonHighlightsProps {
  contact: ContactWithCompany;
  contactTypeOptions: string[];
  onDelete: () => void;
  onCompanySave: (companyId: string | null) => Promise<void>;
  onEmailSave: (value: string) => Promise<void>;
  onPhoneSave: (value: string) => Promise<void>;
  onNameSave: (value: string) => Promise<void>;
  onTypeSave: (value: string) => Promise<void>;
  isDeleting?: boolean;
}

/**
 * Mirrors the Open Mercato person header rhythm while staying within Sunder's current contact model.
 */
export function PersonHighlights({
  contact,
  contactTypeOptions,
  onDelete,
  onCompanySave,
  onEmailSave,
  onPhoneSave,
  onNameSave,
  onTypeSave,
  isDeleting = false,
}: PersonHighlightsProps) {
  return (
    <div className="space-y-6">
      <DetailPageHeader
        backHref="/customers/people"
        backLabel="Back to People"
        deleteLabel="Delete person"
        isDeleting={isDeleting}
        onDelete={onDelete}
      />

      <InlineEditField
        label="Name"
        value={formatContactFullName(contact)}
        hideLabel
        containerClassName="rounded-none px-0 py-0 hover:bg-transparent"
        displayClassName="text-3xl font-semibold tracking-tight text-foreground"
        editorClassName="w-full max-w-full"
        onSave={onNameSave}
      />

      <div className="group rounded-lg border border-border/40 bg-muted/30 p-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
              Company
            </p>
            {contact.companies?.company_id ? (
              <Link
                href={`/customers/companies/${contact.companies.company_id}`}
                className="mt-3 inline-flex items-center text-sm font-medium text-foreground transition-colors hover:text-foreground/80"
              >
                <AppIcon name="building" className="mr-2 h-4 w-4 text-muted-foreground" />
                {contact.companies.name}
              </Link>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No linked company</p>
            )}
          </div>

          {contact.company_id ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => {
                void onCompanySave(null);
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <HighlightFieldCard label="Email">
          <InlineEditField
            label="Email"
            value={contact.email}
            inputType="email"
            onSave={onEmailSave}
          />
        </HighlightFieldCard>
        <HighlightFieldCard label="Phone">
          <InlineEditField
            label="Phone"
            value={contact.phone}
            inputType="tel"
            onSave={onPhoneSave}
          />
        </HighlightFieldCard>
        <HighlightFieldCard label="Type">
          <InlineEditField
            label="Type"
            value={contact.type}
            type="select"
            options={buildCrmSelectOptions(contactTypeOptions, contact.type)}
            onSave={onTypeSave}
          />
        </HighlightFieldCard>
        <HighlightFieldCard label="Updated">
          <p className="text-sm text-foreground/80">
            {new Date(contact.updated_at).toLocaleString("en-SG", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </HighlightFieldCard>
      </div>
    </div>
  );
}
