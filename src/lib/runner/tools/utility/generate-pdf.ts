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
