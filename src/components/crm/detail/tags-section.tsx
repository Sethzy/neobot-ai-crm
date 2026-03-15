/**
 * Deferred tags placeholder for the CRM aesthetic overhaul.
 * @module components/crm/detail/tags-section
 */
"use client";

import { Empty, EmptyDescription } from "@/components/ui/empty";

/**
 * Keeps the spot for a future tags model without introducing schema changes in this overhaul.
 */
export function TagsSection() {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground">Tags</h2>
      <Empty>
        <EmptyDescription>Tags stay deferred until the CRM data model adds first-class tag support.</EmptyDescription>
      </Empty>
    </section>
  );
}
