/**
 * Full-page people detail route.
 * @module app/(dashboard)/customers/people/[contactId]/page
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ContactDetailContent } from "@/components/crm/record-detail/contact-detail-content";
import { PageCanvas, PageSurface } from "@/components/layout/page-canvas";
import { Button } from "@/components/ui/button";

interface ContactDetailPageProps {
  params: Promise<{
    contactId: string;
  }>;
}

export default async function ContactDetailPage({ params }: ContactDetailPageProps) {
  const { contactId } = await params;

  return (
    <PageCanvas>
      <div>
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Link href="/customers/people">
            <ArrowLeft className="size-4" />
            <span>Back to People</span>
          </Link>
        </Button>
      </div>
      <PageSurface padding="none" className="overflow-hidden">
        <ContactDetailContent contactId={contactId} surface="page" />
      </PageSurface>
    </PageCanvas>
  );
}
