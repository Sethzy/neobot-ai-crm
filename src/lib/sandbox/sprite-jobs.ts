/** Async sandbox job management — CRUD, claim/lease, HMAC auth, result formatting. */

import crypto from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createMessage } from "@/lib/chat/messages";
import { createAgentFileClient } from "@/lib/storage/agent-files";
import { jobOutputDir, jobDoneMarker, jobErrorMarker, jobStreamLog } from "./sandbox-paths";
import type { Database } from "@/types/database";

const XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 30;

type SpriteJobInsert = Database["public"]["Tables"]["sprite_jobs"]["Insert"];
type SpriteJobRow = Database["public"]["Tables"]["sprite_jobs"]["Row"];

/** Minimal sprite handle for delivery operations. */
interface SpriteHandle {
  execFile: (
    command: string,
    args?: string[],
  ) => Promise<{ stdout?: string | Buffer; stderr?: string | Buffer }>;
  filesystem: (basePath?: string) => {
    readFile: (path: string) => Promise<string | Buffer>;
  };
}

/**
 * Derive a per-job HMAC token for webhook callback authentication.
 * Reuses the signing pattern from src/lib/triggers/webhook-auth.ts.
 */
export function deriveJobToken(jobId: string): string {
  return crypto
    .createHmac("sha256", process.env.SANDBOX_CALLBACK_SECRET!)
    .update(jobId)
    .digest("hex");
}

/** Format job result as a human-readable chat message. */
export function formatResultForChat(
  jobType: string,
  meta: Record<string, unknown>,
): string {
  if (meta.error) return String(meta.error);
  const summary = String(meta.summary || "Analysis complete.");
  const link = meta.downloadUrl || meta.previewUrl || meta.publishedUrl;
  return link ? `${summary}\n\n[Download result](${link})` : summary;
}

/** Find an active (starting or running) job for a given sprite. */
export async function findRunningJob(
  supabase: SupabaseClient<Database>,
  spriteName: string,
): Promise<SpriteJobRow | null> {
  const { data } = await supabase
    .from("sprite_jobs")
    .select("*")
    .eq("sprite_name", spriteName)
    .in("status", ["starting", "running"])
    .limit(1)
    .maybeSingle();
  return data;
}

/** Insert a new sprite job row. */
export async function insertSpriteJob(
  supabase: SupabaseClient<Database>,
  job: SpriteJobInsert,
): Promise<void> {
  const { error } = await supabase.from("sprite_jobs").insert(job);
  if (error) throw new Error(`Failed to insert sprite job: ${error.message}`);
}

/** Update a sprite job's status. */
export async function updateJobStatus(
  supabase: SupabaseClient<Database>,
  jobId: string,
  status: string,
): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (status === "completed" || status === "failed") {
    update.completed_at = new Date().toISOString();
  }
  await supabase.from("sprite_jobs").update(update).eq("id", jobId);
}

/** Parse NDJSON stream-json lines to extract a human-readable progress label. */
export function parseProgressFromLines(content: string): string | null {
  const lines = content.split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const event = JSON.parse(lines[i]);
      if (event.type === "assistant" && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === "tool_use") {
            const name = block.name;
            const input = block.input || {};
            if (name === "Bash") return `Running: ${(input.command || "").slice(0, 60)}`;
            if (name === "Write" || name === "Edit") return `Editing ${input.file_path || "file"}`;
            if (name === "Read") return `Reading ${input.file_path || "file"}`;
            return `Using ${name}`;
          }
        }
      }
    } catch { continue; }
  }
  return null;
}

/**
 * Read the stream log from a sprite and extract progress.
 * Uses `tail -20` to get the last 20 lines (lightweight).
 */
export async function readLatestProgress(
  sprite: SpriteHandle,
  jobId: string,
): Promise<string | null> {
  try {
    const { stdout } = await sprite.execFile("tail", ["-20", jobStreamLog(jobId)]);
    const content = typeof stdout === "string" ? stdout : stdout?.toString("utf8") ?? "";
    return parseProgressFromLines(content);
  } catch {
    return null;
  }
}

/**
 * Deliver a completed job's result to the chat thread.
 * Reads output artifacts from the sprite, uploads them to Supabase Storage,
 * inserts a conversation_messages row with download links, then marks completed.
 */
export async function deliverResult(
  job: SpriteJobRow,
  sprite: SpriteHandle,
  supabase: SupabaseClient<Database>,
): Promise<void> {
  const outputDir = jobOutputDir(job.id);
  const filesystem = sprite.filesystem(outputDir);
  const meta = (job.job_meta ?? {}) as Record<string, unknown>;
  const agentFiles = createAgentFileClient(supabase, job.client_id);
  const resultMeta: Record<string, unknown> = {};

  // Read summary (shared by both job types)
  let summary = "Analysis complete.";
  try {
    const raw = await filesystem.readFile("summary.txt");
    const text = typeof raw === "string" ? raw : raw.toString("utf8");
    if (text.trim()) summary = text.trim();
  } catch {
    // No summary file — use default
  }
  resultMeta.summary = summary;

  // Upload artifacts based on job type
  if (job.job_type === "analyze") {
    try {
      const outputFile = await filesystem.readFile("result.xlsx");
      const outputBuffer = typeof outputFile === "string"
        ? Buffer.from(outputFile)
        : outputFile;

      const uploadResult = await agentFiles.uploadArtifact({
        path: `artifacts/sandbox/result-${Date.now()}.xlsx`,
        content: outputBuffer,
        contentType: XLSX_MEDIA_TYPE,
        expiresInSeconds: SIGNED_URL_EXPIRY_SECONDS,
        downloadFilename: "result.xlsx",
      });

      resultMeta.downloadUrl = uploadResult.downloadUrl;
      resultMeta.storagePath = uploadResult.storagePath;
    } catch {
      // No result.xlsx — deliver summary-only
    }
  } else if (job.job_type === "artifact" && meta.shipIt) {
    try {
      const outputHtml = await filesystem.readFile("output.html");
      const htmlContent = typeof outputHtml === "string"
        ? outputHtml
        : outputHtml.toString("utf8");

      const uploadResult = await agentFiles.uploadArtifact({
        path: `artifacts/sandbox/property-showcase-${Date.now()}.html`,
        content: htmlContent,
        contentType: "text/html; charset=utf-8",
        expiresInSeconds: SIGNED_URL_EXPIRY_SECONDS,
        downloadFilename: "property-showcase.html",
      });

      resultMeta.publishedUrl = uploadResult.downloadUrl;
    } catch {
      // No output.html — deliver summary-only
    }
  }

  const chatMessage = formatResultForChat(job.job_type, resultMeta);

  await supabase.from("sprite_jobs").update({
    result_meta: resultMeta,
    status: "completed",
    completed_at: new Date().toISOString(),
  }).eq("id", job.id);

  await createMessage(supabase, {
    thread_id: job.thread_id,
    role: "assistant",
    parts: [
      { type: "text", text: chatMessage },
      { type: "data", data: { source: "background-job", jobId: job.id } },
    ],
  });
}

/**
 * Mark a job as failed and insert an error message into the chat.
 */
export async function failJob(
  job: SpriteJobRow,
  errorMessage: string,
  supabase: SupabaseClient<Database>,
): Promise<void> {
  await supabase.from("sprite_jobs").update({
    result_meta: { error: errorMessage },
    status: "failed",
    completed_at: new Date().toISOString(),
  }).eq("id", job.id);

  await createMessage(supabase, {
    thread_id: job.thread_id,
    role: "assistant",
    parts: [
      { type: "text", text: errorMessage },
      { type: "data", data: { source: "background-job", jobId: job.id } },
    ],
  });
}

/**
 * Cron fallback: check all active sprite jobs for completion.
 * Claims running rows, checks markers, updates progress.
 */
export async function checkActiveSpriteJobs(
  supabase: SupabaseClient<Database>,
  getSprite: (spriteName: string) => SpriteHandle,
): Promise<{ checked: number; delivered: number; failed: number }> {
  // Reclaim stale delivering rows (>5 min)
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  await supabase.from("sprite_jobs")
    .update({ status: "running", claimed_by: null, claimed_at: null })
    .eq("status", "delivering")
    .lt("claimed_at", fiveMinAgo);

  // Claim running jobs
  const { data: jobs } = await supabase
    .from("sprite_jobs")
    .select("*")
    .in("status", ["starting", "running"])
    .is("claimed_by", null);

  if (!jobs?.length) return { checked: 0, delivered: 0, failed: 0 };

  let delivered = 0;
  let failed = 0;

  for (const job of jobs) {
    const sprite = getSprite(job.sprite_name);

    const isDone = await sprite.execFile("test", ["-f", jobDoneMarker(job.id)])
      .then(() => true).catch(() => false);
    const isError = await sprite.execFile("test", ["-f", jobErrorMarker(job.id)])
      .then(() => true).catch(() => false);

    if (isDone) {
      // CAS claim
      const { data: claimed } = await supabase
        .from("sprite_jobs")
        .update({ status: "delivering", claimed_by: "cron", claimed_at: new Date().toISOString() })
        .eq("id", job.id)
        .in("status", ["starting", "running"])
        .select()
        .single();
      if (claimed) {
        await deliverResult(claimed, sprite, supabase);
        delivered++;
      }
    } else if (isError) {
      const { data: claimed } = await supabase
        .from("sprite_jobs")
        .update({ status: "delivering", claimed_by: "cron", claimed_at: new Date().toISOString() })
        .eq("id", job.id)
        .in("status", ["starting", "running"])
        .select()
        .single();
      if (claimed) {
        await failJob(claimed, "Analysis failed. Want me to try again?", supabase);
        failed++;
      }
    } else {
      // Still running — update progress
      const progress = await readLatestProgress(sprite, job.id);
      if (progress) {
        await supabase.from("sprite_jobs")
          .update({ progress_label: progress })
          .eq("id", job.id);
      }
    }
  }

  return { checked: jobs.length, delivered, failed };
}

interface DestroyableSpriteHandle {
  destroy: () => Promise<void>;
}

/**
 * Destroy sprites that have been inactive for more than 7 days.
 * Skips sprites with running jobs.
 */
export async function cleanupStaleSprites(
  supabase: SupabaseClient<Database>,
  getSprite: (spriteName: string) => DestroyableSpriteHandle,
): Promise<{ destroyed: number }> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();

  const { data: staleSessions } = await supabase
    .from("sprite_sessions")
    .select("sprite_name, last_active_at")
    .lt("last_active_at", cutoff);

  if (!staleSessions?.length) return { destroyed: 0 };

  let destroyed = 0;

  for (const session of staleSessions) {
    // Check for running jobs before destroying
    const { data: runningJobs } = await supabase
      .from("sprite_jobs")
      .select("id")
      .eq("sprite_name", session.sprite_name)
      .in("status", ["starting", "running"]);

    if (runningJobs?.length) continue;

    const sprite = getSprite(session.sprite_name);
    try {
      await sprite.destroy();
    } catch {
      // Sprite may already be gone — mark it destroyed anyway
    }

    await supabase.from("sprite_sessions")
      .update({ status: "destroyed" } as Record<string, unknown>)
      .eq("sprite_name", session.sprite_name);

    destroyed++;
  }

  return { destroyed };
}
