/**
 * PDF render API route.
 * Accepts a json-render spec via POST, renders it to a PDF buffer
 * using @json-render/react-pdf, and returns the PDF bytes.
 * @module app/api/pdf/route
 */
import { renderToBuffer } from "@json-render/react-pdf/render";
import type { Spec } from "@json-render/core";
import { z } from "zod";

import {
  authenticateAndParseBody,
  jsonError,
} from "@/lib/api/route-helpers";

export const maxDuration = 30;
const maxPdfRouteBodyBytes = 256 * 1024;
const maxPdfSpecElements = 500;

const pdfElementSchema = z.object({
  type: z.string().min(1).max(100),
  props: z.record(z.string().max(200), z.unknown()).default({}),
  children: z.array(z.string().min(1).max(200)).max(100).optional(),
  visible: z.unknown().optional(),
  on: z.record(z.string().max(100), z.unknown()).optional(),
  repeat: z.object({
    statePath: z.string().min(1).max(200),
    key: z.string().min(1).max(200).optional(),
  }).optional(),
  watch: z.record(z.string().max(200), z.unknown()).optional(),
});

const pdfSpecSchema = z.object({
  root: z.string().min(1).max(200),
  elements: z.record(z.string().min(1).max(200), pdfElementSchema).superRefine(
    (elements, context) => {
      if (Object.keys(elements).length <= maxPdfSpecElements) {
        return;
      }

      context.addIssue({
        code: "custom",
        message: `spec.elements must contain at most ${maxPdfSpecElements} elements.`,
      });
    },
  ),
  state: z.record(z.string().max(200), z.unknown()).optional(),
}).superRefine((spec, context) => {
  if (spec.root in spec.elements) {
    return;
  }

  context.addIssue({
    code: "custom",
    message: "spec.root must reference an existing element.",
    path: ["root"],
  });
});

/**
 * Request body schema. The spec remains intentionally permissive at the prop
 * level because json-render owns the detailed component contract, but the
 * wrapper now bounds the overall shape and element count.
 */
const requestSchema = z.object({
  spec: pdfSpecSchema,
  download: z.boolean().optional(),
  filename: z.string().max(200).optional(),
});

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
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxPdfRouteBodyBytes) {
    return jsonError("Payload too large", 413);
  }

  const parsed = await authenticateAndParseBody(req, requestSchema);
  if (parsed.kind === "error") {
    return parsed.response;
  }

  const { spec, download, filename } = parsed.body;
  const typedSpec = spec as Spec;

  const safeName = filename ? sanitizeFilename(filename) : "document";

  return pdfResponse(typedSpec, safeName, download ?? false);
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
