/**
 * Shared titled section wrapper for record drawer content blocks.
 * @module components/crm/record-drawer/drawer-section
 */
interface DrawerSectionProps {
  /** Section title shown in uppercase muted label style. */
  title: string;
  /** Section content nodes. */
  children: React.ReactNode;
}

/**
 * Renders a small section label and body for consistent drawer hierarchy.
 */
export function DrawerSection({ title, children }: DrawerSectionProps) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">{title}</h3>
      {children}
    </section>
  );
}

