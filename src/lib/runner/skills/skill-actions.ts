"use server";
/**
 * Server actions for skill management — save edits and reset to bundled default.
 * Uses createAgentFileClient for storage (same guardrails as the agent).
 * @module lib/runner/skills/skill-actions
 */
import { revalidatePath } from "next/cache";

import { resolveClientId } from "@/lib/chat/client-id";
import { createAgentFileClient } from "@/lib/storage/agent-files";
import { createClient } from "@/lib/supabase/server";

import { validateSkillContent } from "./discover-skills";
import { getDefaultSkillContent } from "./skill-templates";

const SKILLS_PATH = "/skills";

/** Save updated SKILL.md content. Validates frontmatter before writing. */
export async function saveSkillContent(
  slug: string,
  content: string,
): Promise<{ success: boolean; error?: string }> {
  const validation = validateSkillContent(content);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    const supabase = await createClient();
    const clientId = await resolveClientId(supabase);
    const fileClient = createAgentFileClient(supabase, clientId);

    await fileClient.uploadFile(`skills/${slug}/SKILL.md`, content);

    revalidatePath(SKILLS_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/** Reset a skill to its bundled default. Only works for default slugs. */
export async function resetSkillToDefault(
  slug: string,
): Promise<{ success: boolean; content?: string; error?: string }> {
  const defaultContent = getDefaultSkillContent(slug);
  if (!defaultContent) {
    return { success: false, error: `No bundled default for skill: ${slug}` };
  }

  const result = await saveSkillContent(slug, defaultContent);
  if (result.success) {
    return { success: true, content: defaultContent };
  }
  return result;
}
