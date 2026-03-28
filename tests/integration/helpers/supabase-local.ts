/**
 * Local Supabase client factory for integration tests.
 * Connects to `supabase start` local dev instance.
 * @module tests/integration/helpers/supabase-local
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Well-known local Supabase defaults from `supabase start`.
 * These match the values printed by `supabase status` for every local project.
 */
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const LOCAL_SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export type TestSupabaseClient = SupabaseClient<Database>;

/**
 * Creates a service-role Supabase client for integration tests.
 * Bypasses RLS — used for seeding data and testing application logic.
 */
export function createServiceClient(): TestSupabaseClient {
  return createClient<Database>(
    LOCAL_SUPABASE_URL,
    LOCAL_SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/**
 * Creates an anon-key Supabase client for RLS testing.
 * Must be paired with `signInTestUser` to get an authenticated session.
 */
export function createAnonClient(): TestSupabaseClient {
  return createClient<Database>(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Creates a test auth user via the admin API and returns the user_id.
 * Uses the service-role client to bypass auth restrictions.
 */
export async function createTestUser(
  serviceClient: TestSupabaseClient,
  email: string,
  password = "test-password-123!",
): Promise<string> {
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) throw new Error(`Failed to create test user: ${error.message}`);
  return data.user.id;
}

/**
 * Signs in a test user on an anon client and returns the authenticated client.
 */
export async function signInTestUser(
  anonClient: TestSupabaseClient,
  email: string,
  password = "test-password-123!",
): Promise<TestSupabaseClient> {
  const { error } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw new Error(`Failed to sign in test user: ${error.message}`);
  return anonClient;
}

/**
 * Checks if local Supabase is reachable. Resolves to `true` if running, `false` if not.
 * Use with `describe.runIf(await isSupabaseRunning())` to skip gracefully.
 */
export async function isSupabaseRunning(): Promise<boolean> {
  try {
    const client = createServiceClient();
    const { error } = await client.from("clients").select("client_id").limit(0);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Quick connectivity check — throws if Supabase is not running.
 * Prefer `isSupabaseRunning()` + `describe.runIf()` for graceful skipping.
 */
export async function assertSupabaseRunning(
  client: TestSupabaseClient,
): Promise<void> {
  try {
    const { error } = await client.from("clients").select("client_id").limit(0);
    if (error) throw error;
  } catch {
    throw new Error(
      "Local Supabase is not running. Start it with `supabase start` before running integration tests.",
    );
  }
}
