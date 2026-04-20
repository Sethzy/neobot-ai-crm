/**
 * Settings → Agent → Memory. Edits the durable client profile + user preferences
 * that are injected into every managed-agent kickoff.
 * @module app/(dashboard)/settings/agent/memory/page
 */
import { AgentContextForm } from "@/components/settings/agent-context-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Memory</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            These two fields are injected into every managed-agent kickoff. Keep them stable,
            durable, and high-signal.
          </p>
        </div>

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
      </div>
    </div>
  );
}
