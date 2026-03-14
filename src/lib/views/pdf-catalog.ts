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
