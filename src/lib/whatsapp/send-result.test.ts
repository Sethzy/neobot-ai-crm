/**
 * Tests for OpenClaw callback utility.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendWhatsAppResult, formatProcessingResult } from "./send-result";

// Mock fetch globally
const mockFetch = vi.fn().mockResolvedValue({ ok: true });
global.fetch = mockFetch;

// Mock HMAC
vi.mock("./hmac", () => ({
  generateWebhookSignature: vi.fn(() => ({
    signature: "abc123",
    timestamp: "1234567890",
  })),
}));

describe("formatProcessingResult", () => {
  it("formats successful extraction result", () => {
    const result = formatProcessingResult({
      filename: "invoice.pdf",
      documentType: "Medical Expense",
      extractedData: {
        amount: "$1,234.56",
        provider: "ABC Hospital",
        date: "2026-01-15",
      },
      caseId: "case-123",
      appUrl: "https://sunder.app",
    });

    expect(result).toContain("invoice.pdf");
    expect(result).toContain("Medical Expense");
    expect(result).toContain("$1,234.56");
    expect(result).toContain("https://sunder.app/cases/case-123");
  });

  it("formats error result", () => {
    const result = formatProcessingResult({
      filename: "corrupted.pdf",
      error: "Unable to read PDF file",
      caseId: "case-123",
      appUrl: "https://sunder.app",
    });

    expect(result).toContain("corrupted.pdf");
    expect(result).toContain("Unable to read PDF file");
  });
});

describe("sendWhatsAppResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENCLAW_CALLBACK_URL = "https://openclaw.example.com/hooks/wake";
    process.env.WEBHOOK_SECRET = "test-secret";
  });

  it("sends result to OpenClaw callback URL", async () => {
    await sendWhatsAppResult({
      phone: "+15551234567",
      message: "Document processed successfully!",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://openclaw.example.com/hooks/wake",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-webhook-signature": "abc123",
          "x-webhook-timestamp": "1234567890",
        }),
      })
    );
  });

  it("includes phone and message in payload", async () => {
    await sendWhatsAppResult({
      phone: "+15551234567",
      message: "Your document has been processed!",
    });

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body).toEqual(
      expect.objectContaining({
        to: "+15551234567",
        message: "Your document has been processed!",
        deliver: true,
        channel: "whatsapp",
      })
    );
  });
});
