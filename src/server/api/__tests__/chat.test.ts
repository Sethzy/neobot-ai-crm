/**
 * @fileoverview Tests for AI Analyst chat API endpoint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "test-anon-key";

// Mock dependencies
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockSupabase),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: MockAnthropicClient,
}));

vi.mock("../../src/lib/docgen/json-generator", () => ({
  convertSplitsToJSON: vi.fn(() => '{"splits": []}'),
}));

vi.mock("../../src/clients/skill-registry", () => ({
  getDocgenSkillId: vi.fn(() => null),
}));

vi.mock("../../src/lib/report-history", () => ({
  saveGeneratedFileToReportHistory: vi.fn(),
}));

const mockSupabase = {
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    }),
  },
  rpc: vi.fn().mockResolvedValue({ data: "default" }),
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue({ data: [] }),
        }),
      }),
    }),
  }),
};

const mockFilesUpload = vi.fn().mockResolvedValue({ id: "file_123" });
const mockFilesRetrieveMetadata = vi
  .fn()
  .mockResolvedValue({ filename: "data.json" });

const createMockStream = () => {
  const events = [
    { type: "message_start", message: { container: { id: "container_abc" } } },
    { type: "content_block_start", content_block: { type: "text" } },
    { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
    { type: "message_stop" },
  ];

  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
    finalMessage: vi.fn().mockResolvedValue({
      container: { id: "container_abc" },
      model: "claude-test",
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: "text", text: "Hello" }],
    }),
  };
};

const mockMessagesStream = vi.fn().mockImplementation(() => createMockStream());

class MockAnthropicClient {
  beta = {
    files: {
      upload: mockFilesUpload,
      retrieveMetadata: mockFilesRetrieveMetadata,
    },
    messages: {
      stream: mockMessagesStream,
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Hello" }],
        container: { id: "container_abc" },
      }),
    },
  };
}

// Helper to create mock request/response
function createMockReqRes(options: {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}) {
  const req = {
    method: options.method ?? "POST",
    headers: options.headers ?? {},
    body: options.body ?? {},
  } as VercelRequest;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    write: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  } as unknown as VercelResponse;

  return { req, res };
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects requests without authorization header", async () => {
    const { req, res } = createMockReqRes({
      method: "POST",
      headers: {},
      body: {
        messages: [
          { id: "1", role: "user", parts: [{ type: "text", text: "Hi" }] },
        ],
        caseId: "550e8400-e29b-41d4-a716-446655440000",
      },
    });

    const handler = (await import("../chat")).default;
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "Missing authorization token",
    });
  });

  it("rejects non-POST methods", async () => {
    const { req, res } = createMockReqRes({
      method: "GET",
      headers: { authorization: "Bearer token123" },
    });

    const handler = (await import("../chat")).default;
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: "Method not allowed" });
  });

  it("rejects invalid request body", async () => {
    const { req, res } = createMockReqRes({
      method: "POST",
      headers: { authorization: "Bearer token123" },
      body: {
        messages: [],
        caseId: "not-a-uuid",
      },
    });

    const handler = (await import("../chat")).default;
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid request" })
    );
  });
});

describe("First message flow (Anthropic SDK)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads JSON via Files API and creates container", async () => {
    // Mock splits data
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "split-1",
                  tag_id: "invoice",
                  document_date: "2024-01-15",
                  identifier: "INV-001",
                  potential_duplicate: null,
                  extracted_data: { amount: 100 },
                },
              ],
            }),
          }),
        }),
      }),
    });

    const { req, res } = createMockReqRes({
      method: "POST",
      headers: { authorization: "Bearer token123" },
      body: {
        messages: [
          {
            id: "msg-1",
            role: "user",
            parts: [{ type: "text", text: "Analyze my invoices" }],
          },
        ],
        caseId: "550e8400-e29b-41d4-a716-446655440000",
      },
    });

    const handler = (await import("../chat")).default;
    await handler(req, res);

    expect(mockFilesUpload).toHaveBeenCalled();
    expect(mockFilesRetrieveMetadata).toHaveBeenCalled();
    expect(mockMessagesStream).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
    expect(res.write).toHaveBeenCalledWith(
      expect.stringContaining('"type":"metadata"')
    );
    expect(res.write).toHaveBeenCalledWith(
      expect.stringContaining('"containerId":"container_abc"')
    );
    expect(res.end).toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("returns 400 when no extracted documents found", async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
      }),
    });

    const { req, res } = createMockReqRes({
      method: "POST",
      headers: { authorization: "Bearer token123" },
      body: {
        messages: [
          {
            id: "msg-1",
            role: "user",
            parts: [{ type: "text", text: "Analyze" }],
          },
        ],
        caseId: "550e8400-e29b-41d4-a716-446655440000",
      },
    });

    const handler = (await import("../chat")).default;
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "No extracted documents found for this case",
    });
  });
});
