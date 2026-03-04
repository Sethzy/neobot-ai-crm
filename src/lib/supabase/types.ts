/**
 * Shared Supabase client type alias used across chat and runner modules.
 * @module lib/supabase/types
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/** Typed Supabase client scoped to the app's database schema. */
export type AppSupabaseClient = SupabaseClient<Database>;
