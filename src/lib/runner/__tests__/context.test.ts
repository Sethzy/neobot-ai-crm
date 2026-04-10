/**
 * Tests for runner context assembly.
 * @module lib/runner/__tests__/context
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildPlatformInstructions } from "@/lib/ai/platform-instructions";
import {
  MARKET_DATA_PROMPT,
  PROPERTY_LISTING_PROMPT,
} from "@/lib/ai/system-prompt";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { SUMMARY_PREFIX } from "../compaction";
import { assembleContext, assembleSystemOnly } from "../context";

const {
  mockLoadMemoryContext,
  mockBuildSystemReminder,
  mockFetchThreadCompactionState,
  mockFetchThreadMetadata,
  mockDiscoverUserSkills,
} = vi.hoisted(() => ({
  mockLoadMemoryContext: vi.fn().mockResolvedValue({
    soul: "soul-content",
    user: "user-content",
    memory: "memory-content",
  }),
  mockBuildSystemReminder: vi.fn().mockResolvedValue(
    "<system-reminder>\nCurrent time: 2026-03-05 14:30:00 UTC\nOpen todos: 0\n</system-reminder>",
  ),
  mockFetchThreadCompactionState: vi.fn().mockResolvedValue(null),
  mockFetchThreadMetadata: vi.fn().mockResolvedValue({
    updatedAt: new Date().toISOString(),
    contextResetAt: null,
    compactionState: null,
  }),
  mockDiscoverUserSkills: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/memory/loader", () => ({
  loadMemoryContext: mockLoadMemoryContext,
}));

vi.mock("@/lib/runner/system-reminder", async () => {
  const actual = await vi.importActual<typeof import("@/lib/runner/system-reminder")>(
    "@/lib/runner/system-reminder",
  );
  return {
    ...actual,
    buildSystemReminder: mockBuildSystemReminder,
  };
});

vi.mock("@/lib/runner/compaction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/runner/compaction")>();
  return {
    ...actual,
    fetchThreadCompactionState: mockFetchThreadCompactionState,
    fetchThreadMetadata: mockFetchThreadMetadata,
  };
});

vi.mock("@/lib/runner/skills/discover-skills", () => ({
  discoverUserSkills: mockDiscoverUserSkills,
}));

describe("assembleContext", () => {
  function textModelMessage(role: "user" | "assistant" | "system", text: string) {
    return {
      role,
      content: [{ type: "text" as const, text }],
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the system prompt with platform instructions and current message when no history exists", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
    });

    expect(result.system).toContain("<platform-instructions>");
    expect(result.system).toContain("You are Sunder");
    expect(result.messages).toEqual([textModelMessage("user", "Hello!")]);
  });

  it("assembles system string without memory or system-reminder (moved to messages)", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(result.system).toContain("<platform-instructions>");
    expect(result.system).toContain("You are Sunder");

    // Memory and system-reminder should NOT be in the system string
    expect(result.system).not.toContain("<soul>");
    expect(result.system).not.toContain("<user-profile>");
    expect(result.system).not.toContain("<working-memory>");
    expect(result.system).not.toContain("<system-reminder>");

    // Memory should be injected as a message
    const memoryMessage = result.messages.find(
      (m) => Array.isArray(m.content)
        && m.content.some((c) => c.type === "text" && "text" in c && (c as { text: string }).text.includes("<soul>")),
    );
    expect(memoryMessage).toBeDefined();
    expect(memoryMessage?.role).toBe("user");
  });

  it("places available-skills in the system prompt (memory is in messages now)", async () => {
    mockDiscoverUserSkills.mockResolvedValueOnce([
      {
        slug: "test-skill",
        name: "test-skill",
        description: "A test skill.",
        path: "/agent/skills/test-skill/SKILL.md",
      },
    ]);
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(result.system).toContain("<available-skills>");
    // Memory should NOT be in the system string
    expect(result.system).not.toContain("<soul>");
    expect(result.system).not.toContain("<working-memory>");
  });

  it("includes platform instructions before system prompt when clientId is provided", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    const platformIndex = result.system.indexOf("<platform-instructions>");
    const systemPromptIndex = result.system.indexOf("You are Sunder");

    expect(platformIndex).toBeGreaterThanOrEqual(0);
    expect(systemPromptIndex).toBeGreaterThan(platformIndex);
  });

  it("injects system-reminder as a user message, not in system string", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    // System prompt should NOT contain system-reminder
    expect(result.system).not.toContain("<system-reminder>");

    // A message should contain system-reminder
    const reminderMessage = result.messages.find(
      (m) => Array.isArray(m.content)
        && m.content.some((c) => c.type === "text" && "text" in c && (c as { text: string }).text.includes("<system-reminder>")),
    );
    expect(reminderMessage).toBeDefined();
    expect(reminderMessage?.role).toBe("user");
  });

  it("injects compaction summary as part of the memory message, not in system string", async () => {
    const compactionState = {
      thread_id: "thread-1",
      client_id: "client-123",
      compaction_summary: `${SUMMARY_PREFIX}\nOlder thread summary`,
      compaction_compacted_through_at: "2026-03-06T02:00:00.000Z",
      compaction_compacted_through_message_id: "message-2",
      compaction_summary_model: "google/gemini-2.5-flash-lite",
      compaction_summary_tokens_used: 99,
    };
    mockFetchThreadMetadata.mockResolvedValueOnce({
      updatedAt: new Date().toISOString(),
      contextResetAt: null,
      compactionState,
    });
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    // Compaction summary should NOT be in the system string
    expect(result.system).not.toContain("<compaction-summary>");

    // Should be in a memory message
    const memoryMessage = result.messages.find(
      (m) => Array.isArray(m.content)
        && m.content.some((c) => c.type === "text" && "text" in c && (c as { text: string }).text.includes("<compaction-summary>")),
    );
    expect(memoryMessage).toBeDefined();
    expect(memoryMessage?.role).toBe("user");
  });

  it("does not inject a compaction block anywhere when the thread has no summary", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(result.system).not.toContain("<compaction-summary>");
    const compactionMessage = result.messages.find(
      (m) => Array.isArray(m.content)
        && m.content.some((c) => c.type === "text" && "text" in c && (c as { text: string }).text.includes("<compaction-summary>")),
    );
    expect(compactionMessage).toBeUndefined();
  });

  it("loads memory context when clientId is provided (bootstrap happens at entrypoint)", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(mockLoadMemoryContext).toHaveBeenCalledWith(expect.anything(), "client-123");
  });

  it("does not load memory when clientId is omitted", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
    });

    expect(mockLoadMemoryContext).not.toHaveBeenCalled();
  });

  it("passes clientId and threadId to buildSystemReminder", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(mockBuildSystemReminder).toHaveBeenCalledWith(
      expect.anything(),
      "client-123",
      "thread-1",
    );
    expect(mockFetchThreadMetadata).toHaveBeenCalledWith(
      expect.anything(),
      "thread-1",
    );
  });

  it("does not include system-reminder when clientId is omitted but always includes platform instructions", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
    });

    expect(result.system).toContain("<platform-instructions>");
    expect(result.system).not.toContain("<system-reminder>");
    expect(mockBuildSystemReminder).not.toHaveBeenCalled();
  });

  it("injects run-specific instructions in the system prompt", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
      instructions: "Custom autopilot instructions",
    });

    const systemPromptIndex = result.system.indexOf("You are Sunder");
    const instructionsIndex = result.system.indexOf("Custom autopilot instructions");

    expect(instructionsIndex).toBeGreaterThan(systemPromptIndex);
    // Memory is in messages, not in system string
    expect(result.system).not.toContain("<soul>");
  });

  it("injects runtime CRM vocabulary into the normal-mode platform instructions", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });
    const platformInstructions = buildPlatformInstructions({
      deal_label: "Policy & Claim",
      deal_stages: ["lead", "underwriting", "bound"],
      contact_types: ["prospect", "policy_holder"],
      interaction_types: ["call", "email"],
      deal_contact_roles: ["insured", "owner"],
      deal_custom_fields: [
        { key: "coverage_amount", label: 'Coverage "Amount"', type: "currency" },
      ],
      contact_custom_fields: [],
      task_custom_fields: [],
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
      platformInstructions,
    });

    expect(result.system).toContain("<crm-vocabulary>");
    expect(result.system).toContain("Policy &amp; Claim");
    expect(result.system).toContain("underwriting");
    expect(result.system).toContain("Coverage &quot;Amount&quot;");
  });

  it("uses an explicit runtime system prompt override when provided", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Help me configure my CRM",
      clientId: "client-123",
      platformInstructions: buildPlatformInstructions({
        deal_label: "Policy",
        deal_stages: ["lead", "underwriting", "bound"],
        contact_types: ["prospect", "client"],
        interaction_types: ["call", "email"],
        deal_contact_roles: ["insured", "owner"],
        deal_custom_fields: [],
        contact_custom_fields: [],
        task_custom_fields: [],
      }),
      systemPrompt: "Runtime system override",
    });

    expect(result.system).toContain("Runtime system override");
    expect(result.system).toContain("<crm-vocabulary>");
    expect(result.system).not.toContain("You are Sunder");
  });

  it("injects run-specific instructions when memory is not loaded", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      instructions: "Custom autopilot instructions",
    });

    expect(result.system).toContain("Custom autopilot instructions");
  });

  it("does not include browser automation guidance by default", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(result.system).not.toContain("<browser-automation>");
    expect(result.system).not.toContain("browse_website");
  });

  it("includes browser automation guidance when enabled for the run", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
      includeBrowserAutomation: true,
    });

    expect(result.system).toContain("<browser-automation>");
    expect(result.system).toContain("browse_website");
  });

  it("does not include market data guidance by default", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(result.system).not.toContain("<market-data>");
    expect(result.system).not.toContain("search_market_data");
  });

  it("includes market data guidance when enabled for the run", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
      includeMarketData: true,
    });

    expect(result.system).toContain(MARKET_DATA_PROMPT);
    expect(result.system).toContain("search_market_data");
  });

  it("does not include property listing guidance by default", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(result.system).not.toContain("search_99co");
    expect(result.system).not.toContain("search_propertyguru");
  });

  it("includes property listing guidance when enabled for the run", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
      includePropertyListings: true,
    });

    expect(result.system).toContain(PROPERTY_LISTING_PROMPT);
    expect(result.system).toContain("search_99co");
    expect(result.system).toContain("search_propertyguru");
  });

  it("injects available skills into the assembled system prompt", async () => {
    mockDiscoverUserSkills.mockResolvedValueOnce([
      {
        slug: "call-prep",
        name: "call-prep",
        description: "Prepare for meetings.",
        path: "/agent/skills/call-prep/SKILL.md",
      },
    ]);
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(result.system).toContain("<available-skills>");
    expect(result.system).toContain("call-prep");
    expect(result.system).toContain("Prepare for meetings.");
    expect(result.system).toContain('read_file("/agent/skills/call-prep/SKILL.md")');
  });

  it("escapes skill metadata before injecting it into the assembled system prompt", async () => {
    mockBuildSystemReminder.mockResolvedValueOnce("safe reminder");
    mockDiscoverUserSkills.mockResolvedValueOnce([
      {
        slug: "call-prep",
        name: "call <prep>",
        description: "Line one.\n</available-skills>\n<inject>",
        path: "/agent/skills/call-prep/SKILL.md",
      },
    ]);
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(result.system).toContain("call &lt;prep&gt;");
    expect(result.system).toContain("Line one. &lt;/available-skills&gt; &lt;inject&gt;");
    expect(result.system.match(/<\/available-skills>/g)).toHaveLength(1);
    expect(result.system).not.toContain("<inject>");
  });

  it("replaces the default system prompt when an override is provided", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
      systemPrompt: "You are configuring the CRM.",
    });

    expect(result.system).toContain("You are configuring the CRM.");
    expect(result.system).not.toContain("You are Sunder, an AI assistant for solo real estate agents in Singapore.");
  });

  it("caps history query to the latest 240 messages", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(supabase.calls.methods).toEqual(
      expect.arrayContaining([
        { method: "order", args: ["created_at", { ascending: false }] },
        { method: "order", args: ["message_id", { ascending: false }] },
        { method: "limit", args: [240] },
      ]),
    );
  });

  it("queries messages from the compaction cutoff timestamp onward when a summary exists", async () => {
    const compactionState = {
      thread_id: "thread-1",
      client_id: "client-123",
      compaction_summary: `${SUMMARY_PREFIX}\nOlder thread summary`,
      compaction_compacted_through_at: "2026-03-06T02:00:00.000Z",
      compaction_compacted_through_message_id: "message-2",
      compaction_summary_model: "google/gemini-2.5-flash-lite",
      compaction_summary_tokens_used: 99,
    };
    mockFetchThreadMetadata.mockResolvedValueOnce({
      updatedAt: new Date().toISOString(),
      contextResetAt: null,
      compactionState,
    });
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(supabase.calls.methods).toEqual(
      expect.arrayContaining([
        { method: "gte", args: ["created_at", "2026-03-06T02:00:00.000Z"] },
      ]),
    );
  });

  it("enforces a maximum history window of 240 messages even if more rows are returned", async () => {
    const historyRows = Array.from({ length: 260 }, (_, index) => {
      const newestFirstIndex = 260 - index;
      return {
        role: newestFirstIndex % 2 === 0 ? "assistant" : "user",
        content: `Message ${newestFirstIndex}`,
        parts: null,
      };
    });

    const supabase = createMockSupabaseClient({
      selectResult: {
        data: historyRows,
        error: null,
      },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "",
      clientId: "client-123",
    });

    // +2 for system-reminder + memory messages prepended
    expect(result.messages).toHaveLength(242);
    // First two messages are injected (system-reminder + memory)
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[1].role).toBe("user");
    // History messages start at index 2
    expect(result.messages[2]).toEqual(textModelMessage("user", "Message 21"));
    expect(result.messages[241]).toEqual(textModelMessage("assistant", "Message 260"));
  });

  it("includes thread history before the current message", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [
          { role: "assistant", content: "Hello! How can I help?", parts: null },
          { role: "user", content: "Hi", parts: null },
        ],
        error: null,
      },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Create a follow-up reminder",
    });

    expect(result.messages).toEqual([
      textModelMessage("user", "Hi"),
      textModelMessage("assistant", "Hello! How can I help?"),
      textModelMessage("user", "Create a follow-up reminder"),
    ]);
  });

  it("filters out the compacted-through boundary message while keeping later messages at the same timestamp", async () => {
    const compactionState = {
      thread_id: "thread-1",
      client_id: "client-123",
      compaction_summary: `${SUMMARY_PREFIX}\nOlder thread summary`,
      compaction_compacted_through_at: "2026-03-06T02:00:00.000Z",
      compaction_compacted_through_message_id: "message-2",
      compaction_summary_model: "google/gemini-2.5-flash-lite",
      compaction_summary_tokens_used: 99,
    };
    mockFetchThreadMetadata.mockResolvedValueOnce({
      updatedAt: new Date().toISOString(),
      contextResetAt: null,
      compactionState,
    });
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [
          {
            message_id: "message-4",
            created_at: "2026-03-06T02:05:00.000Z",
            role: "assistant",
            content: "Newest response",
            parts: null,
          },
          {
            message_id: "message-3",
            created_at: "2026-03-06T02:00:00.000Z",
            role: "user",
            content: "Keep me",
            parts: null,
          },
          {
            message_id: "message-2",
            created_at: "2026-03-06T02:00:00.000Z",
            role: "assistant",
            content: "Drop me",
            parts: null,
          },
        ],
        error: null,
      },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "",
      clientId: "client-123",
    });

    // System-reminder and memory messages are prepended, then the filtered history
    const historyMessages = result.messages.filter(
      (m) => !Array.isArray(m.content) || !m.content.some((c) =>
        c.type === "text" && "text" in c && (
          (c as { text: string }).text.includes("<system-reminder>") ||
          (c as { text: string }).text.includes("<soul>")
        ),
      ),
    );
    expect(historyMessages).toEqual([
      textModelMessage("user", "Keep me"),
      textModelMessage("assistant", "Newest response"),
    ]);
  });

  it("does not append a synthetic user message when currentMessage is empty", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [
          { role: "assistant", content: "Existing response", parts: null },
          { role: "user", content: "Persisted inbound message", parts: null },
        ],
        error: null,
      },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "",
    });

    expect(result.messages).toEqual([
      textModelMessage("user", "Persisted inbound message"),
      textModelMessage("assistant", "Existing response"),
    ]);
  });

  it("falls back to text part content when row content is null", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [
          {
            role: "assistant",
            content: null,
            parts: [{ type: "text", text: "Rendered from parts" }],
          },
        ],
        error: null,
      },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Thanks",
    });

    expect(result.messages[0]).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "Rendered from parts" }],
    });
  });

  it("converts persisted user file parts into model message content", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [
          {
            message_id: "message-1",
            created_at: "2026-03-07T09:00:00.000Z",
            role: "user",
            content: "See attached",
            parts: [
              {
                type: "file",
                filename: "screenshot.png",
                mediaType: "image/png",
                url: "https://storage.example.com/chat-attachments/client-1/screenshot.png",
              },
              { type: "text", text: "See attached" },
            ],
          },
        ],
        error: null,
      },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "",
    });

    expect(result.messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "file",
            filename: "screenshot.png",
            mediaType: "image/png",
            data: "https://storage.example.com/chat-attachments/client-1/screenshot.png",
          },
          {
            type: "text",
            text: "See attached",
          },
        ],
      },
    ]);
  });

  it("strips non-model-visible historical file parts before converting messages", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [
          {
            message_id: "message-1",
            created_at: "2026-03-07T09:00:00.000Z",
            role: "user",
            content: "Review the proposal",
            parts: [
              {
                type: "file",
                filename: "proposal.docx",
                mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                url: "https://storage.example.com/chat-attachments/client-1/proposal.docx",
              },
              { type: "text", text: "Review the proposal" },
            ],
          },
        ],
        error: null,
      },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "",
    });

    expect(result.messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Review the proposal",
          },
        ],
      },
    ]);
  });

  it("throws when history query fails", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "connection refused" } },
    });

    await expect(
      assembleContext({
        supabase: supabase as never,
        threadId: "thread-1",
        currentMessage: "Hello!",
      }),
    ).rejects.toThrow("Failed to load thread history: connection refused");
  });
});

describe("assembleSystemOnly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds the system layers without loading thread history", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [
          { role: "user", content: "Do not include me", parts: null },
        ],
        error: null,
      },
    });

    const system = await assembleSystemOnly({
      supabase: supabase as never,
      threadId: "thread-1",
      clientId: "client-123",
    });

    expect(system).toContain("<platform-instructions>");
    expect(system).not.toContain("<system-reminder>");
    expect(system).toContain("<soul>");
    expect(system).not.toContain("Do not include me");
    expect(system).not.toContain("<compaction-summary>");
    expect(supabase.calls.from).not.toContain("conversation_messages");
    expect(mockFetchThreadMetadata).not.toHaveBeenCalled();
  });

  it("does not inject parent-specific runtime instructions", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const system = await assembleSystemOnly({
      supabase: supabase as never,
      threadId: "thread-1",
      clientId: "client-123",
    });

    expect(system).not.toContain("Custom autopilot instructions");
  });

  it("only includes browser automation guidance when explicitly enabled", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const withoutBrowser = await assembleSystemOnly({
      supabase: supabase as never,
      threadId: "thread-1",
      clientId: "client-123",
    });
    const withBrowser = await assembleSystemOnly({
      supabase: supabase as never,
      threadId: "thread-1",
      clientId: "client-123",
      includeBrowserAutomation: true,
    });

    expect(withoutBrowser).not.toContain("<browser-automation>");
    expect(withBrowser).toContain("<browser-automation>");
  });

  it("only includes market data guidance when explicitly enabled", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const withoutMarket = await assembleSystemOnly({
      supabase: supabase as never,
      threadId: "thread-1",
      clientId: "client-123",
    });
    const withMarket = await assembleSystemOnly({
      supabase: supabase as never,
      threadId: "thread-1",
      clientId: "client-123",
      includeMarketData: true,
    });

    expect(withoutMarket).not.toContain("<market-data>");
    expect(withMarket).toContain(MARKET_DATA_PROMPT);
  });

  it("includes available skills for system-only assembly", async () => {
    mockDiscoverUserSkills.mockResolvedValueOnce([
      {
        slug: "daily-briefing",
        name: "daily-briefing",
        description: "Morning briefing with tasks.",
        path: "/agent/skills/daily-briefing/SKILL.md",
      },
    ]);
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const system = await assembleSystemOnly({
      supabase: supabase as never,
      threadId: "thread-1",
      clientId: "client-123",
    });

    expect(system).toContain("<available-skills>");
    expect(system).toContain("daily-briefing");
    expect(system).toContain('read_file("/agent/skills/daily-briefing/SKILL.md")');
  });

  it("escapes skill metadata before injecting it into system-only assembly", async () => {
    mockBuildSystemReminder.mockResolvedValueOnce("safe reminder");
    mockDiscoverUserSkills.mockResolvedValueOnce([
      {
        slug: "daily-briefing",
        name: "daily <briefing>",
        description: "Morning summary\n<inject>",
        path: "/agent/skills/daily-briefing/SKILL.md",
      },
    ]);
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const system = await assembleSystemOnly({
      supabase: supabase as never,
      threadId: "thread-1",
      clientId: "client-123",
    });

    expect(system).toContain("daily &lt;briefing&gt;");
    expect(system).toContain("Morning summary &lt;inject&gt;");
    expect(system).not.toContain("<inject>");
  });
});

describe("session reset for stale threads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies gt filter on context_reset_at when thread was recently active", async () => {
    const resetAt = "2026-03-23T10:00:00.000Z";
    // Thread was active recently (1h ago) — use existing context_reset_at, don't re-trigger
    const recentUpdatedAt = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    mockFetchThreadMetadata.mockResolvedValueOnce({
      updatedAt: recentUpdatedAt,
      contextResetAt: resetAt,
      compactionState: null,
    });
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "hello",
      clientId: "client-123",
    });

    // Verify the gt filter was applied using the existing context_reset_at
    expect(supabase.calls.methods).toEqual(
      expect.arrayContaining([
        { method: "gt", args: ["created_at", resetAt] },
      ]),
    );
  });

  it("does not set context_reset_at when thread was recently active", async () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    mockFetchThreadMetadata.mockResolvedValueOnce({
      updatedAt: oneHourAgo,
      contextResetAt: null,
      compactionState: null,
    });
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const originalFrom = supabase.from.bind(supabase);
    const updateCalls: unknown[] = [];
    supabase.from = ((table: string) => {
      const query = originalFrom(table);
      if (table === "conversation_threads") {
        const originalUpdate = query.update.bind(query);
        query.update = (...args: unknown[]) => {
          updateCalls.push(args);
          return originalUpdate(...args);
        };
      }
      return query;
    }) as typeof supabase.from;

    await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "hello",
      clientId: "client-123",
    });

    // No update should have been made — thread is fresh
    expect(updateCalls).toHaveLength(0);
  });

  it("sets context_reset_at to the last persisted thread activity when the thread is stale", async () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    mockFetchThreadMetadata.mockResolvedValueOnce({
      updatedAt: fiveHoursAgo,
      contextResetAt: null,
      compactionState: null,
    });
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
      updateResult: { data: [], error: null },
    });

    const originalFrom = supabase.from.bind(supabase);
    const updateCalls: unknown[] = [];
    supabase.from = ((table: string) => {
      const query = originalFrom(table);
      if (table === "conversation_threads") {
        const originalUpdate = query.update.bind(query);
        query.update = (...args: unknown[]) => {
          updateCalls.push(args);
          return originalUpdate(...args);
        };
      }
      return query;
    }) as typeof supabase.from;

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "hello",
      clientId: "client-123",
    });

    expect(updateCalls).toEqual([
      [{ context_reset_at: fiveHoursAgo }],
    ]);
    expect(supabase.calls.methods).toEqual(
      expect.arrayContaining([
        { method: "gt", args: ["created_at", fiveHoursAgo] },
      ]),
    );
    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: expect.arrayContaining([
            expect.objectContaining({ type: "text", text: "hello" }),
          ]),
        }),
      ]),
    );
  });

  it("includes SANDBOX_PROMPT in system prompt when includeSandbox is true", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Analyze this spreadsheet",
      clientId: "client-123",
      includeSandbox: true,
    });
    expect(result.system).toContain("<sandbox>");
    expect(result.system).toContain("agent/home/");
  });

  it("excludes SANDBOX_PROMPT when includeSandbox is false", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello",
      clientId: "client-123",
      includeSandbox: false,
    });
    expect(result.system).not.toContain("<sandbox>");
  });

});
