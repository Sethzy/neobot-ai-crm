/**
 * Compact deal card for the kanban board, styled to match Twenty CRM.
 * Always renders all rows for uniform height. Each field is inline-editable
 * via popovers (amount, company, contact).
 * @module components/crm/deal-kanban-card
 */
"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Building2, Calendar, DollarSign, User } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useClientId } from "@/hooks/use-client-id";
import { companiesQueryOptions } from "@/hooks/use-companies";
import { contactsQueryOptions } from "@/hooks/use-contacts";
import { dealKeys, type DealWithContact } from "@/hooks/use-deals";
import { useUpdateDeal } from "@/hooks/use-update-deal";
import {
  avatarColorFor,
  formatCompactCurrency,
  formatContactFullName,
  formatCrmDate,
} from "@/lib/crm/display";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface DealKanbanCardProps {
  deal: DealWithContact;
}

/** Shared trigger button styling for all inline-edit rows. */
const rowTriggerClassName =
  "flex w-full items-center gap-2 rounded-sm text-left hover:bg-muted/50";

/** Stops click from propagating to the card (which opens the drawer). */
function stop(e: React.MouseEvent) {
  e.stopPropagation();
}

/* -------------------------------------------------------------------------- */
/*  Amount editor                                                             */
/* -------------------------------------------------------------------------- */

function AmountRow({ amount, dealId }: { amount: number | null; dealId: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  function handleOpen(next: boolean) {
    if (next) {
      setDraft(amount != null ? String(amount) : "");
    }
    setOpen(next);
  }

  async function handleSave() {
    const trimmed = draft.trim().replace(/[^0-9.-]/g, "");
    const parsed = trimmed ? Number(trimmed) : null;
    if (parsed !== null && Number.isNaN(parsed)) return;

    // DB column is `price` (app schema uses `amount`)
    const { error } = await supabase
      .from("deals")
      .update({ price: parsed } as never)
      .eq("deal_id", dealId);

    if (error) throw error;

    await queryClient.invalidateQueries({ queryKey: dealKeys.all });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={rowTriggerClassName} onClick={stop}>
          <DollarSign className="h-3 w-3 shrink-0" />
          {amount != null ? (
            <span>{formatCompactCurrency(amount)}</span>
          ) : (
            <span className="text-muted-foreground/50">Amount</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-44 p-2"
        align="start"
        onClick={stop}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
          inputRef.current?.select();
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            placeholder="Enter amount"
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-control outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
          />
        </form>
      </PopoverContent>
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */
/*  Company picker                                                            */
/* -------------------------------------------------------------------------- */

function CompanyPickerRow({
  companyName,
  dealId,
}: {
  companyName: string | null;
  dealId: string;
}) {
  const [open, setOpen] = useState(false);
  const updateDeal = useUpdateDeal(dealId);

  const { data: companies = [] } = useQuery({
    ...companiesQueryOptions({}),
    enabled: open,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={rowTriggerClassName} onClick={stop}>
          <Building2 className="h-3 w-3 shrink-0" />
          {companyName ? (
            <span className="truncate">{companyName}</span>
          ) : (
            <span className="truncate text-muted-foreground/50">Company</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start" onClick={stop}>
        <Command>
          <CommandInput placeholder="Search" />
          <CommandList>
            <CommandEmpty>No companies found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                data-checked={!companyName}
                onSelect={async () => {
                  await updateDeal.mutateAsync({ company_id: null });
                  setOpen(false);
                }}
              >
                <Ban className="h-3.5 w-3.5 text-muted-foreground" />
                No Company
              </CommandItem>
              {companies.map((company) => (
                <CommandItem
                  key={company.company_id}
                  data-checked={company.name === companyName}
                  onSelect={async () => {
                    await updateDeal.mutateAsync({
                      company_id: company.company_id,
                    });
                    setOpen(false);
                  }}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded text-caption font-semibold",
                      avatarColorFor(company.name),
                    )}
                  >
                    {company.name.charAt(0).toUpperCase()}
                  </span>
                  {company.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */
/*  Contact picker                                                            */
/* -------------------------------------------------------------------------- */

function ContactPickerRow({
  contactName,
  contactId,
  dealId,
}: {
  contactName: string | null;
  contactId: string | null;
  dealId: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: clientId } = useClientId();
  const queryClient = useQueryClient();

  const { data: contacts = [] } = useQuery({
    ...contactsQueryOptions({}),
    enabled: open,
  });

  async function pickContact(nextContactId: string | null) {
    if (!clientId) return;

    // Remove existing primary contact link
    if (contactId) {
      await supabase
        .from("deal_contacts")
        .delete()
        .eq("deal_id", dealId)
        .eq("contact_id", contactId);
    }

    // Insert new link
    if (nextContactId) {
      await supabase.from("deal_contacts").insert({
        client_id: clientId,
        deal_id: dealId,
        contact_id: nextContactId,
        role: "buyer",
        is_primary: true,
      });
    }

    await queryClient.invalidateQueries({ queryKey: dealKeys.all });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={rowTriggerClassName} onClick={stop}>
          <User className="h-3 w-3 shrink-0" />
          {contactName ? (
            <span className="inline-flex items-center gap-1 truncate">
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-caption font-medium",
                  avatarColorFor(contactName),
                )}
              >
                {contactName.charAt(0).toUpperCase()}
              </span>
              {contactName}
            </span>
          ) : (
            <span className="text-muted-foreground/50">Contact</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start" onClick={stop}>
        <Command>
          <CommandInput placeholder="Search" />
          <CommandList>
            <CommandEmpty>No contacts found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                data-checked={!contactId}
                onSelect={() => pickContact(null)}
              >
                <Ban className="h-3.5 w-3.5 text-muted-foreground" />
                No Contact
              </CommandItem>
              {contacts.map((contact) => {
                const name = formatContactFullName(contact);
                return (
                  <CommandItem
                    key={contact.contact_id}
                    data-checked={contact.contact_id === contactId}
                    onSelect={() => pickContact(contact.contact_id)}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-caption font-medium",
                        avatarColorFor(name),
                      )}
                    >
                      {name.charAt(0).toUpperCase()}
                    </span>
                    {name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */
/*  Card                                                                      */
/* -------------------------------------------------------------------------- */

export function DealKanbanCard({ deal }: DealKanbanCardProps) {
  const primaryContact =
    deal.deal_contacts?.find((dc) => dc.is_primary) ?? deal.deal_contacts?.[0];
  const contactName = primaryContact?.contacts
    ? formatContactFullName(primaryContact.contacts)
    : null;
  const contactId = primaryContact?.contact_id ?? null;
  const companyName = deal.companies?.name ?? null;
  const initial = deal.address.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col gap-1.5">
      {/* Title row: colored initial + deal name */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded text-caption font-semibold",
            avatarColorFor(deal.address),
          )}
        >
          {initial}
        </span>
        <span className="type-row-title truncate text-foreground">
          {deal.address}
        </span>
      </div>

      {/* Data rows — all rendered for uniform card height, each inline-editable */}
      <div className="flex flex-col gap-1 pl-7 type-row-meta text-muted-foreground">
        <AmountRow amount={deal.amount} dealId={deal.deal_id} />
        <div className="flex items-center gap-2">
          <Calendar className="h-3 w-3 shrink-0" />
          <span>{formatCrmDate(deal.updated_at)}</span>
        </div>
        <CompanyPickerRow companyName={companyName} dealId={deal.deal_id} />
        <ContactPickerRow
          contactName={contactName}
          contactId={contactId}
          dealId={deal.deal_id}
        />
      </div>
    </div>
  );
}
