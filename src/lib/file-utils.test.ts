/**
 * Tests for file validation and processing utilities.
 * @module lib/file-utils.test
 */
import { describe, it, expect } from "vitest";
import {
  validateFileType,
  validateFileSize,
  computeFileHash,
  getFileExtension,
  MAX_FILE_SIZE,
} from "./file-utils";

describe("validateFileType", () => {
  it("accepts PDF files", () => {
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    expect(validateFileType(file)).toBe(true);
  });

  it("accepts JPEG files", () => {
    const file = new File(["content"], "test.jpg", { type: "image/jpeg" });
    expect(validateFileType(file)).toBe(true);
  });

  it("accepts PNG files", () => {
    const file = new File(["content"], "test.png", { type: "image/png" });
    expect(validateFileType(file)).toBe(true);
  });

  it("accepts WEBP files", () => {
    const file = new File(["content"], "test.webp", { type: "image/webp" });
    expect(validateFileType(file)).toBe(true);
  });

  it("accepts TXT files", () => {
    const file = new File(["content"], "test.txt", { type: "text/plain" });
    expect(validateFileType(file)).toBe(true);
  });

  it("rejects EXE files", () => {
    const file = new File(["content"], "test.exe", {
      type: "application/x-msdownload",
    });
    expect(validateFileType(file)).toBe(false);
  });

  it("rejects files without extension", () => {
    const file = new File(["content"], "test", { type: "" });
    expect(validateFileType(file)).toBe(false);
  });

  it("accepts files by extension when MIME type missing", () => {
    const file = new File(["content"], "document.pdf", { type: "" });
    expect(validateFileType(file)).toBe(true);
  });
});

describe("validateFileSize", () => {
  it("accepts files under 50MB", () => {
    const file = new File(["x".repeat(1000)], "test.pdf", {
      type: "application/pdf",
    });
    expect(validateFileSize(file)).toBe(true);
  });

  it("rejects files over 50MB", () => {
    // Mock file with size property
    const file = {
      name: "large.pdf",
      type: "application/pdf",
      size: 60 * 1024 * 1024, // 60MB
    } as File;
    expect(validateFileSize(file)).toBe(false);
  });

  it("accepts files exactly 50MB", () => {
    const file = {
      name: "exact.pdf",
      type: "application/pdf",
      size: MAX_FILE_SIZE,
    } as File;
    expect(validateFileSize(file)).toBe(true);
  });
});

describe("computeFileHash", () => {
  /**
   * Creates a mock File with arrayBuffer support for testing.
   */
  function createMockFile(content: string, name: string): File {
    const blob = new Blob([content], { type: "text/plain" });
    const file = new File([blob], name, { type: "text/plain" });
    return file;
  }

  /**
   * Creates a File with raw binary bytes.
   */
  function createBinaryFile(bytes: Uint8Array, name: string): File {
    const blob = new Blob([bytes as unknown as BlobPart], { type: "application/octet-stream" });
    return new File([blob], name, { type: "application/octet-stream" });
  }

  it("computes SHA-256 hash of file content", async () => {
    const content = "Hello, World!";
    const file = createMockFile(content, "test.txt");

    const hash = await computeFileHash(file);

    // SHA-256 of "Hello, World!"
    expect(hash).toBe(
      "dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f"
    );
  });

  it("returns different hashes for different content", async () => {
    const file1 = createMockFile("content1", "test1.txt");
    const file2 = createMockFile("content2", "test2.txt");

    const hash1 = await computeFileHash(file1);
    const hash2 = await computeFileHash(file2);

    expect(hash1).not.toBe(hash2);
  });

  it("correctly hashes binary files without corruption", async () => {
    // Binary bytes including null byte and high bytes (would corrupt if read as text)
    const binaryBytes = new Uint8Array([0x00, 0x01, 0xff, 0xfe, 0x80, 0x7f]);
    const file = createBinaryFile(binaryBytes, "binary.bin");

    const hash = await computeFileHash(file);

    // Pre-computed SHA-256 of bytes [0x00, 0x01, 0xff, 0xfe, 0x80, 0x7f]
    // Verified via: node -e "require('crypto').createHash('sha256').update(Buffer.from([0,1,255,254,128,127])).digest('hex')"
    expect(hash).toBe(
      "ab3bc7e0b12dcd973d0c7e56319c6142b9ccd60dd86d4f2594fa10648bb8cdc5"
    );
  });
});

describe("getFileExtension", () => {
  it("extracts extension from filename", () => {
    expect(getFileExtension("document.pdf")).toBe("pdf");
    expect(getFileExtension("image.JPEG")).toBe("jpeg");
    expect(getFileExtension("file.name.txt")).toBe("txt");
  });

  it("returns empty string for no extension", () => {
    expect(getFileExtension("noextension")).toBe("");
  });
});
