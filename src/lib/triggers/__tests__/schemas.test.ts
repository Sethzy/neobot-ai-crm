/**
 * Tests for trigger Zod schemas.
 * @module lib/triggers/__tests__/schemas
 */
import { describe, expect, it } from "vitest";

import {
  scanResultSchema,
  triggerDispatchPayloadSchema,
  triggerRowSchema,
  triggerTypeValues,
} from "../schemas";

describe("triggerTypeValues", () => {
  it("includes only schedule, webhook, and rss", () => {
    expect(triggerTypeValues).toEqual(["schedule", "webhook", "rss"]);
  });
});

describe("triggerRowSchema", () => {
  const validRow = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    thread_id: "770e8400-e29b-41d4-a716-446655440000",
    trigger_type: "schedule",
    name: "Daily briefing",
    cron_expression: "0 9 * * *",
    instruction_path: "state/triggers/daily-briefing.md",
    payload: {
      timezone: "Asia/Singapore",
    },
    enabled: true,
    current_run_id: null,
    next_fire_at: "2026-03-07T09:00:00.000Z",
    last_fired_at: null,
    last_status: null,
    retry_count: 0,
    webhook_secret: null,
    invocation_message: "Run the daily briefing",
    created_at: "2026-03-06T00:00:00.000Z",
    updated_at: "2026-03-06T00:00:00.000Z",
  };

  it("parses a valid schedule trigger row", () => {
    expect(triggerRowSchema.safeParse(validRow).success).toBe(true);
  });

  it("rejects a row missing a required name", () => {
    const missingName = { ...validRow };
    delete missingName.name;

    expect(triggerRowSchema.safeParse(missingName).success).toBe(false);
  });

  it("rejects an invalid trigger type", () => {
    expect(
      triggerRowSchema.safeParse({
        ...validRow,
        trigger_type: "invalid",
      }).success,
    ).toBe(false);
  });

  it("allows a claimed trigger", () => {
    expect(
      triggerRowSchema.safeParse({
        ...validRow,
        current_run_id: "880e8400-e29b-41d4-a716-446655440000",
      }).success,
    ).toBe(true);
  });
});

describe("triggerDispatchPayloadSchema", () => {
  const validPayload = {
    triggerId: "550e8400-e29b-41d4-a716-446655440000",
    clientId: "660e8400-e29b-41d4-a716-446655440000",
    threadId: "770e8400-e29b-41d4-a716-446655440000",
    currentRunId: "880e8400-e29b-41d4-a716-446655440000",
    triggerType: "schedule",
    triggerName: "Daily briefing",
    instructionPath: "state/triggers/daily-briefing.md",
    triggerPayload: { source: "cron" },
    invocationMessage: "Run the daily briefing",
    nextFireAt: "2026-03-07T09:00:00.000Z",
  };

  it("parses a valid dispatch payload", () => {
    expect(triggerDispatchPayloadSchema.safeParse(validPayload).success).toBe(true);
  });

  it("rejects a payload missing triggerId", () => {
    const missingTriggerId = { ...validPayload };
    delete missingTriggerId.triggerId;

    expect(triggerDispatchPayloadSchema.safeParse(missingTriggerId).success).toBe(false);
  });

  it("rejects a payload missing triggerType", () => {
    const missingTriggerType = { ...validPayload };
    delete missingTriggerType.triggerType;

    expect(triggerDispatchPayloadSchema.safeParse(missingTriggerType).success).toBe(false);
  });

  it("rejects an invalid nextFireAt timestamp", () => {
    expect(
      triggerDispatchPayloadSchema.safeParse({
        ...validPayload,
        nextFireAt: "tomorrow morning",
      }).success,
    ).toBe(false);
  });

  it("accepts rss dispatch payloads", () => {
    expect(
      triggerDispatchPayloadSchema.safeParse({
        ...validPayload,
        triggerType: "rss",
        triggerPayload: { feed_url: "https://example.com/feed.xml" },
        invocationMessage: null,
      }).success,
    ).toBe(true);
  });
});

describe("scanResultSchema", () => {
  it("parses a valid scan result", () => {
    expect(
      scanResultSchema.safeParse({
        claimed: 1,
        dispatched: 1,
        staleReleased: 0,
        errors: [],
      }).success,
    ).toBe(true);
  });
});
