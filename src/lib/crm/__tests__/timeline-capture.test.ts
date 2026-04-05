/**
 * Tests the shared timeline audit capture utility.
 * @module lib/crm/__tests__/timeline-capture
 */
import { describe, expect, it, vi } from "vitest";

import {
  calculateDiff,
  captureTimelineActivity,
} from "@/lib/crm/timeline-capture";

describe("calculateDiff", () => {
  it("returns null when no tracked fields changed", () => {
    expect(
      calculateDiff(
        {
          first_name: "Sarah",
          updated_at: "2026-04-05T10:00:00+08:00",
        },
        {
          first_name: "Sarah",
          updated_at: "2026-04-05T11:00:00+08:00",
        },
      ),
    ).toBeNull();
  });

  it("skips ignored system fields and returns changed tracked fields", () => {
    expect(
      calculateDiff(
        {
          phone: null,
          client_id: "client-1",
          created_at: "2026-04-05T10:00:00+08:00",
          updated_at: "2026-04-05T10:00:00+08:00",
          search_vector: "old",
        },
        {
          phone: "+6598765432",
          client_id: "client-1",
          created_at: "2026-04-05T10:00:00+08:00",
          updated_at: "2026-04-05T11:00:00+08:00",
          search_vector: "new",
        },
      ),
    ).toEqual({
      phone: {
        before: null,
        after: "+6598765432",
      },
    });
  });
});

describe("captureTimelineActivity", () => {
  it("sends created events with an after payload", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "activity-1", error: null });

    await captureTimelineActivity({
      supabase: { rpc } as never,
      clientId: "client-1",
      recordType: "contact",
      recordId: "record-1",
      action: "created",
      actorType: "user",
      after: { first_name: "Sarah", last_name: "Tan" },
    });

    await Promise.resolve();

    expect(rpc).toHaveBeenCalledWith(
      "upsert_timeline_activity",
      expect.objectContaining({
        p_client_id: "client-1",
        p_record_type: "contact",
        p_record_id: "record-1",
        p_name: "contact.created",
        p_actor_type: "user",
        p_properties: {
          after: { first_name: "Sarah", last_name: "Tan" },
        },
      }),
    );
  });

  it("sends deleted events with a before payload", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "activity-1", error: null });

    await captureTimelineActivity({
      supabase: { rpc } as never,
      clientId: "client-1",
      recordType: "company",
      recordId: "record-2",
      action: "deleted",
      actorType: "agent",
      before: { name: "PropNex" },
    });

    await Promise.resolve();

    expect(rpc).toHaveBeenCalledWith(
      "upsert_timeline_activity",
      expect.objectContaining({
        p_name: "company.deleted",
        p_actor_type: "agent",
        p_actor_label: "Sunder",
        p_properties: {
          before: { name: "PropNex" },
        },
      }),
    );
  });

  it("sends updated events with diff metadata", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "activity-1", error: null });

    await captureTimelineActivity({
      supabase: { rpc } as never,
      clientId: "client-1",
      recordType: "deal",
      recordId: "record-3",
      action: "updated",
      actorType: "system",
      before: {
        stage: "leads",
        amount: 1000000,
      },
      after: {
        stage: "offer",
        amount: 1000000,
      },
    });

    await Promise.resolve();

    expect(rpc).toHaveBeenCalledWith(
      "upsert_timeline_activity",
      expect.objectContaining({
        p_name: "deal.updated",
        p_actor_label: "System",
        p_properties: {
          before: {
            stage: "leads",
            amount: 1000000,
          },
          after: {
            stage: "offer",
            amount: 1000000,
          },
          updatedFields: ["stage"],
          diff: {
            stage: {
              before: "leads",
              after: "offer",
            },
          },
        },
      }),
    );
  });

  it("does not call the rpc for no-op updates", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "activity-1", error: null });

    await captureTimelineActivity({
      supabase: { rpc } as never,
      clientId: "client-1",
      recordType: "task",
      recordId: "record-4",
      action: "updated",
      actorType: "user",
      before: { title: "Follow up" },
      after: { title: "Follow up" },
    });

    await Promise.resolve();

    expect(rpc).not.toHaveBeenCalled();
  });

  it("swallows rpc failures", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("rpc failed"));

    await expect(
      captureTimelineActivity({
        supabase: { rpc } as never,
        clientId: "client-1",
        recordType: "contact",
        recordId: "record-5",
        action: "created",
        actorType: "user",
        after: { first_name: "Sarah" },
      }),
    ).resolves.toBe(false);
  });
});
