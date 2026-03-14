# PDF Document Generation Tool — Implementation Plan

**PR:** PR 42a-pdf: PDF document generation tool
**Decisions:** UX-10, LLM-02
**Goal:** Agent can generate downloadable PDF documents on demand when the user asks (e.g. "make me a client brief for John Tan").

**Architecture:** Inner LLM call pattern (same as `run_subagent`). The `generate_pdf` tool makes a secondary `generateText()` call using `@json-render/react-pdf`'s auto-generated system prompt (`catalog.prompt()`). The inner LLM generates JSONL patches, compiled into a spec via `createSpecStreamCompiler`, rendered server-side via `renderToBuffer()`, uploaded to Supabase Storage, and returned as a download URL. No main agent context bloat — all PDF generation runs in an isolated LLM call.

**Tech Stack:** `@json-render/react-pdf`, `@json-render/core` (already installed), Vercel AI SDK `generateText()`, Supabase Storage

---

## Relevant Files

### Create
- `src/lib/views/pdf-catalog.ts` — PDF catalog definition using standardComponentDefinitions
- `src/lib/runner/tools/utility/generate-pdf.ts` — generate_pdf agent tool
- `src/lib/runner/tools/utility/__tests__/generate-pdf.test.ts` — tool tests
- `src/lib/views/__tests__/pdf-catalog.test.ts` — catalog tests
- `app/api/pdf/route.ts` — PDF render API route
- `app/api/pdf/__tests__/route.test.ts` — route tests (optional, complex to test API routes in isolation)

### Modify
- `src/lib/runner/tools/utility/index.ts` — add generate_pdf to utility barrel
- `src/lib/runner/tools/utility/__tests__/index.test.ts` — update tool list assertion
- `src/lib/ai/system-prompt.ts` — add PDF generation guidance to tool-usage section
- `package.json` — add `@json-render/react-pdf` dependency

---

## Task 1: Install `@json-render/react-pdf` and verify it works

**Files:**
- Modify: `package.json`

**Step 1: Install the package**

```bash
npm install @json-render/react-pdf
```

**Step 2: Verify the package exports are accessible**

```bash
npx tsx -e "
  import { standardComponentDefinitions } from '@json-render/react-pdf/catalog';
  import { schema } from '@json-render/react-pdf/server';
  import { renderToBuffer } from '@json-render/react-pdf/render';
  console.log('Components:', Object.keys(standardComponentDefinitions).length);
  console.log('Schema OK:', typeof schema !== 'undefined');
  console.log('renderToBuffer OK:', typeof renderToBuffer === 'function');
"
```

Expected: prints component count (13-15), Schema OK: true, renderToBuffer OK: true

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(pr42a-pdf): install @json-render/react-pdf"
```

---

## Task 2: Create PDF catalog

**Files:**
- Create: `src/lib/views/pdf-catalog.ts`
- Create: `src/lib/views/__tests__/pdf-catalog.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/views/__tests__/pdf-catalog.test.ts
/**
 * Tests for the PDF document catalog.
 * @module lib/views/__tests__/pdf-catalog
 */
import { describe, expect, it } from "vitest";

import { pdfCatalog } from "../pdf-catalog";

describe("pdfCatalog", () => {
  it("generates a non-empty system prompt", () => {
    const prompt = pdfCatalog.prompt();
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(100);
  });

  it("system prompt includes Document and Page component references", () => {
    const prompt = pdfCatalog.prompt();
    expect(prompt).toContain("Document");
    expect(prompt).toContain("Page");
    expect(prompt).toContain("Table");
  });

  it("system prompt includes Text and Heading components", () => {
    const prompt = pdfCatalog.prompt();
    expect(prompt).toContain("Text");
    expect(prompt).toContain("Heading");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/views/__tests__/pdf-catalog.test.ts
```

Expected: FAIL — `Cannot find module '../pdf-catalog'`

**Step 3: Write minimal implementation**

```typescript
// src/lib/views/pdf-catalog.ts
/**
 * PDF document catalog for agent-generated PDF documents.
 * Uses the standard json-render react-pdf component definitions.
 * The catalog auto-generates the system prompt for the inner LLM call
 * via `pdfCatalog.prompt()`.
 * @module lib/views/pdf-catalog
 */
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react-pdf/server";
import { standardComponentDefinitions } from "@json-render/react-pdf/catalog";

export const pdfCatalog = defineCatalog(schema, {
  components: standardComponentDefinitions,
  actions: {},
});
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/views/__tests__/pdf-catalog.test.ts
```

Expected: PASS — all 3 tests green

**Step 5: Commit**

```bash
git add src/lib/views/pdf-catalog.ts src/lib/views/__tests__/pdf-catalog.test.ts
git commit -m "feat(pr42a-pdf): add PDF catalog with standard component definitions"
```

---

## Task 3: Create PDF render API route

**Files:**
- Create: `app/api/pdf/route.ts`

**Step 1: Write the failing test**

This is an API route, so we test it via a manual curl check after implementation. But first, verify the route doesn't exist yet:

```bash
ls app/api/pdf/
```

Expected: `No such file or directory`

**Step 2: Create the route**

```typescript
// app/api/pdf/route.ts
/**
 * PDF render API route.
 * Accepts a json-render spec via POST, renders it to a PDF buffer
 * using @json-render/react-pdf, and returns the PDF bytes.
 * @module app/api/pdf/route
 */
import { renderToBuffer } from "@json-render/react-pdf/render";
import type { Spec } from "@json-render/core";

export const maxDuration = 30;

export async function POST(req: Request) {
  const body = (await req.json()) as {
    spec: Spec;
    filename?: string;
  };

  const { spec, filename } = body;

  if (!spec?.root || !spec?.elements) {
    return Response.json(
      { error: "Invalid spec: must include root and elements" },
      { status: 400 },
    );
  }

  const buffer = await renderToBuffer(spec);

  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename ?? "document"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
```

**Step 3: Verify it builds**

```bash
npx tsc --noEmit
```

Expected: no type errors

**Step 4: Commit**

```bash
git add app/api/pdf/route.ts
git commit -m "feat(pr42a-pdf): add PDF render API route"
```

---

## Task 4: Create the `generate_pdf` tool

This is the core tool. It makes an inner `generateText()` call using the PDF catalog's auto-generated system prompt, compiles the streamed JSONL into a spec, renders it to a PDF buffer, uploads to Supabase Storage, and returns a download URL.

**Files:**
- Create: `src/lib/runner/tools/utility/generate-pdf.ts`
- Create: `src/lib/runner/tools/utility/__tests__/generate-pdf.test.ts`

### Step 1: Write the failing tests

```typescript
// src/lib/runner/tools/utility/__tests__/generate-pdf.test.ts
/**
 * Tests for the generate_pdf tool.
 * @module lib/runner/tools/utility/__tests__/generate-pdf
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---
const { mockGenerateText, mockRenderToBuffer, mockUpload, mockGetPublicUrl } =
  vi.hoisted(() => ({
    mockGenerateText: vi.fn(),
    mockRenderToBuffer: vi.fn(),
    mockUpload: vi.fn(),
    mockGetPublicUrl: vi.fn(),
  }));

vi.mock("ai", () => ({
  tool: (await vi.importActual("ai")).tool,
  generateText: mockGenerateText,
}));

vi.mock("@json-render/react-pdf/render", () => ({
  renderToBuffer: mockRenderToBuffer,
}));

vi.mock("@/lib/ai/gateway", () => ({
  gateway: vi.fn((model: string) => model),
  gatewayProviderOptions: undefined,
  TIER_1_MODEL: "google/gemini-3-flash",
}));

import { createGeneratePdfTool } from "../generate-pdf";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

function createMockSupabase() {
  return {
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      })),
    },
  };
}

describe("createGeneratePdfTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a generate_pdf tool with an execute function", () => {
    const supabase = createMockSupabase();
    const { generate_pdf } = createGeneratePdfTool(supabase as never, CLIENT_ID);
    expect(generate_pdf).toBeDefined();
    expect(generate_pdf).toHaveProperty("execute");
  });

  it("returns success with a download URL on valid generation", async () => {
    const validSpec = {
      root: "doc",
      elements: {
        doc: {
          type: "Document",
          props: { title: "Test" },
          children: ["page"],
        },
        page: {
          type: "Page",
          props: { size: "A4" },
          children: [],
        },
      },
    };

    // Mock inner LLM call — returns JSONL patches
    const jsonlText = [
      '{"op":"add","path":"/root","value":"doc"}',
      `{"op":"add","path":"/elements/doc","value":${JSON.stringify(validSpec.elements.doc)}}`,
      `{"op":"add","path":"/elements/page","value":${JSON.stringify(validSpec.elements.page)}}`,
    ].join("\n");

    mockGenerateText.mockResolvedValue({
      text: jsonlText,
      totalUsage: { inputTokens: 500, outputTokens: 300 },
    });

    // Mock PDF rendering
    const fakePdfBuffer = new Uint8Array([37, 80, 68, 70]); // %PDF
    mockRenderToBuffer.mockResolvedValue(fakePdfBuffer);

    // Mock Supabase upload
    mockUpload.mockResolvedValue({ data: { path: "test.pdf" }, error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://storage.example.com/test.pdf" },
    });

    const supabase = createMockSupabase();
    const { generate_pdf } = createGeneratePdfTool(supabase as never, CLIENT_ID);

    const result = await generate_pdf.execute(
      {
        description: "A simple test document",
        filename: "test-doc",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: true,
      filename: "test-doc.pdf",
    });
    expect(result).toHaveProperty("download_url");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(mockRenderToBuffer).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  it("returns an error when the inner LLM produces an empty spec", async () => {
    mockGenerateText.mockResolvedValue({
      text: "",
      totalUsage: { inputTokens: 100, outputTokens: 0 },
    });

    const supabase = createMockSupabase();
    const { generate_pdf } = createGeneratePdfTool(supabase as never, CLIENT_ID);

    const result = await generate_pdf.execute(
      { description: "Empty test" },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: false,
    });
    expect(result).toHaveProperty("error");
  });

  it("returns an error when PDF rendering fails", async () => {
    const jsonlText = [
      '{"op":"add","path":"/root","value":"doc"}',
      '{"op":"add","path":"/elements/doc","value":{"type":"Document","props":{},"children":["page"]}}',
      '{"op":"add","path":"/elements/page","value":{"type":"Page","props":{"size":"A4"},"children":[]}}',
    ].join("\n");

    mockGenerateText.mockResolvedValue({
      text: jsonlText,
      totalUsage: { inputTokens: 500, outputTokens: 300 },
    });
    mockRenderToBuffer.mockRejectedValue(new Error("Render failed"));

    const supabase = createMockSupabase();
    const { generate_pdf } = createGeneratePdfTool(supabase as never, CLIENT_ID);

    const result = await generate_pdf.execute(
      { description: "A broken document" },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("Render failed"),
    });
  });

  it("returns an error when Supabase upload fails", async () => {
    const jsonlText = [
      '{"op":"add","path":"/root","value":"doc"}',
      '{"op":"add","path":"/elements/doc","value":{"type":"Document","props":{},"children":["page"]}}',
      '{"op":"add","path":"/elements/page","value":{"type":"Page","props":{"size":"A4"},"children":[]}}',
    ].join("\n");

    mockGenerateText.mockResolvedValue({
      text: jsonlText,
      totalUsage: { inputTokens: 500, outputTokens: 300 },
    });
    mockRenderToBuffer.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    mockUpload.mockResolvedValue({
      data: null,
      error: { message: "Storage quota exceeded" },
    });

    const supabase = createMockSupabase();
    const { generate_pdf } = createGeneratePdfTool(supabase as never, CLIENT_ID);

    const result = await generate_pdf.execute(
      { description: "Upload failure test" },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("Storage quota exceeded"),
    });
  });

  it("generates a sanitized filename from the description when no filename is provided", async () => {
    const jsonlText = [
      '{"op":"add","path":"/root","value":"doc"}',
      '{"op":"add","path":"/elements/doc","value":{"type":"Document","props":{},"children":["page"]}}',
      '{"op":"add","path":"/elements/page","value":{"type":"Page","props":{"size":"A4"},"children":[]}}',
    ].join("\n");

    mockGenerateText.mockResolvedValue({
      text: jsonlText,
      totalUsage: { inputTokens: 500, outputTokens: 300 },
    });
    mockRenderToBuffer.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    mockUpload.mockResolvedValue({ data: { path: "doc.pdf" }, error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://storage.example.com/doc.pdf" },
    });

    const supabase = createMockSupabase();
    const { generate_pdf } = createGeneratePdfTool(supabase as never, CLIENT_ID);

    const result = await generate_pdf.execute(
      { description: "Client Brief for John Tan - March 2026" },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({ success: true });
    // Filename should be derived from description, sanitized
    expect((result as { filename: string }).filename).toMatch(/\.pdf$/);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/runner/tools/utility/__tests__/generate-pdf.test.ts
```

Expected: FAIL — `Cannot find module '../generate-pdf'`

### Step 3: Write the implementation

```typescript
// src/lib/runner/tools/utility/generate-pdf.ts
/**
 * PDF document generation tool.
 * Makes an inner LLM call to generate a json-render PDF spec,
 * renders it to a PDF buffer, uploads to Supabase Storage,
 * and returns a download URL.
 * @module lib/runner/tools/utility/generate-pdf
 */
import { generateText, tool } from "ai";
import type { Spec } from "@json-render/core";
import { createSpecStreamCompiler } from "@json-render/core";
import { buildUserPrompt } from "@json-render/core";
import { renderToBuffer } from "@json-render/react-pdf/render";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { gateway, gatewayProviderOptions, TIER_1_MODEL } from "@/lib/ai/gateway";
import { pdfCatalog } from "@/lib/views/pdf-catalog";
import type { Database } from "@/types/database";

/** Max time for the inner LLM call. */
const PDF_GENERATION_TIMEOUT_MS = 60_000;

/** Supabase Storage bucket for generated PDFs. */
const PDF_STORAGE_BUCKET = "client-files";

/** System prompt for the inner LLM, auto-generated from the PDF catalog. */
const PDF_SYSTEM_PROMPT = pdfCatalog.prompt();

/**
 * Sanitizes a string into a safe filename.
 * Lowercases, replaces non-alphanumeric chars with dashes, trims, and truncates.
 */
function sanitizeFilename(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Compiles JSONL text (RFC 6902 patches) into a json-render Spec.
 * Returns null if the compiled spec has no root or elements.
 */
function compileSpec(jsonlText: string): Spec | null {
  const compiler = createSpecStreamCompiler<Spec>();
  compiler.push(jsonlText + "\n");
  const result = compiler.getResult();

  if (!result?.root || !result?.elements) {
    return null;
  }

  return result;
}

/** Creates the generate_pdf tool for runner registration. */
export function createGeneratePdfTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const generate_pdf = tool({
    description:
      "Generate a professional PDF document. Describe what you want — a client brief, " +
      "property report, deal summary, transaction checklist, or any structured document. " +
      "Include relevant data (names, addresses, numbers) in the description so the " +
      "document is populated with real content. Returns a download URL.",
    inputSchema: z.object({
      description: z
        .string()
        .min(10)
        .describe(
          "Detailed description of the PDF to generate, including all data to include. " +
          "Example: 'A client brief for John Tan, buyer, looking for 3BR condo in Bishan. " +
          "Budget $1.5M. Shortlisted: 10 Bishan St 15 #12-34 ($1.45M), 20 Bishan St 22 #08-12 ($1.52M).'",
        ),
      filename: z
        .string()
        .optional()
        .describe(
          "Optional filename (without .pdf extension). If omitted, derived from description.",
        ),
    }),
    execute: async ({ description, filename }) => {
      try {
        // 1. Inner LLM call to generate the PDF spec
        const userPrompt = buildUserPrompt({ prompt: description });
        const result = await generateText({
          model: gateway(TIER_1_MODEL),
          system: PDF_SYSTEM_PROMPT,
          prompt: userPrompt,
          temperature: 0.7,
          providerOptions: gatewayProviderOptions,
          timeout: { totalMs: PDF_GENERATION_TIMEOUT_MS },
        });

        // 2. Compile JSONL patches into a spec
        const spec = compileSpec(result.text);

        if (!spec) {
          return {
            success: false as const,
            error: "PDF generation produced an invalid or empty document spec.",
          };
        }

        // 3. Render spec to PDF buffer
        const buffer = await renderToBuffer(spec);

        // 4. Upload to Supabase Storage
        const safeName = filename
          ? sanitizeFilename(filename)
          : sanitizeFilename(description.slice(0, 60));
        const timestamp = Date.now();
        const storagePath = `${clientId}/generated-pdfs/${safeName}-${timestamp}.pdf`;

        const { error: uploadError } = await supabase.storage
          .from(PDF_STORAGE_BUCKET)
          .upload(storagePath, buffer, {
            contentType: "application/pdf",
            upsert: false,
          });

        if (uploadError) {
          return {
            success: false as const,
            error: `Failed to upload PDF: ${uploadError.message}`,
          };
        }

        // 5. Get the public URL
        const { data: urlData } = supabase.storage
          .from(PDF_STORAGE_BUCKET)
          .getPublicUrl(storagePath);

        return {
          success: true as const,
          download_url: urlData.publicUrl,
          filename: `${safeName}.pdf`,
        };
      } catch (err) {
        return {
          success: false as const,
          error: err instanceof Error ? err.message : "PDF generation failed",
        };
      }
    },
  });

  return { generate_pdf };
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/tools/utility/__tests__/generate-pdf.test.ts
```

Expected: PASS — all 6 tests green

**Step 5: Commit**

```bash
git add src/lib/runner/tools/utility/generate-pdf.ts src/lib/runner/tools/utility/__tests__/generate-pdf.test.ts
git commit -m "feat(pr42a-pdf): add generate_pdf tool with inner LLM call"
```

---

## Task 5: Register `generate_pdf` in the utility tool barrel

**Files:**
- Modify: `src/lib/runner/tools/utility/index.ts`
- Modify: `src/lib/runner/tools/utility/__tests__/index.test.ts`

**Step 1: Write the failing test — update tool list assertion**

In `src/lib/runner/tools/utility/__tests__/index.test.ts`, update the expected tool list to include `generate_pdf`:

```typescript
// Update the "returns all utility tools" test
expect(Object.keys(tools).sort()).toEqual([
  "ask_user_question",
  "calculate",
  "generate_pdf",
  "get_agent_db_schema",
  "list_todo",
  "manage_todo",
  "rename_chat",
  "run_sql",
  "send_message",
]);
```

And update the subagent exclusion test to confirm `generate_pdf` is NOT in subagent tools:

```typescript
// Update the "excludes user-facing and outbound tools for subagents" test
expect(Object.keys(tools).sort()).toEqual([
  "calculate",
  "get_agent_db_schema",
  "list_todo",
  "manage_todo",
  "run_sql",
]);
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/runner/tools/utility/__tests__/index.test.ts
```

Expected: FAIL — `generate_pdf` not in the list

**Step 3: Update the barrel**

In `src/lib/runner/tools/utility/index.ts`, add the import and registration:

```typescript
import { createGeneratePdfTool } from "./generate-pdf";
```

Inside `createUtilityTools`, add after the existing tools (before the subagent-excluded section):

```typescript
return {
  ...createCalculateTool(),
  ...createTodoTools(supabase, clientId, threadId),
  ...createSqlTools(supabase),
  ...(!isSubagent ? createGeneratePdfTool(supabase, clientId) : {}),
  ...(!isSubagent ? createAskUserQuestionTool() : {}),
  ...(!isSubagent ? createRenameChatTool(supabase, clientId, threadId) : {}),
  ...(includeSendMessage ? createSendMessageTool() : {}),
};
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/runner/tools/utility/__tests__/index.test.ts
```

Expected: PASS — all 3 tests green

**Step 5: Run full test suite to check for regressions**

```bash
npx vitest run src/lib/runner/tools/
```

Expected: all existing tests still pass

**Step 6: Commit**

```bash
git add src/lib/runner/tools/utility/index.ts src/lib/runner/tools/utility/__tests__/index.test.ts
git commit -m "feat(pr42a-pdf): register generate_pdf in utility tool barrel"
```

---

## Task 6: Add PDF generation guidance to the system prompt

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`

**Step 1: Identify insertion point**

The system prompt has tool-usage sections organized by category (CRM, File Storage, Web, Calculations, Triggers). Add a new `PDF Documents` section after `Calculations`.

**Step 2: Add the section**

After the `Calculations:` block (which ends with "Chain multiple calculate calls..."), add:

```
PDF Documents:
- Use generate_pdf when the user asks for a document, report, brief, summary, or any formatted output they'd want to download, print, or send.
- Include ALL relevant data in the description — names, addresses, prices, dates, status. The PDF generator cannot access CRM tools, so you must pull the data first and pass it in the description.
- Before calling generate_pdf, use CRM search tools to gather the data the document needs. Then describe the document with the real data included.
- Keep descriptions specific: "Client brief for John Tan, buyer, budget $1.5M, viewing 10 Bishan St 15 on March 20" — not "a client brief".
- Typical documents: client briefs, property comparison reports, deal summaries, transaction checklists, monthly activity reports.
```

**Step 3: Verify build**

```bash
npx tsc --noEmit
```

Expected: no errors

**Step 4: Commit**

```bash
git add src/lib/ai/system-prompt.ts
git commit -m "feat(pr42a-pdf): add PDF generation guidance to system prompt"
```

---

## Task 7: Render download link in chat for `generate_pdf` output

**Files:**
- Modify: `src/components/chat/tool-call-inline.tsx` (or create a dedicated component)

The current `ToolCallInline` renders tool outputs as raw JSON via `JsonView`. For `generate_pdf`, we want to show a clickable download button instead.

**Step 1: Identify the rendering point**

In `src/components/chat/tool-call-inline.tsx`, the output section is rendered when `!isDenied && output !== undefined`. We need to detect when the tool is `generate_pdf` and the output has `success: true` + `download_url`, and render a download link instead of raw JSON.

**Step 2: Add download link rendering**

Inside `ToolCallInline`, after the existing output rendering block, add a conditional for PDF outputs:

```typescript
// Check if this is a successful generate_pdf result
const isPdfDownload =
  name === "generate_pdf" &&
  output &&
  typeof output === "object" &&
  "success" in output &&
  output.success === true &&
  "download_url" in output;
```

Then in the JSX, before the generic `<JsonView data={output} />`, render a download button if `isPdfDownload`:

```tsx
{isPdfDownload ? (
  <a
    href={(output as { download_url: string }).download_url}
    download={(output as { filename?: string }).filename ?? "document.pdf"}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
  >
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
    {(output as { filename?: string }).filename ?? "Download PDF"}
  </a>
) : (
  <JsonView data={output} />
)}
```

**Step 3: Verify build and manual test**

```bash
npx tsc --noEmit
```

Expected: no errors

**Step 4: Commit**

```bash
git add src/components/chat/tool-call-inline.tsx
git commit -m "feat(pr42a-pdf): render download link for generate_pdf tool output"
```

---

## Task 8: End-to-end verification

**Step 1: Start the dev server**

```bash
npm run dev
```

**Step 2: Manual test in chat**

Open the app, navigate to chat, and type:

> "Make me a simple client brief for John Tan. He's a buyer looking for a 3BR condo in Bishan, budget $1.5M."

**Expected behavior:**
1. Agent searches CRM for John Tan (or uses the info you provided)
2. Agent calls `generate_pdf` tool — you see the tool pill with spinner
3. Inner LLM generates the PDF spec (takes 3-5 seconds)
4. Tool completes — you see a download button with the filename
5. Clicking the download button downloads a real PDF file
6. The PDF contains structured content: headings, text, maybe a table

**Step 3: Verify edge cases**

- Ask for a document when no CRM data exists — agent should still generate a document from the description
- Ask for a very simple document ("make me a blank letterhead") — should work
- Check that the download URL works and the file is a valid PDF

**Step 4: Final commit**

If any fixes were needed during testing, commit them:

```bash
git add -A
git commit -m "fix(pr42a-pdf): end-to-end fixes from manual testing"
```

---

## Notes

### Key references
- **json-render react-pdf example:** `/Users/sethlim/Documents/json-render/examples/react-pdf/`
- **Existing inline view catalog:** `src/lib/views/catalog.ts` — pattern reference for how catalogs are set up
- **Subagent tool (inner LLM pattern):** `src/lib/runner/tools/subagents/run-subagent.ts` — same `generateText()` pattern
- **Gateway config:** `src/lib/ai/gateway.ts` — `TIER_1_MODEL`, `gateway()`, `gatewayProviderOptions`
- **Tool testing pattern:** `src/lib/runner/tools/utility/__tests__/calculate.test.ts` — simple, clean tests

### What's deferred
- Custom branded PDF components (DealCard, ContactCard, etc.) — future PR
- Chart rendering in PDFs — `@react-pdf/renderer` can't run Recharts
- Live PDF preview in chat — just download for now
- Refinement mode (edit an existing PDF) — future if needed

### Architecture decisions
- **UX-10:** Agent-generated views — this extends the catalog-based pattern to PDF output
- **LLM-02:** All LLM calls go through AI SDK via `@ai-sdk/gateway` — the inner call follows this
- Uses `generateText()` (not `streamText()`) for the inner call since we don't need streaming — we just need the final text result to compile the spec
