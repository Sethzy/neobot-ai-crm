/**
 * send_message tool for managed agents.
 *
 * @module lib/managed-agents/tools/messaging/send-message
 */
import { z } from "zod";

import type { ManagedAgentTool } from "../types";
import { createConsoleLogger } from "@/lib/logger";

const console = createConsoleLogger();

const inputSchema = z.object({
  to: z.array(z.string().min(1)).min(1).describe("Recipients. Use 'owner' for the primary user email."),
  body: z.string().min(1).describe("Message body. Supports markdown for email."),
  subject: z.string().min(1).optional().describe("Email subject."),
  attachments: z.array(z.string().min(1)).optional().describe("Attachment file paths."),
});

type SendMessageInput = z.infer<typeof inputSchema>;
type SendMessageResult = {
  success: false;
  data: null;
  error: string;
  source: "send_message";
};

export const sendMessageTool: ManagedAgentTool<SendMessageInput, SendMessageResult> = {
  name: "send_message",
  description:
    "Send a message to the user or another verified contact method. " +
    "Top-level shape: { to, body, subject?, attachments? }. DO NOT wrap the whole call in a payload, params, message, or request object. " +
    "Use 'owner' to target the account owner's primary email. " +
    "This environment currently logs the intent but does not deliver the message.",
  inputSchema,
  execute: async (input) => {
    console.warn("[send_message] delivery skipped in stub mode", {
      to: input.to,
      subject: input.subject,
      attachmentCount: input.attachments?.length ?? 0,
    });

    return {
      success: false,
      data: null,
      error: "Message delivery is not available in this environment",
      source: "send_message",
    };
  },
};
