/**
 * Utility for sending processing results back to OpenClaw via WhatsApp.
 * Called after Gemini processing completes to notify the user.
 */

import { generateWebhookSignature } from "./hmac";
import type { OpenClawCallbackPayload } from "./types";

interface ProcessingResultSuccess {
  filename: string;
  documentType: string;
  extractedData: Record<string, unknown>;
  caseId: string;
  appUrl: string;
  error?: never;
}

interface ProcessingResultError {
  filename: string;
  error: string;
  caseId: string;
  appUrl: string;
  documentType?: never;
  extractedData?: never;
}

type ProcessingResult = ProcessingResultSuccess | ProcessingResultError;

/**
 * Formats extraction result into a human-readable WhatsApp message.
 */
export function formatProcessingResult(result: ProcessingResult): string {
  const { filename, caseId, appUrl } = result;
  const caseUrl = `${appUrl}/cases/${caseId}`;

  if (result.error) {
    return [
      `Unable to process *${filename}*`,
      "",
      `Error: ${result.error}`,
      "",
      `View case: ${caseUrl}`,
    ].join("\n");
  }

  const { documentType, extractedData } = result;

  // Format extracted data as key-value pairs
  const dataLines = Object.entries(extractedData ?? {})
    .slice(0, 5) // Limit to first 5 fields
    .map(([key, value]) => `• ${key}: ${value}`)
    .join("\n");

  return [
    `Processed *${filename}*`,
    "",
    `Type: ${documentType}`,
    "",
    dataLines,
    "",
    `View case: ${caseUrl}`,
  ].join("\n");
}

interface SendResultOptions {
  phone: string;
  message: string;
}

/**
 * Sends processing result to OpenClaw callback URL for WhatsApp delivery.
 */
export async function sendWhatsAppResult(options: SendResultOptions): Promise<void> {
  const { phone, message } = options;

  const callbackUrl = process.env.OPENCLAW_CALLBACK_URL;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (!callbackUrl || !webhookSecret) {
    console.error("[whatsapp/send-result] Missing OPENCLAW_CALLBACK_URL or WEBHOOK_SECRET");
    return;
  }

  const payload: OpenClawCallbackPayload = {
    to: phone,
    message,
    deliver: true,
    channel: "whatsapp",
  };

  const body = JSON.stringify(payload);
  const { signature, timestamp } = generateWebhookSignature(body, webhookSecret);

  try {
    const response = await fetch(callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-signature": signature,
        "x-webhook-timestamp": timestamp,
      },
      body,
    });

    if (!response.ok) {
      console.error("[whatsapp/send-result] Callback failed:", response.status);
    } else {
      console.log("[whatsapp/send-result] Result sent to", phone);
    }
  } catch (error) {
    console.error("[whatsapp/send-result] Error sending callback:", error);
  }
}
