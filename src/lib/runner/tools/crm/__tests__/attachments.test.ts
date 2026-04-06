/**
 * Tests for CRM attachment tools.
 * @module lib/runner/tools/crm/__tests__/attachments.test
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAttachmentTools } from "../attachments";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const CONTACT_ID = "550e8400-e29b-41d4-a716-446655440001";
const COMPANY_ID = "550e8400-e29b-41d4-a716-446655440002";
const DEAL_ID = "550e8400-e29b-41d4-a716-446655440003";
const ATTACHMENT_ID = "550e8400-e29b-41d4-a716-446655440010";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;
const STORAGE_UUID = "00000000-0000-0000-0000-000000000099";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("attach_file_to_record", () => {
  it("copies a workspace file and creates the attachment row", async () => {
    vi.stubGlobal("crypto", {
      ...crypto,
      randomUUID: () => STORAGE_UUID,
    });

    const created = {
      attachment_id: ATTACHMENT_ID,
      client_id: CLIENT_ID,
      record_type: "contact",
      record_id: CONTACT_ID,
      filename: "report.pdf",
      storage_path: `attachments/contact/${CONTACT_ID}/${STORAGE_UUID}`,
      content_type: "application/pdf",
      file_size: 2048,
      file_category: "pdf",
      created_at: "2026-04-05T00:00:00Z",
      updated_at: "2026-04-05T00:00:00Z",
    };

    const sourceBlob = {
      type: "application/pdf",
      size: 2048,
      arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode("file content").buffer),
    };

    const download = vi.fn().mockResolvedValue({ data: sourceBlob, error: null });
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });

    const { client, builders } = createMockSupabase({
      record_attachments: { data: created, error: null },
    });

    client.storage = {
      from: vi.fn().mockReturnValue({
        download,
        upload,
        remove,
      }),
    } as never;

    const tools = createAttachmentTools(client, CLIENT_ID);

    const result = await tools.attach_file_to_record.execute(
      {
        source_path: "/agent/home/report.pdf",
        record_type: "contact",
        record_id: CONTACT_ID,
        filename: "report.pdf",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, attachment: created });
    expect(download).toHaveBeenCalledWith(`${CLIENT_ID}/home/report.pdf`);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0]?.[0]).toBe(
      `${CLIENT_ID}/attachments/contact/${CONTACT_ID}/${STORAGE_UUID}`,
    );
    expect(upload.mock.calls[0]?.[1]).toMatchObject({
      byteLength: expect.any(Number),
    });
    expect(upload.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        contentType: "application/pdf",
        upsert: false,
      }),
    );
    expect(builders.record_attachments.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        record_type: "contact",
        record_id: CONTACT_ID,
        filename: "report.pdf",
        storage_path: `attachments/contact/${CONTACT_ID}/${STORAGE_UUID}`,
        content_type: "application/pdf",
        file_size: 2048,
        file_category: "pdf",
      }),
    );
  });

  it("returns an error when the source file cannot be read", async () => {
    const download = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Object not found" },
    });

    const { client } = createMockSupabase();
    client.storage = {
      from: vi.fn().mockReturnValue({
        download,
        upload: vi.fn(),
        remove: vi.fn(),
      }),
    } as never;

    const tools = createAttachmentTools(client, CLIENT_ID);

    const result = await tools.attach_file_to_record.execute(
      {
        source_path: "/agent/home/missing.pdf",
        record_type: "deal",
        record_id: DEAL_ID,
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: 'Failed to read source file "/agent/home/missing.pdf": Object not found',
    });
  });
});

describe("list_record_attachments", () => {
  it("returns attachments for one CRM record", async () => {
    const attachments = [
      {
        attachment_id: ATTACHMENT_ID,
        filename: "report.pdf",
        file_category: "pdf",
        file_size: 2048,
        content_type: "application/pdf",
        created_at: "2026-04-05T00:00:00Z",
      },
      {
        attachment_id: "550e8400-e29b-41d4-a716-446655440011",
        filename: "photo.jpg",
        file_category: "image",
        file_size: 512000,
        content_type: "image/jpeg",
        created_at: "2026-04-04T00:00:00Z",
      },
    ];

    const { client, builders } = createMockSupabase({
      record_attachments: { data: attachments, error: null },
    });

    const tools = createAttachmentTools(client, CLIENT_ID);

    const result = await tools.list_record_attachments.execute(
      {
        record_type: "contact",
        record_id: CONTACT_ID,
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, attachments, count: 2 });
    expect(builders.record_attachments.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builders.record_attachments.eq).toHaveBeenCalledWith("record_type", "contact");
    expect(builders.record_attachments.eq).toHaveBeenCalledWith("record_id", CONTACT_ID);
    expect(builders.record_attachments.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("returns an empty result when no attachments exist", async () => {
    const { client } = createMockSupabase({
      record_attachments: { data: [], error: null },
    });

    const tools = createAttachmentTools(client, CLIENT_ID);

    const result = await tools.list_record_attachments.execute(
      {
        record_type: "company",
        record_id: COMPANY_ID,
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, attachments: [], count: 0 });
  });
});

describe("delete_record_attachment", () => {
  it("deletes the row and removes the storage object", async () => {
    const deleted = {
      attachment_id: ATTACHMENT_ID,
      client_id: CLIENT_ID,
      record_type: "contact",
      record_id: CONTACT_ID,
      storage_path: `attachments/contact/${CONTACT_ID}/uuid-1`,
    };

    const remove = vi.fn().mockResolvedValue({ error: null });

    const { client, builders } = createMockSupabase({
      record_attachments: { data: deleted, error: null },
    });

    client.storage = {
      from: vi.fn().mockReturnValue({
        download: vi.fn(),
        upload: vi.fn(),
        remove,
      }),
    } as never;

    const tools = createAttachmentTools(client, CLIENT_ID);

    const result = await tools.delete_record_attachment.execute(
      { attachment_id: ATTACHMENT_ID },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, deleted_id: ATTACHMENT_ID });
    expect(builders.record_attachments.delete).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith([
      `${CLIENT_ID}/attachments/contact/${CONTACT_ID}/uuid-1`,
    ]);
  });

  it("returns an error when the attachment row is missing", async () => {
    const { client } = createMockSupabase({
      record_attachments: { data: null, error: { message: "Row not found" } },
    });

    client.storage = {
      from: vi.fn().mockReturnValue({
        download: vi.fn(),
        upload: vi.fn(),
        remove: vi.fn(),
      }),
    } as never;

    const tools = createAttachmentTools(client, CLIENT_ID);

    const result = await tools.delete_record_attachment.execute(
      { attachment_id: ATTACHMENT_ID },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "Row not found" });
  });
});
