/**
 * Display names for DocGen report types.
 * @module lib/docgen/prompts
 */
import type { ReportType } from './types';

/**
 * Gets display name for report type.
 */
export function getReportDisplayName(reportType: ReportType): string {
  const names: Record<ReportType, string> = {
    quick_report: 'Quick Report',
  };
  return names[reportType];
}
