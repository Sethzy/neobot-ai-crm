/**
 * Local Supabase client factory for integration tests.
 * Connects to `supabase start` local dev instance.
 * @module tests/integration/helpers/supabase-local
 */
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

let cachedSupabaseStatusEnv: Record<string, string> | null = null;
let cachedDockerSupabaseEnv: Record<string, string> | null = null;

/**
 * Reads local Supabase credentials from `supabase status -o env`.
 * Integration tests can also set `SUPABASE_LOCAL_*` variables explicitly.
 */
function readSupabaseStatusEnv(): Record<string, string> {
  if (cachedSupabaseStatusEnv) return cachedSupabaseStatusEnv;

  try {
    const output = execFileSync("supabase", ["status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    cachedSupabaseStatusEnv = Object.fromEntries(
      output
        .split(/\r?\n/)
        .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
        .filter((match): match is RegExpMatchArray => Boolean(match))
        .map((match) => [match[1], match[2].replace(/^"|"$/g, "")]),
    );
  } catch {
    cachedSupabaseStatusEnv = {};
  }

  return cachedSupabaseStatusEnv;
}

/**
 * Reads environment variables from the running local Supabase auth container.
 * This covers repos without a Supabase CLI config file, where `status` cannot
 * infer the generated Docker container names.
 */
function readDockerSupabaseEnv(): Record<string, string> {
  if (cachedDockerSupabaseEnv) return cachedDockerSupabaseEnv;

  try {
    const containerNames = execFileSync(
      "docker",
      ["ps", "--format", "{{.Names}}"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    )
      .split(/\r?\n/)
      .filter(Boolean);
    const authContainer = containerNames.find((name) =>
      name.startsWith("supabase_auth_"),
    );

    if (!authContainer) {
      cachedDockerSupabaseEnv = {};
      return cachedDockerSupabaseEnv;
    }

    const output = execFileSync(
      "docker",
      [
        "inspect",
        "--format",
        "{{range .Config.Env}}{{println .}}{{end}}",
        authContainer,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );

    cachedDockerSupabaseEnv = Object.fromEntries(
      output
        .split(/\r?\n/)
        .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
        .filter((match): match is RegExpMatchArray => Boolean(match))
        .map((match) => [match[1], match[2].replace(/^"|"$/g, "")]),
    );
  } catch {
    cachedDockerSupabaseEnv = {};
  }

  return cachedDockerSupabaseEnv;
}

/**
 * Resolves a local Supabase value without storing local credentials in source.
 */
function getLocalSupabaseSetting(
  envName: string,
  statusName: string,
  fallback?: string,
): string {
  const value =
    process.env[envName] ?? readSupabaseStatusEnv()[statusName] ?? fallback;

  if (!value) {
    throw new Error(
      `Missing ${envName}. Start local Supabase with Docker available or set ${envName} for integration tests.`,
    );
  }

  return value;
}

/**
 * Encodes a JWT segment using Node's base64url support.
 */
function encodeJwtSegment(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/**
 * Creates a local Supabase role token from the running container's JWT secret.
 */
function createLocalRoleToken(role: "anon" | "service_role"): string {
  const jwtSecret =
    process.env.SUPABASE_LOCAL_JWT_SECRET ??
    readDockerSupabaseEnv().GOTRUE_JWT_SECRET;

  if (!jwtSecret) {
    throw new Error(
      "Missing SUPABASE_LOCAL_JWT_SECRET. Start local Supabase with Docker available or set local Supabase test credentials.",
    );
  }

  const unsignedToken = [
    encodeJwtSegment({ alg: "HS256", typ: "JWT" }),
    encodeJwtSegment({
      iss: "supabase-demo",
      ref: "127.0.0.1",
      role,
      exp: 1983812996,
    }),
  ].join(".");
  const signature = createHmac("sha256", jwtSecret)
    .update(unsignedToken)
    .digest("base64url");

  return `${unsignedToken}.${signature}`;
}

/**
 * Returns the local Supabase URL lazily so importing integration tests can
 * skip cleanly when the local stack is absent.
 */
function getLocalSupabaseUrl(): string {
  return getLocalSupabaseSetting(
    "SUPABASE_LOCAL_URL",
    "SUPABASE_URL",
    "http://127.0.0.1:54321",
  );
}

/**
 * Returns the local anon key lazily. This may synthesize a token from the
 * running Docker auth container when `supabase status` cannot provide one.
 */
function getLocalSupabaseAnonKey(): string {
  return (
    process.env.SUPABASE_LOCAL_ANON_KEY ??
    readSupabaseStatusEnv().ANON_KEY ??
    createLocalRoleToken("anon")
  );
}

/**
 * Returns the local service-role key lazily. This keeps missing local
 * credentials from failing test collection before `describe.runIf()` can skip.
 */
function getLocalSupabaseServiceRoleKey(): string {
  return (
    process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ??
    readSupabaseStatusEnv().SERVICE_ROLE_KEY ??
    createLocalRoleToken("service_role")
  );
}

export type TestSupabaseClient = SupabaseClient<Database>;

/**
 * Creates a service-role Supabase client for integration tests.
 * Bypasses RLS — used for seeding data and testing application logic.
 */
export function createServiceClient(): TestSupabaseClient {
  return createClient<Database>(
    getLocalSupabaseUrl(),
    getLocalSupabaseServiceRoleKey(),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        storageKey: `sb-service-${randomUUID()}`,
      },
    },
  );
}

/**
 * Creates an anon-key Supabase client for RLS testing.
 * Must be paired with `signInTestUser` to get an authenticated session.
 */
export function createAnonClient(): TestSupabaseClient {
  return createClient<Database>(getLocalSupabaseUrl(), getLocalSupabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `sb-anon-${randomUUID()}`,
    },
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
