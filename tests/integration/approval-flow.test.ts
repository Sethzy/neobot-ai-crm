/**
 * Integration test: approval event lifecycle.
 * Tests create → resolve → already_resolved → expire paths against real Postgres.
 *
 * Skipped automatically when local Supabase is not running.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import {
  createApprovalEvent,
  resolveApprovalEvent,
  expireApprovalEvent,
} from "@/lib/approvals/queries";

import { cleanupAll, cleanupAuthUsers } from "./helpers/cleanup";
import { seedClient, seedThread, type SeededClient, type SeededThread } from "./helpers/seed";
import {
  createServiceClient,
  isSupabaseRunning,
  type TestSupabaseClient,
} from "./helpers/supabase-local";

const canRun = await isSupabaseRunning();

let supabase: TestSupabaseClient;
let client: SeededClient;
let thread: SeededThread;
let runId: string;

beforeAll(async () => {
  if (!canRun) return;
  supabase = createServiceClient();
});

afterAll(async () => {
  if (canRun) {
    await cleanupAll(supabase);
    await cleanupAuthUsers(supabase);
  }
});

beforeEach(async () => {
  if (!canRun) return;

  await cleanupAll(supabase);
  await cleanupAuthUsers(supabase);

  client = await seedClient(supabase);
  thread = await seedThread(supabase, client.clientId);

  // Create a run for the approval to reference
  const { data } = await supabase
    .from("runs")
    .insert({
      thread_id: thread.threadId,
      client_id: client.clientId,
      status: "running",
      run_type: "chat",
    })
    .select("run_id")
    .single();

  runId = data!.run_id;
});

describe.runIf(canRun)("Approval Event — Create", () => {
  it("creates a pending approval event", async () => {
    const result = await createApprovalEvent(supabase, {
      clientId: client.clientId,
      threadId: thread.threadId,
      runId,
      toolName: "send_email",
      toolInput: { to: "user@example.com", body: "Hello" },
      approvalId: "test-approval-1",
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("created");
    expect(result.event).toBeTruthy();
    expect(result.event!.status).toBe("pending");
    expect(result.event!.tool_name).toBe("send_email");
    expect(result.event!.approval_id).toBe("test-approval-1");
  });

  it("detects duplicate approval_id for the same client", async () => {
    await createApprovalEvent(supabase, {
      clientId: client.clientId,
      threadId: thread.threadId,
      runId,
      toolName: "send_email",
      toolInput: { to: "a@b.com" },
      approvalId: "dup-test",
    });

    const duplicate = await createApprovalEvent(supabase, {
      clientId: client.clientId,
      threadId: thread.threadId,
      runId,
      toolName: "send_email",
      toolInput: { to: "a@b.com" },
      approvalId: "dup-test",
    });

    expect(duplicate.success).toBe(true);
    expect(duplicate.status).toBe("duplicate");
  });
});

describe.runIf(canRun)("Approval Event — Resolve", () => {
  it("approves a pending event", async () => {
    await createApprovalEvent(supabase, {
      clientId: client.clientId,
      threadId: thread.threadId,
      runId,
      toolName: "send_email",
      toolInput: {},
      approvalId: "resolve-test",
    });

    const result = await resolveApprovalEvent(supabase, {
      clientId: client.clientId,
      approvalId: "resolve-test",
      approved: true,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("updated");
    expect(result.event).toBeTruthy();
    expect(result.event!.status).toBe("approved");
    expect(result.event!.resolved_at).toBeTruthy();
  });

  it("denies a pending event", async () => {
    await createApprovalEvent(supabase, {
      clientId: client.clientId,
      threadId: thread.threadId,
      runId,
      toolName: "send_sms",
      toolInput: {},
      approvalId: "deny-test",
    });

    const result = await resolveApprovalEvent(supabase, {
      clientId: client.clientId,
      approvalId: "deny-test",
      approved: false,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("updated");
    expect(result.event!.status).toBe("denied");
  });

  it("returns already_resolved when resolving twice", async () => {
    await createApprovalEvent(supabase, {
      clientId: client.clientId,
      threadId: thread.threadId,
      runId,
      toolName: "send_email",
      toolInput: {},
      approvalId: "double-resolve",
    });

    await resolveApprovalEvent(supabase, {
      clientId: client.clientId,
      approvalId: "double-resolve",
      approved: true,
    });

    const second = await resolveApprovalEvent(supabase, {
      clientId: client.clientId,
      approvalId: "double-resolve",
      approved: true,
    });

    expect(second.success).toBe(true);
    expect(second.status).toBe("already_resolved");
  });

  it("returns missing for non-existent approval_id", async () => {
    const result = await resolveApprovalEvent(supabase, {
      clientId: client.clientId,
      approvalId: "does-not-exist",
      approved: true,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("missing");
  });
});

describe.runIf(canRun)("Approval Event — Expire", () => {
  it("expires a pending event", async () => {
    await createApprovalEvent(supabase, {
      clientId: client.clientId,
      threadId: thread.threadId,
      runId,
      toolName: "send_email",
      toolInput: {},
      approvalId: "expire-test",
    });

    const result = await expireApprovalEvent(supabase, {
      clientId: client.clientId,
      approvalId: "expire-test",
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("updated");
    expect(result.event!.status).toBe("expired");
  });

  it("cannot expire an already-resolved event", async () => {
    await createApprovalEvent(supabase, {
      clientId: client.clientId,
      threadId: thread.threadId,
      runId,
      toolName: "send_email",
      toolInput: {},
      approvalId: "no-expire-after-resolve",
    });

    await resolveApprovalEvent(supabase, {
      clientId: client.clientId,
      approvalId: "no-expire-after-resolve",
      approved: true,
    });

    const expireResult = await expireApprovalEvent(supabase, {
      clientId: client.clientId,
      approvalId: "no-expire-after-resolve",
    });

    expect(expireResult.success).toBe(false);
    expect(expireResult.status).toBe("missing");

    // Verify it's still approved (not expired)
    const { data } = await supabase
      .from("approval_events")
      .select("status")
      .eq("approval_id", "no-expire-after-resolve")
      .single();

    expect(data!.status).toBe("approved");
  });
});

describe.runIf(canRun)("Approval Event — Cross-Client Isolation", () => {
  it("client B cannot resolve client A approval", async () => {
    const clientB = await seedClient(supabase, { email: "client-b@approval.test" });

    await createApprovalEvent(supabase, {
      clientId: client.clientId,
      threadId: thread.threadId,
      runId,
      toolName: "send_email",
      toolInput: {},
      approvalId: "cross-client-test",
    });

    const result = await resolveApprovalEvent(supabase, {
      clientId: clientB.clientId,
      approvalId: "cross-client-test",
      approved: true,
    });

    // Should not find it — scoped by client_id
    expect(result.success).toBe(false);
    expect(result.status).toBe("missing");

    // Verify it's still pending
    const { data } = await supabase
      .from("approval_events")
      .select("status")
      .eq("approval_id", "cross-client-test")
      .eq("client_id", client.clientId)
      .single();

    expect(data!.status).toBe("pending");
  });
});
