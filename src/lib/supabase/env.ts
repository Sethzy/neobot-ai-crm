/**
 * Shared Supabase environment variable loader for client and server modules.
 * Delegates to the central env validator for URL and anon key.
 * @module lib/supabase/env
 */
import { getServerEnv } from "@/lib/env";

export interface SupabaseEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export function getSupabaseEnv(): SupabaseEnv {
  const env = getServerEnv();
  return { supabaseUrl: env.SUPABASE_URL, supabaseAnonKey: env.SUPABASE_ANON_KEY };
}
