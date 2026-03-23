/**
 * Artifact publishing tool backed by a persistent per-thread Sprite.
 * @module lib/runner/tools/sandbox/publish-artifact
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getSpritesToken } from "@/lib/sandbox/env";
import { runArtifactInSprite, type SpriteHandle } from "@/lib/sandbox/artifact-runner";
import { loadSkillFilesForSandbox } from "@/lib/sandbox/skill-loader";
import {
  findActiveSpriteSession,
  touchSpriteSession,
  upsertSpriteSession,
} from "@/lib/sandbox/sprite-session";
import { getOrCreateSprite } from "@/lib/sandbox/sprites-client";
import { createAgentFileClient } from "@/lib/storage/agent-files";
import type { Database } from "@/types/database";

const FRONTEND_SKILL_SLUG = "frontend-design";
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 30;

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
  const agentFiles = createAgentFileClient(supabase, clientId);

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

          const userSkillFiles = await loadSkillFilesForSandbox(
            supabase,
            clientId,
            FRONTEND_SKILL_SLUG,
          );
          const runResult = await runArtifactInSprite(sprite as SpriteHandle, {
            task,
            propertyData,
            photoUrls,
            userSkillFiles,
            userSkillSlug: userSkillFiles.length > 0 ? FRONTEND_SKILL_SLUG : undefined,
            isNew,
            shipIt,
          });

          if (!runResult.success) {
            return {
              success: false as const,
              error: runResult.error ?? "Artifact publishing failed.",
            };
          }

          await upsertSpriteSession(supabase, {
            client_id: clientId,
            thread_id: threadId,
            sprite_name: spriteName,
            status: "running",
            preview_url: runResult.previewUrl,
          });
          await touchSpriteSession(supabase, spriteName);

          if (!shipIt) {
            return {
              success: true as const,
              summary: runResult.summary,
              previewUrl: runResult.previewUrl,
              published: false as const,
              spriteName,
            };
          }

          if (!runResult.outputHtml) {
            return {
              success: false as const,
              error: "Sandbox run completed but /tmp/output.html was not produced.",
            };
          }

          const uploadResult = await agentFiles.uploadArtifact({
            path: `artifacts/sandbox/property-showcase-${Date.now()}.html`,
            content: runResult.outputHtml,
            contentType: "text/html; charset=utf-8",
            expiresInSeconds: SIGNED_URL_EXPIRY_SECONDS,
            downloadFilename: "property-showcase.html",
          });

          return {
            success: true as const,
            summary: runResult.summary,
            previewUrl: runResult.previewUrl,
            published: true as const,
            publishedUrl: uploadResult.downloadUrl,
            publicationNote: "This signed URL expires in 30 days and is not a permanent link.",
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
