export type PropertySupabaseEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export const PROPERTY_SUPABASE_ENV_ERROR =
  "Missing property Supabase env vars. Set NEXT_PUBLIC_PROPERTY_SUPABASE_URL and NEXT_PUBLIC_PROPERTY_SUPABASE_ANON_KEY.";

export function getPropertySupabaseEnv(): PropertySupabaseEnv | null {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_PROPERTY_SUPABASE_URL ??
    process.env.PROPERTY_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_PROPERTY_SUPABASE_ANON_KEY ??
    process.env.PROPERTY_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return { supabaseUrl, supabaseAnonKey };
}

export function isPropertySupabaseConfigured(): boolean {
  return getPropertySupabaseEnv() !== null;
}
