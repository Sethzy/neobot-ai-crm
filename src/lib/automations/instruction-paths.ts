/**
 * Helpers for automation instruction paths across storage, UI, and runtime.
 *
 * Automation rows store storage-relative paths in `agent_triggers.instruction_path`.
 * Most instructions are regular storage files, but predefined skill-backed
 * automations use a skill slug that resolves to `skills/<slug>/SKILL.md`.
 *
 * The UI edits storage-backed content under the `/agent/` virtual root, while
 * managed-agent runtime reads attached skills from `/workspace/skills/*`.
 *
 * @module lib/automations/instruction-paths
 */
import { toModelPath, toStoragePath } from "@/lib/storage/agent-paths";

const STORAGE_SKILLS_PREFIX = "skills/";
const WORKSPACE_SKILLS_PREFIX = "/workspace/skills/";
const SKILL_FILE_NAME = "SKILL.md";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/u, "");
}

function normalizeInstructionPath(instructionPath: string): string {
  return trimTrailingSlashes(toStoragePath(instructionPath.trim()));
}

/**
 * Returns the skill slug when an automation instruction path points at a
 * predefined or customized skill bundle.
 */
export function parseAutomationSkillReference(
  instructionPath: string | null | undefined,
): { slug: string } | null {
  if (!instructionPath?.trim()) {
    return null;
  }

  const normalizedPath = normalizeInstructionPath(instructionPath);

  if (normalizedPath.startsWith(STORAGE_SKILLS_PREFIX)) {
    const remainder = normalizedPath.slice(STORAGE_SKILLS_PREFIX.length);
    const segments = remainder.split("/").filter(Boolean);

    if (segments.length === 1 && segments[0]) {
      return { slug: segments[0] };
    }

    if (segments.length === 2 && segments[0] && segments[1] === SKILL_FILE_NAME) {
      return { slug: segments[0] };
    }
  }

  if (instructionPath.startsWith(WORKSPACE_SKILLS_PREFIX)) {
    const remainder = trimTrailingSlashes(
      instructionPath.slice(WORKSPACE_SKILLS_PREFIX.length),
    );
    const segments = remainder.split("/").filter(Boolean);

    if (segments.length === 1 && segments[0] && segments[0] !== SKILL_FILE_NAME) {
      return { slug: segments[0] };
    }

    if (segments.length === 2 && segments[0] && segments[1] === SKILL_FILE_NAME) {
      return { slug: segments[0] };
    }
  }

  return null;
}

/** Returns the canonical storage path for a skill override. */
export function skillStoragePath(slug: string): string {
  return `${STORAGE_SKILLS_PREFIX}${slug}/${SKILL_FILE_NAME}`;
}

/**
 * Normalizes any automation instruction path into the storage-relative path we
 * persist in `agent_triggers.instruction_path`.
 */
export function toAutomationInstructionStoragePath(instructionPath: string): string {
  const skillReference = parseAutomationSkillReference(instructionPath);

  if (skillReference) {
    return skillStoragePath(skillReference.slug);
  }

  return toStoragePath(instructionPath);
}

/**
 * Returns the UI/editor path for an automation instruction file.
 *
 * Skill-backed automations resolve to `/agent/skills/<slug>/SKILL.md` because
 * user overrides live in storage and are editable from the dashboard.
 */
export function toAutomationInstructionDisplayPath(instructionPath: string): string {
  const storagePath = toAutomationInstructionStoragePath(instructionPath);
  return toModelPath(storagePath);
}

/**
 * Returns the runtime path that managed-agent sessions should see.
 *
 * Attached skills are mounted under `/workspace/skills/<slug>/SKILL.md`, while
 * regular storage-backed instructions remain under the `/agent/` virtual root.
 */
export function toAutomationInstructionRuntimePath(instructionPath: string): string {
  const skillReference = parseAutomationSkillReference(instructionPath);

  if (skillReference) {
    return `${WORKSPACE_SKILLS_PREFIX}${skillReference.slug}/${SKILL_FILE_NAME}`;
  }

  return toModelPath(toStoragePath(instructionPath));
}
