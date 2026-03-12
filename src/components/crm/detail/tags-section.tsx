/**
 * Deferred tags placeholder for the CRM aesthetic overhaul.
 * @module components/crm/detail/tags-section
 */
"use client";

/**
 * Keeps the spot for a future tags model without introducing schema changes in this overhaul.
 */
export function TagsSection() {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground">Tags</h2>
      <div className="rounded-lg border border-dashed border-border/50 bg-muted/10 p-6 text-sm text-muted-foreground">
        Tags stay deferred until the CRM data model adds first-class tag support.
      </div>
    </section>
  );
}
