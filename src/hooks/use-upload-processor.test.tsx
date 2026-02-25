/**
 * Tests for upload processor hook.
 * The hook auto-processes pending items via useEffect.
 * @module hooks/use-upload-processor.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useUploadProcessor, triggerGeminiProcessing } from "./use-upload-processor";
import { UploadProvider, useUpload } from "@/contexts/upload-context";

// Mock dependencies
vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ error: null })),
      })),
    },
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({
              data: { id: "doc-1", case_id: "case-123" },
              error: null,
            })
          ),
        })),
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() =>
            Promise.resolve({ data: [], error: null })
          ),
        })),
      })),
    })),
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({
          data: { user: { id: "user-123" } },
          error: null,
        })
      ),
      getSession: vi.fn(() =>
        Promise.resolve({
          data: { session: { access_token: "test-token" } },
          error: null,
        })
      ),
    },
  },
}));

vi.mock("@/lib/file-utils", () => ({
  validateFileType: vi.fn(() => true),
  validateFileSize: vi.fn(() => true),
  computeFileHash: vi.fn(() => Promise.resolve("abc123def456")),
  getFileExtension: vi.fn(() => "pdf"),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <UploadProvider>{children}</UploadProvider>
    </QueryClientProvider>
  );
};

describe("useUploadProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fetch for triggerGeminiProcessing calls
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("auto-processes pending items when queue changes", async () => {
    const { result } = renderHook(
      () => {
        const upload = useUpload();
        useUploadProcessor();
        return upload;
      },
      { wrapper: createWrapper() }
    );

    // Add file to queue - useEffect should auto-process
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    act(() => {
      result.current.addToQueue([file], "case-123");
    });

    expect(result.current.queue).toHaveLength(1);

    // Wait for auto-processing to complete
    await waitFor(() => {
      expect(result.current.queue[0].status).toBe("complete");
    });
  });

  it("marks item as failed on validation error", async () => {
    const { validateFileType } = await import("@/lib/file-utils");
    vi.mocked(validateFileType).mockReturnValue(false);

    const { result } = renderHook(
      () => {
        const upload = useUpload();
        useUploadProcessor();
        return upload;
      },
      { wrapper: createWrapper() }
    );

    const file = new File(["content"], "test.exe", {
      type: "application/x-msdownload",
    });

    act(() => {
      result.current.addToQueue([file], "case-123");
    });

    await waitFor(() => {
      expect(result.current.queue[0].status).toBe("failed");
      expect(result.current.queue[0].error).toContain("Invalid file type");
    });
  });

  it("does not double-process items", async () => {
    // Reset mocks to ensure validateFileType returns true
    const { validateFileType } = await import("@/lib/file-utils");
    vi.mocked(validateFileType).mockReturnValue(true);

    const { result } = renderHook(
      () => {
        const upload = useUpload();
        useUploadProcessor();
        return upload;
      },
      { wrapper: createWrapper() }
    );

    // Add multiple files at once
    const file1 = new File(["content1"], "test1.pdf", { type: "application/pdf" });
    const file2 = new File(["content2"], "test2.pdf", { type: "application/pdf" });

    act(() => {
      result.current.addToQueue([file1, file2], "case-123");
    });

    expect(result.current.queue).toHaveLength(2);

    // Both should complete successfully
    await waitFor(() => {
      expect(result.current.queue[0].status).toBe("complete");
      expect(result.current.queue[1].status).toBe("complete");
    });
  });

  it("processes each file exactly once even under rapid queue updates", async () => {
    // Track how many times each file is uploaded
    const uploadCounts = new Map<string, number>();
    const { supabase } = await import("@/lib/supabase");

    vi.mocked(supabase.storage.from).mockImplementation(() => ({
      upload: vi.fn((path: string) => {
        const filename = path.split("/").pop() ?? path;
        uploadCounts.set(filename, (uploadCounts.get(filename) ?? 0) + 1);
        return Promise.resolve({ error: null, data: { path } });
      }),
    }) as unknown as ReturnType<typeof supabase.storage.from>);

    // Ensure validation passes
    const { validateFileType, computeFileHash } = await import("@/lib/file-utils");
    vi.mocked(validateFileType).mockReturnValue(true);

    // Return unique hash per file to avoid duplicate detection
    let hashCounter = 0;
    vi.mocked(computeFileHash).mockImplementation(() =>
      Promise.resolve(`unique-hash-${hashCounter++}`)
    );

    const { result } = renderHook(
      () => {
        const upload = useUpload();
        useUploadProcessor();
        return upload;
      },
      { wrapper: createWrapper() }
    );

    // Add files in rapid succession (simulating rapid user interaction)
    const files = [
      new File(["content1"], "file1.pdf", { type: "application/pdf" }),
      new File(["content2"], "file2.pdf", { type: "application/pdf" }),
      new File(["content3"], "file3.pdf", { type: "application/pdf" }),
    ];

    act(() => {
      result.current.addToQueue([files[0]], "case-123");
    });
    act(() => {
      result.current.addToQueue([files[1]], "case-123");
    });
    act(() => {
      result.current.addToQueue([files[2]], "case-123");
    });

    expect(result.current.queue).toHaveLength(3);

    // Wait for all to complete
    await waitFor(
      () => {
        expect(result.current.queue.every((item) => item.status === "complete")).toBe(true);
      },
      { timeout: 5000 }
    );

    // Each file should be uploaded exactly once
    // uploadCounts values should all be 1
    const counts = Array.from(uploadCounts.values());
    expect(counts.every((count) => count === 1)).toBe(true);
    expect(counts.length).toBe(3);
  });
});

describe("triggerGeminiProcessing", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls /api/gemini/process with document ID", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    await triggerGeminiProcessing("doc-123", "access-token-xyz");

    expect(fetch).toHaveBeenCalledWith("/api/gemini/process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer access-token-xyz",
      },
      body: JSON.stringify({ documentId: "doc-123" }),
    });
  });

  it("does not throw on failure (fire-and-forget)", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

    // Should not throw
    await expect(
      triggerGeminiProcessing("doc-123", "token")
    ).resolves.toBeUndefined();
  });
});
