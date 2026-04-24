/**
 * Shared titled section wrapper for record drawer content blocks.
 * @module components/crm/record-drawer/drawer-section
 */
interface DrawerSectionProps {
  /** Section title shown in mixed-case muted label style. */
  title: string;
  /** Section content nodes. */
  children: React.ReactNode;
}

/**
 * Renders a small section label and body for consistent drawer hierarchy.
 */
export function DrawerSection({ title, children }: DrawerSectionProps) {
  return (
    <section className="space-y-2">
      <h3 className="text-meta font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}
