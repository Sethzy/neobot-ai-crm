/**
 * Stub send_message tool for future platform notifications.
 * @module lib/runner/tools/utility/send-message
 */
import { tool } from "ai";
import { z } from "zod";

/**
 * Creates a Tasklet-aligned `send_message` tool stub.
 * Delivery is deferred until the platform email backend is wired.
 */
export function createSendMessageTool() {
  return {
    send_message: tool({
      description:
        "Send a message to the user or another verified contact method. " +
        "Use 'owner' to target the account owner's primary email. " +
        "This environment currently logs the intent but does not deliver the message.",
      inputSchema: z.object({
        to: z.array(z.string().min(1)).min(1).describe("Recipients. Use 'owner' for the primary user email."),
        body: z.string().min(1).describe("Message body. Supports markdown for email."),
        subject: z.string().min(1).optional().describe("Email subject."),
        attachments: z.array(z.string().min(1)).optional().describe("Attachment file paths."),
      }),
      execute: async (input) => {
        console.warn("[send_message] delivery skipped in stub mode", input);

        return {
          success: false,
          data: null,
          error: "Message delivery is not available in this environment",
          source: "send_message",
        };
      },
    }),
  };
}
