/**
 * Spreadsheet analysis tool backed by a persistent per-thread Sprite.
 * @module lib/runner/tools/sandbox/analyze-spreadsheet
 */
import crypto from "crypto";

import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { fetchSafeExternalResource } from "@/lib/sandbox/external-url";
import {
  buildAnalysisPrompt,
  ensureBundledXlsxSkillFiles,
  ensureSpreadsheetDependencies,
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
  findActiveSpriteSession,
  touchSpriteSession,
  upsertSpriteSession,
} from "@/lib/sandbox/sprite-session";
import { getOrCreateSprite } from "@/lib/sandbox/sprites-client";
import type { Database } from "@/types/database";

const ANALYST_SKILL_SLUG = "re-analyst";

const analyzeSpreadsheetInputSchema = z.object({
  task: z.string().min(1).describe("What spreadsheet analysis to perform."),
  files: z.array(
    z.object({
      url: z.string().url(),
      filename: z.string().min(1),
      mediaType: z.string().min(1),
    }),
  ).describe("Structured spreadsheet inputs from chat attachments."),
});

/**
 * Creates the spreadsheet analysis tool for a single runner invocation.
 */
export function createAnalyzeSpreadsheetTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
) {
  return {
    analyze_spreadsheet: tool({
      description:
        "Analyze spreadsheet inputs and produce a downloadable Excel workbook. " +
        "Use for uploaded xlsx/csv files, financial models, and deal comparisons. " +
        "Supports multi-turn iteration by reusing the same Sprite within the current thread.",
      inputSchema: analyzeSpreadsheetInputSchema,
      execute: async ({ task, files }) => {
        const token = process.env.SPRITES_TOKEN?.trim();

        if (!token) {
          return {
            success: false as const,
            error: "Missing SPRITES_TOKEN environment variable.",
          };
        }

        try {
          const existingSession = await findActiveSpriteSession(supabase, threadId);
          const requestedSpriteName = `thread-${threadId.slice(0, 8)}`;
          const { sprite, spriteName } = await getOrCreateSprite({
            token,
            existingSpriteName: existingSession?.sprite_name,
            spriteName: requestedSpriteName,
          });
          const spriteFilesystem = sprite.filesystem();

          await upsertSpriteSession(supabase, {
            client_id: clientId,
            thread_id: threadId,
            sprite_name: spriteName,
            status: "running",
          });

          await sprite.execFile("mkdir", ["-p", "/workspace/input"]);

          for (const file of files) {
            const response = await fetchSafeExternalResource(file.url);

            if (!response.ok) {
              throw new Error(
                `Failed to download input file "${file.filename}" (status ${response.status}).`,
              );
            }

            const buffer = Buffer.from(await response.arrayBuffer());
            await spriteFilesystem.writeFile(
              `/workspace/input/${sanitizeSpriteFilename(file.filename)}`,
              buffer,
            );
          }

          const existingJob = await findRunningJob(supabase, spriteName);
          if (existingJob) {
            return {
              success: false as const,
              error: "A sandbox job is already running. Please wait for it to finish.",
            };
          }

          const inputFilenames = files.map((file) => sanitizeSpriteFilename(file.filename));
          const userSkillFiles = await loadSkillFilesForSandbox(
            supabase,
            clientId,
            ANALYST_SKILL_SLUG,
          );
          const skillSlug = userSkillFiles.length > 0 ? ANALYST_SKILL_SLUG : undefined;

          // Ensure dependencies and skill files are present before launching
          await ensureSpreadsheetDependencies(sprite);
          await ensureBundledXlsxSkillFiles(sprite, spriteFilesystem);
          await writeSkillFiles(sprite, spriteFilesystem, userSkillFiles);

          const jobId = crypto.randomUUID();
          await insertSpriteJob(supabase, {
            id: jobId,
            client_id: clientId,
            thread_id: threadId,
            sprite_name: spriteName,
            job_type: "analyze",
            job_meta: { skillSlug, inputFilenames },
          });

          try {
            const prompt = buildAnalysisPrompt(task, inputFilenames, skillSlug, jobOutputDir(jobId));
            await launchBackgroundJob(sprite, jobId, { prompt, maxTurns: 20 });
            await updateJobStatus(supabase, jobId, "running");
          } catch {
            await updateJobStatus(supabase, jobId, "failed");
            return { success: false as const, error: "Failed to start analysis." };
          }

          await touchSpriteSession(supabase, spriteName);

          return {
            success: true as const,
            status: "started" as const,
            message: "Analysis started in the background. I'll share results when it's ready.",
            spriteName,
          };
        } catch (error) {
          return {
            success: false as const,
            error: error instanceof Error ? error.message : "Spreadsheet analysis failed.",
          };
        }
      },
    }),
  };
}

function sanitizeSpriteFilename(filename: string): string {
  const trimmedFilename = filename.trim();

  if (trimmedFilename.length === 0) {
    return "input-file";
  }

  return trimmedFilename.replace(/[\\/]+/g, "-");
}
