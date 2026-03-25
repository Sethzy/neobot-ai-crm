/**
 * Builds the Claude Code prompt for sandbox artifact generation.
 * @module lib/sandbox/artifact-prompt
 */

export interface ArtifactPromptOptions {
  task: string;
  photoFilenames: string[];
  userSkillSlug?: string;
  isFollowUp: boolean;
  shipIt?: boolean;
  outputDir?: string;
}

/**
 * Builds the artifact prompt for first-run, follow-up, and ship-it modes.
 */
export function buildArtifactPrompt({
  task,
  photoFilenames,
  userSkillSlug,
  isFollowUp,
  shipIt = false,
  outputDir = "/tmp",
}: ArtifactPromptOptions): string {
  const lines: string[] = [];

  if (userSkillSlug) {
    lines.push(
      `Read /skills/${userSkillSlug}/SKILL.md and any references before you change the app.`,
    );
  }

  lines.push("Read /workspace/data/property.json for the property data.");

  if (photoFilenames.length > 0) {
    lines.push(`Photos are available in /workspace/photos/: ${photoFilenames.join(", ")}`);
  }

  lines.push("");

  if (isFollowUp) {
    lines.push("The React app already exists at /workspace/app/ from the previous iteration.");
    lines.push("Modify the existing files in /workspace/app/ to satisfy the new request.");
  } else {
    lines.push("A committed React property showcase template exists at /template/.");
    lines.push("Copy it to /workspace/app/ before making changes.");
    lines.push(
      "Use /workspace/data/property.json as the source of truth and replace placeholder content with the real property data.",
    );
  }

  lines.push("Leave the preview service alone. The runner manages that lifecycle.");

  if (shipIt) {
    lines.push("");
    lines.push(
      `This is a ship-it run. After your edits, execute OUTPUT_DIR=${outputDir} /workspace/app/build.sh and verify ${outputDir}/output.html exists.`,
    );
    lines.push(
      "The final output will be published as a 30-day signed URL, so finalize the page before you stop.",
    );
  }

  lines.push("");
  lines.push(`Task: ${task}`);

  return lines.join("\n");
}
