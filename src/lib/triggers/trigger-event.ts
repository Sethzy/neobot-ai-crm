/**
 * Shared trigger-event message formatting for trigger execution and simulation.
 * @module lib/triggers/trigger-event
 */
import { escapeXml } from "@/lib/runner/system-reminder";

export interface TriggerEventMessageInput {
  triggerId: string;
  triggerType: string;
  triggerName: string;
  instructionPath: string;
  triggerPayload: Record<string, unknown>;
  invocationMessage?: string | null;
  firedAt?: string;
}

/**
 * Builds the canonical XML trigger-event system message inserted into thread history.
 */
export function buildTriggerEventMessage({
  triggerId,
  triggerType,
  triggerName,
  instructionPath,
  triggerPayload,
  invocationMessage,
  firedAt = new Date().toISOString(),
}: TriggerEventMessageInput): string {
  const lines = [
    "<trigger-event>",
    `trigger_instance_id: ${triggerId}`,
    `trigger_type: ${triggerType}`,
    `fired_at: ${firedAt}`,
    `trigger_name: ${escapeXml(triggerName)}`,
    `instruction_path: ${escapeXml(instructionPath)}`,
  ];

  if (invocationMessage?.trim()) {
    lines.push(`invocation_message: ${escapeXml(invocationMessage.trim())}`);
  }

  lines.push(
    `payload: ${escapeXml(JSON.stringify(triggerPayload))}`,
    "</trigger-event>",
  );

  return lines.join("\n");
}
