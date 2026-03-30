/**
 * Tests for Composio file bridge helpers — download detection, storage persistence, upload resolution.
 * @module lib/composio/__tests__/file-bridge
 */
import { describe, expect, it } from "vitest";

import { findDownloadedFile } from "../file-bridge";

describe("findDownloadedFile", () => {
  it("returns null for non-object data", () => {
    expect(findDownloadedFile(null)).toBeNull();
    expect(findDownloadedFile(undefined)).toBeNull();
    expect(findDownloadedFile("string")).toBeNull();
    expect(findDownloadedFile(42)).toBeNull();
  });

  it("returns null when no file download fields present", () => {
    expect(findDownloadedFile({ success: true, data: "some text" })).toBeNull();
  });

  it("detects top-level file download result", () => {
    const result = findDownloadedFile({
      uri: "/tmp/composio/report.xlsx",
      file_downloaded: true,
      s3url: "https://s3.example.com/file.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(result).toEqual({
      uri: "/tmp/composio/report.xlsx",
      file_downloaded: true,
      s3url: "https://s3.example.com/file.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  });

  it("detects one-level nested file download result", () => {
    const result = findDownloadedFile({
      response_data: {
        uri: "/tmp/composio/photo.jpg",
        file_downloaded: true,
        s3url: "https://s3.example.com/photo.jpg",
        mimeType: "image/jpeg",
      },
    });

    expect(result).toEqual({
      uri: "/tmp/composio/photo.jpg",
      file_downloaded: true,
      s3url: "https://s3.example.com/photo.jpg",
      mimeType: "image/jpeg",
    });
  });

  it("returns the shape even when file_downloaded is false", () => {
    const result = findDownloadedFile({
      uri: "",
      file_downloaded: false,
      s3url: "https://s3.example.com/file.xlsx",
      mimeType: "application/octet-stream",
    });

    expect(result).not.toBeNull();
    expect(result!.file_downloaded).toBe(false);
  });

  it("returns null when uri is missing", () => {
    expect(findDownloadedFile({
      file_downloaded: true,
      s3url: "https://s3.example.com/file.xlsx",
    })).toBeNull();
  });
});
