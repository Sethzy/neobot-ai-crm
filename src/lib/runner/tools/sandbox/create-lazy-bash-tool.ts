/**
 * Lazy bash tool wrapper — boots Vercel Sandbox on first use.
 *
 * Cloned from the tool-creation pattern in call-summary-agent's `lib/tools.ts`
 * and the sandbox-creation pattern in oss-data-analyst's `src/lib/tools/sandbox.ts`.
 * Adapted for Sunder's lazy initialization and per-call artifact syncing.
 *
 * @module lib/runner/tools/sandbox/create-lazy-bash-tool
 */
import { tool } from "ai";
import type { Sandbox } from "@vercel/sandbox";
import { z } from "zod";

import { buildContextJson } from "./build-context-json";
import { generateFileTree } from "./build-preload-files";
import { syncOutputArtifacts } from "./sync-output-artifacts";
import type { SandboxContextEntry, SandboxPreloadFile, SyncedArtifact } from "./types";

const WORKSPACE = "/vercel/sandbox/workspace";
const SANDBOX_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface LazyBashToolOptions {
  /** Golden snapshot ID from env. */
  snapshotId: string;
  /** Async callback to build preload files (skills + attachments). */
  getPreloadFiles: () => Promise<SandboxPreloadFile[]>;
  /** Callback to snapshot accumulated tool results for context.json. */
  getContextEntries: () => SandboxContextEntry[];
  /** Agent file client from createAgentFileClient(). */
  fileClient: {
    uploadArtifact: (opts: {
      path: string;
      content: Buffer;
      contentType: string;
      expiresInSeconds: number;
      downloadFilename?: string;
    }) => Promise<{ storagePath: string; downloadUrl: string }>;
  };
  /** Current run ID for artifact namespacing. */
  runId: string;
}

export interface LazyBashToolResult {
  /** AI SDK tool to register in the tools object. */
  tool: ReturnType<typeof tool>;
  /** Call in onFinish/onError to stop the sandbox. */
  cleanup: () => Promise<void>;
  /** Whether the sandbox has been created (for testing). */
  hasInitialized: () => boolean;
}

/**
 * Creates a lazy bash tool that boots the sandbox on first invocation.
 *
 * The tool is registered at run start so the LLM sees it in the tool list,
 * but the actual Vercel Sandbox + bash-tool instance is created only when
 * the agent first calls it.
 */
export function createLazyBashTool(options: LazyBashToolOptions): LazyBashToolResult {
  const { snapshotId, getPreloadFiles, getContextEntries, fileClient, runId } = options;

  // Mutable state — captured in closure
  let sandbox: Sandbox | null = null;
  let bashExecute: ((input: { command: string }) => Promise<any>) | null = null;
  let initialized = false;
  let initPromise: Promise<void> | null = null;
  const artifactHashes = new Map<string, string>();

  /** Concurrency-safe init: second call awaits the same promise as the first. */
  async function initialize(): Promise<void> {
    if (initialized) return;
    if (!initPromise) initPromise = doInitialize();
    await initPromise;
  }

  async function doInitialize(): Promise<void> {

    // Dynamic import to avoid loading @vercel/sandbox when sandbox isn't used
    const { Sandbox } = await import("@vercel/sandbox");
    const { createBashTool } = await import("bash-tool");

    // 1. Create sandbox from golden snapshot
    const { getServerEnv } = await import("@/lib/env");
    const env = getServerEnv();

    const sandboxOptions: Record<string, unknown> = {
      source: { type: "snapshot", snapshotId },
      timeout: SANDBOX_TIMEOUT_MS,
    };

    // Local dev fallback: explicit token auth requires team + project
    if (env.VERCEL_TOKEN && env.VERCEL_TEAM_ID && env.VERCEL_PROJECT_ID) {
      sandboxOptions.token = env.VERCEL_TOKEN;
      sandboxOptions.teamId = env.VERCEL_TEAM_ID;
      sandboxOptions.projectId = env.VERCEL_PROJECT_ID;
    }

    sandbox = await Sandbox.create(sandboxOptions as any);

    // 2. Build and upload preload files
    const preloadFiles = await getPreloadFiles();
    const contextJson = buildContextJson(getContextEntries());
    const allFiles = [
      ...preloadFiles,
      { path: "input/context.json", content: Buffer.from(contextJson, "utf-8") },
    ];

    if (allFiles.length > 0) {
      await sandbox.writeFiles(
        allFiles.map((f: SandboxPreloadFile) => ({
          path: `${WORKSPACE}/${f.path}`,
          content: f.content,
        })),
      );
    }

    // 3. Create bash-tool instance
    const fileTree = generateFileTree(allFiles);
    const extraInstructions = [
      `\nFiles preloaded in workspace:`,
      fileTree,
      `\nWrite output files to output/ — they will be synced to storage automatically.`,
    ].join("\n");

    const { bash } = await createBashTool({
      sandbox,
      extraInstructions,
      maxOutputLength: 100_000,
    });

    bashExecute = bash.execute as any;
    initialized = true;
  }

  // The AI SDK tool definition — registered at run start, executes lazily
  const bashTool = tool({
    description: [
      "Execute a bash command in an isolated sandbox environment.",
      "The sandbox has Python 3 (pandas, openpyxl, matplotlib, numpy), Node 22, LibreOffice, and standard CLI tools.",
      "User files are at input/, skill references at skills/, write results to output/.",
    ].join(" "),
    inputSchema: z.object({
      command: z.string().describe("The bash command to execute."),
    }),
    execute: async ({ command }) => {
      if (!snapshotId) {
        return {
          stdout: "",
          stderr: "Sandbox is not configured. Set SANDBOX_GOLDEN_SNAPSHOT_ID in environment.",
          exitCode: 1,
          artifacts: [],
        };
      }

      await initialize();

      // Execute the command
      const result = await bashExecute!({ command });

      // Sync output artifacts after each command
      let artifacts: SyncedArtifact[] = [];
      try {
        artifacts = await syncOutputArtifacts({
          sandbox,
          fileClient,
          runId,
          priorHashes: artifactHashes,
        });
      } catch (error) {
        console.warn("[sandbox] Artifact sync failed (non-fatal):", error);
      }

      return {
        ...result,
        artifacts,
      };
    },
  });

  async function cleanup(): Promise<void> {
    if (sandbox) {
      try {
        await sandbox.stop();
      } catch {
        // Best-effort cleanup
      }
      sandbox = null;
      bashExecute = null;
      initialized = false;
    }
  }

  return {
    tool: bashTool,
    cleanup,
    hasInitialized: () => initialized,
  };
}
