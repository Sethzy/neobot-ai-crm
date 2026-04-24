/**
 * Server-side client_id resolver.
 * @module lib/chat/client-resolver
 */
import { cache } from "react";

import { resolveClientId } from "@/lib/chat/client-id";
import { createClient } from "@/lib/supabase/server";

/**
 * Resolves the current authenticated server user's client_id.
 */
export const getClientId = cache(async function getClientId(): Promise<string> {
  const supabase = await createClient();
  return resolveClientId(supabase);
});
