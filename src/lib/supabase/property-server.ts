import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  getPropertySupabaseEnv,
  PROPERTY_SUPABASE_ENV_ERROR,
} from "@/lib/supabase/property-env";

export async function createPropertyServerClient() {
  const env = getPropertySupabaseEnv();
  if (!env) {
    throw new Error(PROPERTY_SUPABASE_ENV_ERROR);
  }

  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
    },
  });
}
