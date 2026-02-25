/**
 * @file Tests for ExtendAI client
 */
import { describe, it, expect } from "vitest";
import { createUploadFormData } from "../extend-ai";

describe("createUploadFormData", () => {
  it("creates FormData with PDF bytes and filename", () => {
    const testBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const formData = createUploadFormData(testBytes, "child-split-1.pdf");

    // FormData should have a 'file' field
    const file = formData.get("file");
    expect(file).toBeInstanceOf(Blob);
    expect((file as Blob).type).toBe("application/pdf");
  });

  it("uses default filename if not provided", () => {
    const testBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const formData = createUploadFormData(testBytes);

    const file = formData.get("file");
    expect(file).toBeInstanceOf(Blob);
  });
});

describe("buildExtractionPayload", () => {
  it("uses fileUrl when provided", async () => {
    const { buildExtractionPayload } = await import("../extend-ai");

    const payload = buildExtractionPayload({
      processorId: "proc-123",
      fileUrl: "https://example.com/file.pdf",
      config: {
        type: "EXTRACT",
        baseProcessor: "base",
        baseVersion: "v1",
        schema: {},
        advancedOptions: {},
      },
    });

    expect(payload.file).toEqual({ fileUrl: "https://example.com/file.pdf" });
  });

  it("uses fileId when provided", async () => {
    const { buildExtractionPayload } = await import("../extend-ai");

    const payload = buildExtractionPayload({
      processorId: "proc-123",
      fileId: "file_abc123",
      config: {
        type: "EXTRACT",
        baseProcessor: "base",
        baseVersion: "v1",
        schema: {},
        advancedOptions: {},
      },
    });

    expect(payload.file).toEqual({ fileId: "file_abc123" });
  });

  it("prefers fileId over fileUrl when both provided", async () => {
    const { buildExtractionPayload } = await import("../extend-ai");

    const payload = buildExtractionPayload({
      processorId: "proc-123",
      fileUrl: "https://example.com/file.pdf",
      fileId: "file_abc123",
      config: {
        type: "EXTRACT",
        baseProcessor: "base",
        baseVersion: "v1",
        schema: {},
        advancedOptions: {},
      },
    });

    expect(payload.file).toEqual({ fileId: "file_abc123" });
  });

  it("throws if neither fileUrl nor fileId provided", async () => {
    const { buildExtractionPayload } = await import("../extend-ai");

    expect(() =>
      buildExtractionPayload({
        processorId: "proc-123",
        config: {
          type: "EXTRACT",
          baseProcessor: "base",
          baseVersion: "v1",
          schema: {},
          advancedOptions: {},
        },
      })
    ).toThrow("fileUrl or fileId required");
  });
});
