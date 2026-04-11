/**
 * Settings page for editing the two managed-agent kickoff context fields.
 * @module app/(dashboard)/settings/agent-context/page
 */
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { resolveClientId } from "@/lib/chat/client-id";
import { createClient } from "@/lib/supabase/server";

import { AgentContextForm } from "./agent-context-form";

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

    return {
      kind: "loaded",
      data,
    };
  } catch {
    return { kind: "error" };
  }
}

export default async function AgentContextPage() {
  const agentContext = await loadAgentContext();

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col">
        {agentContext.kind === "error" ? (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTitle>Failed to load agent context.</AlertTitle>
              <AlertDescription>
                Refresh the page and retry before saving. The form stays locked until the
                current values are loaded.
              </AlertDescription>
            </Alert>
            <Link href="/settings" className="text-sm text-muted-foreground hover:underline">
              ← Back to settings
            </Link>
          </div>
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
