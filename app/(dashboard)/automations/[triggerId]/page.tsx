/**
 * Automation detail page route.
 * @module app/(dashboard)/automations/[triggerId]/page
 */
"use client";

import { useParams } from "next/navigation";

import { AutomationDetail } from "@/components/automations/automation-detail";

export default function AutomationDetailPage() {
  const params = useParams<{ triggerId: string }>();
  if (!params) return null;
  return <AutomationDetail triggerId={params.triggerId} />;
}
