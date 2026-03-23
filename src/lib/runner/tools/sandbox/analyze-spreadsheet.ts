/**
 * Spreadsheet analysis tool backed by a persistent per-thread Sprite.
 * @module lib/runner/tools/sandbox/analyze-spreadsheet
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { runClaudeInSprite } from "@/lib/sandbox/run-claude-in-sprite";
import { loadSkillFilesForSandbox } from "@/lib/sandbox/skill-loader";
import {
  findActiveSpriteSession,
  touchSpriteSession,
  upsertSpriteSession,
} from "@/lib/sandbox/sprite-session";
import { getOrCreateSprite } from "@/lib/sandbox/sprites-client";
import { createAgentFileClient } from "@/lib/storage/agent-files";
import type { Database } from "@/types/database";

const ANALYST_SKILL_SLUG = "re-analyst";
const XLSX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 30;

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
  const agentFiles = createAgentFileClient(supabase, clientId);

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
            const response = await fetch(file.url);

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

          const userSkillFiles = await loadSkillFilesForSandbox(
            supabase,
            clientId,
            ANALYST_SKILL_SLUG,
          );
          const runResult = await runClaudeInSprite(sprite, {
            task,
            inputFilenames: files.map((file) => sanitizeSpriteFilename(file.filename)),
            userSkillFiles,
            userSkillSlug: ANALYST_SKILL_SLUG,
          });

          await touchSpriteSession(supabase, spriteName);

          if (!runResult.success) {
            return {
              success: false as const,
              error:
                runResult.error
                ?? runResult.summary
                ?? "Spreadsheet analysis failed.",
            };
          }

          let outputBuffer: Buffer;

          try {
            const outputFile = await spriteFilesystem.readFile("/workspace/output/result.xlsx");
            outputBuffer = typeof outputFile === "string"
              ? Buffer.from(outputFile)
              : outputFile;
          } catch {
            return {
              success: false as const,
              error: "Sandbox run completed but result.xlsx was not produced.",
            };
          }

          const uploadResult = await agentFiles.uploadArtifact({
            path: `artifacts/sandbox/result-${Date.now()}.xlsx`,
            content: outputBuffer,
            contentType: XLSX_MEDIA_TYPE,
            expiresInSeconds: SIGNED_URL_EXPIRY_SECONDS,
            downloadFilename: "result.xlsx",
          });

          return {
            success: true as const,
            summary: runResult.summary,
            outputFiles: [
              {
                filename: "result.xlsx",
                storagePath: uploadResult.storagePath,
                downloadUrl: uploadResult.downloadUrl,
                mediaType: XLSX_MEDIA_TYPE,
              },
            ],
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
