/**
 * Core types for the managed-agents custom tool layer.
 *
 * Tools in this package are dispatch-friendly: each tool exports a plain object
 * with `execute(input, context)`. The dispatcher supplies the correct Supabase
 * client per request and translates these definitions into the managed-agents
 * wire format elsewhere.
 *
 * @module lib/managed-agents/tools/types
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

import type { CrmVocabConfig } from "@/lib/crm/config";
import type { Database } from "@/types/database";

/**
 * Runtime context injected into every tool execution.
 */
export interface ToolContext {
  /** User-authenticated for chat, service-role for triggers. */
  supabase: SupabaseClient<Database>;
  /** Owning tenant for the current execution. */
  clientId: string;
  /** Thread-scoped tools use this when available. */
  threadId?: string;
  /** True for chat adapter executions, false for trigger executions. */
  isChatContext: boolean;
  /** Optional CRM vocabulary injected per client. */
  crmConfig?: CrmVocabConfig;
}

/**
 * Standard tool result contract shared across the managed-agent tool surface.
 * Failure payloads stay permissive because the legacy runner already returns
 * structured non-error failures for some tools (for example dedup hints).
 */
export type ToolResult<TData = Record<string, unknown>> =
  | ({ success: true } & TData)
  | { success: false; error: string };

/**
 * Plain managed-agent tool definition.
 */
export interface ManagedAgentTool<TInput = unknown, TOutput = ToolResult> {
  /** Tool name exposed to the managed agent. */
  name: string;
  /** Model-facing tool description. */
  description: string;
  /** Zod schema used for runtime validation and JSON Schema generation. */
  inputSchema: z.ZodType<TInput>;
  /** Marks tools that are available only in chat context. */
  chatOnly?: boolean;
  /** Executes the tool with validated input and injected context. */
  execute: (input: TInput, context: ToolContext) => Promise<TOutput>;
}
