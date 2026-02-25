/**
 * @file Integration tests for Gemini processing pipeline
 * @description Tests the full flow: Gemini split -> create splits -> extract -> validate
 * NOTE: These tests mock external APIs (Gemini, ExtendAI) and database calls.
 */
import { describe, it, vi, beforeEach } from "vitest";

describe("Gemini Process Pipeline Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("when processing a document with extraction-enabled tags", () => {
    it.todo("creates split rows for each Gemini split");
    it.todo("calls ExtendAI for splits with extendProcessorId");
    it.todo("sets extraction_status to 'complete' when validation passes");
    it.todo("sets extraction_status to 'needs_review' when validation fails");
    it.todo("sets extraction_status to 'failed' when ExtendAI errors");
  });

  describe("when processing with default config (no extraction)", () => {
    it.todo("creates split rows with extraction_status 'complete'");
    it.todo("does not call ExtendAI");
  });

  describe("when EXTEND_API_KEY is not configured", () => {
    it.todo("skips extraction and marks splits 'complete'");
  });
});
