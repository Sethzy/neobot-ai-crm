/**
 * Full-page deal detail route replacing the legacy CRM drawer.
 * @module app/(dashboard)/customers/deals/[dealId]/page
 */
"use client";

import posthog from "posthog-js";
import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "@/components/icons/lucide-compat";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { ActivitiesSection } from "@/components/crm/detail/activities-section";
import { CustomDataSection } from "@/components/crm/detail/custom-data-section";
import { DealHighlights } from "@/components/crm/detail/deal-highlights";
import {
  DetailTabsLayout,
  type DetailTabDefinition,
} from "@/components/crm/detail/detail-tabs-layout";
import {
  DetailFieldsSection,
  type DetailFieldConfig,
} from "@/components/crm/detail/detail-fields-section";
import { LinkedContactsSection } from "@/components/crm/detail/linked-contacts-section";
import { TagsSection } from "@/components/crm/detail/tags-section";
import { dealKeys, useDeal } from "@/hooks/use-deals";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { useUpdateDeal } from "@/hooks/use-update-deal";
import {
  buildCrmSelectOptions,
  formatContactFullName,
  formatCrmEnumLabel,
  formatCrmPrice,
  parseCustomFieldInputValue,
  toNullableValue,
} from "@/lib/crm/display";
import { supabase } from "@/lib/supabase";

type DealTab = "contacts" | "activity";

const dealTabs: DetailTabDefinition<DealTab>[] = [
  { id: "contacts", label: "Contacts" },
  { id: "activity", label: "Activity" },
] as const;

function serializePrice(nextValue: string) {
  const numericPriceString = nextValue.replace(/[^\d.-]/g, "");

  if (!numericPriceString) {
    return null;
  }

  const parsedPrice = Number(numericPriceString);

  if (Number.isNaN(parsedPrice)) {
    throw new Error("Price must be a valid number.");
  }

  return Math.round(parsedPrice);
}

export default function DealDetailPage() {
  const dealId = useParams<{ dealId?: string }>()?.dealId ?? "";
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const activeTab = (searchParams?.get("tab") ?? "contacts") as DealTab;
  const resolvedActiveTab: DealTab = dealTabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : "contacts";

  const { data: deal, isLoading, isError } = useDeal(dealId);
  const { data: crmConfigResult } = useCrmConfig();
  const updateDeal = useUpdateDeal(dealId);

  useEffect(() => {
    if (!deal) {
      return;
    }

    posthog.capture("crm_record_viewed", {
      entity_type: "deal",
      record_id: deal.deal_id,
    });
  }, [deal?.deal_id]);

  const deleteDeal = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("deals").delete().eq("deal_id", dealId);

      if (error) {
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dealKeys.all });
      toast.success("Deal deleted.");
      router.push("/customers/deals");
    },
    onError: () => {
      toast.error("Unable to delete this deal.");
    },
  });

  const setActiveTab = (nextTab: DealTab) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading deal...
        </div>
      </div>
    );
  }

  if (isError || !deal) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">Deal not found.</p>
          <button
            type="button"
            className="text-sm font-medium text-foreground underline underline-offset-4"
            onClick={() => router.push("/customers/deals")}
          >
            Back to Deals
          </button>
        </div>
      </div>
    );
  }

  const detailFields: DetailFieldConfig[] = [
    {
      key: "address",
      label: "Address",
      value: deal.address,
      onSave: async (nextValue) => {
        await updateDeal.mutateAsync({ address: nextValue.trim() });
      },
    },
    {
      key: "stage",
      label: "Stage",
      value: deal.stage,
      type: "select",
      options: buildCrmSelectOptions(crmConfigResult?.config.deal_stages ?? [], deal.stage),
      onSave: async (nextValue) => {
        await updateDeal.mutateAsync({ stage: nextValue });
      },
    },
    {
      key: "price",
      label: "Price",
      value: deal.price === null ? null : String(deal.price),
      type: "number",
      displayValue: formatCrmPrice(deal.price),
      onSave: async (nextValue) => {
        await updateDeal.mutateAsync({ price: serializePrice(nextValue) });
      },
    },
    {
      key: "notes",
      label: "Notes",
      value: deal.notes,
      type: "textarea",
      gridClassName: "sm:col-span-2 md:col-span-3",
      onSave: async (nextValue) => {
        await updateDeal.mutateAsync({ notes: toNullableValue(nextValue) });
      },
    },
  ];

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <DealHighlights
          deal={deal}
          stageOptions={crmConfigResult?.config.deal_stages ?? []}
          isDeleting={deleteDeal.isPending}
          onAddressSave={async (nextValue) => {
            await updateDeal.mutateAsync({ address: nextValue.trim() });
          }}
          onDelete={() => {
            if (!window.confirm(`Delete ${deal.address}? This cannot be undone.`)) {
              return;
            }

            deleteDeal.mutate();
          }}
          onPriceSave={async (nextValue) => {
            await updateDeal.mutateAsync({ price: serializePrice(nextValue) });
          }}
          onStageSave={async (nextValue) => {
            await updateDeal.mutateAsync({ stage: nextValue });
          }}
        />

        <DetailTabsLayout
          tabs={dealTabs}
          activeTab={resolvedActiveTab}
          navAriaLabel="Deal detail sections"
          onTabChange={setActiveTab}
        >
          {resolvedActiveTab === "activity" ? (
            <ActivitiesSection mode={{ kind: "deal", dealId }} />
          ) : null}
          {resolvedActiveTab === "contacts" ? (
            <LinkedContactsSection
              contacts={deal.deal_contacts.map((dealContact) => ({
                id: dealContact.contact_id,
                name: dealContact.contacts ? formatContactFullName(dealContact.contacts) : "Unknown contact",
                badge: formatCrmEnumLabel(dealContact.role),
                meta: dealContact.is_primary ? "Primary contact" : null,
                href: `/customers/people/${dealContact.contact_id}`,
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
            definitions={crmConfigResult?.config.deal_custom_fields ?? []}
            values={(deal.custom_fields as Record<string, unknown> | null | undefined) ?? {}}
            onSaveField={async (definition, nextValue) => {
              await updateDeal.mutateAsync({
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
