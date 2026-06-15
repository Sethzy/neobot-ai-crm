/**
 * Settings → Agent → General.
 * @module app/(dashboard)/settings/agent/general/page
 */
import { PageHeader } from "@/components/layout/page-header";
import { PageSurface } from "@/components/layout/page-canvas";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";

export default async function AgentGeneralPage() {
  return (
    <SettingsPageShell>
      <PageHeader
        title="General"
        description="Agent-wide behavior."
      />

      <PageSurface padding="lg">
        <div className="space-y-1">
          <h2 className="type-section-title">Proactive work</h2>
          <p className="type-control-muted text-muted-foreground">
            Manage proactive work from Automations, where scheduled and recurring agent work
            lives for this workspace.
          </p>
        </div>
      </PageSurface>
    </SettingsPageShell>
  );
}
