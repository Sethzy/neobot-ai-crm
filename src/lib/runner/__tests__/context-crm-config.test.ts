/**
 * Tests CRM-config-aware context assembly behavior.
 * @module lib/runner/__tests__/context-crm-config
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CRM_DEFAULTS } from "@/lib/crm/config";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { assembleContext } from "../context";

const {
  mockBootstrapMemoryFiles,
  mockLoadMemoryContext,
  mockBuildSystemReminder,
  mockFetchThreadCompactionState,
} = vi.hoisted(() => ({
  mockBootstrapMemoryFiles: vi.fn().mockResolvedValue(undefined),
  mockLoadMemoryContext: vi.fn().mockResolvedValue({
    soul: "soul-content",
    user: "user-content",
    memory: "memory-content",
  }),
  mockBuildSystemReminder: vi.fn().mockResolvedValue(
    "<system-reminder>\nCurrent time: 2026-03-05 14:30:00 UTC\nOpen todos: 0\n</system-reminder>",
  ),
  mockFetchThreadCompactionState: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/memory/bootstrap", () => ({
  bootstrapMemoryFiles: mockBootstrapMemoryFiles,
}));

vi.mock("@/lib/memory/loader", () => ({
  loadMemoryContext: mockLoadMemoryContext,
}));

vi.mock("@/lib/runner/system-reminder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/runner/system-reminder")>();
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
  };
});

describe("assembleContext CRM configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses setup-mode prompt override and injects escaped CRM vocabulary", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Help me configure this.",
      clientId: "client-123",
      crmMode: "setup",
      crmConfig: {
        ...CRM_DEFAULTS,
        deal_label: 'Policy <Line>',
        company_label: 'Brokerage <Firm>',
        deal_stages: ["lead & quoted", "bound"],
        company_industries: ["property_agency", 'law_firm "partner"'],
        deal_custom_fields: [
          {
            key: "coverage_amount",
            label: 'Coverage "Amount"',
            type: "currency",
          },
        ],
        company_custom_fields: [
          {
            key: "tier",
            label: 'Tier "Band"',
            type: "select",
            options: ["a", "b"],
          },
        ],
      },
    });

    expect(result.system.toLowerCase()).toContain("crm setup");
    expect(result.system).toContain("configure_crm");
    expect(result.system).toContain("<crm-vocabulary>");
    expect(result.system).toContain("Policy &lt;Line&gt;");
    expect(result.system).toContain("Brokerage &lt;Firm&gt;");
    expect(result.system).toContain("lead &amp; quoted");
    expect(result.system).toContain("law_firm &quot;partner&quot;");
    expect(result.system).toContain("Coverage &quot;Amount&quot;");
    expect(result.system).toContain("Tier &quot;Band&quot;");
  });
});
