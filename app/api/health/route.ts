/** Public health check endpoint for monitoring and load balancers. */
import { createAdminClient } from "@/lib/supabase/server";
import { getRedisClient } from "@/lib/redis";

export const dynamic = "force-dynamic";

const SUPABASE_TIMEOUT_MS = 3000;

async function checkSupabase(): Promise<"ok" | "error"> {
  try {
    const supabase = await createAdminClient();
    const result = await Promise.race([
      supabase.from("clients").select("client_id").limit(1).maybeSingle(),
      new Promise<{ error: Error }>((resolve) =>
        setTimeout(
          () => resolve({ error: new Error("timeout") }),
          SUPABASE_TIMEOUT_MS,
        ),
      ),
    ]);
    return result.error ? "error" : "ok";
  } catch {
    return "error";
  }
}

async function checkRedis(): Promise<"ok" | "degraded"> {
  try {
    const client = await getRedisClient();
    if (!client) return "degraded";
    await client.ping();
    return "ok";
  } catch {
    return "degraded";
  }
}

export async function GET() {
  const [supabase, redis] = await Promise.all([
    checkSupabase(),
    checkRedis(),
  ]);

  const isHealthy = supabase === "ok";
  const body = {
    status: isHealthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
    checks: { supabase, redis },
  };

  return Response.json(body, { status: isHealthy ? 200 : 503 });
}
