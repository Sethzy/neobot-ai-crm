/**
 * @file Validation rules section for case detail page
 * @description Shows all validation rules grouped by document type with pass/fail stats
 */
import { useCaseSplits } from "@/hooks/use-splits";
import { useDocuments } from "@/hooks/use-documents";
import { useClientConfigId } from "@/hooks/use-client-config";
import { getClientConfig } from "@/config/loader";
import type { TagDefinition, ValidationFailure } from "@/config/types";
import type { SplitExtraction } from "@/types/extraction";
import type { Document } from "@/types/documents";
import { AlertTriangle, CheckCircle2, Info } from "@/components/icons/lucide-compat";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

interface ValidationRulesSectionProps {
  /** Case ID to fetch splits for */
  caseId: string;
}

/**
 * Extracts unique validation rules from a tag's validate function.
 * Runs validate with empty object to discover rule structure.
 */
function getValidationRulesForTag(
  tag: TagDefinition
): Array<{ ruleId: string; ruleName: string; message: string; description?: string; field: string | string[] }> {
  if (!tag.validate) return [];

  // Run validate with empty object to get all possible failures
  // This reveals the rule structure without needing actual data
  const failures = tag.validate({});

  // Dedupe by ruleId (same rule might fire multiple times)
  const seen = new Set<string>();
  return failures.filter((f) => {
    if (seen.has(f.ruleId)) return false;
    seen.add(f.ruleId);
    return true;
  });
}

/**
 * Gets document names that fail a specific validation rule.
 */
function getFailingDocsForRule(
  splits: SplitExtraction[],
  documents: Document[],
  tagId: string,
  ruleId: string
): string[] {
  // Build document ID to name lookup
  const docNameMap = new Map(
    documents.map((d) => [d.id, d.renamed_filename || d.original_filename])
  );

  // Find splits with this failure (excluding dismissed rules)
  const failingSplits = splits.filter(
    (s) =>
      s.tagId === tagId &&
      s.validationFailures?.some(
        (f: ValidationFailure) =>
          f.ruleId === ruleId && !s.dismissedRuleIds?.includes(f.ruleId)
      )
  );

  // Map to unique document names
  const docNames = new Set<string>();
  for (const split of failingSplits) {
    const name = docNameMap.get(split.documentId);
    if (name) docNames.add(name);
  }

  return Array.from(docNames);
}

/**
 * Counts how many splits of a given tag have a specific validation failure.
 */
function countFailuresForRule(
  splits: SplitExtraction[],
  tagId: string,
  ruleId: string
): { failing: number; total: number } {
  const tagSplits = splits.filter((s) => s.tagId === tagId);
  const failing = tagSplits.filter((s) =>
    s.validationFailures?.some(
      (f: ValidationFailure) =>
        f.ruleId === ruleId && !s.dismissedRuleIds?.includes(f.ruleId)
    )
  ).length;

  return { failing, total: tagSplits.length };
}

/**
 * Counts total validation issues for a tag across all splits (excluding dismissed).
 */
function countTotalIssuesForTag(
  splits: SplitExtraction[],
  tagId: string
): number {
  const tagSplits = splits.filter((s) => s.tagId === tagId);
  return tagSplits.reduce((sum, s) => {
    const undismissedFailures =
      s.validationFailures?.filter(
        (f: ValidationFailure) => !s.dismissedRuleIds?.includes(f.ruleId)
      ) ?? [];
    return sum + undismissedFailures.length;
  }, 0);
}

/**
 * Validation rules section component.
 * Shows all validation rules grouped by document type with case-level stats.
 */
export function ValidationRulesSection({ caseId }: ValidationRulesSectionProps) {
  const { data: splits = [], isLoading } = useCaseSplits(caseId);
  const { data: documents = [] } = useDocuments(caseId);
  const { data: clientConfigId, isLoading: isConfigLoading } = useClientConfigId();

  const config = getClientConfig(clientConfigId ?? null);

  // Calculate total issues across all splits (excluding dismissed)
  const totalIssues = splits.reduce((sum, s) => {
    const undismissedFailures =
      s.validationFailures?.filter(
        (f: ValidationFailure) => !s.dismissedRuleIds?.includes(f.ruleId)
      ) ?? [];
    return sum + undismissedFailures.length;
  }, 0);

  // Get unique document count (only docs with undismissed failures)
  const uniqueDocIds = new Set(
    splits
      .filter((s) =>
        s.validationFailures?.some(
          (f: ValidationFailure) => !s.dismissedRuleIds?.includes(f.ruleId)
        )
      )
      .map((s) => s.documentId)
  );

  if (isLoading || isConfigLoading) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-16 text-center shadow-sm">
        <p className="text-muted-foreground">Loading validation rules...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with summary */}
      <div>
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-foreground">Validation Rules</h2>
          {totalIssues > 0 ? (
            <span className="flex items-center gap-1.5 text-[13px] text-warning">
              <AlertTriangle className="h-4 w-4" />
              {totalIssues} issue{totalIssues !== 1 ? "s" : ""} across{" "}
              {uniqueDocIds.size} doc{uniqueDocIds.size !== 1 ? "s" : ""}
            </span>
          ) : splits.length > 0 ? (
            <span className="flex items-center gap-1.5 text-[13px] text-success">
              <CheckCircle2 className="h-4 w-4" />
              All validations passing
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground mt-1.5">
          Business logic checks applied to each document's extracted data.
        </p>
      </div>

      {/* Rules by document type */}
      <Accordion type="multiple" defaultValue={config.tags.map((t) => t.id)}>
        {config.tags.map((tag) => {
          const rules = getValidationRulesForTag(tag);
          const tagSplitCount = splits.filter((s) => s.tagId === tag.id).length;
          const tagIssueCount = countTotalIssuesForTag(splits, tag.id);

          return (
            <AccordionItem
              key={tag.id}
              value={tag.id}
              className="rounded-xl border border-border/40 bg-card shadow-sm mb-4 overflow-hidden"
            >
              <AccordionTrigger className="hover:no-underline px-5 py-4 hover:bg-muted/40 transition-colors">
                <div className="flex items-center justify-between w-full pr-4">
                  <span className="text-sm font-semibold text-foreground">{tag.displayName}</span>
                  <div className="flex items-center gap-3 text-[13px]">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground tabular-nums">
                        {tagSplitCount} doc{tagSplitCount !== 1 ? "s" : ""}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground tabular-nums">
                        {rules.length} rule{rules.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {tagIssueCount > 0 ? (
                      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-warning/10 text-warning">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {tagIssueCount} issue{tagIssueCount !== 1 ? "s" : ""}
                      </span>
                    ) : tagSplitCount > 0 && rules.length > 0 ? (
                      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-success/10 text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Passing
                      </span>
                    ) : null}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-0 pb-0">
                {rules.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground/70 px-5 py-4">
                    No validation rules configured for this document type.
                  </p>
                ) : (
                  <div className="max-h-[400px] overflow-y-auto border-t border-border/40">
                    <table className="w-full">
                      <thead className="sticky top-0 z-10 bg-card">
                      <tr>
                        <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70 w-10">
                          #
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                          Rule
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                          Description
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70 w-[200px]">
                          Field(s)
                        </th>
                        <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground/70 w-20">
                          Failing
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70 w-[100px]">
                          Docs
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((rule, index) => {
                        const { failing, total } = countFailuresForRule(
                          splits,
                          tag.id,
                          rule.ruleId
                        );
                        const isAllPassing = failing === 0 && total > 0;
                        const hasFailing = failing > 0;
                        const failingDocs = getFailingDocsForRule(
                          splits,
                          documents,
                          tag.id,
                          rule.ruleId
                        );

                        // Format fields for display
                        const fields = Array.isArray(rule.field) ? rule.field : [rule.field];

                        return (
                          <tr
                            key={rule.ruleId}
                            className="border-t border-border/30 hover:bg-muted/40 transition-colors"
                          >
                            <td className="px-5 py-4 text-[13px] text-muted-foreground/70 tabular-nums">
                              {index + 1}
                            </td>
                            <td className="px-5 py-4 text-sm text-foreground/80">
                              <span className="flex items-center gap-2.5">
                                {hasFailing ? (
                                  <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
                                ) : isAllPassing ? (
                                  <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                                ) : (
                                  <Info className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                                )}
                                {rule.ruleName}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-sm text-foreground/80">
                              {rule.description ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="line-clamp-2 cursor-default block">
                                        {rule.description}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                      <p>{rule.description}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex flex-wrap gap-1">
                                {fields.length <= 2 ? (
                                  fields.map((field) => {
                                    const schema = tag.extractionConfig?.schema as Record<string, unknown> | undefined;
                                    const properties = schema?.properties as Record<string, { description?: string }> | undefined;
                                    const fieldDesc = properties?.[field]?.description;

                                    return fieldDesc ? (
                                      <TooltipProvider key={field}>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Badge
                                              variant="outline"
                                              className="cursor-default font-mono text-[11px] text-muted-foreground"
                                            >
                                              {field}
                                            </Badge>
                                          </TooltipTrigger>
                                          <TooltipContent className="max-w-xs">
                                            <p className="text-xs">{fieldDesc}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    ) : (
                                      <Badge
                                        key={field}
                                        variant="outline"
                                        className="cursor-default font-mono text-[11px] text-muted-foreground"
                                      >
                                        {field}
                                      </Badge>
                                    );
                                  })
                                ) : (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge
                                          variant="outline"
                                          className="cursor-default font-mono text-[11px] text-muted-foreground"
                                        >
                                          {fields.length} fields
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs">
                                        <p className="text-xs font-medium mb-1">Fields:</p>
                                        <ul className="text-xs space-y-0.5">
                                          {fields.map((field) => {
                                            const schema = tag.extractionConfig?.schema as Record<string, unknown> | undefined;
                                            const properties = schema?.properties as Record<string, { description?: string }> | undefined;
                                            const fieldDesc = properties?.[field]?.description;
                                            return (
                                              <li key={field}>
                                                <span className="font-mono">{field}</span>
                                                {fieldDesc && <span className="text-background/70"> — {fieldDesc}</span>}
                                              </li>
                                            );
                                          })}
                                        </ul>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <span
                                className={`text-[13px] tabular-nums ${
                                  hasFailing
                                    ? "text-warning font-medium"
                                    : "text-foreground/80"
                                }`}
                              >
                                {failing}/{total}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              {failingDocs.length === 0 ? (
                                <span className="text-[13px] text-foreground/80">—</span>
                              ) : (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="secondary" className="cursor-default">
                                        {failingDocs.length} doc{failingDocs.length !== 1 ? "s" : ""}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                      <p className="text-xs font-medium mb-1">Failing documents:</p>
                                      <ul className="text-xs space-y-0.5">
                                        {failingDocs.map((doc) => (
                                          <li key={doc}>• {doc}</li>
                                        ))}
                                      </ul>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      </tbody>
                    </table>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
