/**
 * Tests for artifact prompt building.
 * @module lib/sandbox/__tests__/artifact-prompt
 */
import { describe, expect, it } from "vitest";

import { buildArtifactPrompt } from "../artifact-prompt";

describe("buildArtifactPrompt", () => {
  it("includes template copy instructions on first run", () => {
    const prompt = buildArtifactPrompt({
      task: "Build a showcase page for 42 Noriega Street.",
      photoFilenames: ["hero.jpg"],
      isFollowUp: false,
    });

    expect(prompt).toContain("/template/");
    expect(prompt).toContain("Copy it to /workspace/app/");
    expect(prompt).toContain("/workspace/data/property.json");
    expect(prompt).toContain("/workspace/photos/");
    expect(prompt).toContain("hero.jpg");
  });

  it("includes the frontend skill when a skill slug is provided", () => {
    const prompt = buildArtifactPrompt({
      task: "Use a warmer luxury aesthetic.",
      photoFilenames: [],
      userSkillSlug: "frontend-design",
      isFollowUp: false,
    });

    expect(prompt).toContain("/skills/frontend-design/SKILL.md");
  });

  it("omits skill instructions when no skill slug is provided", () => {
    const prompt = buildArtifactPrompt({
      task: "Build a page.",
      photoFilenames: [],
      isFollowUp: false,
    });

    expect(prompt).not.toContain("/skills/");
  });

  it("uses iteration language on follow-up runs without referencing the template", () => {
    const prompt = buildArtifactPrompt({
      task: "Swap the hero image and tighten the headline.",
      photoFilenames: ["new-hero.jpg"],
      isFollowUp: true,
    });

    expect(prompt).toContain("/workspace/app/");
    expect(prompt).toContain("previous iteration");
    expect(prompt).not.toContain("Copy it to /workspace/app/");
    expect(prompt).not.toContain("/template/");
  });

  it("adds ship-it instructions for building the static artifact", () => {
    const prompt = buildArtifactPrompt({
      task: "Finalize the showcase.",
      photoFilenames: [],
      isFollowUp: true,
      shipIt: true,
    });

    expect(prompt).toContain("build.sh");
    expect(prompt).toContain("/tmp/output.html");
    expect(prompt).toContain("30-day signed URL");
  });

  it("uses custom outputDir in ship-it instructions when provided", () => {
    const prompt = buildArtifactPrompt({
      task: "Finalize the showcase.",
      photoFilenames: [],
      isFollowUp: true,
      shipIt: true,
      outputDir: "/workspace/jobs/abc",
    });

    expect(prompt).toContain("/workspace/jobs/abc/output.html");
    expect(prompt).not.toContain("/tmp/output.html");
  });

  it("never tells Claude to start or restart the dev server", () => {
    const prompt = buildArtifactPrompt({
      task: "Build a page.",
      photoFilenames: [],
      isFollowUp: false,
      shipIt: true,
    });

    expect(prompt).not.toContain("npm run dev");
    expect(prompt).not.toContain("start the dev server");
    expect(prompt).not.toContain("restart the dev server");
  });
});
