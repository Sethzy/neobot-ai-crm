/**
 * Atomic claim helper for inbound webhook trigger execution.
 * @module lib/triggers/webhook-claim
 */
import type { TriggerSupabaseClient } from "./schemas";

export interface WebhookClaimResult {
  currentRunId: string;
}

/**
 * Claims an enabled idle webhook trigger by assigning a fresh run id.
 */
export async function claimWebhookTrigger(
  supabase: TriggerSupabaseClient,
  triggerId: string,
): Promise<WebhookClaimResult | null> {
  const { data, error } = await supabase
    .from("agent_triggers")
    .update({
      current_run_id: crypto.randomUUID(),
      last_fired_at: new Date().toISOString(),
    })
    .eq("id", triggerId)
    .eq("trigger_type", "webhook")
    .eq("enabled", true)
    .is("current_run_id", null)
    .select("current_run_id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to claim webhook trigger ${triggerId}: ${error.message}`);
  }

  if (!data?.current_run_id) {
    return null;
  }

  return {
    currentRunId: data.current_run_id,
  };
}
