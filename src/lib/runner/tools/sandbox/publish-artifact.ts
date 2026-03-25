/**
 * Artifact publishing tool backed by a persistent per-thread Sprite.
 * @module lib/runner/tools/sandbox/publish-artifact
 */
import crypto from "crypto";

import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  launchArtifactBackgroundJob,
  writePropertyDataToSprite,
  downloadPhotosToSprite,
  writeSkillFilesToSprite,
  ensureDevServerService,
  type SpriteHandle,
} from "@/lib/sandbox/artifact-runner";
import { buildArtifactPrompt } from "@/lib/sandbox/artifact-prompt";
import { getSpritesToken } from "@/lib/sandbox/env";
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
import { getPropertyShowcaseTemplateFiles } from "@/lib/sandbox/templates/property-showcase/template-files";
import type { Database } from "@/types/database";

const FRONTEND_SKILL_SLUG = "frontend-design";

const publishArtifactInputSchema = z.object({
  task: z.string().min(1).describe("What page to create or how to change the current page."),
  propertyData: z
    .record(z.string(), z.unknown())
    .describe("Structured property and marketing data gathered before calling the tool."),
  photoUrls: z
    .array(z.string().url())
    .optional()
    .describe("External photo URLs to download on the runner and copy into the Sprite."),
  shipIt: z
    .boolean()
    .optional()
    .describe("Set true only when the user explicitly wants a final 30-day signed URL."),
});

/**
 * Creates the publish_artifact tool for a specific client/thread context.
 */
export function createPublishArtifactTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
) {
  return {
    publish_artifact: tool({
      description:
        "Generate a polished web page such as a property showcase, pitch page, or " +
        "neighborhood guide. Returns a live preview URL for iteration in the current thread. " +
        "When the user explicitly says to ship or publish it, set shipIt=true to return a " +
        "30-day signed URL for the final static HTML.",
      inputSchema: publishArtifactInputSchema,
      execute: async ({ task, propertyData, photoUrls = [], shipIt = false }) => {
        const token = getSpritesToken();

        if (!token) {
          return {
            success: false as const,
            error: "Missing SPRITES_TOKEN environment variable.",
          };
        }

        try {
          const existingSession = await findActiveSpriteSession(supabase, threadId);
          const requestedSpriteName = `thread-${threadId.slice(0, 8)}`;
          const { sprite, spriteName, isNew } = await getOrCreateSprite({
            token,
            existingSpriteName: existingSession?.sprite_name,
            spriteName: requestedSpriteName,
          });

          await upsertSpriteSession(supabase, {
            client_id: clientId,
            thread_id: threadId,
            sprite_name: spriteName,
            status: "running",
            preview_url: sprite.url ?? existingSession?.preview_url ?? null,
          });

          const existingJob = await findRunningJob(supabase, spriteName);
          if (existingJob) {
            return {
              success: false as const,
              error: "A sandbox job is already running. Please wait for it to finish.",
            };
          }

          if (isNew) {
            const templateFiles = await getPropertyShowcaseTemplateFiles();
            const filesystem = sprite.filesystem("/template");
            for (const file of templateFiles) {
              await filesystem.writeFile(file.relativePath, file.content);
            }
            await sprite.execFile("bash", ["-lc", "cd /template && npm install"]);
          }

          await writePropertyDataToSprite(sprite as SpriteHandle, propertyData);
          const photoFilenames = await downloadPhotosToSprite(sprite as SpriteHandle, photoUrls);
          const userSkillFiles = await loadSkillFilesForSandbox(
            supabase,
            clientId,
            FRONTEND_SKILL_SLUG,
          );
          await writeSkillFilesToSprite(sprite as SpriteHandle, userSkillFiles);
          const skillSlug = userSkillFiles.length > 0 ? FRONTEND_SKILL_SLUG : undefined;

          const jobId = crypto.randomUUID();
          await insertSpriteJob(supabase, {
            id: jobId,
            client_id: clientId,
            thread_id: threadId,
            sprite_name: spriteName,
            job_type: "artifact",
            job_meta: { skillSlug, shipIt, isNew },
          });

          try {
            const prompt = buildArtifactPrompt({
              task,
              photoFilenames,
              userSkillSlug: skillSlug,
              isFollowUp: !isNew,
              shipIt,
              outputDir: jobOutputDir(jobId),
            });
            await launchArtifactBackgroundJob(sprite as SpriteHandle, jobId, {
              prompt,
              maxTurns: 20,
            });
            await updateJobStatus(supabase, jobId, "running");
          } catch {
            await updateJobStatus(supabase, jobId, "failed");
            return { success: false as const, error: "Failed to start artifact generation." };
          }

          // Only start the dev server on follow-up runs where /workspace/app already exists.
          // On new sprites, the background Claude run creates /workspace/app first —
          // the dev server is started at delivery time or on the next follow-up.
          if (!isNew) {
            await ensureDevServerService(sprite as SpriteHandle, isNew);
          }
          await touchSpriteSession(supabase, spriteName);

          return {
            success: true as const,
            status: "started" as const,
            message: "Artifact generation started in the background. I'll share results when it's ready.",
            previewUrl: sprite.url ?? "",
            spriteName,
          };
        } catch (error) {
          return {
            success: false as const,
            error: error instanceof Error ? error.message : "Artifact publishing failed.",
          };
        }
      },
    }),
  };
}
