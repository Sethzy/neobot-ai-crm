/**
 * Tests optimistic CRM column-width persistence.
 * @module hooks/__tests__/use-update-field-width
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CRM_DEFAULTS } from "@/lib/crm/config";

import { crmConfigKeys, type CrmConfigResponse } from "../use-crm-config";
import { useUpdateFieldWidth } from "../use-update-field-width";

function createWrapper(initialResponse?: CrmConfigResponse) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  if (initialResponse) {
    queryClient.setQueryData(crmConfigKeys.current(), initialResponse);
  }

  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

function createInitialResponse(): CrmConfigResponse {
  return {
    hasConfig: true,
    config: {
      ...CRM_DEFAULTS,
      contact_fields: CRM_DEFAULTS.contact_fields.map((field) => ({ ...field })),
      company_fields: CRM_DEFAULTS.company_fields.map((field) => ({ ...field })),
      deal_fields: CRM_DEFAULTS.deal_fields.map((field) => ({ ...field })),
    },
  };
}

function replaceWidth(
  response: CrmConfigResponse,
  fieldKey: "contact_fields" | "company_fields" | "deal_fields",
  columnId: string,
  width: number,
): CrmConfigResponse {
  return {
    ...response,
    config: {
      ...response.config,
      [fieldKey]: response.config[fieldKey].map((field) =>
        field.key === columnId ? { ...field, width } : field,
      ),
    },
  };
}

describe("useUpdateFieldWidth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("optimistically updates the crm-config cache and PATCHes the matching field array", async () => {
    const initialResponse = createInitialResponse();
    const serverResponse = replaceWidth(initialResponse, "contact_fields", "name", 334);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(serverResponse), { status: 200 }),
    );

    const { queryClient, wrapper } = createWrapper(initialResponse);
    const { result } = renderHook(() => useUpdateFieldWidth("contacts"), {
      wrapper,
    });

    act(() => {
      result.current.mutate({ columnId: "name", width: 333.6 });
    });

    await waitFor(() => {
      const optimisticResponse = queryClient.getQueryData<CrmConfigResponse>(crmConfigKeys.current());
      expect(
        optimisticResponse?.config.contact_fields.find((field) => field.key === "name")?.width,
      ).toBe(334);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const requestInit = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/crm/config",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
    expect(JSON.parse(String(requestInit.body))).toEqual({
      contact_fields: expect.arrayContaining([
        expect.objectContaining({
          key: "name",
          width: 334,
        }),
      ]),
    });
  });

  it("rolls back the optimistic width when the PATCH request fails", async () => {
    const initialResponse = createInitialResponse();
    let resolveFetch: ((response: Response) => void) | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const { queryClient, wrapper } = createWrapper(initialResponse);
    const { result } = renderHook(() => useUpdateFieldWidth("companies"), {
      wrapper,
    });

    act(() => {
      result.current.mutate({ columnId: "name", width: 360 });
    });

    await waitFor(() => {
      expect(
        queryClient
        .getQueryData<CrmConfigResponse>(crmConfigKeys.current())
        ?.config.company_fields.find((field) => field.key === "name")?.width,
      ).toBe(360);
    });

    resolveFetch?.(new Response(JSON.stringify({ error: "boom" }), { status: 500 }));

    await waitFor(() => expect(result.current.error?.message).toBe("boom"));

    expect(
      queryClient
        .getQueryData<CrmConfigResponse>(crmConfigKeys.current())
        ?.config.company_fields.find((field) => field.key === "name")?.width,
    ).toBe(240);
  });
});
