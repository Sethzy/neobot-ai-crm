/**
 * Shared Supabase environment variable loader for client and server modules.
 * @module lib/supabase/env
 */

export interface SupabaseEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export function getSupabaseEnv(): SupabaseEnv {
  const supabaseUrl = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ""
  ).trim();
  const supabaseAnonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ""
  ).trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}
