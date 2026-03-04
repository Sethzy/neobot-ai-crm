/**
 * CRM contacts list page with search/filter controls.
 * @module app/(dashboard)/crm/contacts/page
 */
"use client";

import { Search, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { RecordDrawer } from "@/components/crm/record-drawer";
import { ContactsTable } from "@/components/crm/contacts-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useContacts, type ContactType } from "@/hooks/use-contacts";
import { useRecordDrawer } from "@/hooks/use-record-drawer";
import { contactTypeValues } from "@/lib/crm/schemas";

const allContactTypes = "all";

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [contactTypeFilter, setContactTypeFilter] = useState<string>(allContactTypes);
  const { isOpen, recordId, open, close } = useRecordDrawer();

  const contactFilters = useMemo(() => {
    const normalizedSearch = search.trim();
    const hasTypeFilter = contactTypeFilter !== allContactTypes;

    return {
      search: normalizedSearch.length > 0 ? normalizedSearch : undefined,
      type: hasTypeFilter ? (contactTypeFilter as ContactType) : undefined,
    };
  }, [search, contactTypeFilter]);

  const { data: contacts = [], isLoading, isError, refetch } = useContacts(contactFilters);

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Contacts</h1>
        <p className="mt-2 text-sm text-muted-foreground/80">
          Browse and inspect contacts created by your AI agent.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, email, or phone..."
            className="h-12 w-full border-border/50 pl-11 shadow-sm focus-visible:ring-1"
          />
        </div>
        <Select value={contactTypeFilter} onValueChange={setContactTypeFilter}>
          <SelectTrigger className="h-12 w-full border-border/50 shadow-sm sm:w-40">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={allContactTypes}>All types</SelectItem>
            {contactTypeValues.map((contactType) => (
              <SelectItem key={contactType} value={contactType}>
                {contactType}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-14 rounded-lg bg-muted/30" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6">
            <p className="text-sm text-destructive">Unable to load contacts</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                void refetch();
              }}
            >
              Retry
            </Button>
          </div>
        ) : contacts.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card p-10 text-center shadow-sm md:p-20">
            <Users className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-6 text-muted-foreground">
              {contactFilters.search || contactFilters.type
                ? "No contacts match your filters"
                : "No contacts yet"}
            </p>
          </div>
        ) : (
          <ContactsTable contacts={contacts} onRowClick={open} />
        )}
      </div>

      <RecordDrawer isOpen={isOpen} recordId={recordId} objectType="contact" onClose={close} />
    </div>
  );
}
