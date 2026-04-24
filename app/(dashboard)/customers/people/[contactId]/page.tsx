/**
 * Full-page people detail route.
 * @module app/(dashboard)/customers/people/[contactId]/page
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ContactDetailContent } from "@/components/crm/record-detail/contact-detail-content";
import { PageCanvas, PageSurface } from "@/components/layout/page-canvas";
import { Button } from "@/components/ui/button";
import type { ContactWithCompany } from "@/lib/crm/contact-record";
import { getSingleQueryParam, resolveCrmRecordBackHref } from "@/lib/crm/navigation";
import { createClient } from "@/lib/supabase/server";

interface ContactDetailPageProps {
  params: Promise<{
    contactId: string;
  }>;
  searchParams?: Promise<{
    from?: string | string[];
  }>;
}

/**
 * Fetches the contact record on the server so the full-page route can render
 * meaningful content on first paint instead of waiting for the client query.
 */
async function loadInitialContact(contactId: string): Promise<ContactWithCompany | undefined> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("contacts")
      .select("*, companies!contacts_company_id_fkey(company_id, name)")
      .eq("contact_id", contactId)
      .single();

    if (error) {
      return undefined;
    }

    return data as ContactWithCompany;
  } catch {
    return undefined;
  }
}

export default async function ContactDetailPage({
  params,
  searchParams,
}: ContactDetailPageProps) {
  const [{ contactId }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams ? searchParams : Promise.resolve({}),
  ]);
  const initialContact = await loadInitialContact(contactId);
  const backHref = resolveCrmRecordBackHref(
    "contact",
    getSingleQueryParam(resolvedSearchParams.from),
  );

  return (
    <PageCanvas>
      <div>
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Link href={backHref}>
            <ArrowLeft className="size-4" />
            <span>Back to People</span>
          </Link>
        </Button>
      </div>
      <PageSurface padding="none" className="overflow-hidden">
        <ContactDetailContent
          contactId={contactId}
          surface="page"
          initialContact={initialContact}
        />
      </PageSurface>
    </PageCanvas>
  );
}
