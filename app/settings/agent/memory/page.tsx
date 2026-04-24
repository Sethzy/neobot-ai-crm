/**
 * Settings → Agent → Personality. Edits the durable client profile + user preferences
 * that are injected into every managed-agent kickoff. Route stays `/settings/agent/memory`
 * for backwards compatibility; only the user-facing label changed.
 * @module app/(dashboard)/settings/agent/memory/page
 */
import { AgentContextForm } from "@/components/settings/agent-context-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageCanvas } from "@/components/layout/page-canvas";
import { PageHeader } from "@/components/layout/page-header";
import { resolveClientId } from "@/lib/chat/client-id";
import { createClient } from "@/lib/supabase/server";

interface AgentContextData {
  client_profile: string | null;
  user_preferences: string | null;
}

type LoadedAgentContext =
  | { kind: "loaded"; data: AgentContextData }
  | { kind: "error" };

async function loadAgentContext(): Promise<LoadedAgentContext> {
  try {
    const supabase = await createClient();
    const clientId = await resolveClientId(supabase);
    const { data, error } = await supabase
      .from("clients")
      .select("client_profile, user_preferences")
      .eq("client_id", clientId)
      .single();

    if (error || !data) {
      return { kind: "error" };
    }

    return { kind: "loaded", data };
  } catch {
    return { kind: "error" };
  }
}

export default async function AgentMemoryPage() {
  const agentContext = await loadAgentContext();

  return (
    <PageCanvas variant="content" contentClassName="max-w-6xl">
        <PageHeader
          title="Personality"
          description="These two fields are injected into every managed-agent kickoff. Keep them stable, durable, and high-signal."
          titleClassName="type-page-title"
          descriptionClassName="max-w-3xl"
        />

        {agentContext.kind === "error" ? (
          <Alert variant="destructive">
            <AlertTitle>Failed to load agent context.</AlertTitle>
            <AlertDescription>
              Refresh the page and retry before saving. The form stays locked until the
              current values are loaded.
            </AlertDescription>
          </Alert>
        ) : (
          <AgentContextForm
            initialClientProfile={agentContext.data.client_profile ?? ""}
            initialUserPreferences={agentContext.data.user_preferences ?? ""}
          />
        )}
    </PageCanvas>
  );
}
