/**
 * Settings → Agent → General. Hosts the Autopilot configuration card.
 * @module app/(dashboard)/settings/agent/general/page
 */
import { AutopilotCard, type AutopilotConfigData } from "@/components/settings/autopilot-card";
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
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">General</h1>
          <p className="text-sm text-muted-foreground">
            Agent-wide behavior. Configure how and when the agent works on its own.
          </p>
        </div>

        {autopilotConfig ? (
          <AutopilotCard initialConfig={autopilotConfig} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Autopilot configuration is not available yet. Try refreshing the page.
          </p>
        )}
      </div>
    </div>
  );
}
