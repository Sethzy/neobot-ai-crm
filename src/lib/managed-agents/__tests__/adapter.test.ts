/**
 * @module lib/managed-agents/__tests__/adapter.test
 *
 * Tests for `runManagedAgent` — the thin chat wrapper over the session
 * runner. The runner itself is mocked: we verify that the adapter wires
 * the runner's callbacks into the UIMessageStream writer and finalizes
 * the run correctly across the three terminal variants:
 *   - end_turn → completeRun(completed) + createMessages + evaluators
 *   - retries_exhausted → completeRun(failed)
 *   - requires_action → createMessages, but NOT completeRun (the
 *     approval-resolution path in H4 owns the final completion)
 *
 * We also assert spec-fence handling via pipeJsonRender.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../agent-config", () => ({
  resolveAgentRef: vi.fn(() => ({
    agentId: "agent_test",
    agentVersion: 1,
    anthropicModelId: "claude-sonnet-4-6",
  })),
}));
vi.mock("../session-runner", () => ({
  consumeAnthropicSession: vi.fn(),
}));
vi.mock("../session-kickoff", () => ({
  buildKickoffContent: vi.fn(() => [{ type: "text", text: "kickoff" }]),
  getExistingSessionId: vi.fn().mockResolvedValue(null),
  createSessionForThread: vi.fn().mockResolvedValue("sess_1"),
}));
vi.mock("@/lib/runner/system-reminder", () => ({
  buildFallbackSystemReminder: vi.fn().mockReturnValue("<reminder>fallback</reminder>"),
  buildSystemReminder: vi.fn().mockResolvedValue("<reminder>ok</reminder>"),
}));
vi.mock("@/lib/runner/skills/list-installed-skill-slugs", () => ({
  listInstalledSkillSlugs: vi.fn().mockResolvedValue(["call-prep", "daily-briefing"]),
}));
vi.mock("@/lib/runner/skills/list-catalog-skill-slugs", () => ({
  listCatalogSkills: vi.fn().mockReturnValue([
    {
      slug: "call-prep",
      name: "call-prep",
      description: "research a contact before a meeting",
      isExplicitOnly: false,
    },
    {
      slug: "daily-briefing",
      name: "daily-briefing",
      description: "summarize today's pipeline and tasks",
      isExplicitOnly: false,
    },
    {
      slug: "pdf",
      name: "pdf",
      description: "read and extract text from PDF files",
      isExplicitOnly: true,
    },
    {
      slug: "xlsx",
      name: "xlsx",
      description: "read and write Excel workbooks",
      isExplicitOnly: true,
    },
  ]),
  listCatalogSkillSlugs: vi.fn().mockReturnValue([
    "call-prep",
    "daily-briefing",
    "pdf",
    "xlsx",
  ]),
}));
vi.mock("@/lib/runner/run-lifecycle", () => ({
  createRunRecord: vi.fn().mockResolvedValue("run_1"),
  completeRun: vi.fn().mockResolvedValue(undefined),
  markStaleRunsFailed: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/chat/messages", () => ({
  upsertMessage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/approvals/queries", () => ({
  claimApprovalResolution: vi.fn(),
  patchApprovalPartState: vi.fn().mockResolvedValue(undefined),
  releaseApprovalResolutionClaim: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/channels/deliver", () => ({
  deliverToExternalChannels: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/eval/run-evaluators", () => ({
  runEvaluatorsForEvents: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/usage/message-quota", () => ({
  consumeMessageQuota: vi.fn().mockResolvedValue({
    allowed: true,
    clientId: "c1",
    planName: "Free",
    monthlyMessageLimit: 100,
    messagesUsed: 1,
    messagesRemaining: 99,
    periodStart: "2026-04-01",
    nextResetDate: "2026-05-01",
  }),
  releaseMessageQuota: vi.fn().mockResolvedValue(true),
  MessageQuotaError: class MessageQuotaError extends Error {
    code: string;
    quota: unknown;

    constructor(code: string, message: string, options?: { quota?: unknown }) {
      super(message);
      this.name = "MessageQuotaError";
      this.code = code;
      this.quota = options?.quota ?? null;
    }
  },
  messageQuotaErrorCodes: {
    limitReached: "message-quota-exceeded",
    loadFailed: "message-quota-load-failed",
  },
}));
vi.mock("../upload-files-for-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../upload-files-for-session")>();
  return {
    ...actual,
    uploadFilePartsToAnthropic: vi.fn().mockResolvedValue([]),
    mountUploadedFilesToSession: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock("../download-session-files", () => ({
  downloadSessionFiles: vi.fn().mockResolvedValue([]),
}));

const { consumeAnthropicSession } = await import("../session-runner");
const {
  buildKickoffContent,
  createSessionForThread,
  getExistingSessionId,
} = await import("../session-kickoff");
const { buildSystemReminder } = await import("@/lib/runner/system-reminder");
const { completeRun, markStaleRunsFailed } = await import("@/lib/runner/run-lifecycle");
const { upsertMessage } = await import("@/lib/chat/messages");
const {
  claimApprovalResolution,
  patchApprovalPartState,
  releaseApprovalResolutionClaim,
} = await import("@/lib/approvals/queries");
const { deliverToExternalChannels } = await import("@/lib/channels/deliver");
const { runEvaluatorsForEvents } = await import("@/lib/eval/run-evaluators");
const {
  consumeMessageQuota,
  releaseMessageQuota,
} = await import("@/lib/usage/message-quota");
const {
  buildSessionAttachmentMounts,
  mountUploadedFilesToSession,
  uploadFilePartsToAnthropic,
} = await import("../upload-files-for-session");
const { downloadSessionFiles } = await import("../download-session-files");

async function collectStream<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader();
  const parts: T[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value !== undefined) parts.push(value);
  }
  return parts;
}

beforeEach(() => {
  vi.clearAllMocks();
  (getExistingSessionId as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (createSessionForThread as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("sess_1");
  (buildSessionAttachmentMounts as unknown as ReturnType<typeof vi.fn> | undefined)?.mockClear?.();
  (uploadFilePartsToAnthropic as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (mountUploadedFilesToSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (downloadSessionFiles as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (claimApprovalResolution as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    success: true,
    status: "claimed",
    event: {
      thread_id: "thread_1",
      session_id: "sess_1",
      tool_use_id: "toolu_123",
      run_id: "run_1",
    },
    claimedStatus: "approved",
    claimedResolvedAt: "2026-04-12T00:00:00.000Z",
  });
  (patchApprovalPartState as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (releaseApprovalResolutionClaim as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (consumeMessageQuota as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    allowed: true,
    clientId: "c1",
    planName: "Free",
    monthlyMessageLimit: 100,
    messagesUsed: 1,
    messagesRemaining: 99,
    periodStart: "2026-04-01",
    nextResetDate: "2026-05-01",
  });
  (releaseMessageQuota as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
});

describe("runManagedAgent — happy path", () => {
  it("wires session-runner callbacks to UIMessageStream writes, finalizes on end_turn", async () => {
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (options) => {
        await options.callbacks?.onSpanModelRequestStart?.({
          id: "span_1",
          type: "span.model_request_start",
        });
        await options.callbacks?.onAgentMessage?.({
          id: "evt_1",
          type: "agent.message",
          content: [{ type: "text", text: "Hello" }],
        });
        return {
          status: "complete",
          reason: "end_turn",
          accumulatedEvents: [
            { id: "span_1", type: "span.model_request_start" },
            {
              id: "evt_1",
              type: "agent.message",
              content: [{ type: "text", text: "Hello" }],
            },
          ],
          cost: {
            inputTokens: 50,
            outputTokens: 20,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            runtimeSeconds: 5,
          },
          approvalEventIds: [],
          costRetrievePromise: Promise.resolve(),
        };
      },
    );

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "hi",
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });

    const parts = await collectStream(stream);
    expect(
      parts.some((p) => (p as { type?: string }).type === "text-delta" || (p as { type?: string }).type === "text"),
    ).toBe(true);
    expect(completeRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "completed", runId: "run_1" }),
    );
    expect(upsertMessage).toHaveBeenCalled();
    expect(runEvaluatorsForEvents).toHaveBeenCalled();
  });

  it("persists mirrored session files as assistant file parts on terminal completion", async () => {
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "end_turn",
      accumulatedEvents: [
        {
          id: "evt_file_1",
          type: "agent.message",
          content: [{ type: "text", text: "File ready." }],
        },
      ],
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 0,
      },
      approvalEventIds: [],
      costRetrievePromise: Promise.resolve(),
    });
    (downloadSessionFiles as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        anthropicFileId: "file_1",
        filename: "saaa_sorted.csv",
        mediaType: "text/csv",
        storagePath: "sessions/sess_1/saaa_sorted.csv",
        signedUrl: "https://storage.example.com/signed",
      },
    ]);

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "sort this csv",
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });

    await collectStream(stream);

    expect(downloadSessionFiles).toHaveBeenCalledWith({
      supabase: expect.anything(),
      clientId: "c1",
      sessionId: "sess_1",
    });
    expect(upsertMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        role: "assistant",
        parts: expect.arrayContaining([
          expect.objectContaining({ type: "text", text: "File ready." }),
          expect.objectContaining({
            type: "file",
            filename: "saaa_sorted.csv",
            mediaType: "text/csv",
            storagePath: "sessions/sess_1/saaa_sorted.csv",
            url: "https://storage.example.com/signed",
          }),
        ]),
      }),
    );
  });

  it("consumes quota and persists the fresh user turn before starting the managed session", async () => {
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "end_turn",
      accumulatedEvents: [],
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 0,
      },
      approvalEventIds: [],
          costRetrievePromise: Promise.resolve(),
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "hi",
      userMessageSourceId: "user-msg-1",
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });

    await collectStream(stream);

    expect(consumeMessageQuota).toHaveBeenCalledWith(expect.anything(), "c1");
    expect(upsertMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        thread_id: "t1",
        role: "user",
        content: "hi",
        source_event_id: "user-msg-1",
      }),
    );
  });

  it("runs persistUserInput, getExistingSessionId, and buildSystemReminder in parallel before uploading and creating a new session", async () => {
    const events: string[] = [];

    (consumeMessageQuota as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        events.push("quota_start");
        await new Promise((resolve) => setTimeout(resolve, 0));
        events.push("quota_end");
        return {
          allowed: true,
          clientId: "c1",
          planName: "Free",
          monthlyMessageLimit: 100,
          messagesUsed: 1,
          messagesRemaining: 99,
          periodStart: "2026-04-01",
          nextResetDate: "2026-05-01",
        };
      },
    );
    (upsertMessage as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        events.push("persist_start");
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push("persist_end");
      },
    );
    (getExistingSessionId as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        events.push("lookup_start");
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push("lookup_end");
        return null;
      },
    );
    (buildSystemReminder as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        events.push("reminder_start");
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push("reminder_end");
        return "<system-reminder>Current time: X</system-reminder>";
      },
    );
    (uploadFilePartsToAnthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        events.push("upload_start");
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push("upload_end");
        return [];
      },
    );
    (createSessionForThread as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        events.push("session_start");
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push("session_end");
        return "sess_1";
      },
    );
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "end_turn",
      accumulatedEvents: [],
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 0,
      },
      approvalEventIds: [],
          costRetrievePromise: Promise.resolve(),
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "hi",
      fileParts: [{
        type: "file",
        url: "https://storage.example.com/brief.pdf",
        mediaType: "application/pdf",
        filename: "brief.pdf",
      }],
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });

    await collectStream(stream);

    const quotaEnd = events.indexOf("quota_end");
    const persistStart = events.indexOf("persist_start");
    const lookupStart = events.indexOf("lookup_start");
    const reminderStart = events.indexOf("reminder_start");

    expect(quotaEnd).toBeLessThan(persistStart);
    expect(quotaEnd).toBeLessThan(lookupStart);
    expect(quotaEnd).toBeLessThan(reminderStart);

    const persistEnd = events.indexOf("persist_end");
    const lookupEnd = events.indexOf("lookup_end");
    const uploadStart = events.indexOf("upload_start");
    const uploadEnd = events.indexOf("upload_end");
    const reminderEnd = events.indexOf("reminder_end");
    const lastStart = Math.max(persistStart, lookupStart, reminderStart);
    const firstEnd = Math.min(persistEnd, lookupEnd, reminderEnd);

    expect(lastStart).toBeLessThan(firstEnd);

    const sessionStart = events.indexOf("session_start");
    const sessionEnd = events.indexOf("session_end");

    expect(uploadStart).toBeGreaterThan(lookupEnd);
    expect(uploadStart).toBeGreaterThan(persistEnd);
    expect(uploadStart).toBeGreaterThan(reminderEnd);
    expect(sessionStart).toBeGreaterThan(uploadEnd);
    expect(sessionEnd).toBeGreaterThan(sessionStart);
  });

  it("seeds client profile and user preferences into the kickoff on the first turn of a new session", async () => {
    (getExistingSessionId as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (createSessionForThread as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("sess_new");
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "end_turn",
      accumulatedEvents: [],
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 0,
      },
      approvalEventIds: [],
          costRetrievePromise: Promise.resolve(),
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "client_1",
      threadId: "thread_1",
      input: "Draft a follow-up to Kate",
      clientProfile: "## Client Profile\nJane — broker in SG",
      userPreferences: "## Preferences\nConcise. No fluff.",
      threadTitle: null,
    });

    await collectStream(stream);

    expect(buildKickoffContent).toHaveBeenCalledWith(
      expect.objectContaining({
        clientProfile: "## Client Profile\nJane — broker in SG",
        userPreferences: "## Preferences\nConcise. No fluff.",
        installedSkills: [
          { slug: "call-prep", description: "research a contact before a meeting" },
          { slug: "daily-briefing", description: "summarize today's pipeline and tasks" },
        ],
        notInstalledSkills: [],
        userMessage: "Draft a follow-up to Kate",
        attachmentHints: [],
      }),
    );
  });

  it("omits client profile and user preferences from the kickoff on subsequent turns of an existing session", async () => {
    (getExistingSessionId as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("sess_existing");
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "end_turn",
      accumulatedEvents: [],
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 0,
      },
      approvalEventIds: [],
          costRetrievePromise: Promise.resolve(),
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "client_1",
      threadId: "thread_1",
      input: "Follow-up question",
      clientProfile: "## Client Profile\nJane — broker in SG",
      userPreferences: "## Preferences\nConcise. No fluff.",
      threadTitle: null,
    });

    await collectStream(stream);

    expect(buildKickoffContent).toHaveBeenCalledWith(
      expect.objectContaining({
        clientProfile: null,
        userPreferences: null,
        installedSkills: [
          { slug: "call-prep", description: "research a contact before a meeting" },
          { slug: "daily-briefing", description: "summarize today's pipeline and tasks" },
        ],
        notInstalledSkills: [],
        userMessage: "Follow-up question",
        attachmentHints: [],
      }),
    );
  });

  it("uses input.existingSessionId and skips the duplicate session lookup", async () => {
    (getExistingSessionId as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("should not be called");
    });
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "end_turn",
      accumulatedEvents: [],
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 0,
      },
      approvalEventIds: [],
      costRetrievePromise: Promise.resolve(),
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "hello",
      existingSessionId: "sess_existing",
      clientProfile: null,
      userPreferences: null,
      threadTitle: "Thread 1",
    });

    await collectStream(stream);

    expect(consumeAnthropicSession).toHaveBeenCalled();
  });

  it("passes uploaded Anthropic file ids as initialResources when creating a new session", async () => {
    (uploadFilePartsToAnthropic as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { fileId: "file_123", filename: "brief.pdf" },
    ]);
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "end_turn",
      accumulatedEvents: [],
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 0,
      },
      approvalEventIds: [],
          costRetrievePromise: Promise.resolve(),
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "see attached",
      fileParts: [{
        type: "file",
        url: "https://storage.example.com/brief.pdf",
        mediaType: "application/pdf",
        filename: "brief.pdf",
      }],
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });

    await collectStream(stream);

    expect(createSessionForThread).toHaveBeenCalledWith(
      expect.objectContaining({
        initialResources: [
          {
            type: "file",
            file_id: "file_123",
            mount_path: "/mnt/session/uploads/brief.pdf",
          },
        ],
      }),
    );
    expect(buildKickoffContent).toHaveBeenCalledWith(
      expect.objectContaining({
        installedSkills: [
          { slug: "call-prep", description: "research a contact before a meeting" },
          { slug: "daily-briefing", description: "summarize today's pipeline and tasks" },
        ],
        notInstalledSkills: [
          { slug: "pdf", description: "read and extract text from PDF files" },
        ],
        attachmentHints: [
          expect.objectContaining({
            filename: "brief.pdf",
            mountPath: "/mnt/session/uploads/brief.pdf",
          }),
        ],
      }),
    );
  });

  it("does not sweep stale runs on the hot path", async () => {
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "end_turn",
      accumulatedEvents: [],
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 0,
      },
      approvalEventIds: [],
          costRetrievePromise: Promise.resolve(),
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "hi",
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });

    await collectStream(stream);

    expect(markStaleRunsFailed).not.toHaveBeenCalled();
  });

  it("persists and streams a generated title before the managed-agent turn finishes when the title is ready early", async () => {
    const events: string[] = [];
    let releaseConsume: (() => void) | null = null;
    const consumeGate = new Promise<void>((resolve) => {
      releaseConsume = resolve;
    });
    const updateEqClientId = vi.fn().mockResolvedValue({ error: null });
    const updateEqThreadId = vi.fn(() => ({
      eq: updateEqClientId,
    }));
    const updateThread = vi.fn(() => ({
      eq: updateEqThreadId,
    }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "conversation_threads") {
          return {
            update: updateThread,
          };
        }

        return {};
      }),
    } as never;

    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (options) => {
        events.push("consume-start");
        await consumeGate;
        await options.callbacks?.onAgentMessage?.({
          id: "evt_1",
          type: "agent.message",
          content: [{ type: "text", text: "Hello" }],
        });
        events.push("consume-end");

        return {
          status: "complete",
          reason: "end_turn",
          accumulatedEvents: [
            {
              id: "evt_1",
              type: "agent.message",
              content: [{ type: "text", text: "Hello" }],
            },
          ],
          cost: {
            inputTokens: 10,
            outputTokens: 5,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            runtimeSeconds: 1,
          },
          approvalEventIds: [],
          costRetrievePromise: Promise.resolve(),
        };
      },
    );
    updateEqClientId.mockImplementation(async () => {
      events.push("title-persist");
      return { error: null };
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase,
      clientId: "c1",
      threadId: "t1",
      input: "hi",
      clientProfile: null,
      userPreferences: null,
      threadTitle: "New Chat",
      generatedTitlePromise: Promise.resolve("Weekly Planning"),
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual(["consume-start", "title-persist"]);

    releaseConsume?.();
    const parts = await collectStream(stream);
    const titleIndex = parts.findIndex(
      (part) => (part as { type?: string }).type === "data-chat-title",
    );
    const textIndex = parts.findIndex((part) => {
      const type = (part as { type?: string }).type;
      return type === "text-delta" || type === "text";
    });

    expect(parts).toContainEqual(
      expect.objectContaining({
        type: "data-chat-title",
        data: "Weekly Planning",
      }),
    );
    expect(titleIndex).toBeGreaterThanOrEqual(0);
    expect(textIndex).toBeGreaterThan(titleIndex);
    expect(updateThread).toHaveBeenCalledWith({ title: "Weekly Planning" });
    expect(updateEqThreadId).toHaveBeenCalledWith("thread_id", "t1");
    expect(updateEqClientId).toHaveBeenCalledWith("client_id", "c1");
    expect(completeRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "completed", runId: "run_1" }),
    );
  });

  it("swallows title generation failures so the chat stream still completes", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "end_turn",
      accumulatedEvents: [],
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 0,
      },
      approvalEventIds: [],
          costRetrievePromise: Promise.resolve(),
    });

    const { runManagedAgent } = await import("../adapter");
    const generatedTitlePromise = Promise.reject(new Error("title model failed"));
    void generatedTitlePromise.catch(() => undefined);
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "hi",
      clientProfile: null,
      userPreferences: null,
      threadTitle: "New Chat",
      generatedTitlePromise,
    });

    const parts = await collectStream(stream);

    expect(parts.some((part) => (part as { type?: string }).type === "data-chat-title")).toBe(false);
    expect(completeRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "completed", runId: "run_1" }),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[runManagedAgent] failed to generate or persist thread title",
      expect.any(Error),
    );
    consoleErrorSpy.mockRestore();
  });
});

describe("runManagedAgent — terminal variants", () => {
  it("persists partial output and scores retries_exhausted terminal failures", async () => {
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "failed",
      reason: "retries_exhausted",
      accumulatedEvents: [
        {
          id: "evt_1",
          type: "agent.message",
          content: [{ type: "text", text: "I got partway through this." }],
        },
        {
          id: "evt_terminal",
          type: "session.status_idle",
          stop_reason: { type: "retries_exhausted" },
        },
      ],
      cost: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 1,
      },
      approvalEventIds: [],
          costRetrievePromise: Promise.resolve(),
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "hi",
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });
    await collectStream(stream);
    expect(completeRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "failed" }),
    );
    expect(upsertMessage).toHaveBeenCalled();
    expect(deliverToExternalChannels).toHaveBeenCalled();
    expect(runEvaluatorsForEvents).toHaveBeenCalled();
  });

  it("does not mark run complete when reason is requires_action", async () => {
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "requires_action",
      accumulatedEvents: [
        {
          id: "evt_1",
          type: "agent.message",
          content: [{ type: "text", text: "pending approval" }],
        },
      ],
      cost: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 1,
      },
      approvalEventIds: ["tu_1"],
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "rm -rf /tmp",
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });
    await collectStream(stream);
    expect(completeRun).not.toHaveBeenCalled();
    expect(downloadSessionFiles).not.toHaveBeenCalled();
    expect(upsertMessage).toHaveBeenCalled();
  });
});

describe("resumeManagedAgentFromApproval", () => {
  it("returns a stream from resumeManagedAgentFromApproval without completing the run early", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "runs") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { model: "claude-sonnet-4-6" },
                }),
              }),
            }),
          };
        }

        return {};
      },
    } as never;

    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (options) => {
        await options.onKickoffApprovalSent?.();
        await options.callbacks?.onAgentMessage?.({
          id: "evt_approval_1",
          type: "agent.message",
          content: [{ type: "text", text: "Approved. Continuing." }],
        });

        return {
          status: "complete",
          reason: "end_turn",
          accumulatedEvents: [
            {
              id: "evt_approval_1",
              type: "agent.message",
              content: [{ type: "text", text: "Approved. Continuing." }],
            },
          ],
          cost: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            runtimeSeconds: 0,
          },
          approvalEventIds: [],
          costRetrievePromise: Promise.resolve(),
        };
      },
    );

    const { resumeManagedAgentFromApproval } = await import("../adapter");
    const result = await resumeManagedAgentFromApproval({
      anthropic: {} as never,
      supabase,
      clientId: "c1",
      approvalId: "toolu_123",
      approved: true,
    });

    expect(result.status).toBe("streaming");
    if (result.status !== "streaming") {
      throw new Error("Expected a streaming result.");
    }

    expect(completeRun).not.toHaveBeenCalled();

    await collectStream(result.stream);

    expect(claimApprovalResolution).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        clientId: "c1",
        approvalId: "toolu_123",
        approved: true,
      }),
    );
    expect(consumeAnthropicSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess_1",
        runId: "run_1",
        kickoffApproval: {
          toolUseId: "toolu_123",
          result: "allow",
          denyMessage: undefined,
        },
      }),
    );
    expect(patchApprovalPartState).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        clientId: "c1",
        threadId: "thread_1",
        approvalId: "toolu_123",
        approved: true,
      }),
    );
    expect(completeRun).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        runId: "run_1",
        status: "completed",
      }),
    );
  });
});

describe("runManagedAgent — source_event_id idempotency", () => {
  it("upserts the assistant message keyed by the terminal event id", async () => {
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "end_turn",
      accumulatedEvents: [
        { id: "span_1", type: "span.model_request_start" },
        {
          id: "evt_1",
          type: "agent.message",
          content: [{ type: "text", text: "Hello" }],
        },
        {
          id: "evt_terminal",
          type: "session.status_idle",
          stop_reason: { type: "end_turn" },
        },
      ],
      cost: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 1,
      },
      approvalEventIds: [],
          costRetrievePromise: Promise.resolve(),
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "hi",
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });
    await collectStream(stream);
    expect(upsertMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        thread_id: "t1",
        role: "assistant",
        source_event_id: "evt_terminal",
      }),
    );
    expect(deliverToExternalChannels).toHaveBeenCalledWith(
      expect.anything(),
      "t1",
      "c1",
      expect.any(String),
      expect.any(Array),
      "evt_terminal",
    );
  });
});

describe("runManagedAgent — failure cleanup", () => {
  it("marks the run failed when setup throws after the lock is acquired", async () => {
    (createSessionForThread as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("missing managed agent env"),
    );

    const { runManagedAgent } = await import("../adapter");

    await expect(
      runManagedAgent({
        anthropic: {} as never,
        supabase: {} as never,
        clientId: "c1",
        threadId: "t1",
        input: "hi",
        clientProfile: null,
        userPreferences: null,
        threadTitle: null,
      }),
    ).rejects.toThrow("missing managed agent env");

    expect(completeRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "failed", runId: "run_1" }),
    );
  });

  it("releases the consumed quota if user-turn persistence fails before the run starts", async () => {
    (upsertMessage as unknown as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("insert failed"));

    const { runManagedAgent } = await import("../adapter");

    await expect(
      runManagedAgent({
        anthropic: {} as never,
        supabase: {} as never,
        clientId: "c1",
        threadId: "t1",
        input: "hi",
        userMessageSourceId: "user-msg-1",
        clientProfile: null,
        userPreferences: null,
        threadTitle: null,
      }),
    ).rejects.toThrow("insert failed");

    expect(releaseMessageQuota).toHaveBeenCalledWith(
      expect.anything(),
      "c1",
      "2026-04-01",
    );
  });

  it("marks the run failed when consumeAnthropicSession throws mid-stream", async () => {
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("upstream EPIPE"),
    );

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "hi",
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });
    // Drain the stream — the error happens inside execute and the
    // UIMessageStream surfaces it via the consumer; we just need the
    // adapter to have run its cleanup.
    try {
      await collectStream(stream);
    } catch {
      // expected
    }
    expect(completeRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "failed", runId: "run_1" }),
    );
  });

  it("marks the run failed when attachment fetch fails during setup", async () => {
    (uploadFilePartsToAnthropic as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Failed to fetch attachment bad.pdf (500)"),
    );

    const { runManagedAgent } = await import("../adapter");

    await expect(
      runManagedAgent({
        anthropic: {} as never,
        supabase: {} as never,
        clientId: "c1",
        threadId: "t1",
        input: "see attached",
        fileParts: [{
          type: "file",
          url: "https://storage.example.com/bad.pdf",
          mediaType: "application/pdf",
          filename: "bad.pdf",
        }],
        clientProfile: null,
        userPreferences: null,
        threadTitle: null,
      }),
    ).rejects.toThrow("Failed to fetch attachment bad.pdf (500)");

    expect(completeRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "failed", runId: "run_1" }),
    );
  });

  it("skips reused-session attachment when a new session is created", async () => {
    (getExistingSessionId as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (createSessionForThread as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("sess_1");
    (uploadFilePartsToAnthropic as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { fileId: "file_123", filename: "brief.pdf" },
    ]);
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "end_turn",
      accumulatedEvents: [],
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 0,
      },
      approvalEventIds: [],
          costRetrievePromise: Promise.resolve(),
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "see attached",
      fileParts: [{
        type: "file",
        url: "https://storage.example.com/brief.pdf",
        mediaType: "application/pdf",
        filename: "brief.pdf",
      }],
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });

    await collectStream(stream);

    expect(mountUploadedFilesToSession).not.toHaveBeenCalled();
  });

  it("attaches file parts after the managed session exists on reused sessions", async () => {
    (getExistingSessionId as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("sess_1");
    (uploadFilePartsToAnthropic as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { fileId: "file_123", filename: "brief.pdf" },
    ]);
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "end_turn",
      accumulatedEvents: [],
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 0,
      },
      approvalEventIds: [],
          costRetrievePromise: Promise.resolve(),
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "see attached",
      fileParts: [{
        type: "file",
        url: "https://storage.example.com/brief.pdf",
        mediaType: "application/pdf",
        filename: "brief.pdf",
      }],
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });

    await collectStream(stream);

    expect(createSessionForThread).not.toHaveBeenCalled();
    expect(uploadFilePartsToAnthropic).toHaveBeenCalledWith(
      expect.anything(),
      [
        {
          type: "file",
          url: "https://storage.example.com/brief.pdf",
          mediaType: "application/pdf",
          filename: "brief.pdf",
        },
      ],
    );
    expect(mountUploadedFilesToSession).toHaveBeenCalledWith({
      anthropic: expect.anything(),
      sessionId: "sess_1",
      uploadedFiles: [{ fileId: "file_123", filename: "brief.pdf" }],
      mountPaths: ["/mnt/session/uploads/brief.pdf"],
      logLabel: "runManagedAgent",
    });
  });
});

describe("runManagedAgent — pipeJsonRender spec fences", () => {
  it("emits data-spec parts when agent.message contains a spec fence", async () => {
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (options) => {
        const specText =
          'Here is the data:\n```spec\n{"op":"replace","path":"/m","value":1}\n```\nDone.';
        await options.callbacks?.onAgentMessage?.({
          id: "evt_1",
          type: "agent.message",
          content: [{ type: "text", text: specText }],
        });
        return {
          status: "complete",
          reason: "end_turn",
          accumulatedEvents: [
            {
              id: "evt_1",
              type: "agent.message",
              content: [{ type: "text", text: specText }],
            },
          ],
          cost: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 1,
      },
          approvalEventIds: [],
          costRetrievePromise: Promise.resolve(),
        };
      },
    );

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "show me",
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });
    const parts = await collectStream(stream);
    const types = parts.map((p) => (p as { type?: string }).type ?? "");
    expect(types.some((t) => t.startsWith("data-"))).toBe(true);
  });
});
