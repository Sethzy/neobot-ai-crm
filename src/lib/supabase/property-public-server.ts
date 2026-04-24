import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  getPropertySupabaseEnv,
  PROPERTY_SUPABASE_ENV_ERROR,
} from "@/lib/supabase/property-env";

let propertyPublicClient: ReturnType<typeof createClient> | null = null;

export function createPropertyPublicServerClient() {
  const env = getPropertySupabaseEnv();
  if (!env) {
    throw new Error(PROPERTY_SUPABASE_ENV_ERROR);
  }

  if (!propertyPublicClient) {
    propertyPublicClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return propertyPublicClient;
}
