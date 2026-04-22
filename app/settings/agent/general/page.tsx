/**
 * Settings → Agent → General. Hosts the Autopilot configuration card.
 * @module app/(dashboard)/settings/agent/general/page
 */
import { AutopilotCard, type AutopilotConfigData } from "@/components/settings/autopilot-card";
import { PageCanvas } from "@/components/layout/page-canvas";
import { PageHeader } from "@/components/layout/page-header";
import { resolveClientId } from "@/lib/chat/client-id";
import { createClient } from "@/lib/supabase/server";

async function loadAutopilotConfig(): Promise<AutopilotConfigData | null> {
  try {
    const supabase = await createClient();
    const clientId = await resolveClientId(supabase);
    const { data } = await supabase
      .from("autopilot_config")
      .select("config_id, pulse_interval, quiet_hours_start, quiet_hours_end, timezone, enabled")
      .eq("client_id", clientId)
      .single();

    return data;
  } catch {
    return null;
  }
}

export default async function AgentGeneralPage() {
  const autopilotConfig = await loadAutopilotConfig();

  return (
    <PageCanvas variant="form">
        <PageHeader
          title="General"
          description="Agent-wide behavior. Configure how and when the agent works on its own."
        />

        {autopilotConfig ? (
          <AutopilotCard initialConfig={autopilotConfig} />
        ) : (
          <p className="type-control-muted text-muted-foreground">
            Autopilot configuration is not available yet. Try refreshing the page.
          </p>
        )}
    </PageCanvas>
  );
}
