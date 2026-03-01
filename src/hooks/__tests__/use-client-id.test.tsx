/**
 * Tests query hook that resolves auth user to client_id.
 * @module hooks/__tests__/use-client-id
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { clientIdKeys, useClientId } from "../use-client-id";

const mockResolveClientId = vi.fn();

vi.mock("@/hooks/use-session", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { marker: "browser-client" },
}));

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

describe("useClientId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("resolves client id for the authenticated user", async () => {
    const { useSession } = await import("@/hooks/use-session");
    vi.mocked(useSession).mockReturnValue({
      session: null,
      user: { id: "user-1" } as never,
      isLoading: false,
      isAuthenticated: true,
    });
    mockResolveClientId.mockResolvedValue("client-1");

    const { result } = renderHook(() => useClientId(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBe("client-1"));
    expect(mockResolveClientId).toHaveBeenCalledWith(expect.any(Object), "user-1");
  });

  test("is disabled while auth user is unresolved", async () => {
    const { useSession } = await import("@/hooks/use-session");
    vi.mocked(useSession).mockReturnValue({
      session: null,
      user: null,
      isLoading: true,
      isAuthenticated: false,
    });

    const { result } = renderHook(() => useClientId(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(mockResolveClientId).not.toHaveBeenCalled();
  });
});

describe("clientIdKeys", () => {
  test("includes auth user id in cache key", () => {
    expect(clientIdKeys.byUser("user-1")).toEqual(["client-id", "user-1"]);
  });
});
