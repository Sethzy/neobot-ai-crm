# Agent Attachment Tools Implementation Plan

**Goal:** Give the agent 3 tools to manage CRM record attachments: attach a file from its workspace to a record, list attachments on a record, and delete an attachment. Uses copy semantics — file is copied from agent workspace to the attachments path.

**Architecture:** New `src/lib/runner/tools/crm/attachments.ts` following the exact `interactions.ts` factory pattern. Three tools registered in the CRM tools barrel. Depends on the `record_attachments` table from the Files Tab PR.

**Tech Stack:** AI SDK `tool()`, Zod, Supabase (Postgres + Storage), existing `getFileCategory` utility.

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" — Step
- "Run it to make sure it fails" — Step
- "Implement the minimal code to make the test pass" — Step
- "Run the tests and make sure they pass" — Step
- "Commit" — Step

---

## Task 1: Write failing tests for all 3 tools

**Files:**
- Create: `src/lib/runner/tools/crm/__tests__/attachments.test.ts`

**Step 1: Write the test file**

```typescript
/**
 * Tests for CRM attachment tools.
 * @module lib/runner/tools/crm/__tests__/attachments.test
 */
import { describe, expect, it, vi } from "vitest";

import { createAttachmentTools } from "../attachments";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

// Mock crypto.randomUUID for deterministic storage keys
vi.stubGlobal("crypto", {
  ...crypto,
  randomUUID: () => "00000000-0000-0000-0000-000000000099",
});

describe("attach_file_to_record", () => {
  it("copies file from agent workspace and creates attachment record", async () => {
    const created = {
      attachment_id: "att-1",
      client_id: CLIENT_ID,
      record_type: "contact",
      record_id: "c-1",
      filename: "report.pdf",
      storage_path: "attachments/contact/c-1/00000000-0000-0000-0000-000000000099",
      content_type: "application/pdf",
      file_size: 2048,
      file_category: "pdf",
      created_at: "2026-04-05T00:00:00Z",
      updated_at: "2026-04-05T00:00:00Z",
    };

    const mockBlob = new Blob(["file content"], { type: "application/pdf" });
    Object.defineProperty(mockBlob, "size", { value: 2048 });

    const mockDownload = vi.fn().mockResolvedValue({ data: mockBlob, error: null });
    const mockUpload = vi.fn().mockResolvedValue({ error: null });
    const mockRemove = vi.fn().mockResolvedValue({ error: null });

    const { client, builders } = createMockSupabase({
      record_attachments: { data: created, error: null },
    });

    // Override storage mock
    client.storage = {
      from: vi.fn().mockReturnValue({
        download: mockDownload,
        upload: mockUpload,
        remove: mockRemove,
      }),
    } as never;

    const tools = createAttachmentTools(client, CLIENT_ID);

    const result = await tools.attach_file_to_record.execute(
      {
        source_path: "/agent/home/report.pdf",
        record_type: "contact",
        record_id: "c-1",
        filename: "report.pdf",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, attachment: created });

    // Verify it downloaded from the agent workspace path
    expect(mockDownload).toHaveBeenCalledWith(
      `${CLIENT_ID}/home/report.pdf`,
    );

    // Verify it uploaded to the attachments path
    expect(mockUpload).toHaveBeenCalledWith(
      `${CLIENT_ID}/attachments/contact/c-1/00000000-0000-0000-0000-000000000099`,
      expect.anything(),
      expect.objectContaining({ contentType: "application/pdf" }),
    );

    // Verify DB insert
    expect(builders.record_attachments.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        record_type: "contact",
        record_id: "c-1",
        filename: "report.pdf",
        storage_path: "attachments/contact/c-1/00000000-0000-0000-0000-000000000099",
      }),
    );
  });

  it("returns error when source file does not exist", async () => {
    const mockDownload = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Object not found" },
    });

    const { client } = createMockSupabase();
    client.storage = {
      from: vi.fn().mockReturnValue({
        download: mockDownload,
        upload: vi.fn(),
        remove: vi.fn(),
      }),
    } as never;

    const tools = createAttachmentTools(client, CLIENT_ID);

    const result = await tools.attach_file_to_record.execute(
      {
        source_path: "/agent/home/nonexistent.pdf",
        record_type: "deal",
        record_id: "d-1",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("Failed to read source file"),
    });
  });
});

describe("list_record_attachments", () => {
  it("returns attachments for a record", async () => {
    const attachments = [
      {
        attachment_id: "att-1",
        filename: "report.pdf",
        file_category: "pdf",
        file_size: 2048,
        created_at: "2026-04-05T00:00:00Z",
      },
      {
        attachment_id: "att-2",
        filename: "photo.jpg",
        file_category: "image",
        file_size: 512000,
        created_at: "2026-04-04T00:00:00Z",
      },
    ];

    const { client, builders } = createMockSupabase({
      record_attachments: { data: attachments, error: null },
    });

    const tools = createAttachmentTools(client, CLIENT_ID);

    const result = await tools.list_record_attachments.execute(
      { record_type: "contact", record_id: "c-1" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, attachments, count: 2 });
    expect(builders.record_attachments.eq).toHaveBeenCalledWith("record_type", "contact");
    expect(builders.record_attachments.eq).toHaveBeenCalledWith("record_id", "c-1");
    expect(builders.record_attachments.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("returns empty array when no attachments exist", async () => {
    const { client } = createMockSupabase({
      record_attachments: { data: [], error: null },
    });

    const tools = createAttachmentTools(client, CLIENT_ID);

    const result = await tools.list_record_attachments.execute(
      { record_type: "deal", record_id: "d-1" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, attachments: [], count: 0 });
  });
});

describe("delete_record_attachment", () => {
  it("deletes DB record and storage file", async () => {
    const deleted = {
      attachment_id: "att-1",
      client_id: CLIENT_ID,
      storage_path: "attachments/contact/c-1/uuid-1",
    };

    const mockRemove = vi.fn().mockResolvedValue({ error: null });

    const { client, builders } = createMockSupabase({
      record_attachments: { data: deleted, error: null },
    });

    client.storage = {
      from: vi.fn().mockReturnValue({
        download: vi.fn(),
        upload: vi.fn(),
        remove: mockRemove,
      }),
    } as never;

    const tools = createAttachmentTools(client, CLIENT_ID);

    const result = await tools.delete_record_attachment.execute(
      { attachment_id: "att-1" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, deleted_id: "att-1" });
    expect(builders.record_attachments.delete).toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith([
      `${CLIENT_ID}/attachments/contact/c-1/uuid-1`,
    ]);
  });

  it("returns error when attachment not found", async () => {
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
      { attachment_id: "att-999" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "Row not found" });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/attachments.test.ts
```

Expected: FAIL — `Cannot find module '../attachments'`

**Step 3: Commit**

```bash
git add src/lib/runner/tools/crm/__tests__/attachments.test.ts
git commit -m "test: add failing tests for agent attachment tools"
```

---

## Task 2: Implement the attachment tools

**Files:**
- Create: `src/lib/runner/tools/crm/attachments.ts`

**Step 1: Write the implementation**

```typescript
/**
 * CRM attachment tools for the runner.
 * Allows the agent to attach files from its workspace to CRM records,
 * list attachments, and delete attachments.
 * @module lib/runner/tools/crm/attachments
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getFileCategory } from "@/lib/crm/file-categories";
import { AGENT_FILES_BUCKET } from "@/lib/storage/agent-files";
import type { Database } from "@/types/database";

/**
 * Resolves an agent-facing path (e.g. "/agent/home/report.pdf") to a
 * workspace-relative path (e.g. "home/report.pdf").
 */
function resolveAgentPath(inputPath: string): string {
  return inputPath
    .replace(/^\/agent\//, "")
    .replace(/^\/+/, "");
}

/**
 * Creates CRM attachment tools: attach, list, delete.
 */
export function createAttachmentTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const attach_file_to_record = tool({
    description:
      "Attach a file from the agent workspace to a CRM record (contact, company, or deal). " +
      "The file is COPIED to the record's attachment storage — the original remains in the workspace. " +
      "Use read_file or write_file to create the file first, then attach it. " +
      "Use search_crm to find the record_id.",
    inputSchema: z.object({
      source_path: z
        .string()
        .min(1)
        .describe(
          "Path to the file in the agent workspace, e.g. '/agent/home/report.pdf'. " +
          "The file must already exist.",
        ),
      record_type: z.enum(["contact", "company", "deal"]).describe("CRM record type."),
      record_id: z.string().uuid().describe("UUID of the target record. Use search_crm to find this."),
      filename: z
        .string()
        .optional()
        .describe("Display filename for the attachment. Defaults to the source filename."),
    }),
    execute: async ({ source_path, record_type, record_id, filename }) => {
      const workspacePath = resolveAgentPath(source_path);
      const displayFilename = filename ?? workspacePath.split("/").pop() ?? "file";
      const absoluteSourcePath = `${clientId}/${workspacePath}`;

      // Step 1: Download the source file from agent workspace
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(AGENT_FILES_BUCKET)
        .download(absoluteSourcePath);

      if (downloadError || !fileData) {
        return {
          success: false as const,
          error: `Failed to read source file "${source_path}": ${downloadError?.message ?? "not found"}`,
        };
      }

      // Step 2: Upload copy to attachments path
      const storageKey = crypto.randomUUID();
      const relativePath = `attachments/${record_type}/${record_id}/${storageKey}`;
      const absoluteDestPath = `${clientId}/${relativePath}`;
      const contentType = fileData.type || "application/octet-stream";

      const { error: uploadError } = await supabase.storage
        .from(AGENT_FILES_BUCKET)
        .upload(absoluteDestPath, await fileData.arrayBuffer(), {
          contentType,
          upsert: false,
        });

      if (uploadError) {
        return {
          success: false as const,
          error: `Failed to copy file to attachments: ${uploadError.message}`,
        };
      }

      // Step 3: Create attachment record
      const fileCategory = getFileCategory(displayFilename);

      const { data, error } = await supabase
        .from("record_attachments")
        .insert({
          client_id: clientId,
          record_type,
          record_id,
          filename: displayFilename,
          storage_path: relativePath,
          content_type: contentType,
          file_size: fileData.size,
          file_category: fileCategory,
        })
        .select()
        .single();

      if (error) {
        // Clean up orphaned storage file
        await supabase.storage.from(AGENT_FILES_BUCKET).remove([absoluteDestPath]);
        return { success: false as const, error: error.message };
      }

      return { success: true as const, attachment: data };
    },
  });

  const list_record_attachments = tool({
    description:
      "List all file attachments on a CRM record. " +
      "Returns filename, category, size, and creation date for each attachment.",
    inputSchema: z.object({
      record_type: z.enum(["contact", "company", "deal"]).describe("CRM record type."),
      record_id: z.string().uuid().describe("UUID of the record. Use search_crm to find this."),
    }),
    execute: async ({ record_type, record_id }) => {
      const { data, error } = await supabase
        .from("record_attachments")
        .select("attachment_id, filename, file_category, file_size, content_type, created_at")
        .eq("client_id", clientId)
        .eq("record_type", record_type)
        .eq("record_id", record_id)
        .order("created_at", { ascending: false });

      if (error) {
        return { success: false as const, error: error.message };
      }

      return {
        success: true as const,
        attachments: data ?? [],
        count: data?.length ?? 0,
      };
    },
  });

  const delete_record_attachment = tool({
    description:
      "Delete a file attachment from a CRM record. Removes both the file and the database record. " +
      "DESTRUCTIVE: Use ask_user_question to confirm with the user before calling.",
    inputSchema: z.object({
      attachment_id: z.string().uuid().describe("UUID of the attachment to delete. Use list_record_attachments to find this."),
    }),
    execute: async ({ attachment_id }) => {
      // Delete DB record (returns the row for storage cleanup)
      const { data, error } = await supabase
        .from("record_attachments")
        .delete()
        .eq("attachment_id", attachment_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      // Clean up storage file (best-effort)
      const absolutePath = `${clientId}/${(data as { storage_path: string }).storage_path}`;
      await supabase.storage.from(AGENT_FILES_BUCKET).remove([absolutePath]);

      return { success: true as const, deleted_id: attachment_id };
    },
  });

  return {
    attach_file_to_record,
    list_record_attachments,
    delete_record_attachment,
  };
}
```

**Step 2: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/attachments.test.ts
```

Expected: PASS — all 6 tests green.

**Step 3: Commit**

```bash
git add src/lib/runner/tools/crm/attachments.ts
git commit -m "feat: add agent attachment tools (attach, list, delete)"
```

---

## Task 3: Register tools in the CRM barrel

**Files:**
- Modify: `src/lib/runner/tools/crm/index.ts`

**Step 1: Write failing test — tools appear in the registry**

The existing `src/lib/runner/tools/crm/__tests__/index.test.ts` likely checks which tools are returned. Check its assertions and verify that `attach_file_to_record`, `list_record_attachments`, and `delete_record_attachment` are NOT present — confirming the test will fail when we add the assertion.

Add to the test file:

```typescript
it("includes attachment tools in normal write mode", () => {
  const tools = createCrmTools(client, CLIENT_ID, { allowWriteTools: true });
  expect(tools).toHaveProperty("attach_file_to_record");
  expect(tools).toHaveProperty("list_record_attachments");
  expect(tools).toHaveProperty("delete_record_attachment");
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/index.test.ts
```

Expected: FAIL — `attach_file_to_record` not in returned tools.

**Step 3: Wire tools into index.ts**

Modify `src/lib/runner/tools/crm/index.ts`:

Add import:

```typescript
import { createAttachmentTools } from "./attachments";
```

After `const taskTools = ...` (~line 66), add:

```typescript
  const attachmentTools = createAttachmentTools(supabase, clientId);
```

In the return object, after `update_task: taskTools.update_task,` add:

```typescript
    attach_file_to_record: attachmentTools.attach_file_to_record,
    list_record_attachments: attachmentTools.list_record_attachments,
    delete_record_attachment: attachmentTools.delete_record_attachment,
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/index.test.ts
```

Expected: PASS.

**Step 5: Run all CRM tool tests**

```bash
npx vitest run src/lib/runner/tools/crm/
```

Expected: All tests green.

**Step 6: Commit**

```bash
git add src/lib/runner/tools/crm/index.ts src/lib/runner/tools/crm/__tests__/index.test.ts
git commit -m "feat: register attachment tools in CRM tool barrel"
```

---

## Relevant Files Summary

| File | Action |
|------|--------|
| `src/lib/runner/tools/crm/attachments.ts` | Create — 3 tools: attach, list, delete |
| `src/lib/runner/tools/crm/__tests__/attachments.test.ts` | Create — 6 tests |
| `src/lib/runner/tools/crm/index.ts` | Modify — import + register tools |
| `src/lib/runner/tools/crm/__tests__/index.test.ts` | Modify — assert tools present |

## Dependencies

- Requires the `record_attachments` table from the Files Tab PR
- Requires `getFileCategory` from `src/lib/crm/file-categories.ts` (also from Files Tab PR)
- Uses `AGENT_FILES_BUCKET` from `src/lib/storage/agent-files.ts` (already exists)

## Reference

- Pattern: `src/lib/runner/tools/crm/interactions.ts` (simplest existing tool)
- Tests: `src/lib/runner/tools/crm/__tests__/interactions.test.ts`
- Mock helper: `src/lib/runner/tools/crm/__tests__/mock-supabase.ts`
