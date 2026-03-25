/**
 * Supabase server-side client factories for user-session and admin contexts.
 * @module lib/supabase/server
 */
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { getSupabaseEnv } from "./env";

export async function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll is called from Server Components where cookies are
            // read-only. The middleware handles persisting refreshed tokens
            // in that case, so this catch is safe to swallow.
          }
        },
      },
    }
  );
}

/**
 * Creates a trusted service-role client for cron and webhook contexts.
 */
export async function createAdminClient(): Promise<SupabaseClient<Database>> {
  const { supabaseUrl } = getSupabaseEnv();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (!serviceRoleKey) {
    throw new Error("Missing Supabase admin credentials");
  }

  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
