/**
 * Lazy bash tool wrapper — boots Vercel Sandbox on first use.
 *
 * Cloned from the tool-creation pattern in call-summary-agent's `lib/tools.ts`
 * and the sandbox-creation pattern in oss-data-analyst's `src/lib/tools/sandbox.ts`.
 * Adapted for Sunder's lazy initialization and per-call artifact syncing.
 *
 * @module lib/runner/tools/sandbox/create-lazy-bash-tool
 */
import { createHash } from "node:crypto";

import { tool, type Tool } from "ai";
import type { Sandbox } from "@vercel/sandbox";
import type { CommandResult } from "bash-tool";
import { z } from "zod";

import { buildContextJson } from "./build-context-json";
import { generateFileSummary } from "./build-preload-files";
import { syncOutputArtifacts } from "./sync-output-artifacts";
import type { SandboxContextEntry, SandboxPreloadFile, SyncedArtifact } from "./types";

const WORKSPACE = "/vercel/sandbox/workspace";
const SANDBOX_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

type SandboxModule = typeof import("@vercel/sandbox");
type SandboxCreateOptions = Parameters<SandboxModule["Sandbox"]["create"]>[0];

type BashCommandResult = CommandResult;

interface LazyBashExecutionResult extends BashCommandResult {
  artifacts: SyncedArtifact[];
}

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
  tool: Tool<{ command: string }, LazyBashExecutionResult>;
  /** Call in onFinish/onError to stop the sandbox. */
  cleanup: () => Promise<void>;
  /** Whether the sandbox has been created (for testing). */
  hasInitialized: () => boolean;
  /** Returns the live Vercel Sandbox instance, or null if not yet booted. */
  getSandbox: () => Sandbox | null;
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
  let bashExecute: ((input: { command: string }) => Promise<BashCommandResult>) | null = null;
  let initialized = false;
  let initPromise: Promise<void> | null = null;
  const artifactHashes = new Map<string, string>();

  /** Concurrency-safe init: second call awaits the same promise as the first. */
  async function initialize(): Promise<void> {
    if (initialized) return;
    if (!initPromise) {
      initPromise = doInitialize().catch((error) => {
        // Reset so the next bash call can retry instead of replaying the rejection
        initPromise = null;
        throw error;
      });
    }
    await initPromise;
  }

  async function doInitialize(): Promise<void> {

    // Dynamic import to avoid loading @vercel/sandbox when sandbox isn't used
    const sandboxModule = await import("@vercel/sandbox");
    const { createBashTool } = await import("bash-tool");
    const SandboxClass = sandboxModule.Sandbox;

    // 1. Create sandbox from golden snapshot
    const { getServerEnv } = await import("@/lib/env");
    const env = getServerEnv();

    // Inject web research API keys so sandbox scripts can call Brave/Exa directly.
    const sandboxEnv: Record<string, string> = {};
    if (env.BRAVE_SEARCH_API_KEY) sandboxEnv.BRAVE_SEARCH_API_KEY = env.BRAVE_SEARCH_API_KEY;
    if (env.EXA_API_KEY) sandboxEnv.EXA_API_KEY = env.EXA_API_KEY;

    const sandboxOptions: SandboxCreateOptions =
      env.VERCEL_TOKEN && env.VERCEL_TEAM_ID && env.VERCEL_PROJECT_ID
        ? {
          source: { type: "snapshot", snapshotId },
          timeout: SANDBOX_TIMEOUT_MS,
          token: env.VERCEL_TOKEN,
          teamId: env.VERCEL_TEAM_ID,
          projectId: env.VERCEL_PROJECT_ID,
          env: sandboxEnv,
        }
        : {
          source: { type: "snapshot", snapshotId },
          timeout: SANDBOX_TIMEOUT_MS,
          env: sandboxEnv,
        };

    sandbox = await SandboxClass.create(sandboxOptions);

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

    // 2b. Ensure agent/home/ directory exists for artifact sync target.
    //     Use runCommand + mkdir -p because sandbox.mkDir() does not create
    //     intermediate directories and fails with 400 if parents are missing.
    await sandbox.runCommand("bash", ["-c", `mkdir -p ${WORKSPACE}/agent/home`]);

    // 2c. Seed artifact hash baseline from preloaded home/ files so the
    //     first sync doesn't re-upload them as "new" artifacts.
    const HOME_PREFIX = "agent/home/";
    for (const file of preloadFiles) {
      if (file.path.startsWith(HOME_PREFIX)) {
        const relativePath = file.path.slice(HOME_PREFIX.length);
        const hash = createHash("sha256").update(file.content).digest("hex");
        artifactHashes.set(relativePath, hash);
      }
    }

    // 3. Create bash-tool instance
    const fileSummary = generateFileSummary(allFiles);
    const extraInstructions = [
      `\nFiles preloaded in workspace:`,
      fileSummary,
      `\nUse \`ls\` to discover individual files.`,
    ].join("\n");

    const bashToolkit = await createBashTool({
      sandbox,
      extraInstructions,
      maxOutputLength: 100_000,
      onBeforeBashCall: ({ command }) => {
        console.log(`[sandbox] $ ${command}`);
        return undefined;
      },
      onAfterBashCall: ({ result }) => {
        const lines = result.stdout.split("\n");
        const preview = lines.slice(0, 8).join("\n");
        const suffix = lines.length > 8 ? `\n... (${lines.length} lines)` : "";
        console.log(`[sandbox] ${preview}${suffix}`);
        if (result.stderr) console.warn(`[sandbox] stderr: ${result.stderr.slice(0, 500)}`);
        if (result.exitCode !== 0) console.warn(`[sandbox] exit code: ${result.exitCode}`);
        return undefined;
      },
    });

    bashExecute = ({ command }) => bashToolkit.sandbox.executeCommand(command);
    initialized = true;
  }

  // The AI SDK tool definition — registered at run start, executes lazily
  const bashTool = tool({
    description: [
      "Execute a bash command in an isolated sandbox environment.",
      "The sandbox has Python 3 (pandas, openpyxl, matplotlib, numpy), Node 22, LibreOffice, and standard CLI tools.",
      "User uploads are at agent/uploads/, skill references at skills/, and persistent results belong in agent/home/.",
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
          sandbox: sandbox!,
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
    getSandbox: () => sandbox,
  };
}
