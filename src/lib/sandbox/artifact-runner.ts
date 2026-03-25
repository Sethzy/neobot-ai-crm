/**
 * Orchestrates artifact generation work inside a persistent Sprite.
 * @module lib/sandbox/artifact-runner
 */
import { extname } from "node:path";

import { buildSandboxClaudeEnv } from "./claude-env";
import { jobOutputDir } from "./sandbox-paths";
import { deriveJobToken } from "./sprite-jobs";
import type { SpriteSkillFile } from "./types";
import { buildArtifactPrompt } from "./artifact-prompt";
import { fetchSafeExternalResource } from "./external-url";
import { getPropertyShowcaseTemplateFiles } from "./templates/property-showcase/template-files";

const ALLOWED_TOOLS = ["Read", "Write", "Edit", "MultiEdit", "Bash", "Glob", "Grep"];
const DEFAULT_MAX_TURNS = 20;
const DEV_SERVER_SERVICE_NAME = "dev-server";

interface SpriteFilesystemHandle {
  writeFile: (path: string, content: string | Buffer) => Promise<void>;
  readFile: (path: string) => Promise<string | Buffer>;
}

interface ServiceStateLike {
  status?: "stopped" | "starting" | "running" | "stopping" | "failed";
}

interface ServiceWithStateLike {
  name: string;
  state?: ServiceStateLike;
}

interface ServiceLogStreamLike {
  processAll?: (handler: (event: unknown) => void | Promise<void>) => Promise<void>;
  close?: () => void;
}

export interface SpriteHandle {
  name: string;
  url?: string;
  filesystem: (workingDir?: string) => SpriteFilesystemHandle;
  execFile: (
    command: string,
    args?: string[],
    options?: { env?: Record<string, string> },
  ) => Promise<{ stdout?: string | Buffer; stderr?: string | Buffer; exitCode?: number }>;
  spawn: (
    command: string,
    args?: string[],
    options?: { detachable?: boolean; env?: Record<string, string> },
  ) => void;
  listServices: () => Promise<ServiceWithStateLike[]>;
  createService: (
    serviceName: string,
    config: { cmd: string; args?: string[]; httpPort?: number },
    duration?: string,
  ) => Promise<ServiceLogStreamLike>;
  startService: (serviceName: string, duration?: string) => Promise<ServiceLogStreamLike>;
  updateURLSettings: (settings: { auth: string }) => Promise<void>;
}

export interface RunArtifactInSpriteOptions {
  task: string;
  propertyData: Record<string, unknown>;
  photoUrls: string[];
  userSkillFiles: SpriteSkillFile[];
  userSkillSlug?: string;
  isNew: boolean;
  shipIt?: boolean;
  maxTurns?: number;
}

export interface ArtifactRunResult {
  success: boolean;
  summary: string;
  previewUrl: string;
  outputHtml?: string;
  error?: string;
}

/**
 * Builds execFile-safe Claude CLI args.
 */
export function buildClaudeCliArgs({
  prompt,
  maxTurns = DEFAULT_MAX_TURNS,
}: {
  prompt: string;
  maxTurns?: number;
}): string[] {
  return [
    "--output-format",
    "stream-json",
    "--dangerously-skip-permissions",
    "--allowedTools",
    ALLOWED_TOOLS.join(","),
    "--max-turns",
    String(maxTurns),
    "-p",
    prompt,
  ];
}

/**
 * Builds the environment map for Claude CLI execution.
 */
export function buildClaudeEnv(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  return buildSandboxClaudeEnv(env);
}

/**
 * Launch artifact generation in a detachable tmux session.
 * Returns immediately. Process runs at full speed, survives disconnect.
 */
export async function launchArtifactBackgroundJob(
  sprite: SpriteHandle,
  jobId: string,
  options: { prompt: string; maxTurns: number },
): Promise<void> {
  const { prompt, maxTurns } = options;
  const outputDir = jobOutputDir(jobId);
  const claudeEnv = buildClaudeEnv();
  const cliArgs = buildClaudeCliArgs({ prompt, maxTurns });

  await sprite.execFile("mkdir", ["-p", outputDir]);

  const shellEscape = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  const claudeCmd = ["claude", ...cliArgs].map(shellEscape).join(" ");

  const wrapperScript = [
    `cd /workspace/app`,
    `${claudeCmd} > ${outputDir}/stream.jsonl 2>&1`,
    `EXIT_CODE=$?`,
    `[ $EXIT_CODE -eq 0 ] && touch ${outputDir}/.done || echo $EXIT_CODE > ${outputDir}/.error`,
    `curl -s -X POST "$CALLBACK_URL" \\`,
    `  -H "Authorization: Bearer $CALLBACK_TOKEN" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d "{\\"jobId\\":\\"$JOB_ID\\",\\"status\\":\\"$([ -f ${outputDir}/.done ] && echo done || echo error)\\"}" \\`,
    `  --max-time 10 || true`,
  ].join("\n");

  sprite.spawn("bash", ["-c", wrapperScript], {
    detachable: true,
    env: {
      ...claudeEnv,
      CALLBACK_URL: `${process.env.NEXT_PUBLIC_APP_URL}/api/sandbox/callback`,
      CALLBACK_TOKEN: deriveJobToken(jobId),
      JOB_ID: jobId,
    },
  });
}

/**
 * Writes property data into the Sprite workspace.
 */
export async function writePropertyDataToSprite(
  sprite: SpriteHandle,
  propertyData: Record<string, unknown>,
): Promise<void> {
  const filesystem = sprite.filesystem("/workspace/data");
  await filesystem.writeFile("property.json", JSON.stringify(propertyData, null, 2));
}

/**
 * Writes user skill files into the Sprite filesystem.
 */
export async function writeSkillFilesToSprite(
  sprite: SpriteHandle,
  skillFiles: SpriteSkillFile[],
): Promise<void> {
  if (skillFiles.length === 0) {
    return;
  }

  const filesystem = sprite.filesystem("/skills");

  for (const file of skillFiles) {
    await filesystem.writeFile(file.path, file.content);
  }
}

/**
 * Downloads external photos on the runner and writes them into the Sprite.
 */
export async function downloadPhotosToSprite(
  sprite: SpriteHandle,
  photoUrls: string[],
): Promise<string[]> {
  if (photoUrls.length === 0) {
    return [];
  }

  const filesystem = sprite.filesystem("/workspace/photos");
  const filenames: string[] = [];

  for (const [index, url] of photoUrls.entries()) {
    const response = await fetchSafeExternalResource(url);

    if (!response.ok) {
      throw new Error(`Failed to download photo "${url}" (status ${response.status}).`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type");
    const filename = `photo-${index + 1}${resolvePhotoExtension(url, contentType)}`;

    await filesystem.writeFile(filename, buffer);
    filenames.push(filename);
  }

  return filenames;
}

/**
 * Ensures the Sprite dev server service exists and is reachable.
 */
export async function ensureDevServerService(
  sprite: SpriteHandle,
  isNew: boolean,
): Promise<void> {
  if (!isNew) {
    const services = await sprite.listServices();
    const existingService = services.find((service) => service.name === DEV_SERVER_SERVICE_NAME);

    if (existingService) {
      if (existingService.state?.status && existingService.state.status !== "running") {
        const serviceStream = await sprite.startService(DEV_SERVER_SERVICE_NAME);
        await drainServiceStream(serviceStream);
      }

      await sprite.updateURLSettings({ auth: "public" });
      return;
    }
  }

  const serviceStream = await sprite.createService(DEV_SERVER_SERVICE_NAME, {
    cmd: "bash",
    args: ["-lc", "cd /workspace/app && npm run dev"],
    httpPort: 8080,
  });
  await drainServiceStream(serviceStream);
  await sprite.updateURLSettings({ auth: "public" });
}

/**
 * Reads the built single-file HTML artifact from /tmp/output.html.
 */
export async function readBuiltHtml(sprite: SpriteHandle): Promise<string> {
  const filesystem = sprite.filesystem("/tmp");
  const content = await filesystem.readFile("output.html");

  return toUtf8String(content);
}

/**
 * Runs the artifact workflow inside a Sprite.
 */
export async function runArtifactInSprite(
  sprite: SpriteHandle,
  {
    task,
    propertyData,
    photoUrls,
    userSkillFiles,
    userSkillSlug,
    isNew,
    shipIt = false,
    maxTurns = DEFAULT_MAX_TURNS,
  }: RunArtifactInSpriteOptions,
): Promise<ArtifactRunResult> {
  try {
    if (isNew) {
      const templateFiles = await getPropertyShowcaseTemplateFiles();
      await writeTemplateFilesToSprite(sprite, templateFiles);
      await installTemplateDependencies(sprite);
    }

    await writePropertyDataToSprite(sprite, propertyData);
    const photoFilenames = await downloadPhotosToSprite(sprite, photoUrls);
    await writeSkillFilesToSprite(sprite, userSkillFiles);
    await clearArtifactOutputs(sprite, shipIt);

    const prompt = buildArtifactPrompt({
      task,
      photoFilenames,
      userSkillSlug,
      isFollowUp: !isNew,
      shipIt,
    });
    const cliArgs = buildClaudeCliArgs({ prompt, maxTurns });
    const cliEnv = buildClaudeEnv();
    const executionResult = await sprite.execFile("claude", cliArgs, { env: cliEnv });

    await ensureDevServerService(sprite, isNew);

    if (!sprite.url) {
      return {
        success: false,
        summary: "",
        previewUrl: "",
        error: "Sprite preview URL is unavailable.",
      };
    }

    if (shipIt) {
      try {
        const outputHtml = await readBuiltHtml(sprite);

        return {
          success: true,
          summary: readSummaryFromExecution(executionResult.stdout),
          previewUrl: sprite.url,
          outputHtml,
        };
      } catch {
        return {
          success: false,
          summary: "",
          previewUrl: sprite.url,
          error: "Sandbox run completed but /tmp/output.html was not produced.",
        };
      }
    }

    return {
      success: true,
      summary: readSummaryFromExecution(executionResult.stdout),
      previewUrl: sprite.url,
    };
  } catch (error) {
    return {
      success: false,
      summary: "",
      previewUrl: sprite.url ?? "",
      error: error instanceof Error ? error.message : "Artifact generation failed.",
    };
  }
}

async function writeTemplateFilesToSprite(
  sprite: SpriteHandle,
  templateFiles: Awaited<ReturnType<typeof getPropertyShowcaseTemplateFiles>>,
): Promise<void> {
  const filesystem = sprite.filesystem("/template");

  for (const file of templateFiles) {
    await filesystem.writeFile(file.relativePath, file.content);
  }
}

async function installTemplateDependencies(sprite: SpriteHandle): Promise<void> {
  await sprite.execFile("bash", ["-lc", "cd /template && npm install"]);
}

async function clearArtifactOutputs(sprite: SpriteHandle, shipIt: boolean): Promise<void> {
  if (!shipIt) {
    return;
  }

  await sprite.execFile("bash", ["-lc", "rm -f /tmp/output.html"]);
}

async function drainServiceStream(stream: ServiceLogStreamLike): Promise<void> {
  if (typeof stream.processAll === "function") {
    await stream.processAll(() => undefined);
  }

  if (typeof stream.close === "function") {
    stream.close();
  }
}

function resolvePhotoExtension(url: string, contentType: string | null): string {
  try {
    const pathname = new URL(url).pathname;
    const extension = extname(pathname).toLowerCase();

    if (extension) {
      return extension;
    }
  } catch {
    // Ignore malformed URLs here; fetch() already validates the request path upstream.
  }

  if (contentType?.includes("png")) {
    return ".png";
  }

  if (contentType?.includes("webp")) {
    return ".webp";
  }

  return ".jpg";
}

function readSummaryFromExecution(stdout: string | Buffer | undefined): string {
  const summary = toUtf8String(stdout).trim();

  return summary.length > 0 ? summary : "Artifact updated successfully.";
}

function toUtf8String(value: string | Buffer | undefined): string {
  if (typeof value === "string") {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  return "";
}
