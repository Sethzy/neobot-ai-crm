/**
 * Server-only loader for the current authenticated client's message quota.
 * @module lib/usage/message-quota-server
 */
import { resolveClientId } from "@/lib/chat/client-id";
import { createClient } from "@/lib/supabase/server";

import {
  getMessageQuotaStatus,
  type MessageQuotaStatus,
} from "./message-quota";

export async function loadCurrentMessageQuota(): Promise<MessageQuotaStatus | null> {
  try {
    const supabase = await createClient();
    const clientId = await resolveClientId(supabase);
    return await getMessageQuotaStatus(supabase, clientId);
  } catch {
    return null;
  }
}
