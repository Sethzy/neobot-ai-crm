/**
 * Shared helpers for Next.js API route handlers.
 * @module lib/api/route-helpers
 */
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type AuthResult =
  | { kind: "error"; response: Response }
  | { kind: "ok"; supabase: SupabaseServerClient; userId: string };

/** Returns a JSON error response with the given message and HTTP status. */
export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/**
 * Authenticates a request via Supabase Auth.
 *
 * Returns a discriminated union so callers can early-return on error
 * without nested conditionals.
 */
export async function authenticateRequest(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { kind: "error", response: jsonError("Unauthorized.", 401) };
  }

  return { kind: "ok", supabase, userId: user.id };
}
