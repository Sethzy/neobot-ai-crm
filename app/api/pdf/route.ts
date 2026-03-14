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
  const { spec, download, filename } = (await req.json()) as {
    spec: Spec;
    download?: boolean;
    filename?: string;
  };

  if (!spec || !spec.root || !spec.elements) {
    return new Response("Invalid spec", { status: 400 });
  }

  return pdfResponse(spec, filename ?? "document", download ?? false);
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
