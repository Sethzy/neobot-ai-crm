/** Webhook callback endpoint for async sandbox job completion. */
import { NextRequest, NextResponse } from "next/server";

import { jobDoneMarker, jobErrorMarker } from "@/lib/sandbox/sandbox-paths";
import { deriveJobToken, deliverResult, failJob } from "@/lib/sandbox/sprite-jobs";
import { getSpritesClient } from "@/lib/sandbox/sprites-client";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { jobId } = body;

  if (!jobId) {
    return NextResponse.json({ error: "missing jobId" }, { status: 400 });
  }

  // Verify per-job HMAC
  const auth = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!auth || auth !== deriveJobToken(jobId)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminClient();

  // CAS: acquire ownership
  const { data: job } = await supabase
    .from("sprite_jobs")
    .update({ status: "delivering", claimed_by: "webhook", claimed_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "running")
    .select()
    .single();

  if (!job) {
    return NextResponse.json({ ok: true }); // already delivered or not found
  }

  const sprite = getSpritesClient().sprite(job.sprite_name);

  try {
    // Verify markers independently — don't trust the callback status
    const isDone = await sprite.execFile("test", ["-f", jobDoneMarker(jobId)])
      .then(() => true).catch(() => false);
    const isError = await sprite.execFile("test", ["-f", jobErrorMarker(jobId)])
      .then(() => true).catch(() => false);

    if (isDone) {
      await deliverResult(job, sprite, supabase);
    } else if (isError) {
      await failJob(job, "Analysis failed. Want me to try again?", supabase);
    } else {
      // Callback fired but markers not present — release for cron
      await supabase.from("sprite_jobs")
        .update({ status: "running", claimed_by: null, claimed_at: null })
        .eq("id", job.id);
    }
  } catch {
    // Release for cron retry
    await supabase.from("sprite_jobs")
      .update({ status: "running", claimed_by: null, claimed_at: null })
      .eq("id", job.id);
  }

  return NextResponse.json({ ok: true });
}
