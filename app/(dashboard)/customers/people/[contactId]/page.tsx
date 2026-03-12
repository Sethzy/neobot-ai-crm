/**
 * Full-page people detail route replacing the legacy CRM drawer.
 * @module app/(dashboard)/customers/people/[contactId]/page
 */
"use client";

import posthog from "posthog-js";
import { useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "@/components/icons/lucide-compat";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { ActivitiesSection } from "@/components/crm/detail/activities-section";
import { CustomDataSection } from "@/components/crm/detail/custom-data-section";
import {
  DetailTabsLayout,
  type DetailTabDefinition,
} from "@/components/crm/detail/detail-tabs-layout";
import {
  DetailFieldsSection,
  type DetailFieldConfig,
} from "@/components/crm/detail/detail-fields-section";
import { LinkedDealsSection } from "@/components/crm/detail/linked-deals-section";
import { LinkedTasksSection } from "@/components/crm/detail/linked-tasks-section";
import { NotesSection } from "@/components/crm/detail/notes-section";
import { PersonHighlights } from "@/components/crm/detail/person-highlights";
import { TagsSection } from "@/components/crm/detail/tags-section";
import { useContactDeals, useContactTasks } from "@/hooks/use-contact-relations";
import { useCompanies } from "@/hooks/use-companies";
import { useCrmConfig } from "@/hooks/use-crm-config";
import {
  contactKeys,
  useContact,
} from "@/hooks/use-contacts";
import { useUpdateContact } from "@/hooks/use-update-contact";
import {
  formatContactFullName,
  parseCustomFieldInputValue,
  toNullableValue,
} from "@/lib/crm/display";
import { supabase } from "@/lib/supabase";

type PersonTab = "notes" | "activities" | "deals" | "tasks";

const personTabs: DetailTabDefinition<PersonTab>[] = [
  { id: "notes", label: "Notes" },
  { id: "activities", label: "Activities" },
  { id: "deals", label: "Deals" },
  { id: "tasks", label: "Tasks" },
] as const;

function parsePersonName(nextValue: string, fallbackLastName: string) {
  const parts = nextValue.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return {
      first_name: "",
      last_name: fallbackLastName,
    };
  }

  if (parts.length === 1) {
    return {
      first_name: parts[0],
      last_name: fallbackLastName || parts[0],
    };
  }

  return {
    first_name: parts.slice(0, -1).join(" "),
    last_name: parts.at(-1) ?? fallbackLastName,
  };
}

export default function PersonDetailPage() {
  const contactId = useParams<{ contactId?: string }>()?.contactId ?? "";
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const activeTab = (searchParams?.get("tab") ?? "notes") as PersonTab;
  const resolvedActiveTab: PersonTab = personTabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : "notes";

  const { data: contact, isLoading, isError } = useContact(contactId);
  const { data: companies = [] } = useCompanies({});
  const { data: linkedDeals = [] } = useContactDeals(contactId);
  const { data: linkedTasks = [] } = useContactTasks(contactId);
  const { data: crmConfigResult } = useCrmConfig();
  const updateContact = useUpdateContact(contactId);

  useEffect(() => {
    if (!contact) {
      return;
    }

    posthog.capture("crm_record_viewed", {
      entity_type: "contact",
      record_id: contact.contact_id,
    });
  }, [contact?.contact_id]);

  const deleteContact = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contacts").delete().eq("contact_id", contactId);

      if (error) {
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: contactKeys.all });
      toast.success("Person deleted.");
      router.push("/customers/people");
    },
    onError: () => {
      toast.error("Unable to delete this person.");
    },
  });

  const contactTypeOptions = crmConfigResult?.config.contact_types ?? [];
  const companyOptions = useMemo(
    () => [
      { value: "__none__", label: "No company" },
      ...companies.map((company) => ({
        value: company.company_id,
        label: company.name,
      })),
    ],
    [companies],
  );

  const setActiveTab = (nextTab: PersonTab) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading person...
        </div>
      </div>
    );
  }

  if (isError || !contact) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">Person not found.</p>
          <button
            type="button"
            className="text-sm font-medium text-foreground underline underline-offset-4"
            onClick={() => router.push("/customers/people")}
          >
            Back to People
          </button>
        </div>
      </div>
    );
  }

  const detailFields: DetailFieldConfig[] = [
    {
      key: "display-name",
      label: "Display Name",
      value: formatContactFullName(contact),
      onSave: async (nextValue) => {
        const parsedName = parsePersonName(nextValue, contact.last_name);
        await updateContact.mutateAsync(parsedName);
      },
    },
    {
      key: "first-name",
      label: "First Name",
      value: contact.first_name,
      onSave: async (nextValue) => {
        await updateContact.mutateAsync({ first_name: nextValue.trim() });
      },
    },
    {
      key: "last-name",
      label: "Last Name",
      value: contact.last_name,
      onSave: async (nextValue) => {
        await updateContact.mutateAsync({ last_name: nextValue.trim() });
      },
    },
    {
      key: "company",
      label: "Company",
      value: contact.company_id ?? "__none__",
      type: "select",
      options: companyOptions,
      onSave: async (nextValue) => {
        await updateContact.mutateAsync({
          company_id: nextValue === "__none__" ? null : nextValue,
        });
      },
    },
    {
      key: "notes",
      label: "Notes",
      value: contact.notes,
      type: "textarea",
      gridClassName: "sm:col-span-2 md:col-span-3",
      onSave: async (nextValue) => {
        await updateContact.mutateAsync({ notes: toNullableValue(nextValue) });
      },
    },
  ];

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <PersonHighlights
          contact={contact}
          contactTypeOptions={contactTypeOptions}
          isDeleting={deleteContact.isPending}
          onDelete={() => {
            if (!window.confirm(`Delete ${formatContactFullName(contact)}? This cannot be undone.`)) {
              return;
            }

            deleteContact.mutate();
          }}
          onCompanySave={async (companyId) => {
            await updateContact.mutateAsync({ company_id: companyId });
          }}
          onEmailSave={async (nextValue) => {
            await updateContact.mutateAsync({ email: toNullableValue(nextValue) });
          }}
          onNameSave={async (nextValue) => {
            const parsedName = parsePersonName(nextValue, contact.last_name);
            await updateContact.mutateAsync(parsedName);
          }}
          onPhoneSave={async (nextValue) => {
            await updateContact.mutateAsync({ phone: toNullableValue(nextValue) });
          }}
          onTypeSave={async (nextValue) => {
            await updateContact.mutateAsync({ type: nextValue });
          }}
        />

        <DetailTabsLayout
          tabs={personTabs}
          activeTab={resolvedActiveTab}
          navAriaLabel="Person detail sections"
          onTabChange={setActiveTab}
        >
          {resolvedActiveTab === "activities" ? (
            <ActivitiesSection mode={{ kind: "contact", contactId }} />
          ) : null}
          {resolvedActiveTab === "deals" ? (
            <LinkedDealsSection
              deals={linkedDeals
                .filter((link) => link.deals)
                .map((link) => ({
                  id: link.deal_id,
                  address: link.deals?.address ?? "Untitled deal",
                  stage: link.deals?.stage ?? "leads",
                  price: link.deals?.price ?? null,
                  href: `/customers/deals/${link.deal_id}`,
                }))}
            />
          ) : null}
          {resolvedActiveTab === "tasks" ? <LinkedTasksSection tasks={linkedTasks} /> : null}
          {resolvedActiveTab === "notes" ? (
            <NotesSection contactId={contactId} />
          ) : null}
        </DetailTabsLayout>

        <div className="space-y-6">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Details</h2>
            <DetailFieldsSection fields={detailFields} />
          </section>

          <CustomDataSection
            definitions={crmConfigResult?.config.contact_custom_fields ?? []}
            values={(contact.custom_fields as Record<string, unknown> | null | undefined) ?? {}}
            onSaveField={async (definition, nextValue) => {
              await updateContact.mutateAsync({
                custom_fields: {
                  [definition.key]: parseCustomFieldInputValue(definition.type, nextValue),
                },
              });
            }}
          />

          <TagsSection />
        </div>
      </div>
    </div>
  );
}
