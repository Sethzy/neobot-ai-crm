/**
 * Contact detail page with read-only profile and related tabs.
 * @module app/(dashboard)/crm/contacts/[contactId]/page
 */
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Mail, Phone } from "lucide-react";

import { ContactDeals } from "@/components/crm/contact-deals";
import { ContactTimeline } from "@/components/crm/contact-timeline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useContact } from "@/hooks/use-contacts";
import { contactTypeBadgeVariantMap, formatContactFullName } from "@/lib/crm/display";

export default function ContactDetailPage() {
  const params = useParams<{ contactId: string }>();
  const contactId = params?.contactId ?? "";
  const { data: contact, isLoading, isError } = useContact(contactId);
  const isMismatchedContact = Boolean(contact && contact.contact_id !== contactId);

  if (!contactId) {
    return null;
  }

  if (isLoading || isMismatchedContact || (!contact && !isError)) {
    return (
      <div className="flex h-full animate-pulse flex-col bg-muted/5 px-4 py-6 md:px-12 md:py-10">
        <div className="mb-2 h-3 w-32 rounded bg-muted/40" />
        <div className="h-7 w-64 rounded bg-muted" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-16 rounded-lg bg-muted/30" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !contact) {
    return (
      <div className="px-4 py-6 text-center md:px-12 md:py-10">
        <p className="text-destructive">Contact not found</p>
        <Link href="/crm/contacts" className="mt-4 inline-block text-primary hover:underline">
          Back to Contacts
        </Link>
      </div>
    );
  }

  const fullName = formatContactFullName(contact);

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <nav className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/60">
        <Link href="/crm" className="transition-colors hover:text-foreground">
          CRM
        </Link>
        <span className="font-light text-muted-foreground/30">/</span>
        <Link href="/crm/contacts" className="transition-colors hover:text-foreground">
          Contacts
        </Link>
        <span className="font-light text-muted-foreground/30">/</span>
        <span className="font-semibold text-foreground/70">{fullName}</span>
      </nav>

      <div className="mt-2 flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{fullName}</h1>
        <Badge variant={contactTypeBadgeVariantMap[contact.type]}>{contact.type}</Badge>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Email
            </CardTitle>
          </CardHeader>
          <CardContent>
            {contact.email ? (
              <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-sm hover:underline">
                <Mail className="h-4 w-4 text-muted-foreground/60" />
                {contact.email}
              </a>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Phone
            </CardTitle>
          </CardHeader>
          <CardContent>
            {contact.phone ? (
              <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-sm hover:underline">
                <Phone className="h-4 w-4 text-muted-foreground/60" />
                {contact.phone}
              </a>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {contact.notes ? (
              <p className="text-sm text-foreground/80">{contact.notes}</p>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <Tabs defaultValue="deals">
          <TabsList
            variant="line"
            className="-mb-[1px] h-auto w-full justify-start gap-4 border-b border-border/40 p-0 [&_button::after]:!bottom-[-1px]"
          >
            <TabsTrigger
              value="deals"
              className="px-1 py-2 text-foreground/60 data-[state=active]:font-semibold hover:text-foreground"
            >
              Deals
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="px-1 py-2 text-foreground/60 data-[state=active]:font-semibold hover:text-foreground"
            >
              Activity
            </TabsTrigger>
          </TabsList>
          <TabsContent value="deals" className="mt-4">
            <ContactDeals contactId={contactId} />
          </TabsContent>
          <TabsContent value="activity" className="mt-4">
            <ContactTimeline contactId={contactId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
