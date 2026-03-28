/**
 * Test cleanup utilities — deletes test data between test runs.
 * Uses service-role client to bypass RLS.
 * @module tests/integration/helpers/cleanup
 */
import type { TestSupabaseClient } from "./supabase-local";

/**
 * Tables to delete from in dependency-safe order (children first, parents last).
 * Uses service-role client which bypasses RLS.
 * The `.neq` filter ensures we delete all rows (PostgREST requires a filter on DELETE).
 */
const TABLES_IN_DELETE_ORDER = [
  "approval_events",
  "deal_contacts",
  "interactions",
  "crm_tasks",
  "thread_queue_records",
  "conversation_messages",
  "runs",
  "agent_triggers",
  "deals",
  "contacts",
  "companies",
  "crm_config",
  "autopilot_config",
  "conversation_threads",
  "clients",
] as const;

/**
 * Deletes all rows from integration-test-relevant tables, then removes auth users.
 * Uses sequential deletes in FK-safe order since we can't TRUNCATE via PostgREST.
 */
export async function cleanupAll(supabase: TestSupabaseClient): Promise<void> {
  for (const table of TABLES_IN_DELETE_ORDER) {
    // PostgREST requires at least one filter on DELETE.
    // `gte created_at 1970-01-01` matches all rows.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from(table)
      .delete()
      .gte("created_at", "1970-01-01T00:00:00Z");
  }

  await cleanupAuthUsers(supabase);
}

/**
 * Deletes all auth.users created during tests.
 */
export async function cleanupAuthUsers(
  supabase: TestSupabaseClient,
): Promise<void> {
  const { data } = await supabase.auth.admin.listUsers();
  if (!data?.users) return;

  for (const user of data.users) {
    await supabase.auth.admin.deleteUser(user.id);
  }
}
