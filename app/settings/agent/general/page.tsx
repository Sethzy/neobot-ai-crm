/**
 * Settings → Agent → General.
 * @module app/(dashboard)/settings/agent/general/page
 */
import { PageCanvas } from "@/components/layout/page-canvas";
import { PageHeader } from "@/components/layout/page-header";

export default async function AgentGeneralPage() {
  return (
    <PageCanvas variant="form">
      <PageHeader
        title="General"
        description="Agent-wide behavior."
      />

      <p className="type-control-muted text-muted-foreground">
        Manage proactive work from Automations. Daily Orchestrator now lives there as a normal automation.
      </p>
    </PageCanvas>
  );
}
