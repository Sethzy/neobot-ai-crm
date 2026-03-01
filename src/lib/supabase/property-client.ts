"use client";

import { createBrowserClient } from "@supabase/ssr";
import {
  getPropertySupabaseEnv,
  PROPERTY_SUPABASE_ENV_ERROR,
} from "@/lib/supabase/property-env";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createPropertyClient() {
  const env = getPropertySupabaseEnv();
  if (!env) {
    throw new Error(PROPERTY_SUPABASE_ENV_ERROR);
  }

  if (!browserClient) {
    browserClient = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
  }

  return browserClient;
}
