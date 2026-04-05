/**
 * Tests for the unified CRM timeline hook.
 * @module hooks/__tests__/use-unified-timeline
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useUnifiedTimeline } from "../use-unified-timeline";

const mockFrom = vi.fn();
const mockUseRealtimeTable = vi.fn();
const mockUseContactInteractions = vi.fn();
const mockUseDealInteractions = vi.fn();

vi.mock("@/hooks/use-client-id", () => ({
  useClientId: () => ({ data: "client-1", isLoading: false }),
}));

vi.mock("@/hooks/use-realtime", () => ({
  useRealtimeTable: (options: unknown) => mockUseRealtimeTable(options),
}));

vi.mock("@/hooks/use-contact-relations", () => ({
  useContactInteractions: (recordId: string) => mockUseContactInteractions(recordId),
  useDealInteractions: (recordId: string) => mockUseDealInteractions(recordId),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

function createQueryBuilder(data: unknown) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    then(
      resolve: (value: { data: unknown; error: null }) => void,
      reject?: (reason: unknown) => void,
    ) {
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };

  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);

  return builder;
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useUnifiedTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseContactInteractions.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseDealInteractions.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it("merges audit activities with contact interactions and sorts by newest first", async () => {
    mockFrom.mockReturnValue(
      createQueryBuilder([
        {
          id: "activity-1",
          client_id: "client-1",
          record_type: "contact",
          record_id: "contact-1",
          name: "contact.created",
          properties: {
            after: {
              first_name: "Sarah",
              last_name: "Tan",
            },
          },
          actor_type: "user",
          actor_label: null,
          happened_at: "2026-04-01T09:00:00.000Z",
          created_at: "2026-04-01T09:00:00.000Z",
          updated_at: "2026-04-01T09:00:00.000Z",
        },
        {
          id: "activity-2",
          client_id: "client-1",
          record_type: "contact",
          record_id: "contact-1",
          name: "contact.updated",
          properties: {
            updatedFields: ["phone"],
            diff: {
              phone: { before: null, after: "+65 9876 5432" },
            },
            before: {
              first_name: "Sarah",
              last_name: "Tan",
              phone: null,
            },
            after: {
              first_name: "Sarah",
              last_name: "Tan",
              phone: "+65 9876 5432",
            },
          },
          actor_type: "agent",
          actor_label: "Sunder",
          happened_at: "2026-04-05T09:00:00.000Z",
          created_at: "2026-04-05T09:00:00.000Z",
          updated_at: "2026-04-05T09:00:00.000Z",
        },
      ]),
    );

    mockUseContactInteractions.mockReturnValue({
      data: [
        {
          interaction_id: "interaction-1",
          client_id: "client-1",
          contact_id: "contact-1",
          deal_id: null,
          type: "call",
          summary: "Discussed Sunday viewing",
          occurred_at: "2026-04-03T09:00:00.000Z",
          created_at: "2026-04-03T09:00:00.000Z",
          updated_at: "2026-04-03T09:00:00.000Z",
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useUnifiedTimeline("contact", "contact-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.entries).toHaveLength(3);
    });

    expect(result.current.entries.map((entry) => entry.kind)).toEqual([
      "audit",
      "interaction",
      "audit",
    ]);
    expect(result.current.entries[0]).toMatchObject({
      kind: "audit",
      data: { id: "activity-2" },
    });
    expect(result.current.entries[1]).toMatchObject({
      kind: "interaction",
      data: { interaction_id: "interaction-1" },
    });
    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "timeline_activities",
      filter: "client_id=eq.client-1",
      queryKeys: [["timeline-activities", "contact", "contact-1"]],
      enabled: true,
    });
  });

  it("uses deal interactions for deal timelines", async () => {
    mockFrom.mockReturnValue(createQueryBuilder([]));
    mockUseDealInteractions.mockReturnValue({
      data: [
        {
          interaction_id: "interaction-1",
          client_id: "client-1",
          contact_id: "contact-1",
          deal_id: "deal-1",
          type: "meeting",
          summary: "Met at the showflat",
          occurred_at: "2026-04-04T09:00:00.000Z",
          created_at: "2026-04-04T09:00:00.000Z",
          updated_at: "2026-04-04T09:00:00.000Z",
          contacts: { first_name: "Sarah", last_name: "Tan" },
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useUnifiedTimeline("deal", "deal-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
    });

    expect(mockUseContactInteractions).toHaveBeenCalledWith("");
    expect(mockUseDealInteractions).toHaveBeenCalledWith("deal-1");
    expect(result.current.entries[0]).toMatchObject({
      kind: "interaction",
      data: { interaction_id: "interaction-1" },
    });
  });
});
