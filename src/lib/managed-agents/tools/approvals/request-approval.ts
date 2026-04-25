/**
 * request_approval tool for managed agents.
 *
 * This tool is intentionally intercepted by the dispatcher and session runner
 * before any local side effects happen. Its only job is to give the model a
 * blessed way to pause and ask the human for approval.
 *
 * @module lib/managed-agents/tools/approvals/request-approval
 */
import { z } from "zod";

import {
  GATED_ACTION_TYPES,
  type GatedActionType,
} from "@/lib/managed-agents/gated-action-types";

import type { ManagedAgentTool } from "../types";

export const requestApprovalInputSchema = z.object({
  summary: z
    .string()
    .trim()
    .min(1)
    .max(280)
    .describe("Short human-readable summary shown to the user."),
  action_type: z
    .enum(GATED_ACTION_TYPES)
    .describe(
      `Stable action identifier for the risky action. Must be exactly one of: ${GATED_ACTION_TYPES.map((v) => `"${v}"`).join(", ")}. The "crm." prefix is required.`,
    ),
  payload_preview: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional top-level sanitized preview object for the action."),
});

export interface RequestApprovalInput {
  summary: string;
  action_type: GatedActionType;
  payload_preview?: Record<string, unknown>;
}

export const requestApprovalTool: ManagedAgentTool<
  RequestApprovalInput,
  { success: true; status: "deferred" }
> = {
  name: "request_approval",
  description:
    "Ask the user to approve a risky action before continuing. " +
    "Top-level shape: { summary, action_type, payload_preview? }. DO NOT wrap the whole call in a payload, params, body, or request object. " +
    "Use this before delete_records or configure_crm. Keep the summary short and specific. " +
    `For \`action_type\`, pass exactly one of: ${GATED_ACTION_TYPES.map((v) => `"${v}"`).join(", ")} — the "crm." prefix is required.`,
  inputSchema: requestApprovalInputSchema,
  chatOnly: true,
  execute: async () => ({ success: true, status: "deferred" }),
};
