/**
 * Tests for the browser CRM config query hook.
 * @module hooks/__tests__/use-crm-config
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crmConfigKeys, useCrmConfig } from "../use-crm-config";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

describe("useCrmConfig", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads CRM config from the API route", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      hasConfig: true,
      config: {
        deal_label: "Policy",
        deal_stages: ["lead", "quoted"],
        contact_types: ["prospect"],
        company_label: "Account",
        company_industries: ["carrier"],
        interaction_types: ["call"],
        deal_contact_roles: ["insured"],
        deal_custom_fields: [],
        contact_custom_fields: [],
        company_custom_fields: [],
        task_custom_fields: [],
      },
    }), { status: 200 }));

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCrmConfig(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data?.config.deal_label).toBe("Policy"));
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/crm/config");
  });

  it("surfaces the route error message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: "Failed to load CRM config.",
    }), { status: 500 }));

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCrmConfig(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.error?.message).toBe("Failed to load CRM config.");
  });
});

describe("crmConfigKeys", () => {
  it("uses a stable cache key", () => {
    expect(crmConfigKeys.current()).toEqual(["crm-config", "current"]);
  });
});

describe("useCrmConfig freshness", () => {
  it("uses a 30 second stale time", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      hasConfig: false,
      config: {
        deal_label: "Deal",
        deal_stages: ["leads"],
        contact_types: ["buyer"],
        company_label: "Company",
        company_industries: ["developer"],
        interaction_types: ["call"],
        deal_contact_roles: ["buyer"],
        deal_custom_fields: [],
        contact_custom_fields: [],
        company_custom_fields: [],
        task_custom_fields: [],
      },
    }), { status: 200 }));

    const { queryClient, wrapper } = createWrapper();
    renderHook(() => useCrmConfig(), { wrapper });

    await waitFor(() => {
      const query = queryClient.getQueryCache().find({ queryKey: crmConfigKeys.current() });
      expect(query).toBeDefined();
      expect(query?.options.staleTime).toBe(30_000);
    });
  });
});
