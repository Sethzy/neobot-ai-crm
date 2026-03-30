/**
 * Vercel Sandbox integration — lazy bash tool with file preloading and artifact sync.
 * @module lib/runner/tools/sandbox
 */
export { createLazyBashTool } from "./create-lazy-bash-tool";
export type { LazyBashToolOptions, LazyBashToolResult } from "./create-lazy-bash-tool";
export { buildContextJson } from "./build-context-json";
export { buildPreloadFiles, downloadStorageDirectory, generateFileSummary, generateFileTree } from "./build-preload-files";
export { syncOutputArtifacts } from "./sync-output-artifacts";
export type {
  SandboxContextEntry,
  SandboxPreloadFile,
  SyncedArtifact,
} from "./types";
