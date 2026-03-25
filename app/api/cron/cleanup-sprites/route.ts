/** Daily cron to destroy stale Sprites. */
import { requireCronSecret } from "@/lib/triggers/route-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { cleanupStaleSprites } from "@/lib/sandbox/sprite-jobs";
import { getSpritesClient } from "@/lib/sandbox/sprites-client";

export async function GET(request: Request): Promise<Response> {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  const supabase = await createAdminClient();
  const spritesClient = getSpritesClient();
  const result = await cleanupStaleSprites(
    supabase,
    (spriteName) => spritesClient.sprite(spriteName),
  );
  return Response.json(result);
}
