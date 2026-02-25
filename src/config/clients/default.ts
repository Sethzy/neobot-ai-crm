/**
 * @file Default client configuration
 * @description Matches current hardcoded tag behavior with no extraction
 */

import type { ClientConfig } from "../types";

/**
 * Default configuration for users without a specific client_config_id.
 * Matches current hardcoded tags: invoices, reports, contracts, images, correspondence, other.
 * No extraction configured - classification only.
 */
export const defaultConfig: ClientConfig = {
  id: "default",
  name: "Default Configuration",

  tags: [
    {
      id: "invoices",
      displayName: "Invoices",
      classificationHint:
        "Bills, invoices, payment requests, statements showing amounts owed. Look for line items, totals, invoice numbers.",
      extendProcessorId: null,
    },
    {
      id: "reports",
      displayName: "Reports",
      classificationHint:
        "Reports, summaries, analyses, assessments. Medical reports, financial reports, inspection reports.",
      extendProcessorId: null,
    },
    {
      id: "contracts",
      displayName: "Contracts",
      classificationHint:
        "Contracts, agreements, terms and conditions. Legal documents with parties, signatures, terms.",
      extendProcessorId: null,
    },
    {
      id: "images",
      displayName: "Images",
      classificationHint:
        "Photos, screenshots, diagrams, scanned images. Visual content with minimal text.",
      extendProcessorId: null,
    },
    {
      id: "correspondence",
      displayName: "Correspondence",
      classificationHint:
        "Letters, emails, memos, notices. Communication between parties with sender, recipient, date.",
      extendProcessorId: null,
    },
    {
      id: "other",
      displayName: "Other",
      classificationHint:
        "Documents that don't fit other categories. Cover pages, separator sheets, miscellaneous.",
      extendProcessorId: null,
    },
  ],
};
