/**
 * Contact-specific record drawer body.
 * @module components/crm/record-drawer/contact-drawer-content
 */
"use client";

import { ContactTimeline } from "@/components/crm/contact-timeline";
import { InlineEditField } from "@/components/crm/inline-edit-field";
import { StageBadge } from "@/components/crm/stage-badge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useContactDeals } from "@/hooks/use-contact-relations";
import { useContact } from "@/hooks/use-contacts";
import { useUpdateContact } from "@/hooks/use-update-contact";
import { contactTypeBadgeVariantMap, formatContactFullName, toNullableValue } from "@/lib/crm/display";
import { contactTypeValues, type Contact } from "@/lib/crm/schemas";

import { DrawerSection } from "./drawer-section";

interface ContactDrawerContentProps {
  /** Contact id selected in the drawer. */
  contactId: string;
}

/**
 * Renders contact details, linked deals, and activity timeline.
 */
export function ContactDrawerContent({ contactId }: ContactDrawerContentProps) {
  const { data: contact, isLoading, isError } = useContact(contactId);
  const { data: linkedDeals = [] } = useContactDeals(contactId);
  const updateContact = useUpdateContact(contactId);

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

  return (
    <div className="space-y-6 overflow-y-auto p-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">{formatContactFullName(contact)}</h2>
        <Badge variant={contactTypeBadgeVariantMap[contact.type]}>{contact.type}</Badge>
      </header>

      <DrawerSection title="Details">
        <div className="space-y-0.5">
          <InlineEditField
            label="Phone"
            value={contact.phone}
            onSave={async (nextValue) => {
              await updateContact.mutateAsync({ phone: toNullableValue(nextValue) });
            }}
          />
          <InlineEditField
            label="Email"
            value={contact.email}
            onSave={async (nextValue) => {
              await updateContact.mutateAsync({ email: toNullableValue(nextValue) });
            }}
          />
          <InlineEditField
            label="Type"
            value={contact.type}
            type="select"
            options={contactTypeValues.map((contactType) => ({
              value: contactType,
              label: contactType,
            }))}
            onSave={async (nextValue) => {
              await updateContact.mutateAsync({ type: nextValue as Contact["type"] });
            }}
          />
          <InlineEditField
            label="Notes"
            value={contact.notes}
            type="textarea"
            onSave={async (nextValue) => {
              await updateContact.mutateAsync({ notes: toNullableValue(nextValue) });
            }}
          />
        </div>
      </DrawerSection>

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

      <DrawerSection title="Activity">
        <ContactTimeline contactId={contactId} />
      </DrawerSection>
    </div>
  );
}
