/**
 * One-off data migration for trigger instruction files.
 *
 * Copies each trigger instruction markdown file from the legacy
 * `agent/subagents/` storage prefix into `agent/triggers/`, then rewrites the
 * corresponding `agent_triggers.instruction_path` rows to the new
 * `/agent/triggers/` convention.
 *
 * Safe to re-run. If a destination file already exists, the script treats the
 * copy as already completed and proceeds with the database rewrite + source
 * cleanup.
 *
 * Usage:
 *   pnpm tsx scripts/managed-agents/rename-trigger-instruction-paths.ts
 *   pnpm tsx scripts/managed-agents/rename-trigger-instruction-paths.ts --client-id=<uuid>
 *
 * @module scripts/managed-agents/rename-trigger-instruction-paths
 */
const AGENT_FILES_BUCKET = "agent-files";
const OLD_STORAGE_PREFIX = "agent/subagents";
const NEW_STORAGE_PREFIX = "agent/triggers";
const NEW_MODEL_PREFIX = "/agent/triggers";

interface StorageListFile {
  name: string;
}

interface ScriptStorageBucket {
  list: (path: string) => Promise<{
    data: StorageListFile[] | null;
    error: { message: string; status?: number; statusCode?: string } | null;
  }>;
  copy: (fromPath: string, toPath: string) => Promise<{
    error: { message: string; status?: number; statusCode?: string } | null;
  }>;
  remove: (paths: string[]) => Promise<{
    error: { message: string; status?: number; statusCode?: string } | null;
  }>;
}

interface ScriptSupabaseClient {
  storage: {
    from: (bucket: string) => ScriptStorageBucket;
  };
  from: (table: "agent_triggers" | "clients") => {
    update: (values: { instruction_path: string }) => {
      eq: (column: string, value: string) => {
        eq: (
          nestedColumn: string,
          nestedValue: string,
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    select: (columns: string) => Promise<{
      data: Array<{ client_id: string }> | null;
      error: { message: string } | null;
    }>;
  };
}

function buildLegacyInstructionPathCandidates(fileName: string): string[] {
  return [
    `/agent/subagents/${fileName}`,
    "agent/subagents/" + fileName,
    `subagents/triggers/${fileName}`,
  ];
}

function isAlreadyCopiedError(error: {
  message: string;
  status?: number;
  statusCode?: string;
}): boolean {
  return (
    error.status === 409 ||
    error.statusCode === "409" ||
    /already exists/i.test(error.message)
  );
}

async function createScriptAdminClient(): Promise<ScriptSupabaseClient> {
  const { createAdminClient } = await import("@/lib/supabase/server");
  return createAdminClient() as Promise<ScriptSupabaseClient>;
}

async function rewriteInstructionPathReferences(
  supabase: ScriptSupabaseClient,
  clientId: string,
  fileName: string,
): Promise<void> {
  const nextPath = `${NEW_MODEL_PREFIX}/${fileName}`;

  for (const previousPath of buildLegacyInstructionPathCandidates(fileName)) {
    const { error } = await supabase
      .from("agent_triggers")
      .update({ instruction_path: nextPath })
      .eq("client_id", clientId)
      .eq("instruction_path", previousPath);

    if (error) {
      throw new Error(
        `Failed to rewrite instruction_path ${previousPath} for ${clientId}: ${error.message}`,
      );
    }
  }
}

export async function renameTriggerInstructionPaths(
  options: { clientId: string },
  supabaseArg?: ScriptSupabaseClient,
): Promise<void> {
  const supabase = supabaseArg ?? await createScriptAdminClient();
  const storage = supabase.storage.from(AGENT_FILES_BUCKET);
  const { data: files, error } = await storage.list(
    `${options.clientId}/${OLD_STORAGE_PREFIX}`,
  );

  if (error) {
    throw new Error(
      `Failed to list trigger instruction files for ${options.clientId}: ${error.message}`,
    );
  }

  const markdownFiles = (files ?? []).filter((file) => file.name.endsWith(".md"));
  if (markdownFiles.length === 0) {
    return;
  }

  const sourcePaths: string[] = [];

  for (const file of markdownFiles) {
    const oldPath = `${options.clientId}/${OLD_STORAGE_PREFIX}/${file.name}`;
    const newPath = `${options.clientId}/${NEW_STORAGE_PREFIX}/${file.name}`;
    const { error: copyError } = await storage.copy(oldPath, newPath);

    if (copyError && !isAlreadyCopiedError(copyError)) {
      throw new Error(`Failed to copy ${oldPath} to ${newPath}: ${copyError.message}`);
    }

    await rewriteInstructionPathReferences(supabase, options.clientId, file.name);
    sourcePaths.push(oldPath);
  }

  const { error: removeError } = await storage.remove(sourcePaths);
  if (removeError) {
    throw new Error(`Failed to remove old trigger instruction files: ${removeError.message}`);
  }
}

async function main(): Promise<void> {
  const supabase = await createScriptAdminClient();
  const clientIdArg = process.argv.find((argument) =>
    argument.startsWith("--client-id="),
  );

  if (clientIdArg) {
    await renameTriggerInstructionPaths(
      { clientId: clientIdArg.slice("--client-id=".length) },
      supabase,
    );
    return;
  }

  const { data: clients, error } = await supabase.from("clients").select("client_id");
  if (error) {
    throw new Error(`Failed to list clients: ${error.message}`);
  }

  for (const client of clients ?? []) {
    await renameTriggerInstructionPaths({ clientId: client.client_id }, supabase);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
