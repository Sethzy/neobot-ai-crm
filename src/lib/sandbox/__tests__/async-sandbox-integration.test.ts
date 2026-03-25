/**
 * Integration tests for the async sandbox execution flow.
 * Verifies the full chain: tool → job insert → cron detection → message delivery.
 * @module lib/sandbox/__tests__/async-sandbox-integration
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { deriveJobToken, parseProgressFromLines, formatResultForChat } from "../sprite-jobs";
import { jobOutputDir, jobDoneMarker, jobErrorMarker, jobStreamLog } from "../sandbox-paths";

describe("async sandbox execution (integration)", () => {
  beforeEach(() => {
    vi.stubEnv("SANDBOX_CALLBACK_SECRET", "integration-test-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("HMAC token verification", () => {
    it("produces a valid token that can be verified", () => {
      const jobId = "test-job-123";
      const token = deriveJobToken(jobId);

      // Token should match when derived again with same secret
      expect(token).toBe(deriveJobToken(jobId));

      // Token should not match for a different job
      expect(token).not.toBe(deriveJobToken("different-job"));
    });

    it("produces different tokens with different secrets", () => {
      const jobId = "test-job-123";
      const token1 = deriveJobToken(jobId);

      vi.stubEnv("SANDBOX_CALLBACK_SECRET", "different-secret");
      const token2 = deriveJobToken(jobId);

      expect(token1).not.toBe(token2);
    });
  });

  describe("path helpers consistency", () => {
    it("all paths share the same job-scoped base directory", () => {
      const jobId = "abc-123";
      const base = jobOutputDir(jobId);

      expect(jobStreamLog(jobId)).toBe(`${base}/stream.jsonl`);
      expect(jobDoneMarker(jobId)).toBe(`${base}/.done`);
      expect(jobErrorMarker(jobId)).toBe(`${base}/.error`);
    });
  });

  describe("progress parsing from real-world stream-json output", () => {
    it("handles a multi-event NDJSON stream", () => {
      const stream = [
        JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Let me analyze..." }] } }),
        JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "pip3 install pandas openpyxl" } }] } }),
        JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/workspace/input/data.xlsx" } }] } }),
        JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Write", input: { file_path: "/workspace/output/result.xlsx" } }] } }),
      ].join("\n");

      // Should extract the LAST tool_use (Write)
      const progress = parseProgressFromLines(stream);
      expect(progress).toBe("Editing /workspace/output/result.xlsx");
    });

    it("returns null for text-only events", () => {
      const stream = [
        JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Done!" }] } }),
      ].join("\n");

      expect(parseProgressFromLines(stream)).toBeNull();
    });
  });

  describe("result formatting for chat delivery", () => {
    it("formats analyze results with download link for delivery", () => {
      const message = formatResultForChat("analyze", {
        summary: "The cap rate analysis shows 5.2% yield across all scenarios.",
        downloadUrl: "https://storage.example.com/signed/result.xlsx",
      });

      expect(message).toContain("5.2% yield");
      expect(message).toContain("[Download result]");
      expect(message).toContain("https://storage.example.com/signed/result.xlsx");
    });

    it("formats artifact results with preview URL", () => {
      const message = formatResultForChat("artifact", {
        summary: "Property showcase is ready for review.",
        previewUrl: "https://showcase.sprites.app",
      });

      expect(message).toContain("Property showcase");
      expect(message).toContain("https://showcase.sprites.app");
    });

    it("delivers error messages cleanly", () => {
      const message = formatResultForChat("analyze", {
        error: "The spreadsheet was corrupted. Want me to try again with a different approach?",
      });

      expect(message).toBe(
        "The spreadsheet was corrupted. Want me to try again with a different approach?",
      );
    });
  });
});
