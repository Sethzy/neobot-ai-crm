/**
 * Full-page company detail route replacing the legacy CRM drawer.
 * @module app/(dashboard)/customers/companies/[companyId]/page
 */
"use client";

import posthog from "posthog-js";
import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "@/components/icons/lucide-compat";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { CompanyHighlights } from "@/components/crm/detail/company-highlights";
import { CustomDataSection } from "@/components/crm/detail/custom-data-section";
import {
  DetailTabsLayout,
  type DetailTabDefinition,
} from "@/components/crm/detail/detail-tabs-layout";
import {
  DetailFieldsSection,
  type DetailFieldConfig,
} from "@/components/crm/detail/detail-fields-section";
import { LinkedContactsSection } from "@/components/crm/detail/linked-contacts-section";
import { LinkedDealsSection } from "@/components/crm/detail/linked-deals-section";
import { TagsSection } from "@/components/crm/detail/tags-section";
import { useCompanyContacts, useCompanyDeals } from "@/hooks/use-company-relations";
import { useCompany, companyKeys } from "@/hooks/use-companies";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { useUpdateCompany } from "@/hooks/use-update-company";
import { CRM_DEFAULTS } from "@/lib/crm/config";
import {
  formatContactFullName,
  formatCrmEnumLabel,
  parseCustomFieldInputValue,
  toNullableValue,
} from "@/lib/crm/display";
import { supabase } from "@/lib/supabase";

type CompanyTab = "contacts" | "deals";

const companyTabs: DetailTabDefinition<CompanyTab>[] = [
  { id: "contacts", label: "Contacts" },
  { id: "deals", label: "Deals" },
] as const;

export default function CompanyDetailPage() {
  const companyId = useParams<{ companyId?: string }>()?.companyId ?? "";
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const activeTab = (searchParams?.get("tab") ?? "contacts") as CompanyTab;
  const resolvedActiveTab: CompanyTab = companyTabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : "contacts";

  const { data: company, isLoading, isError } = useCompany(companyId);
  const { data: linkedContacts = [] } = useCompanyContacts(companyId);
  const { data: linkedDeals = [] } = useCompanyDeals(companyId);
  const { data: crmConfigResult } = useCrmConfig();
  const updateCompany = useUpdateCompany(companyId);

  useEffect(() => {
    if (!company) {
      return;
    }

    posthog.capture("crm_record_viewed", {
      entity_type: "company",
      record_id: company.company_id,
    });
  }, [company?.company_id]);

  const deleteCompany = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("companies").delete().eq("company_id", companyId);

      if (error) {
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: companyKeys.all });
      toast.success("Company deleted.");
      router.push("/customers/companies");
    },
    onError: () => {
      toast.error("Unable to delete this company.");
    },
  });

  const setActiveTab = (nextTab: CompanyTab) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading company...
        </div>
      </div>
    );
  }

  if (isError || !company) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">Company not found.</p>
          <button
            type="button"
            className="text-sm font-medium text-foreground underline underline-offset-4"
            onClick={() => router.push("/customers/companies")}
          >
            Back to Companies
          </button>
        </div>
      </div>
    );
  }

  const detailFields: DetailFieldConfig[] = [
    {
      key: "name",
      label: "Name",
      value: company.name,
      onSave: async (nextValue) => {
        await updateCompany.mutateAsync({ name: nextValue.trim() });
      },
    },
    {
      key: "address",
      label: "Address",
      value: company.address,
      onSave: async (nextValue) => {
        await updateCompany.mutateAsync({ address: toNullableValue(nextValue) });
      },
    },
    {
      key: "notes",
      label: "Notes",
      value: company.notes,
      type: "textarea",
      gridClassName: "sm:col-span-2 md:col-span-3",
      onSave: async (nextValue) => {
        await updateCompany.mutateAsync({ notes: toNullableValue(nextValue) });
      },
    },
  ];

  const industryOptions = crmConfigResult?.config.company_industries?.length
    ? crmConfigResult.config.company_industries
    : CRM_DEFAULTS.company_industries;

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <CompanyHighlights
          company={company}
          industryOptions={industryOptions}
          isDeleting={deleteCompany.isPending}
          onDelete={() => {
            if (!window.confirm(`Delete ${company.name}? This cannot be undone.`)) {
              return;
            }

            deleteCompany.mutate();
          }}
          onEmailSave={async (nextValue) => {
            await updateCompany.mutateAsync({ email: toNullableValue(nextValue) });
          }}
          onIndustrySave={async (nextValue) => {
            await updateCompany.mutateAsync({ industry: nextValue });
          }}
          onNameSave={async (nextValue) => {
            await updateCompany.mutateAsync({ name: nextValue.trim() });
          }}
          onPhoneSave={async (nextValue) => {
            await updateCompany.mutateAsync({ phone: toNullableValue(nextValue) });
          }}
          onWebsiteSave={async (nextValue) => {
            await updateCompany.mutateAsync({ website: toNullableValue(nextValue) });
          }}
        />

        <DetailTabsLayout
          tabs={companyTabs}
          activeTab={resolvedActiveTab}
          navAriaLabel="Company detail sections"
          onTabChange={setActiveTab}
        >
          {resolvedActiveTab === "deals" ? (
            <LinkedDealsSection
              deals={linkedDeals.map((deal) => ({
                id: deal.deal_id,
                address: deal.address,
                stage: deal.stage,
                price: deal.price,
                href: `/customers/deals/${deal.deal_id}`,
              }))}
            />
          ) : null}
          {resolvedActiveTab === "contacts" ? (
            <LinkedContactsSection
              contacts={linkedContacts.map((contact) => ({
                id: contact.contact_id,
                name: formatContactFullName(contact),
                badge: formatCrmEnumLabel(contact.type),
                meta: contact.email || contact.phone || null,
                href: `/customers/people/${contact.contact_id}`,
              }))}
            />
          ) : null}
        </DetailTabsLayout>

        <div className="space-y-6">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Details</h2>
            <DetailFieldsSection fields={detailFields} />
          </section>

          <CustomDataSection
            definitions={crmConfigResult?.config.company_custom_fields ?? []}
            values={(company.custom_fields as Record<string, unknown> | null | undefined) ?? {}}
            onSaveField={async (definition, nextValue) => {
              await updateCompany.mutateAsync({
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
