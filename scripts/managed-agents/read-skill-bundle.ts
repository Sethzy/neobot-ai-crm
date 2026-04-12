/**
 * Pure disk reader for a predefined managed-agent skill bundle.
 *
 * A bundle is a directory `<slug>/` containing a `SKILL.md` at its root plus
 * optional reference files in nested subdirectories. The frontmatter `name`
 * must match the directory name so the authored bundle and Anthropic-facing
 * skill identity stay aligned.
 *
 * @module scripts/managed-agents/read-skill-bundle
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export interface SkillBundleFile {
  /** Path prefixed with the bundle slug, e.g. `call-prep/SKILL.md`. */
  relativePath: string;
  absolutePath: string;
  content: string;
}

export interface SkillBundle {
  slug: string;
  frontmatter: {
    name: string;
    description: string;
  };
  files: SkillBundleFile[];
}

export async function readSkillBundle(bundleDir: string): Promise<SkillBundle> {
  const slug = path.basename(bundleDir);
  const skillPath = path.join(bundleDir, "SKILL.md");

  if (!fs.existsSync(skillPath)) {
    throw new Error(`Skill bundle "${slug}" is missing SKILL.md at ${skillPath}`);
  }

  const skillContent = fs.readFileSync(skillPath, "utf8");
  const frontmatter = parseFrontmatter(skillContent);

  if (frontmatter.name !== slug) {
    throw new Error(
      `Skill bundle "${slug}" has frontmatter name "${frontmatter.name}"; expected "${slug}".`,
    );
  }

  const files: SkillBundleFile[] = [];
  walkBundle(bundleDir, (absolutePath) => {
    const relativeToBundle = path.relative(bundleDir, absolutePath).split(path.sep).join("/");
    files.push({
      relativePath: path.posix.join(slug, relativeToBundle),
      absolutePath,
      content: fs.readFileSync(absolutePath, "utf8"),
    });
  });

  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  return {
    slug,
    frontmatter,
    files,
  };
}

function parseFrontmatter(content: string): { name: string; description: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);

  if (!match?.[1]) {
    throw new Error("SKILL.md is missing YAML frontmatter.");
  }

  const parsed = parseYaml(match[1]) as { name?: unknown; description?: unknown } | null;

  if (
    typeof parsed?.name !== "string"
    || parsed.name.trim().length === 0
    || typeof parsed.description !== "string"
    || parsed.description.trim().length === 0
  ) {
    throw new Error("SKILL.md frontmatter must contain non-empty `name` and `description`.");
  }

  return {
    name: parsed.name.trim(),
    description: parsed.description.trim(),
  };
}

function walkBundle(dir: string, visit: (absolutePath: string) => void): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkBundle(absolutePath, visit);
      continue;
    }

    if (entry.isFile()) {
      visit(absolutePath);
    }
  }
}
