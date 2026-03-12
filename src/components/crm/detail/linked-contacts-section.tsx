/**
 * Linked contact cards used by company and deal detail pages.
 * @module components/crm/detail/linked-contacts-section
 */
"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";

export interface LinkedContactItem {
  id: string;
  name: string;
  badge: string;
  meta?: string | null;
  href: string;
}

interface LinkedContactsSectionProps {
  contacts: LinkedContactItem[];
  emptyLabel?: string;
}

/**
 * Renders linked contacts in the same subdued card style as the reference CRM.
 */
export function LinkedContactsSection({
  contacts,
  emptyLabel = "No linked contacts yet.",
}: LinkedContactsSectionProps) {
  if (contacts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/50 bg-muted/10 p-6 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {contacts.map((contact) => (
        <Link
          key={contact.id}
          href={contact.href}
          className="rounded-lg border border-border/40 bg-card p-4 shadow-sm transition-colors hover:bg-muted/20"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{contact.name}</p>
              {contact.meta ? (
                <p className="mt-2 text-sm text-muted-foreground">{contact.meta}</p>
              ) : null}
            </div>
            <Badge variant="outline">{contact.badge}</Badge>
          </div>
        </Link>
      ))}
    </div>
  );
}
