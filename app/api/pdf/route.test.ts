/**
 * Tests for the PDF render API route.
 * @module app/api/pdf/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockRenderToBuffer,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockRenderToBuffer: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", async () => {
  const { buildAuthenticateAndParseBody } = await import("@/test/mocks/route-helpers");

  return {
    authenticateRequest: mockAuthenticateRequest,
    authenticateAndParseBody: buildAuthenticateAndParseBody(
      () => mockAuthenticateRequest(),
      (message: string, status: number) =>
        new Response(JSON.stringify({ error: message }), { status }),
    ),
    jsonError: (message: string, status: number) =>
      new Response(JSON.stringify({ error: message }), { status }),
  };
});

vi.mock("@json-render/react-pdf/render", () => ({
  renderToBuffer: (...args: unknown[]) => mockRenderToBuffer(...args),
}));

import { POST } from "./route";

function buildRequest(
  body: unknown,
  headers: HeadersInit = { "Content-Type": "application/json" },
): Request {
  return new Request("http://localhost/api/pdf", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: {},
      userId: "user-1",
    });
    mockRenderToBuffer.mockResolvedValue(Buffer.from("%PDF-1.4"));
  });

  it("returns 413 when the request body exceeds the configured limit", async () => {
    const response = await POST(
      buildRequest(
        {
          spec: {
            root: "root",
            elements: {
              root: {
                type: "Document",
                props: {},
              },
            },
          },
        },
        {
          "Content-Type": "application/json",
          "Content-Length": String(300 * 1024),
        },
      ),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Payload too large" });
    expect(mockAuthenticateRequest).not.toHaveBeenCalled();
    expect(mockRenderToBuffer).not.toHaveBeenCalled();
  });

  it("returns 400 when spec.root does not reference an existing element", async () => {
    const response = await POST(
      buildRequest({
        spec: {
          root: "missing",
          elements: {
            root: {
              type: "Document",
              props: {},
            },
          },
        },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid request body.",
    });
    expect(mockRenderToBuffer).not.toHaveBeenCalled();
  });

  it("renders a PDF for a valid bounded spec", async () => {
    const response = await POST(
      buildRequest({
        spec: {
          root: "root",
          elements: {
            root: {
              type: "Document",
              props: {},
              children: ["page"],
            },
            page: {
              type: "Page",
              props: {},
              children: ["text"],
            },
            text: {
              type: "Text",
              props: { children: "Hello" },
            },
          },
        },
        download: true,
        filename: "Client Brief",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="client-brief.pdf"',
    );
    expect(mockRenderToBuffer).toHaveBeenCalledWith({
      root: "root",
      elements: {
        root: {
          type: "Document",
          props: {},
          children: ["page"],
        },
        page: {
          type: "Page",
          props: {},
          children: ["text"],
        },
        text: {
          type: "Text",
          props: { children: "Hello" },
        },
      },
    });
  });
});
