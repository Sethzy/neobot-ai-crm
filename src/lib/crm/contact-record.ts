/**
 * Shared CRM contact record shapes reused across server and client modules.
 * @module lib/crm/contact-record
 */
import type { Company, Contact } from "@/lib/crm/schemas";

/** Contact row joined with the minimal linked company fields used in CRM UI. */
export type ContactWithCompany = Contact & {
  companies: Pick<Company, "company_id" | "name"> | null;
};
