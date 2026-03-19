/**
 * Pipeline summary panel for the customers dashboard.
 * @module components/crm/dashboard/pipeline-overview
 */
"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { VariantProps } from "class-variance-authority";

import { AppIcon } from "@/components/icons/app-icons";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { useDeals, type DealWithContact } from "@/hooks/use-deals";
import {
  dealStageBadgeVariantMap,
  formatCompactCurrency,
  formatDealStageLabel,
} from "@/lib/crm/display";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const stageBarClassByVariant = {
  default: "bg-primary",
  destructive: "bg-destructive",
  ghost: "bg-muted-foreground",
  info: "bg-info",
  link: "bg-primary",
  outline: "bg-muted-foreground/50",
  secondary: "bg-muted-foreground/30",
  success: "bg-success",
  warning: "bg-warning",
} as const satisfies Record<BadgeVariant, string>;

export interface PipelineStageSummary {
  stage: string;
  count: number;
  totalValue: number;
}

/**
 * Groups deals by stage, preserving configured order first and appending unknown stages after it.
 */
export function summarizePipelineStages(
  deals: DealWithContact[],
  configuredStages: string[],
): PipelineStageSummary[] {
  const summariesByStage = new Map<string, PipelineStageSummary>();

  for (const deal of deals) {
    const existingSummary = summariesByStage.get(deal.stage);

    if (existingSummary) {
      existingSummary.count += 1;
      existingSummary.totalValue += deal.price ?? 0;
      continue;
    }

    summariesByStage.set(deal.stage, {
      stage: deal.stage,
      count: 1,
      totalValue: deal.price ?? 0,
    });
  }

  const orderedStages = [
    ...configuredStages.filter((stage) => summariesByStage.has(stage)),
    ...Array.from(summariesByStage.keys()).filter(
      (stage) => !configuredStages.includes(stage),
    ),
  ];

  return orderedStages.map((stage) => summariesByStage.get(stage)!);
}

/**
 * Renders a read-only view of the current deal pipeline with drill-down links per stage.
 */
export function PipelineOverview() {
  const { data: deals = [], isLoading, isError, refetch } = useDeals({});
  const { data: crmConfigResult } = useCrmConfig();

  const stageSummaries = useMemo(() => {
    return summarizePipelineStages(
      deals,
      crmConfigResult?.config.deal_stages ?? [],
    );
  }, [crmConfigResult?.config.deal_stages, deals]);

  const maxStageCount = useMemo(() => {
    return stageSummaries.reduce((maxCount, summary) => {
      return Math.max(maxCount, summary.count);
    }, 0);
  }, [stageSummaries]);

  return (
    <section className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Pipeline Overview
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A stage-by-stage snapshot of active deal volume and value.
          </p>
        </div>
        <Link
          href="/customers/deals/pipeline"
          className="shrink-0 whitespace-nowrap text-right text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Open pipeline
        </Link>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-xl bg-muted/40"
              />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">
              Unable to load pipeline overview.
            </p>
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
        ) : stageSummaries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No deals in the pipeline yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {stageSummaries.map((summary) => {
              const stageVariant =
                dealStageBadgeVariantMap[
                  summary.stage as keyof typeof dealStageBadgeVariantMap
                ] ?? "secondary";
              const barClassName =
                stageBarClassByVariant[stageVariant] ?? stageBarClassByVariant.secondary;
              const widthPercentage =
                maxStageCount > 0
                  ? Math.max((summary.count / maxStageCount) * 100, 12)
                  : 0;

              return (
                <Link
                  key={summary.stage}
                  href={`/customers/deals?stage=${encodeURIComponent(summary.stage)}`}
                  className="group block rounded-xl border border-border/50 p-4 transition-colors hover:border-foreground/20 hover:bg-muted/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {formatDealStageLabel(summary.stage)}
                        </p>
                        <Badge variant={stageVariant}>
                          {summary.count} {summary.count === 1 ? "deal" : "deals"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatCompactCurrency(summary.totalValue)}
                      </p>
                    </div>
                    <AppIcon
                      name="arrowUpRight"
                      className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground/80"
                    />
                  </div>

                  <div className="mt-4 h-2 rounded-full bg-muted/60">
                    <div
                      className={`${barClassName} h-full rounded-full transition-[width] duration-300`}
                      style={{ width: `${widthPercentage}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
