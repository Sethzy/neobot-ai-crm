/**
 * Tests for connection-ID-prefixed activated tool loading from cached DB schemas.
 * @module lib/composio/__tests__/activated-tools
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockUpdateConnection, mockBridgeDownloadedFile, mockFindDownloadedFile, mockResolveAgentPathForUpload } = vi.hoisted(() => ({
  mockUpdateConnection: vi.fn(),
  mockBridgeDownloadedFile: vi.fn(),
  mockFindDownloadedFile: vi.fn(),
  mockResolveAgentPathForUpload: vi.fn(),
}));

vi.mock("../client", () => ({
  getComposio: vi.fn(),
}));
vi.mock("@/lib/connections/queries", () => ({
  updateConnection: (...args: unknown[]) => mockUpdateConnection(...args),
}));
vi.mock("../file-bridge", () => ({
  findDownloadedFile: (...args: unknown[]) => mockFindDownloadedFile(...args),
  bridgeDownloadedFile: (...args: unknown[]) => mockBridgeDownloadedFile(...args),
  resolveAgentPathForUpload: (...args: unknown[]) => mockResolveAgentPathForUpload(...args),
}));

import { getComposio } from "../client";

import { loadActivatedConnectionTools } from "../activated-tools";

import type { ConnectionRow } from "@/lib/connections/schemas";

function createMockConnection(
  overrides: Partial<ConnectionRow> & { id: string; toolkit_slug: string },
): ConnectionRow {
  return {
    id: overrides.id,
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    composio_connected_account_id: `composio-${overrides.id}`,
    toolkit_slug: overrides.toolkit_slug,
    display_name: null,
    account_identifier: null,
    status: "active",
    activated_tools: [],
    tool_count: 0,
    tool_schemas: {},
    created_at: "2026-03-07T00:00:00.000Z",
    updated_at: "2026-03-07T00:00:00.000Z",
    ...overrides,
  };
}

describe("loadActivatedConnectionTools", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockUpdateConnection.mockReset();
  });

  it("returns an empty ToolSet when no active connections have activated tools", async () => {
    const result = await loadActivatedConnectionTools([
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440001",
        toolkit_slug: "gmail",
        activated_tools: [],
      }),
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440002",
        toolkit_slug: "slack",
        status: "inactive",
        activated_tools: ["SLACK_SEND_MESSAGE"],
      }),
    ]);

    expect(result).toEqual({});
  });

  it("reads schemas from DB row, not Composio API", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ success: true });
    vi.mocked(getComposio).mockReturnValue({
      tools: {
        getRawComposioTools: vi.fn(),
        execute: mockExecute,
      },
    } as never);

    const connections = [
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440003",
        toolkit_slug: "gmail",
        activated_tools: ["GMAIL_SEND_EMAIL"],
        tool_schemas: {
          GMAIL_SEND_EMAIL: {
            description: "Send an email via Gmail",
            inputParameters: {
              type: "object",
              properties: { to: { type: "string" }, subject: { type: "string" } },
              required: ["to", "subject"],
            },
          },
        },
      }),
    ];

    const tools = await loadActivatedConnectionTools(connections);

    expect(Object.keys(tools)).toEqual(["550e8400-e29b-41d4-a716-446655440003__GMAIL_SEND_EMAIL"]);

    // Verify NO Composio API calls for schema loading
    const composio = vi.mocked(getComposio)();
    expect(composio.tools.getRawComposioTools).not.toHaveBeenCalled();
  });

  it("prefixes tool names with the connection id", async () => {
    vi.mocked(getComposio).mockReturnValue({
      tools: {
        getRawComposioTools: vi.fn(),
        execute: vi.fn().mockResolvedValue({ success: true }),
      },
    } as never);

    const result = await loadActivatedConnectionTools([
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440003",
        toolkit_slug: "gmail",
        activated_tools: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
        tool_schemas: {
          GMAIL_SEND_EMAIL: {
            description: "Send email",
            inputParameters: {
              type: "object",
              properties: { to: { type: "string" } },
            },
          },
          GMAIL_READ_EMAIL: {
            description: "Read email",
            inputParameters: { type: "object", properties: {} },
          },
        },
      }),
    ]);

    expect(Object.keys(result).sort()).toEqual([
      "550e8400-e29b-41d4-a716-446655440003__GMAIL_READ_EMAIL",
      "550e8400-e29b-41d4-a716-446655440003__GMAIL_SEND_EMAIL",
    ]);
  });

  it("loads tools for multiple active connections independently", async () => {
    vi.mocked(getComposio).mockReturnValue({
      tools: {
        getRawComposioTools: vi.fn(),
        execute: vi.fn().mockResolvedValue({ success: true }),
      },
    } as never);

    const result = await loadActivatedConnectionTools([
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440004",
        toolkit_slug: "gmail",
        activated_tools: ["GMAIL_SEND_EMAIL"],
        tool_schemas: {
          GMAIL_SEND_EMAIL: {
            description: "Send email",
            inputParameters: { type: "object", properties: {} },
          },
        },
      }),
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440005",
        toolkit_slug: "slack",
        activated_tools: ["SLACK_SEND_MESSAGE"],
        tool_schemas: {
          SLACK_SEND_MESSAGE: {
            description: "Send Slack message",
            inputParameters: { type: "object", properties: {} },
          },
        },
      }),
    ]);

    expect(Object.keys(result).sort()).toEqual([
      "550e8400-e29b-41d4-a716-446655440004__GMAIL_SEND_EMAIL",
      "550e8400-e29b-41d4-a716-446655440005__SLACK_SEND_MESSAGE",
    ]);
  });

  it("skips tools with no cached schema and warns", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(getComposio).mockReturnValue({
      tools: {
        getRawComposioTools: vi.fn(),
        execute: vi.fn().mockResolvedValue({ success: true }),
      },
    } as never);

    const result = await loadActivatedConnectionTools([
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440006",
        toolkit_slug: "gmail",
        activated_tools: ["GMAIL_SEND_EMAIL", "GMAIL_MISSING_TOOL"],
        tool_schemas: {
          GMAIL_SEND_EMAIL: {
            description: "Send email",
            inputParameters: { type: "object", properties: {} },
          },
        },
      }),
    ]);

    expect(Object.keys(result)).toEqual([
      "550e8400-e29b-41d4-a716-446655440006__GMAIL_SEND_EMAIL",
    ]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("No cached schema for GMAIL_MISSING_TOOL"),
    );
    consoleSpy.mockRestore();
  });

  it("executes wrapped tools with the bound connected account id", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ success: true });
    vi.mocked(getComposio).mockReturnValue({
      tools: {
        getRawComposioTools: vi.fn(),
        execute: mockExecute,
      },
    } as never);

    const result = await loadActivatedConnectionTools([
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440007",
        toolkit_slug: "gmail",
        composio_connected_account_id: "ca_personal_gmail",
        activated_tools: ["GMAIL_SEND_EMAIL"],
        tool_schemas: {
          GMAIL_SEND_EMAIL: {
            description: "Send email",
            inputParameters: {
              type: "object",
              properties: {
                to: { type: "string" },
                body: { type: "string" },
              },
              required: ["to"],
            },
          },
        },
      }),
    ]);

    const wrappedTool = result["550e8400-e29b-41d4-a716-446655440007__GMAIL_SEND_EMAIL"];
    expect(wrappedTool).toBeDefined();

    await (wrappedTool as { execute: (args: Record<string, unknown>) => Promise<unknown> }).execute({
      to: "user@example.com",
      body: "Hello",
    });

    expect(mockExecute).toHaveBeenCalledWith("GMAIL_SEND_EMAIL", {
      connectedAccountId: "ca_personal_gmail",
      arguments: {
        to: "user@example.com",
        body: "Hello",
      },
      dangerouslySkipVersionCheck: true,
    });
  });

  it("persists fallback-loaded schemas so existing active connections self-heal", async () => {
    const rawTools = [
      {
        slug: "GMAIL_SEND_EMAIL",
        description: "Send email",
        inputParameters: {
          type: "object",
          properties: { to: { type: "string" } },
        },
      },
    ];
    vi.mocked(getComposio).mockReturnValue({
      tools: {
        getRawComposioTools: vi.fn().mockResolvedValue(rawTools),
        execute: vi.fn().mockResolvedValue({ success: true }),
      },
    } as never);
    mockUpdateConnection.mockResolvedValue({} as never);

    const result = await loadActivatedConnectionTools([
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440008",
        toolkit_slug: "gmail",
        activated_tools: ["GMAIL_SEND_EMAIL"],
        tool_schemas: {},
      }),
    ], {
      supabase: "supabase" as never,
      clientId: "660e8400-e29b-41d4-a716-446655440000",
    });

    expect(Object.keys(result)).toEqual([
      "550e8400-e29b-41d4-a716-446655440008__GMAIL_SEND_EMAIL",
    ]);
    expect(mockUpdateConnection).toHaveBeenCalledWith(
      "supabase",
      "660e8400-e29b-41d4-a716-446655440000",
      {
        id: "550e8400-e29b-41d4-a716-446655440008",
        tool_schemas: {
          GMAIL_SEND_EMAIL: {
            description: "Send email",
            inputParameters: {
              type: "object",
              properties: { to: { type: "string" } },
            },
          },
        },
      },
    );
  });

  it("skips pending connections", async () => {
    const result = await loadActivatedConnectionTools([
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440010",
        toolkit_slug: "gmail",
        status: "pending",
        activated_tools: ["GMAIL_SEND_EMAIL"],
        tool_schemas: {
          GMAIL_SEND_EMAIL: {
            description: "Send email",
            inputParameters: { type: "object", properties: {} },
          },
        },
      }),
    ]);

    expect(result).toEqual({});
  });
});

describe("file bridge integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockBridgeDownloadedFile.mockReset();
    mockFindDownloadedFile.mockReset();
    mockResolveAgentPathForUpload.mockReset();
    mockUpdateConnection.mockReset();
  });

  it("bridges downloaded file when Composio result contains file data", async () => {
    const fileData = {
      uri: "/tmp/composio/report.xlsx",
      file_downloaded: true,
      s3url: "https://s3.example.com/file.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    const mockExecute = vi.fn().mockResolvedValue({ data: fileData, successful: true });
    vi.mocked(getComposio).mockReturnValue({
      tools: { getRawComposioTools: vi.fn(), execute: mockExecute },
    } as never);

    mockFindDownloadedFile.mockReturnValue(fileData);
    mockBridgeDownloadedFile.mockResolvedValue("/agent/home/report.xlsx");

    const mockFileClient = { uploadArtifact: vi.fn(), downloadBinary: vi.fn() };
    const mockGetSandbox = vi.fn().mockReturnValue(null);

    const tools = await loadActivatedConnectionTools([
      createMockConnection({
        id: "conn-file-dl",
        toolkit_slug: "googledrive",
        activated_tools: ["GOOGLEDRIVE_DOWNLOAD_FILE"],
        tool_schemas: {
          GOOGLEDRIVE_DOWNLOAD_FILE: {
            description: "Download file",
            inputParameters: { type: "object", properties: { file_id: { type: "string" } } },
          },
        },
      }),
    ], {
      fileClient: mockFileClient as never,
      getSandbox: mockGetSandbox,
    });

    const dlTool = tools["conn-file-dl__GOOGLEDRIVE_DOWNLOAD_FILE"];
    const result = await (dlTool as { execute: (args: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }> }).execute({ file_id: "abc123" });

    expect(mockBridgeDownloadedFile).toHaveBeenCalledWith({
      fileData,
      fileClient: mockFileClient,
      getSandbox: mockGetSandbox,
    });
    expect(result.data.uri).toBe("/agent/home/report.xlsx");
    expect(result.data.message).toContain("/agent/home/report.xlsx");
  });

  it("passes through non-file results unchanged", async () => {
    const nonFileResult = { data: { threads: [{ id: "t1" }] }, successful: true };
    const mockExecute = vi.fn().mockResolvedValue(nonFileResult);
    vi.mocked(getComposio).mockReturnValue({
      tools: { getRawComposioTools: vi.fn(), execute: mockExecute },
    } as never);

    mockFindDownloadedFile.mockReturnValue(null);

    const tools = await loadActivatedConnectionTools([
      createMockConnection({
        id: "conn-search",
        toolkit_slug: "googledrive",
        activated_tools: ["GOOGLEDRIVE_SEARCH_DOCUMENTS"],
        tool_schemas: {
          GOOGLEDRIVE_SEARCH_DOCUMENTS: {
            description: "Search docs",
            inputParameters: { type: "object", properties: {} },
          },
        },
      }),
    ], {
      fileClient: { uploadArtifact: vi.fn(), downloadBinary: vi.fn() } as never,
      getSandbox: () => null,
    });

    const tool = tools["conn-search__GOOGLEDRIVE_SEARCH_DOCUMENTS"];
    const result = await (tool as { execute: (args: Record<string, unknown>) => Promise<unknown> }).execute({});

    expect(mockBridgeDownloadedFile).not.toHaveBeenCalled();
    expect(result).toEqual(nonFileResult);
  });

  it("resolves /agent/ paths in arguments for upload direction", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ data: { fileId: "new123" }, successful: true });
    vi.mocked(getComposio).mockReturnValue({
      tools: { getRawComposioTools: vi.fn(), execute: mockExecute },
    } as never);

    mockFindDownloadedFile.mockReturnValue(null);
    mockResolveAgentPathForUpload.mockResolvedValue("/tmp/composio-uploads/report-abcd1234.pdf");

    const mockFileClient = { uploadArtifact: vi.fn(), downloadBinary: vi.fn() };

    const tools = await loadActivatedConnectionTools([
      createMockConnection({
        id: "conn-upload",
        toolkit_slug: "googledrive",
        activated_tools: ["GOOGLEDRIVE_UPLOAD_FILE"],
        tool_schemas: {
          GOOGLEDRIVE_UPLOAD_FILE: {
            description: "Upload file",
            inputParameters: {
              type: "object",
              properties: { filePath: { type: "string" } },
            },
          },
        },
      }),
    ], {
      fileClient: mockFileClient as never,
      getSandbox: () => null,
    });

    const tool = tools["conn-upload__GOOGLEDRIVE_UPLOAD_FILE"];
    await (tool as { execute: (args: Record<string, unknown>) => Promise<unknown> }).execute({ filePath: "/agent/home/report.pdf" });

    expect(mockResolveAgentPathForUpload).toHaveBeenCalledWith({
      agentPath: "/agent/home/report.pdf",
      fileClient: mockFileClient,
    });
    expect(mockExecute).toHaveBeenCalledWith("GOOGLEDRIVE_UPLOAD_FILE", expect.objectContaining({
      arguments: expect.objectContaining({ filePath: "/tmp/composio-uploads/report-abcd1234.pdf" }),
    }));
  });

  it("works without fileClient (no bridge, passthrough)", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ data: { success: true }, successful: true });
    vi.mocked(getComposio).mockReturnValue({
      tools: { getRawComposioTools: vi.fn(), execute: mockExecute },
    } as never);

    const tools = await loadActivatedConnectionTools([
      createMockConnection({
        id: "conn-no-bridge",
        toolkit_slug: "gmail",
        activated_tools: ["GMAIL_SEND_EMAIL"],
        tool_schemas: {
          GMAIL_SEND_EMAIL: {
            description: "Send email",
            inputParameters: { type: "object", properties: {} },
          },
        },
      }),
    ]);

    const tool = tools["conn-no-bridge__GMAIL_SEND_EMAIL"];
    const result = await (tool as { execute: (args: Record<string, unknown>) => Promise<{ data: { success: boolean } }> }).execute({});

    expect(result.data.success).toBe(true);
    expect(mockBridgeDownloadedFile).not.toHaveBeenCalled();
  });
});
