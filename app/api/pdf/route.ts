/**
 * PDF render API route.
 * Accepts a json-render spec via POST, renders it to a PDF buffer
 * using @json-render/react-pdf, and returns the PDF bytes.
 * @module app/api/pdf/route
 */
import { renderToBuffer } from "@json-render/react-pdf/render";
import type { Spec } from "@json-render/core";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";

export const maxDuration = 30;

/**
 * Sanitizes a string into a safe filename for Content-Disposition headers.
 * Prevents header injection via quotes or newlines.
 */
function sanitizeFilename(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function POST(req: Request) {
  const auth = await authenticateRequest();
  if (auth.kind === "error") return auth.response;

  const { spec, download, filename } = (await req.json()) as {
    spec: Spec;
    download?: boolean;
    filename?: string;
  };

  if (!spec || !spec.root || !spec.elements) {
    return jsonError("Invalid spec: must include root and elements", 400);
  }

  const safeName = filename ? sanitizeFilename(filename) : "document";

  return pdfResponse(spec, safeName, download ?? false);
}

async function pdfResponse(spec: Spec, name: string, download: boolean) {
  const buffer = await renderToBuffer(spec);

  const disposition = download
    ? `attachment; filename="${name}.pdf"`
    : `inline; filename="${name}.pdf"`;

  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
      "Cache-Control": "no-store",
    },
  });
}
