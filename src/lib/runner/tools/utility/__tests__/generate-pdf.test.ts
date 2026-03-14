/**
 * Tests for the generate_pdf tool.
 * @module lib/runner/tools/utility/__tests__/generate-pdf
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---
const { mockGenerateText, mockRenderToBuffer, mockUpload, mockGetPublicUrl } =
  vi.hoisted(() => ({
    mockGenerateText: vi.fn(),
    mockRenderToBuffer: vi.fn(),
    mockUpload: vi.fn(),
    mockGetPublicUrl: vi.fn(),
  }));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: mockGenerateText,
  };
});

vi.mock("@json-render/react-pdf/render", () => ({
  renderToBuffer: mockRenderToBuffer,
}));

vi.mock("@/lib/ai/gateway", () => ({
  gateway: vi.fn((model: string) => model),
  gatewayProviderOptions: undefined,
  TIER_1_MODEL: "google/gemini-3-flash",
}));

import { createGeneratePdfTool } from "../generate-pdf";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

function createMockSupabase() {
  return {
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      })),
    },
  };
}

/** Helper: valid JSONL that produces a minimal Document→Page spec. */
function validJsonl() {
  return [
    '{"op":"add","path":"/root","value":"doc"}',
    '{"op":"add","path":"/elements/doc","value":{"type":"Document","props":{"title":"Test"},"children":["page"]}}',
    '{"op":"add","path":"/elements/page","value":{"type":"Page","props":{"size":"A4"},"children":[]}}',
  ].join("\n");
}

describe("createGeneratePdfTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a generate_pdf tool with an execute function", () => {
    const supabase = createMockSupabase();
    const { generate_pdf } = createGeneratePdfTool(supabase as never, CLIENT_ID);
    expect(generate_pdf).toBeDefined();
    expect(generate_pdf).toHaveProperty("execute");
  });

  it("returns success with a download URL on valid generation", async () => {
    mockGenerateText.mockResolvedValue({
      text: validJsonl(),
      totalUsage: { inputTokens: 500, outputTokens: 300 },
    });

    const fakePdfBuffer = new Uint8Array([37, 80, 68, 70]); // %PDF
    mockRenderToBuffer.mockResolvedValue(fakePdfBuffer);

    mockUpload.mockResolvedValue({ data: { path: "test.pdf" }, error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://storage.example.com/test.pdf" },
    });

    const supabase = createMockSupabase();
    const { generate_pdf } = createGeneratePdfTool(supabase as never, CLIENT_ID);

    const result = await generate_pdf.execute(
      {
        description: "A simple test document",
        filename: "test-doc",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: true,
      filename: "test-doc.pdf",
    });
    expect(result).toHaveProperty("download_url");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(mockRenderToBuffer).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  it("returns an error when the inner LLM produces an empty spec", async () => {
    mockGenerateText.mockResolvedValue({
      text: "",
      totalUsage: { inputTokens: 100, outputTokens: 0 },
    });

    const supabase = createMockSupabase();
    const { generate_pdf } = createGeneratePdfTool(supabase as never, CLIENT_ID);

    const result = await generate_pdf.execute(
      { description: "Empty test document" },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: false,
    });
    expect(result).toHaveProperty("error");
  });

  it("returns an error when the inner LLM produces malformed JSONL", async () => {
    mockGenerateText.mockResolvedValue({
      text: "This is not valid JSONL at all\n{broken json",
      totalUsage: { inputTokens: 200, outputTokens: 50 },
    });

    const supabase = createMockSupabase();
    const { generate_pdf } = createGeneratePdfTool(supabase as never, CLIENT_ID);

    const result = await generate_pdf.execute(
      { description: "Malformed JSONL test document" },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: false,
    });
    expect(result).toHaveProperty("error");
  });

  it("returns an error when PDF rendering fails", async () => {
    mockGenerateText.mockResolvedValue({
      text: validJsonl(),
      totalUsage: { inputTokens: 500, outputTokens: 300 },
    });
    mockRenderToBuffer.mockRejectedValue(new Error("Render failed"));

    const supabase = createMockSupabase();
    const { generate_pdf } = createGeneratePdfTool(supabase as never, CLIENT_ID);

    const result = await generate_pdf.execute(
      { description: "A broken document test" },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("Render failed"),
    });
  });

  it("returns an error when Supabase upload fails", async () => {
    mockGenerateText.mockResolvedValue({
      text: validJsonl(),
      totalUsage: { inputTokens: 500, outputTokens: 300 },
    });
    mockRenderToBuffer.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    mockUpload.mockResolvedValue({
      data: null,
      error: { message: "Storage quota exceeded" },
    });

    const supabase = createMockSupabase();
    const { generate_pdf } = createGeneratePdfTool(supabase as never, CLIENT_ID);

    const result = await generate_pdf.execute(
      { description: "Upload failure test document" },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("Storage quota exceeded"),
    });
  });

  it("generates a sanitized filename from the description when no filename is provided", async () => {
    mockGenerateText.mockResolvedValue({
      text: validJsonl(),
      totalUsage: { inputTokens: 500, outputTokens: 300 },
    });
    mockRenderToBuffer.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    mockUpload.mockResolvedValue({ data: { path: "doc.pdf" }, error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://storage.example.com/doc.pdf" },
    });

    const supabase = createMockSupabase();
    const { generate_pdf } = createGeneratePdfTool(supabase as never, CLIENT_ID);

    const result = await generate_pdf.execute(
      { description: "Client Brief for John Tan - March 2026" },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({ success: true });
    // Filename should be derived from description, sanitized
    expect((result as { filename: string }).filename).toMatch(/\.pdf$/);
    expect((result as { filename: string }).filename).not.toContain(" ");
    expect((result as { filename: string }).filename).not.toMatch(/[A-Z]/);
  });
});
