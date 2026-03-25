/**
 * General sandbox execution tool — skill-driven code execution in a persistent Sprite.
 * @module lib/runner/tools/sandbox/execute-in-sandbox
 */
import crypto from "crypto";

import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { MEMORY_BUCKET_ID } from "@/lib/memory/constants";
import { fetchSafeExternalResource } from "@/lib/sandbox/external-url";
import {
  buildSandboxPrompt,
  launchBackgroundJob,
  writeSkillFiles,
} from "@/lib/sandbox/run-claude-in-sprite";
import { jobOutputDir } from "@/lib/sandbox/sandbox-paths";
import { loadSkillFilesForSandbox } from "@/lib/sandbox/skill-loader";
import {
  findRunningJob,
  insertSpriteJob,
  updateJobStatus,
} from "@/lib/sandbox/sprite-jobs";
import {
  findActiveSpriteSessionByClient,
  touchSpriteSession,
  upsertSpriteSession,
} from "@/lib/sandbox/sprite-session";
import { getOrCreateSprite } from "@/lib/sandbox/sprites-client";
import type { SpriteSkillFile } from "@/lib/sandbox/types";
import type { Database } from "@/types/database";

const executeInSandboxSchema = z.object({
  task: z.string().min(1).describe("What to do in the sandbox."),
  skills: z.array(z.string().min(1)).min(1).describe(
    "Skill slugs. First is primary, rest are companions.",
  ),
  inputFiles: z.array(z.string().min(1)).optional().describe(
    "Supabase Storage paths or URLs to download into the sandbox.",
  ),
});

function isUrl(value: string): boolean {
  return value.startsWith("https://");
}

function extractFilename(value: string): string {
  const parts = value.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? `file-${Date.now()}`;
  // Strip query params from URLs
  return last.split("?")[0] || last;
}

/**
 * Creates the general sandbox execution tool for one runner invocation.
 */
export function createExecuteInSandboxTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
) {
  return {
    execute_in_sandbox: tool({
      description:
        "Execute a task in a persistent sandbox computer with Python, bash, and package installation. " +
        "Use when a skill's description says 'execute_in_sandbox'. " +
        "Pass the skill slug(s) and a task description. Input files are downloaded into the sandbox.",
      inputSchema: executeInSandboxSchema,
      execute: async ({ task, skills, inputFiles }) => {
        const token = process.env.SPRITES_TOKEN?.trim();
        if (!token) {
          return { success: false, error: "Sandbox is not configured." };
        }

        // 1. Get or create per-client Sprite
        const existingSession = await findActiveSpriteSessionByClient(supabase, clientId);
        const { sprite, spriteName, isNew } = await getOrCreateSprite({
          token,
          existingSpriteName: existingSession?.sprite_name,
          spriteName: `client-${clientId.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}`,
        });

        if (existingSession) {
          await touchSpriteSession(supabase, spriteName);
        } else {
          await upsertSpriteSession(supabase, {
            client_id: clientId,
            thread_id: threadId,
            sprite_name: spriteName,
            status: "running",
          });
        }

        // 2. Check for running job — queue if busy
        const runningJob = await findRunningJob(supabase, spriteName);
        const jobId = crypto.randomUUID();
        const outputDir = jobOutputDir(jobId);

        const jobMeta = {
          skills,
          task,
          inputFiles: inputFiles ?? [],
          outputDir,
        };

        if (runningJob) {
          await insertSpriteJob(supabase, {
            id: jobId,
            client_id: clientId,
            thread_id: threadId,
            sprite_name: spriteName,
            job_type: "sandbox",
            job_meta: jobMeta,
            status: "queued",
          });
          return {
            success: true,
            status: "queued",
            message: "Queued — I'll start once the current job finishes.",
          };
        }

        // 3. Sync skills to Sprite
        const allSkillFiles: SpriteSkillFile[] = [];
        for (const slug of skills) {
          const files = await loadSkillFilesForSandbox(supabase, clientId, slug);
          allSkillFiles.push(...files);
        }
        const filesystem = sprite.filesystem();
        await writeSkillFiles(sprite, filesystem, allSkillFiles);

        // 4. Download input files to job-scoped input dir
        const inputDir = `${outputDir}/input`;
        await sprite.execFile("mkdir", ["-p", inputDir]);
        const inputFilenames: string[] = [];

        for (const fileRef of inputFiles ?? []) {
          const filename = extractFilename(fileRef);
          inputFilenames.push(filename);
          const inputFs = sprite.filesystem(inputDir);

          if (isUrl(fileRef)) {
            const response = await fetchSafeExternalResource(fileRef);
            if (!response.ok) {
              return { success: false, error: `Failed to download ${fileRef}: HTTP ${response.status}` };
            }
            const arrayBuffer = await response.arrayBuffer();
            await inputFs.writeFile(filename, Buffer.from(arrayBuffer));
          } else {
            // Storage-relative path — download via agent-files bucket
            const storagePath = `${clientId}/${fileRef}`;
            const bucket = supabase.storage.from(MEMORY_BUCKET_ID);
            const { data, error } = await bucket.download(storagePath);
            if (error || !data) {
              return { success: false, error: `Failed to download ${fileRef}: ${error?.message}` };
            }
            const buffer = Buffer.from(await data.arrayBuffer());
            await inputFs.writeFile(filename, buffer);
          }
        }

        // 5. Insert job row and launch (fail the row if launch throws)
        await insertSpriteJob(supabase, {
          id: jobId,
          client_id: clientId,
          thread_id: threadId,
          sprite_name: spriteName,
          job_type: "sandbox",
          job_meta: jobMeta,
          status: "starting",
        });

        try {
          const prompt = buildSandboxPrompt({
            task,
            skillSlugs: skills,
            inputFilenames,
            outputDir,
          });

          await launchBackgroundJob(sprite, jobId, { prompt, maxTurns: 20 });
          await updateJobStatus(supabase, jobId, "running");
          await touchSpriteSession(supabase, spriteName);
        } catch (launchError) {
          await updateJobStatus(supabase, jobId, "failed");
          return {
            success: false,
            error: `Failed to launch sandbox job: ${launchError instanceof Error ? launchError.message : "unknown error"}`,
          };
        }

        return {
          success: true,
          status: "started",
          message: "Working on it — I'll share the result when it's ready.",
        };
      },
    }),
  };
}
