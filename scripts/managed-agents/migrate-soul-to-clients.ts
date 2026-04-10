/**
 * One-time data migration: copy SOUL.md / USER.md from Supabase Storage
 * (`agent-files` bucket, path `{clientId}/SOUL.md|USER.md`) into the new
 * `clients.client_profile` / `clients.user_preferences` columns.
 *
 * Idempotent. Safe to run multiple times - rows whose column is already
 * populated are skipped. Missing files are treated as no-ops.
 *
 * Usage:
 *   pnpm tsx scripts/managed-agents/migrate-soul-to-clients.ts
 *
 * @module scripts/managed-agents/migrate-soul-to-clients
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "agent-files";

type ClientRow = {
  client_id: string;
  client_profile: string | null;
  user_preferences: string | null;
};

async function isMissingStorageObjectError(error: {
  message?: string;
  originalError?: unknown;
  status?: number;
  statusCode?: string;
}): Promise<boolean> {
  if (
    error.status === 404 ||
    error.statusCode === "404" ||
    /not\s*found/i.test(error.message ?? "")
  ) {
    return true;
  }

  const response = error.originalError;
  if (!(response instanceof Response)) {
    return false;
  }

  const contentType = response.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const payload = (await response.clone().json()) as {
        message?: string;
        statusCode?: string | number;
      };

      return (
        payload.statusCode === 404 ||
        payload.statusCode === "404" ||
        /not\s*found/i.test(payload.message ?? "")
      );
    }

    const text = await response.clone().text();
    return /not\s*found/i.test(text);
  } catch {
    return false;
  }
}

async function downloadStorageText(
  supabase: SupabaseClient,
  path: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);

  if (error) {
    if (
      await isMissingStorageObjectError(
        error as {
          message?: string;
          originalError?: unknown;
          status?: number;
          statusCode?: string;
        },
      )
    ) {
      return null;
    }

    throw new Error(`Failed to read ${path}: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  if (typeof data === "string") {
    return data;
  }

  if (typeof (data as { text?: unknown }).text === "function") {
    return (data as { text: () => Promise<string> }).text();
  }

  throw new Error(`Unsupported download payload for ${path}`);
}

/**
 * Migrates SOUL.md/USER.md storage content into the new `clients` columns.
 *
 * Exported for testing. CLI entrypoint below calls it with an admin client.
 */
export async function migrateSoulToClients(
  supabase: SupabaseClient,
): Promise<{ processed: number; wrote: number; skipped: number }> {
  const { data: clients, error } = (await supabase
    .from("clients")
    .select(
      "client_id, client_profile, user_preferences",
    )) as unknown as {
    data: ClientRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(`Failed to list clients: ${error.message}`);
  }

  const rows = clients ?? [];
  let wrote = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.client_profile == null) {
      const soul = await downloadStorageText(
        supabase,
        `${row.client_id}/SOUL.md`,
      );

      if (soul !== null) {
        // Belt-and-suspenders: the `.is("client_profile", null)` clause
        // lets Postgres itself short-circuit the UPDATE if anything else
        // populated the column between our SELECT and this write. For a
        // one-time manual script this is defensive - there are no known
        // concurrent writers today - but it makes the script race-safe
        // by construction for any future reruns.
        const { error: updateError } = await supabase
          .from("clients")
          .update({ client_profile: soul })
          .eq("client_id", row.client_id)
          .is("client_profile", null);

        if (updateError) {
          throw new Error(
            `Failed to update client_profile for ${row.client_id}: ${updateError.message}`,
          );
        }

        row.client_profile = soul;
        wrote += 1;
      } else {
        skipped += 1;
      }
    }

    if (row.user_preferences == null) {
      const user = await downloadStorageText(
        supabase,
        `${row.client_id}/USER.md`,
      );

      if (user !== null) {
        const { error: updateError } = await supabase
          .from("clients")
          .update({ user_preferences: user })
          .eq("client_id", row.client_id)
          .is("user_preferences", null);

        if (updateError) {
          throw new Error(
            `Failed to update user_preferences for ${row.client_id}: ${updateError.message}`,
          );
        }

        row.user_preferences = user;
        wrote += 1;
      } else {
        skipped += 1;
      }
    }
  }

  return { processed: rows.length, wrote, skipped };
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment. Source .env.local first.",
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await migrateSoulToClients(admin);

  console.log(
    `[migrate-soul-to-clients] processed=${result.processed} wrote=${result.wrote} skipped=${result.skipped}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
