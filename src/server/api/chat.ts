/**
 * @fileoverview AI Analyst chat API endpoint.
 *
 * Uses Anthropic SDK directly for all messages:
 * - First message: Creates container with container_upload (file upload)
 * - Follow-up messages: Uses existing container ID for context continuity
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import {
  ChatRequestSchema,
  MODEL_ID,
  SYSTEM_PROMPT,
} from "../../lib/analyst/types";
import { log, logError } from "../../lib/logger";
import { saveGeneratedFileToReportHistory } from "../../lib/report-history";
import { getDocgenSkillId } from "../../clients/skill-registry";
import { convertSplitsToJSON } from "../../lib/docgen/json-generator";
import type { Database } from "../../types/database";

/** Extend timeout for streaming + code execution */
export const config = { maxDuration: 120 };

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Skills array type for container configuration */
type ContainerSkill = {
  type: "anthropic" | "custom";
  skill_id: string;
  version: string;
};

/**
 * Fetch splits for a case and upload as JSON to Anthropic Files API.
 */
async function uploadCaseDataToAnthropic(
  caseId: string,
  selectedTags: string[] | undefined,
  supabase: SupabaseClient<Database>
): Promise<{ fileId: string; splitCount: number; uploadedAt: number } | { error: string }> {
  const queryStart = Date.now();
  let query = supabase
    .from("splits")
    .select(
      "id, tag_id, document_date, identifier, potential_duplicate, extracted_data, updated_at, documents!inner(case_id)"
    )
    .eq("documents.case_id", caseId)
    .in("extraction_status", ["complete", "needs_review"])
    .not("extracted_data", "is", null);

  if (selectedTags && selectedTags.length > 0) {
    query = query.in("tag_id", selectedTags);
  }

  const { data: splits } = await query;
  const queryEnd = Date.now();

  if (!splits || splits.length === 0) {
    return { error: "No extracted documents found for this case" };
  }

  const json = convertSplitsToJSON(
    splits.map((s) => ({
      id: s.id,
      tag_id: s.tag_id,
      document_date: s.document_date as string | null,
      identifier: s.identifier as string | null,
      potential_duplicate: s.potential_duplicate as string | null,
      extracted_data: s.extracted_data as Record<string, unknown> | null,
    }))
  );

  const uploadStart = Date.now();
  const anthropicClient = new Anthropic();
  const file = await anthropicClient.beta.files.upload({
    file: new File([json], "data.json", { type: "application/json" }),
    betas: ["files-api-2025-04-14"],
  });
  const uploadEnd = Date.now();

  log("[chat]", "[TIMING] Case data upload complete", {
    fileId: file.id,
    jsonSizeBytes: json.length,
    queryMs: queryEnd - queryStart,
    uploadMs: uploadEnd - uploadStart,
    uploadedAt: uploadEnd,
  });

  return { fileId: file.id, splitCount: splits.length, uploadedAt: uploadEnd };
}

/**
 * POST /api/chat
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ error: "Missing authorization token" });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: "Supabase environment is not configured" });
  }

  const supabase = createClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  log("[chat]", "Request received", {
    hasMessages: !!req.body?.messages,
    messageCount: req.body?.messages?.length,
    caseId: req.body?.caseId,
    containerId: req.body?.containerId,
    templateFilesCount: req.body?.templateFiles?.length,
    templateFiles: req.body?.templateFiles?.map((f: { name: string; mimeType: string; content: string }) => ({
      name: f.name,
      mimeType: f.mimeType,
      contentLength: f.content?.length,
    })),
  });

  const parseResult = ChatRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    log("[chat]", "Validation failed", parseResult.error.issues);
    return res.status(400).json({
      error: "Invalid request",
      details: parseResult.error.message,
    });
  }

  const { messages, caseId, containerId: existingContainerId, selectedTags, templateFiles, extendedThinking } = parseResult.data;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return res.status(401).json({ error: "Invalid authentication" });
  }
  const userId = user.id;

  const { data: clientConfigId } = await supabase.rpc("get_my_client_config");
  const clientId = (clientConfigId as string) ?? "default";

  const skills: ContainerSkill[] = [
    { type: "anthropic", skill_id: "xlsx", version: "latest" },
    { type: "anthropic", skill_id: "pptx", version: "latest" },
    { type: "anthropic", skill_id: "docx", version: "latest" },
    { type: "anthropic", skill_id: "pdf", version: "latest" },
  ];
  const clientSkillId = getDocgenSkillId(clientId);
  if (clientSkillId) {
    skills.push({ type: "custom", skill_id: clientSkillId, version: "latest" });
  }

  const isFirstMessage = !existingContainerId;

  if (isFirstMessage) {
    return handleFirstMessage(messages, caseId, selectedTags, skills, userId, supabase, res, templateFiles, extendedThinking);
  }

  return handleFollowUpMessage(
    messages,
    existingContainerId!,
    caseId,
    selectedTags,
    skills,
    userId,
    supabase,
    res,
    extendedThinking
  );
}

/** Template file from request */
interface TemplateFile {
  name: string;
  content: string; // base64
  mimeType: string;
}

/**
 * Handle first message - creates container with file upload.
 * This is the ONLY place where data is uploaded to the container.
 * Follow-up messages reuse this data (frozen at session start).
 */
async function handleFirstMessage(
  messages: Array<{
    id: string;
    role: string;
    parts: Array<{ type: string; text?: string; data?: string; mediaType?: string }>;
  }>,
  caseId: string,
  selectedTags: string[] | undefined,
  skills: ContainerSkill[],
  userId: string,
  supabase: SupabaseClient<Database>,
  res: VercelResponse,
  templateFiles?: TemplateFile[],
  extendedThinking?: boolean
) {
  const handlerStart = Date.now();
  log("[chat]", "[TIMING] handleFirstMessage START", { caseId, hasTemplateFiles: !!templateFiles?.length, startedAt: handlerStart });
  try {
    const uploadResult = await uploadCaseDataToAnthropic(caseId, selectedTags, supabase);
    if ("error" in uploadResult) {
      log("[chat]", "Data upload failed", { error: uploadResult.error, caseId, selectedTags });
      return res.status(400).json({ error: uploadResult.error });
    }
    const { fileId, splitCount, uploadedAt: dataUploadedAt } = uploadResult;

    const anthropicClient = new Anthropic();

    // Upload template files to Anthropic Files API
    const templateFileIds: Array<{ fileId: string; name: string; uploadedAt: number }> = [];
    const failedUploads: string[] = [];
    if (templateFiles && templateFiles.length > 0) {
      for (const tf of templateFiles) {
        try {
          const tfUploadStart = Date.now();
          // Convert base64 to buffer
          const buffer = Buffer.from(tf.content, "base64");
          const file = await anthropicClient.beta.files.upload({
            file: new File([buffer], tf.name, { type: tf.mimeType }),
            betas: ["files-api-2025-04-14"],
          });
          const tfUploadEnd = Date.now();
          templateFileIds.push({ fileId: file.id, name: tf.name, uploadedAt: tfUploadEnd });
          log("[chat]", "[TIMING] Template file upload complete", {
            name: tf.name,
            fileId: file.id,
            uploadMs: tfUploadEnd - tfUploadStart,
            uploadedAt: tfUploadEnd,
          });
        } catch (err) {
          logError("[chat]", err, { context: "Template file upload", filename: tf.name });
          failedUploads.push(tf.name);
        }
      }
    }

    // Fail if any template uploads failed - user should know before proceeding
    if (failedUploads.length > 0) {
      return res.status(400).json({
        error: "Template upload failed",
        details: `Failed to upload: ${failedUploads.join(", ")}`,
      });
    }

    // Calculate timing info for all uploads
    const allUploadsComplete = Date.now();
    const lastTemplateUpload = templateFileIds.length > 0
      ? Math.max(...templateFileIds.map(tf => tf.uploadedAt))
      : dataUploadedAt;

    log("[chat]", "[TIMING] All uploads complete, preparing message", {
      caseId,
      fileId: fileId.slice(-12),
      splitCount,
      templateFileCount: templateFileIds.length,
      dataUploadedAt,
      lastTemplateUploadAt: lastTemplateUpload,
      totalUploadMs: allUploadsComplete - handlerStart,
    });

    // =========================================================================
    // FILE READINESS CHECK
    // Anthropic's container file mounting has a race condition - files uploaded
    // via Files API may not be immediately available in the container filesystem.
    // We verify files are ready AND add a safety buffer to prevent flaky failures.
    // =========================================================================
    const FILE_READINESS_BUFFER_MS = 1500; // Minimum wait after uploads (Anthropic container mounting race condition)
    const verificationStart = Date.now();

    // Verify all uploaded files are accessible via Files API
    const allFileIds = [fileId, ...templateFileIds.map(tf => tf.fileId)];
    const fileStatuses: Array<{ fileId: string; status: string; filename?: string; error?: string }> = [];
    for (const fid of allFileIds) {
      try {
        const metadata = await anthropicClient.beta.files.retrieveMetadata(fid, {
          betas: ["files-api-2025-04-14"],
        });
        fileStatuses.push({
          fileId: fid.slice(-12),
          status: "ok",
          filename: metadata.filename,
        });
      } catch (err) {
        fileStatuses.push({
          fileId: fid.slice(-12),
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const verificationDuration = Date.now() - verificationStart;

    // Add safety buffer if verification was too fast
    const remainingBuffer = FILE_READINESS_BUFFER_MS - verificationDuration;
    if (remainingBuffer > 0) {
      log("[chat]", "[DEBUG] Adding file readiness buffer", {
        verificationDurationMs: verificationDuration,
        bufferMs: remainingBuffer,
      });
      await new Promise((resolve) => setTimeout(resolve, remainingBuffer));
    }

    const totalReadinessWait = Date.now() - verificationStart;
    log("[chat]", "[DEBUG] File readiness check complete", {
      fileStatuses,
      verificationMs: verificationDuration,
      totalWaitMs: totalReadinessWait,
    });

    const anthropicMessages: BetaMessageParam[] = [];
    let containerUploadAdded = false;

    for (const msg of messages) {
      if (msg.role !== "user" && msg.role !== "assistant") continue;

      type ImageMediaType = "image/gif" | "image/jpeg" | "image/png" | "image/webp";
      const contentParts: Array<
        | { type: "text"; text: string }
        | { type: "image"; source: { type: "base64"; media_type: ImageMediaType; data: string } }
      > = [];

      // Add images first (if any)
      for (const part of msg.parts) {
        if (part.type === "image" && "data" in part && "mediaType" in part) {
          contentParts.push({
            type: "image",
            source: {
              type: "base64",
              media_type: (part as { mediaType: string }).mediaType as ImageMediaType,
              data: (part as { data: string }).data,
            },
          });
        }
      }

      // Add text parts
      const textParts = msg.parts
        .filter(
          (p): p is { type: "text"; text: string } =>
            p.type === "text" && typeof p.text === "string" && p.text.trim() !== ""
        )
        .map((p) => ({ type: "text" as const, text: p.text }));

      contentParts.push(...textParts);

      if (contentParts.length === 0) continue;

      if (msg.role === "user" && !containerUploadAdded) {
        // First user message: include container_upload for data AND template files
        // Using container_upload instead of document blocks for template files
        // because document blocks only support PDF/plaintext
        const templateUploads = templateFileIds.map((tf) => ({
          type: "container_upload" as const,
          file_id: tf.fileId,
        }));
        anthropicMessages.push({
          role: "user",
          content: [
            { type: "container_upload", file_id: fileId },
            ...templateUploads,
            ...contentParts,
          ],
        });
        containerUploadAdded = true;
      } else {
        anthropicMessages.push({
          role: msg.role as "user" | "assistant",
          content: contentParts,
        });
      }
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // DEBUG: Log exact message structure being sent
    const firstContent = anthropicMessages[0]?.content;
    log("[chat]", "Sending messages to Anthropic", {
      messageCount: anthropicMessages.length,
      firstMessageContent: Array.isArray(firstContent)
        ? firstContent.map((c: unknown) => {
            const block = c as { type: string; file_id?: string; text?: string };
            if (block.type === "container_upload") return { type: block.type, file_id: block.file_id };
            if (block.type === "text") return { type: block.type, textLength: block.text?.length };
            return { type: block.type };
          })
        : firstContent,
    });

    const stream = anthropicClient.beta.messages.stream({
      model: MODEL_ID,
      max_tokens: 16000,
      // Extended thinking: gives Claude a dedicated reasoning budget before responding
      ...(extendedThinking && {
        thinking: { type: "enabled" as const, budget_tokens: 10000 },
      }),
      betas: [
        "code-execution-2025-08-25",
        "files-api-2025-04-14",
        "skills-2025-10-02",
        "interleaved-thinking-2025-05-14",
      ],
      system: SYSTEM_PROMPT,
      container: { skills },
      messages: anthropicMessages,
      tools: [{ type: "code_execution_20250825", name: "code_execution" }],
    });

    const streamStart = Date.now();
    log("[chat]", "[TIMING] Stream starting", {
      streamStartedAt: streamStart,
      msSinceHandlerStart: streamStart - handlerStart,
      msSinceLastUpload: streamStart - lastTemplateUpload,
    });

    let firstCodeExecAt: number | null = null;
    let firstCodeExecCommand: string | null = null;
    let containerInfoFromStream: unknown = null;
    const allEventTypes: string[] = [];

    for await (const event of stream) {
      const eventType = (event as unknown as { type: string }).type;
      allEventTypes.push(eventType);

      // Log ALL events for debugging stream termination issues
      if (eventType !== 'content_block_delta') {
        log("[chat]", "[STREAM] Event received", {
          eventType,
          eventPreview: JSON.stringify(event).slice(0, 500),
        });
      }

      // Capture message_start which contains container info
      if (eventType === 'message_start') {
        const messageStart = event as unknown as { message?: { container?: unknown } };
        if (messageStart.message?.container) {
          containerInfoFromStream = messageStart.message.container;
          log("[chat]", "[DEBUG] Container info from message_start", {
            container: JSON.stringify(messageStart.message.container),
          });
        }
      }

      // Log any error events
      if (eventType === 'error' || eventType.includes('error')) {
        log("[chat]", "[ERROR] Error event in stream", {
          eventType,
          event: JSON.stringify(event),
        });
      }

      // Track first code execution event (when Claude actually runs code)
      if (!firstCodeExecAt && eventType === 'content_block_start') {
        const contentBlock = (event as unknown as { content_block?: { type: string; name?: string; input?: { command?: string } } }).content_block;
        if (contentBlock?.type === 'server_tool_use' && contentBlock?.name === 'bash_code_execution') {
          firstCodeExecAt = Date.now();
          log("[chat]", "[TIMING] First code execution START", {
            firstCodeExecAt,
            msSinceStreamStart: firstCodeExecAt - streamStart,
            msSinceLastUpload: firstCodeExecAt - lastTemplateUpload,
          });
        }
      }

      // Capture the command being executed
      if (eventType === 'content_block_delta') {
        const delta = (event as unknown as { delta?: { type: string; input_json_delta?: string } }).delta;
        if (delta?.type === 'bash_code_execution_input_delta' && delta.input_json_delta && !firstCodeExecCommand) {
          try {
            // Try to extract command from partial JSON
            const partial = delta.input_json_delta;
            if (partial.includes('"command"')) {
              firstCodeExecCommand = partial;
              log("[chat]", "[TIMING] First bash command (partial)", { partial: partial.slice(0, 200) });
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      // Log first code execution result (to see if files were found)
      if (eventType === 'content_block_start') {
        const contentBlock = (event as unknown as { content_block?: { type: string; content?: { stdout?: string; stderr?: string } } }).content_block;
        if (contentBlock?.type === 'bash_code_execution_tool_result') {
          const stdout = contentBlock.content?.stdout ?? '';
          const stderr = contentBlock.content?.stderr ?? '';
          log("[chat]", "[TIMING] First bash result", {
            at: Date.now(),
            msSinceStreamStart: Date.now() - streamStart,
            stdoutPreview: stdout.slice(0, 300),
            stderrPreview: stderr.slice(0, 300),
            foundInputDir: stdout.includes('INPUT_DIR=') || stdout.includes('/files/input'),
          });
        }
      }

      if (eventType === 'message_stop') {
        log("[chat]", "[TIMING] message_stop", { at: Date.now(), msSinceStreamStart: Date.now() - streamStart });
      }
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    log("[chat]", "[TIMING] Stream loop done", {
      at: Date.now(),
      msSinceStreamStart: Date.now() - streamStart,
      totalEvents: allEventTypes.length,
      eventTypes: allEventTypes,
      hasMessageStop: allEventTypes.includes('message_stop'),
    });

    const finalMessage = await stream.finalMessage();
    const streamEnd = Date.now();

    // Log full container info to debug file mounting issues
    log("[chat]", "[DEBUG] Final message container details", {
      containerId: finalMessage.container?.id,
      containerFull: JSON.stringify(finalMessage.container),
    });

    // Log timing summary
    log("[chat]", "[TIMING] Stream complete - SUMMARY", {
      containerId: finalMessage.container?.id,
      totalMs: streamEnd - handlerStart,
      uploadPhaseMs: allUploadsComplete - handlerStart,
      streamPhaseMs: streamEnd - streamStart,
      firstCodeExecAt,
      firstCodeExecDelayMs: firstCodeExecAt ? firstCodeExecAt - streamStart : null,
      msBetweenUploadAndCodeExec: firstCodeExecAt ? firstCodeExecAt - lastTemplateUpload : null,
    });

    // Log file IDs that were uploaded vs what we expected
    log("[chat]", "[DEBUG] File upload verification", {
      expectedFiles: [
        { name: "data.json", fileId: fileId },
        ...templateFileIds.map(tf => ({ name: tf.name, fileId: tf.fileId })),
      ],
      templateFileCount: templateFileIds.length,
    });

    const newContainerId = finalMessage.container?.id;

    // Extract text content to verify API completed
    const textContent = finalMessage.content
      .filter((block): block is BetaContentBlock & { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    log("[chat]", "Stream complete", {
      containerId: newContainerId,
      model: finalMessage.model,
      stopReason: finalMessage.stop_reason,
      usage: finalMessage.usage,
      contentBlocks: finalMessage.content.length,
      // Log first 500 chars of response to verify content was generated
      responsePreview: textContent.slice(0, 500) + (textContent.length > 500 ? "..." : ""),
      responseLength: textContent.length,
    });

    const savedFiles = await saveGeneratedFilesToHistory(
      finalMessage.content,
      caseId,
      userId,
      selectedTags,
      supabase
    );

    if (savedFiles.size > 0) {
      log("[chat]", "Saved files", Array.from(savedFiles.entries()).map(([id, info]) => ({
        fileId: id.slice(-8),
        filename: info.filename,
      })));
    }

    const metadataEvent = {
      type: "metadata",
      containerId: newContainerId ?? null,
      savedFiles: Array.from(savedFiles.values()),
    };
    res.write(`data: ${JSON.stringify(metadataEvent)}\n\n`);
    log("[chat]", "Response fully written, calling res.end()", { timestamp: Date.now() });
    res.end();
    log("[chat]", "res.end() completed", { timestamp: Date.now() });
  } catch (error) {
    logError("[chat]", error, { context: "First message streaming" });
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`);
      res.end();
    } else {
      return res.status(500).json({
        error: "Failed to initialize chat session",
        details: errorMessage,
      });
    }
  }
}

/**
 * Convert UI messages to Anthropic format with container_upload on first user message.
 * Used for FIRST message only - when we need to upload data to the container.
 */
function convertUIMessagesToAnthropicWithUpload(
  messages: Array<{
    id: string;
    role: string;
    parts: Array<{ type: string; text?: string; data?: string; mediaType?: string }>;
  }>,
  fileId: string
): BetaMessageParam[] {
  const filtered = messages.filter((msg) => msg.role === "user" || msg.role === "assistant");
  const firstUserIndex = filtered.findIndex((msg) => msg.role === "user");

  return filtered.map((msg, index) => {
    type ImageMediaType = "image/gif" | "image/jpeg" | "image/png" | "image/webp";
    const contentParts: Array<
      | { type: "text"; text: string }
      | { type: "image"; source: { type: "base64"; media_type: ImageMediaType; data: string } }
    > = [];

    // Add images first
    for (const part of msg.parts) {
      if (part.type === "image" && part.data && part.mediaType) {
        contentParts.push({
          type: "image",
          source: {
            type: "base64",
            media_type: part.mediaType as ImageMediaType,
            data: part.data,
          },
        });
      }
    }

    // Add text parts
    const textParts = msg.parts
      .filter(
        (p): p is { type: "text"; text: string } =>
          p.type === "text" && typeof p.text === "string" && p.text.trim() !== ""
      )
      .map((p) => ({ type: "text" as const, text: p.text }));

    contentParts.push(...textParts);

    const content = contentParts.length > 0 ? contentParts : [{ type: "text" as const, text: "..." }];

    if (msg.role === "user" && index === firstUserIndex) {
      return {
        role: "user" as const,
        content: [{ type: "container_upload" as const, file_id: fileId }, ...content],
      };
    }

    return {
      role: msg.role as "user" | "assistant",
      content,
    };
  });
}

/**
 * Convert UI messages to Anthropic format WITHOUT container_upload.
 * Used for FOLLOW-UP messages - data already exists in container from first message.
 */
function convertUIMessagesToAnthropic(
  messages: Array<{
    id: string;
    role: string;
    parts: Array<{ type: string; text?: string; data?: string; mediaType?: string }>;
  }>
): BetaMessageParam[] {
  const filtered = messages.filter((msg) => msg.role === "user" || msg.role === "assistant");

  return filtered.map((msg) => {
    type ImageMediaType = "image/gif" | "image/jpeg" | "image/png" | "image/webp";
    const contentParts: Array<
      | { type: "text"; text: string }
      | { type: "image"; source: { type: "base64"; media_type: ImageMediaType; data: string } }
    > = [];

    // Add images first
    for (const part of msg.parts) {
      if (part.type === "image" && part.data && part.mediaType) {
        contentParts.push({
          type: "image",
          source: {
            type: "base64",
            media_type: part.mediaType as ImageMediaType,
            data: part.data,
          },
        });
      }
    }

    // Add text parts
    const textParts = msg.parts
      .filter(
        (p): p is { type: "text"; text: string } =>
          p.type === "text" && typeof p.text === "string" && p.text.trim() !== ""
      )
      .map((p) => ({ type: "text" as const, text: p.text }));

    contentParts.push(...textParts);

    const content = contentParts.length > 0 ? contentParts : [{ type: "text" as const, text: "..." }];

    return {
      role: msg.role as "user" | "assistant",
      content,
    };
  });
}

/**
 * Handle follow-up messages with existing container.
 *
 * IMPORTANT: We do NOT re-upload data here. The data.json file already exists
 * in the container from the first message. Container state persists for 30 days.
 * This ensures data is "frozen" at session start - new documents won't appear
 * mid-conversation.
 */
async function handleFollowUpMessage(
  messages: Array<{
    id: string;
    role: string;
    parts: Array<{ type: string; text?: string; data?: string; mediaType?: string }>;
  }>,
  containerId: string,
  caseId: string,
  selectedTags: string[] | undefined,
  skills: ContainerSkill[],
  userId: string,
  supabase: SupabaseClient<Database>,
  res: VercelResponse,
  extendedThinking?: boolean
) {
  try {
    // DEBUG: Log that we're using frozen data (no re-upload)
    log("[chat]", "Follow-up: Using FROZEN data from container (no re-upload)", {
      containerId,
      caseId,
      selectedTags,
      messageCount: messages.length,
    });

    // Convert messages WITHOUT container_upload - data already in container
    const anthropicMessages = convertUIMessagesToAnthropic(messages);

    // DEBUG: Verify no container_upload in messages (data is frozen in container)
    const firstUserMsg = anthropicMessages.find((m) => m.role === "user");
    const contentArray = Array.isArray(firstUserMsg?.content) ? firstUserMsg.content : [];
    const hasContainerUpload = contentArray.some(
      (c) => (c as { type?: string }).type === "container_upload"
    );
    log("[chat]", "Follow-up: Message structure check", {
      firstUserContentTypes: contentArray.map((c) => (c as { type?: string }).type),
      hasContainerUpload,
      totalMessages: anthropicMessages.length,
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    log("[chat]", "Follow-up: Starting stream (using existing container)", { containerId });

    const anthropicClient = new Anthropic();
    const stream = anthropicClient.beta.messages.stream({
      model: MODEL_ID,
      max_tokens: 16000,
      // Extended thinking: gives Claude a dedicated reasoning budget before responding
      ...(extendedThinking && {
        thinking: { type: "enabled" as const, budget_tokens: 10000 },
      }),
      betas: [
        "code-execution-2025-08-25",
        "files-api-2025-04-14",
        "skills-2025-10-02",
        "interleaved-thinking-2025-05-14",
      ],
      system: SYSTEM_PROMPT,
      container: { id: containerId, skills },
      messages: anthropicMessages,
      tools: [{ type: "code_execution_20250825", name: "code_execution" }],
    });

    const followUpStreamStart = Date.now();
    for await (const event of stream) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    const finalMessage = await stream.finalMessage();
    log("[chat]", "[TIMING] Follow-up stream complete", {
      containerId: finalMessage.container?.id,
      streamDurationMs: Date.now() - followUpStreamStart,
    });
    const newContainerId = finalMessage.container?.id;

    // Extract text content to verify API completed
    const textContent = finalMessage.content
      .filter((block): block is BetaContentBlock & { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    log("[chat]", "Follow-up stream complete", {
      containerId: newContainerId,
      model: finalMessage.model,
      stopReason: finalMessage.stop_reason,
      usage: finalMessage.usage,
      contentBlocks: finalMessage.content.length,
      // Log first 500 chars of response to verify content was generated
      responsePreview: textContent.slice(0, 500) + (textContent.length > 500 ? "..." : ""),
      responseLength: textContent.length,
    });

    const savedFiles = await saveGeneratedFilesToHistory(
      finalMessage.content,
      caseId,
      userId,
      selectedTags,
      supabase
    );

    if (savedFiles.size > 0) {
      log("[chat]", "Saved files", Array.from(savedFiles.entries()).map(([id, info]) => ({
        fileId: id.slice(-8),
        filename: info.filename,
      })));
    }

    const metadataEvent = {
      type: "metadata",
      containerId: newContainerId ?? containerId,
      savedFiles: Array.from(savedFiles.values()),
    };
    res.write(`data: ${JSON.stringify(metadataEvent)}\n\n`);
    log("[chat]", "Follow-up: Response fully written, calling res.end()", { timestamp: Date.now() });
    res.end();
    log("[chat]", "Follow-up: res.end() completed", { timestamp: Date.now() });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("404") || errorMessage.includes("410")) {
      log("[chat]", "Container expired", { containerId });
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: "error", error: "Session expired", code: "CONTAINER_EXPIRED" })}\n\n`);
        res.end();
      } else {
        return res.status(410).json({ error: "Session expired", code: "CONTAINER_EXPIRED" });
      }
      return;
    }
    logError("[chat]", error, { context: "Follow-up message", containerId });
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`);
      res.end();
    } else {
      return res.status(500).json({ error: "Failed to process message", details: errorMessage });
    }
  }
}

/** Saved file info */
interface SavedFileInfo {
  fileId: string;
  filename: string;
  signedUrl: string;
}

/**
 * Extract filename from bash command.
 */
function extractFilenameFromBashCommand(command: string): string | null {
  const cpMatch = command.match(/(?:cp|mv)\s+["']?([^\s"']+\.[a-zA-Z0-9]+)["']?\s+/);
  if (cpMatch) {
    return cpMatch[1].split("/").pop() ?? null;
  }

  const anyFile = command.match(/\b([a-zA-Z0-9_-]+\.(xlsx|xls|pdf|csv|docx|doc))\b/i);
  return anyFile ? anyFile[1] : null;
}

/**
 * Save generated files to Report History and return signed URLs.
 */
async function saveGeneratedFilesToHistory(
  content: BetaContentBlock[],
  caseId: string,
  userId: string,
  selectedTags: string[] | undefined,
  supabase: SupabaseClient<Database>
): Promise<Map<string, SavedFileInfo>> {
  const savedFiles = new Map<string, SavedFileInfo>();

  let countQuery = supabase
    .from("splits")
    .select("id, documents!inner(case_id)", { count: "exact", head: true })
    .eq("documents.case_id", caseId)
    .in("extraction_status", ["complete", "needs_review"])
    .not("extracted_data", "is", null);

  if (selectedTags && selectedTags.length > 0) {
    countQuery = countQuery.in("tag_id", selectedTags);
  }

  const { count } = await countQuery;
  const splitsCount = count ?? 0;
  const tagsIncluded = selectedTags ?? [];

  // Collect bash commands by tool_use_id
  const bashCommandsByToolId = new Map<string, string>();
  for (const block of content) {
    if (block.type === "server_tool_use") {
      const serverBlock = block as { id: string; input?: { command?: string } };
      const command = serverBlock.input?.command ?? "";
      if (command) {
        bashCommandsByToolId.set(serverBlock.id, command);
      }
    }
  }

  for (const block of content) {
    if (block.type === "bash_code_execution_tool_result") {
      const resultContent = block.content;
      if (resultContent.type === "bash_code_execution_result") {
        const bashCommand = bashCommandsByToolId.get(block.tool_use_id) ?? "";
        const outputs = resultContent.content ?? [];

        for (const output of outputs) {
          if (output.type === "bash_code_execution_output" && output.file_id) {
            let filename = (output as { filename?: string }).filename;
            if (!filename) {
              filename = extractFilenameFromBashCommand(bashCommand) ?? undefined;
            }
            if (!filename) {
              const mediaType = (output as { media_type?: string }).media_type ?? "";
              const ext = mediaType.includes("spreadsheet") || mediaType.includes("excel") ? ".xlsx"
                : mediaType.includes("pdf") ? ".pdf"
                  : mediaType.includes("csv") ? ".csv"
                    : "";
              filename = `output_${output.file_id.slice(-8)}${ext}`;
            }

            await saveGeneratedFileToReportHistory({
              caseId,
              filename,
              fileId: output.file_id,
              generatedBy: userId,
              splitsCount,
              tagsIncluded,
              supabase,
            });

            const { data: reportRecord } = await supabase
              .from("report_history")
              .select("file_path")
              .eq("case_id", caseId)
              .eq("name", filename)
              .order("created_at", { ascending: false })
              .limit(1)
              .single();

            if (reportRecord?.file_path) {
              const { data: signedUrlData } = await supabase.storage
                .from("reports")
                .createSignedUrl(reportRecord.file_path, 3600, { download: filename });

              if (signedUrlData?.signedUrl) {
                savedFiles.set(output.file_id, {
                  fileId: output.file_id,
                  filename,
                  signedUrl: signedUrlData.signedUrl,
                });
              }
            }
          }
        }
      }
    }
  }

  return savedFiles;
}
