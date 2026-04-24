/**
 * Shared test helpers for mocking API route helper behavior.
 * @module test/mocks/route-helpers
 */

type MockAuthResult =
  | { kind: "error"; response: Response }
  | { kind: "ok"; supabase: unknown; userId: string };

interface MockSafeParseSchema<TBody = unknown, TError = unknown> {
  safeParse:
    (value: unknown) =>
      | { success: true; data: TBody }
      | { success: false; error: TError };
}

interface MockParseBodyOptions<TError = unknown> {
  invalidJsonMessage?: string;
  invalidBodyMessage?: string | ((error: TError) => string);
}

/**
 * Mirrors `authenticateAndParseBody()` closely enough for route unit tests that
 * fully mock `@/lib/api/route-helpers`.
 */
export function buildAuthenticateAndParseBody(
  authenticateRequest: () => Promise<MockAuthResult>,
  jsonError: (message: string, status: number) => Response,
) {
  return async <TBody = unknown, TError = unknown>(
    request: Request,
    schema: MockSafeParseSchema<TBody, TError>,
    options: MockParseBodyOptions<TError> = {},
  ) => {
    const [authResult, rawBody] = await Promise.all([
      authenticateRequest(),
      request.json().catch(() => null),
    ]);

    if (authResult.kind === "error") {
      return authResult;
    }

    if (rawBody === null) {
      return {
        kind: "error" as const,
        response: jsonError(options.invalidJsonMessage ?? "Invalid request body.", 400),
      };
    }

    const parsedBody = schema.safeParse(rawBody);

    if (!parsedBody.success) {
      const invalidBodyMessage = typeof options.invalidBodyMessage === "function"
        ? options.invalidBodyMessage(parsedBody.error)
        : (options.invalidBodyMessage ?? "Invalid request body.");

      return {
        kind: "error" as const,
        response: jsonError(invalidBodyMessage, 400),
      };
    }

    return {
      kind: "ok" as const,
      supabase: authResult.supabase,
      userId: authResult.userId,
      body: parsedBody.data,
    };
  };
}
