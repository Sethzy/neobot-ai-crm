/**
 * One-off data migration for trigger instruction files.
 *
 * Migrates only the instruction files that are currently referenced by
 * `agent_triggers.instruction_path`. Legacy trigger paths are copied into the
 * canonical `triggers/` storage prefix, the corresponding rows are rewritten to
 * the canonical relative `triggers/...` path, and the old source files are
 * removed after the DB rewrite succeeds.
 *
 * The script refuses ambiguous destination collisions. If two different legacy
 * files would collapse onto the same `triggers/...` destination, or if the
 * destination already exists and copy returns `409`, it aborts without
 * rewriting rows or deleting sources.
 *
 * Usage:
 *   pnpm tsx scripts/managed-agents/rename-trigger-instruction-paths.ts
 *   pnpm tsx scripts/managed-agents/rename-trigger-instruction-paths.ts --client-id=<uuid>
 *
 * @module scripts/managed-agents/rename-trigger-instruction-paths
 */
const AGENT_FILES_BUCKET = "agent-files";
const CANONICAL_TRIGGER_PREFIX = "triggers/";

const LEGACY_PATH_VARIANTS = [
  {
    instructionPrefix: "/agent/subagents/",
    storagePrefix: "agent/subagents/",
  },
  {
    instructionPrefix: "agent/subagents/",
    storagePrefix: "agent/subagents/",
  },
  {
    instructionPrefix: "subagents/triggers/",
    storagePrefix: "subagents/triggers/",
  },
  {
    instructionPrefix: "/agent/triggers/",
    storagePrefix: "agent/triggers/",
  },
  {
    instructionPrefix: "agent/triggers/",
    storagePrefix: "agent/triggers/",
  },
] as const;

interface ScriptStorageBucket {
  copy: (fromPath: string, toPath: string) => Promise<{
    error: { message: string; status?: number; statusCode?: string } | null;
  }>;
  remove: (paths: string[]) => Promise<{
    error: { message: string; status?: number; statusCode?: string } | null;
  }>;
}

interface TriggerInstructionRow {
  id: string;
  instruction_path: string;
}

interface AgentTriggersTable {
  select: (columns: string) => {
    eq: (
      column: string,
      value: string,
    ) => Promise<{
      data: TriggerInstructionRow[] | null;
      error: { message: string } | null;
    }>;
  };
  update: (values: { instruction_path: string }) => {
    eq: (column: string, value: string) => {
      eq: (
        nestedColumn: string,
        nestedValue: string,
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
}

interface ClientsTable {
  select: (columns: string) => Promise<{
    data: Array<{ client_id: string }> | null;
    error: { message: string } | null;
  }>;
}

interface ScriptSupabaseClient {
  storage: {
    from: (bucket: string) => ScriptStorageBucket;
  };
  from: {
    (table: "agent_triggers"): AgentTriggersTable;
    (table: "clients"): ClientsTable;
  };
}

interface PlannedTriggerMigration {
  triggerId: string;
  currentInstructionPath: string;
  nextInstructionPath: string;
  sourceStoragePath: string;
  destinationStoragePath: string;
}

interface CopyPlan {
  sourceStoragePath: string;
  destinationStoragePath: string;
}

function isAlreadyCanonicalInstructionPath(instructionPath: string): boolean {
  return instructionPath.startsWith(CANONICAL_TRIGGER_PREFIX);
}

function planTriggerMigration(
  row: TriggerInstructionRow,
): PlannedTriggerMigration | null {
  if (isAlreadyCanonicalInstructionPath(row.instruction_path)) {
    return null;
  }

  for (const variant of LEGACY_PATH_VARIANTS) {
    if (!row.instruction_path.startsWith(variant.instructionPrefix)) {
      continue;
    }

    const suffix = row.instruction_path.slice(variant.instructionPrefix.length);
    if (suffix.length === 0) {
      throw new Error(
        `Trigger ${row.id} has an invalid instruction_path: ${row.instruction_path}`,
      );
    }

    return {
      triggerId: row.id,
      currentInstructionPath: row.instruction_path,
      nextInstructionPath: `${CANONICAL_TRIGGER_PREFIX}${suffix}`,
      sourceStoragePath: `${variant.storagePrefix}${suffix}`,
      destinationStoragePath: `${CANONICAL_TRIGGER_PREFIX}${suffix}`,
    };
  }

  return null;
}

function buildCopyPlans(
  clientId: string,
  migrations: PlannedTriggerMigration[],
): CopyPlan[] {
  const copyPlansBySource = new Map<string, CopyPlan>();
  const destinationsToSources = new Map<string, string>();

  for (const migration of migrations) {
    const source = migration.sourceStoragePath;
    const destination = migration.destinationStoragePath;
    const existingSource = destinationsToSources.get(destination);

    if (existingSource && existingSource !== source) {
      throw new Error(
        `Refusing to collapse ${existingSource} and ${source} onto ${clientId}/${destination}`,
      );
    }

    destinationsToSources.set(destination, source);

    const existingPlan = copyPlansBySource.get(source);
    if (existingPlan) {
      continue;
    }

    copyPlansBySource.set(source, {
      sourceStoragePath: source,
      destinationStoragePath: destination,
    });
  }

  return [...copyPlansBySource.values()];
}

async function createScriptAdminClient(): Promise<ScriptSupabaseClient> {
  const { createAdminClient } = await import("@/lib/supabase/server");
  return createAdminClient() as Promise<ScriptSupabaseClient>;
}

async function listClientTriggerRows(
  supabase: ScriptSupabaseClient,
  clientId: string,
): Promise<TriggerInstructionRow[]> {
  const { data, error } = await supabase
    .from("agent_triggers")
    .select("id, instruction_path")
    .eq("client_id", clientId);

  if (error) {
    throw new Error(
      `Failed to list trigger instructions for ${clientId}: ${error.message}`,
    );
  }

  return (data as TriggerInstructionRow[] | null) ?? [];
}

async function rewriteTriggerInstructionPath(
  supabase: ScriptSupabaseClient,
  clientId: string,
  migration: PlannedTriggerMigration,
): Promise<void> {
  const { error } = await supabase
    .from("agent_triggers")
    .update({ instruction_path: migration.nextInstructionPath })
    .eq("client_id", clientId)
    .eq("id", migration.triggerId);

  if (error) {
    throw new Error(
      `Failed to rewrite trigger ${migration.triggerId} from ${migration.currentInstructionPath} to ${migration.nextInstructionPath}: ${error.message}`,
    );
  }
}

export async function renameTriggerInstructionPaths(
  options: { clientId: string },
  supabaseArg?: ScriptSupabaseClient,
): Promise<void> {
  const supabase = supabaseArg ?? await createScriptAdminClient();
  const storage = supabase.storage.from(AGENT_FILES_BUCKET);
  const triggerRows = await listClientTriggerRows(supabase, options.clientId);
  const migrations = triggerRows.flatMap((row) => {
    const migration = planTriggerMigration(row);
    return migration ? [migration] : [];
  });

  if (migrations.length === 0) {
    return;
  }

  const copyPlans = buildCopyPlans(options.clientId, migrations);

  for (const plan of copyPlans) {
    const oldPath = `${options.clientId}/${plan.sourceStoragePath}`;
    const newPath = `${options.clientId}/${plan.destinationStoragePath}`;
    const { error: copyError } = await storage.copy(oldPath, newPath);

    if (copyError) {
      throw new Error(
        `Failed to copy ${oldPath} to ${newPath}: ${copyError.message}`,
      );
    }
  }

  for (const migration of migrations) {
    await rewriteTriggerInstructionPath(supabase, options.clientId, migration);
  }

  const sourcePaths = copyPlans.map(
    (plan) => `${options.clientId}/${plan.sourceStoragePath}`,
  );
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
