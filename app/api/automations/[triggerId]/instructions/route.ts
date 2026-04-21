/**
 * Reads and writes automation instruction content for the dashboard editor.
 *
 * Regular automations point at storage-backed markdown files. Skill-backed
 * automations point at predefined managed-agent skills and may optionally have
 * a customized `skills/<slug>/SKILL.md` override in storage.
 *
 * @module api/automations/[triggerId]/instructions
 */
import { z } from "zod";

import {
  authenticateRequest,
  jsonError,
  type AuthResult,
} from "@/lib/api/route-helpers";
import {
  parseAutomationSkillReference,
  skillStoragePath,
  toAutomationInstructionDisplayPath,
  toAutomationInstructionStoragePath,
} from "@/lib/automations/instruction-paths";
import { resolveClientId } from "@/lib/chat/client-id";
import { readPredefinedSkillContent } from "@/lib/runner/skills/read-predefined-skill";
import { saveSkillContent } from "@/lib/runner/skills/skill-actions";
import { AGENT_FILES_BUCKET, createAgentFileClient } from "@/lib/storage/agent-files";
import {
  getStorageErrorMessage,
  isMissingStorageObjectError,
} from "@/lib/storage/storage-errors";

const saveInstructionsSchema = z.object({
  content: z.string(),
});

type AuthenticatedRequest = Extract<AuthResult, { kind: "ok" }>;

async function loadTriggerInstructionRecord(
  triggerId: string,
): Promise<
  | {
    kind: "ok";
    clientId: string;
    instructionPath: string;
    supabase: AuthenticatedRequest["supabase"];
  }
  | { kind: "error"; response: Response }
> {
  const authResult = await authenticateRequest();

  if (authResult.kind === "error") {
    return authResult;
  }

  const clientId = await resolveClientId(authResult.supabase, authResult.userId);
  const { data: trigger, error } = await authResult.supabase
    .from("agent_triggers")
    .select("instruction_path")
    .eq("id", triggerId)
    .eq("client_id", clientId)
    .single();

  if (error || !trigger?.instruction_path) {
    return { kind: "error", response: jsonError("Trigger not found", 404) };
  }

  return {
    kind: "ok",
    clientId,
    instructionPath: trigger.instruction_path,
    supabase: authResult.supabase,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ triggerId: string }> },
): Promise<Response> {
  const { triggerId } = await params;
  const record = await loadTriggerInstructionRecord(triggerId);

  if (record.kind === "error") {
    return record.response;
  }

  const skillReference = parseAutomationSkillReference(record.instructionPath);
  const displayPath = toAutomationInstructionDisplayPath(record.instructionPath);

  if (skillReference) {
    const storagePath = `${record.clientId}/${skillStoragePath(skillReference.slug)}`;
    const { data, error } = await record.supabase.storage
      .from(AGENT_FILES_BUCKET)
      .download(storagePath);

    if (!error && data) {
      return Response.json({
        content: await data.text(),
        displayPath,
      });
    }

    if (!isMissingStorageObjectError(error)) {
      return jsonError(getStorageErrorMessage(error), 500);
    }

    const predefinedContent = await readPredefinedSkillContent(skillReference.slug);

    if (predefinedContent === null) {
      return jsonError("Instruction file not found", 404);
    }

    return Response.json({
      content: predefinedContent,
      displayPath,
    });
  }

  const storagePath = `${record.clientId}/${toAutomationInstructionStoragePath(record.instructionPath)}`;
  const { data, error } = await record.supabase.storage
    .from(AGENT_FILES_BUCKET)
    .download(storagePath);

  if (error) {
    if (isMissingStorageObjectError(error)) {
      return Response.json({
        content: "",
        displayPath,
      });
    }

    return jsonError(getStorageErrorMessage(error), 500);
  }

  return Response.json({
    content: data ? await data.text() : "",
    displayPath,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ triggerId: string }> },
): Promise<Response> {
  const { triggerId } = await params;
  const record = await loadTriggerInstructionRecord(triggerId);

  if (record.kind === "error") {
    return record.response;
  }

  const body = await request.json().catch(() => null);
  const parsedBody = saveInstructionsSchema.safeParse(body);

  if (!parsedBody.success) {
    return jsonError("Invalid request body", 400);
  }

  const { content } = parsedBody.data;
  const skillReference = parseAutomationSkillReference(record.instructionPath);

  if (skillReference) {
    const result = await saveSkillContent(skillReference.slug, content);

    if (!result.success) {
      return jsonError(result.error ?? "Failed to save instructions", 400);
    }
  } else {
    try {
      const fileClient = createAgentFileClient(record.supabase, record.clientId);
      await fileClient.uploadFile(
        toAutomationInstructionStoragePath(record.instructionPath),
        content,
      );
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Failed to save instructions",
        500,
      );
    }
  }

  return Response.json({
    content,
    displayPath: toAutomationInstructionDisplayPath(record.instructionPath),
  });
}
