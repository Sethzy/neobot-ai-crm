/**
 * Settings page for editing the two managed-agent kickoff context fields.
 * @module app/(dashboard)/settings/agent-context/page
 */
import { resolveClientId } from "@/lib/chat/client-id";
import { createClient } from "@/lib/supabase/server";

import { AgentContextForm } from "./agent-context-form";

interface AgentContextData {
  client_profile: string | null;
  user_preferences: string | null;
}

async function loadAgentContext(): Promise<AgentContextData> {
  try {
    const supabase = await createClient();
    const clientId = await resolveClientId(supabase);
    const { data, error } = await supabase
      .from("clients")
      .select("client_profile, user_preferences")
      .eq("client_id", clientId)
      .single();

    if (error || !data) {
      return {
        client_profile: null,
        user_preferences: null,
      };
    }

    return data;
  } catch {
    return {
      client_profile: null,
      user_preferences: null,
    };
  }
}

export default async function AgentContextPage() {
  const agentContext = await loadAgentContext();

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col">
        <AgentContextForm
          initialClientProfile={agentContext.client_profile ?? ""}
          initialUserPreferences={agentContext.user_preferences ?? ""}
        />
      </div>
    </div>
  );
}
