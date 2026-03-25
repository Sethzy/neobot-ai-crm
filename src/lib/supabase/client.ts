'use client';

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

import { getSupabaseEnv } from "./env";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      supabaseUrl,
      supabaseAnonKey
    );
  }
  return browserClient;
}
