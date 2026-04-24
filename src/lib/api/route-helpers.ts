/**
 * Shared helpers for Next.js API route handlers.
 * @module lib/api/route-helpers
 */
import { z, type ZodTypeAny } from "zod";

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

interface AuthenticateAndParseBodyOptions<TSchema extends ZodTypeAny> {
  invalidJsonMessage?: string;
  invalidBodyMessage?: string | ((error: z.ZodError<z.output<TSchema>>) => string);
}

export type AuthenticatedBodyResult<TSchema extends ZodTypeAny> =
  | { kind: "error"; response: Response }
  | {
      kind: "ok";
      supabase: SupabaseServerClient;
      userId: string;
      body: z.infer<TSchema>;
    };

/**
 * Parses JSON in parallel with auth so routes do not serialize two
 * independent hot-path operations.
 */
export async function authenticateAndParseBody<TSchema extends ZodTypeAny>(
  request: Request,
  schema: TSchema,
  options: AuthenticateAndParseBodyOptions<TSchema> = {},
): Promise<AuthenticatedBodyResult<TSchema>> {
  const [authResult, rawBody] = await Promise.all([
    authenticateRequest(),
    request.json().catch(() => null),
  ]);

  if (authResult.kind === "error") {
    return authResult;
  }

  if (rawBody === null) {
    return {
      kind: "error",
      response: jsonError(options.invalidJsonMessage ?? "Invalid request body.", 400),
    };
  }

  const parsedBody = schema.safeParse(rawBody);
  if (!parsedBody.success) {
    const invalidBodyMessage = typeof options.invalidBodyMessage === "function"
      ? options.invalidBodyMessage(parsedBody.error)
      : (options.invalidBodyMessage ?? "Invalid request body.");

    return {
      kind: "error",
      response: jsonError(invalidBodyMessage, 400),
    };
  }

  return {
    kind: "ok",
    supabase: authResult.supabase,
    userId: authResult.userId,
    body: parsedBody.data,
  };
}
