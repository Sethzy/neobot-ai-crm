/**
 * Admin dashboard for recent evaluator score trends.
 * The route is intentionally gated to the known internal test account until a
 * broader admin surface exists.
 *
 * @module app/(dashboard)/admin/scores/page
 */
import { notFound } from "next/navigation";

import { PageCanvas, PageSurface } from "@/components/layout/page-canvas";
import { PageHeader } from "@/components/layout/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchRecentScores } from "@/lib/admin/scores-query";
import { createClient } from "@/lib/supabase/server";

const SCORES_LOOKBACK_DAYS = 30;
const SCORES_DASHBOARD_EMAIL = "limzheyi1996@gmail.com";

async function assertAdminViewer(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.email !== SCORES_DASHBOARD_EMAIL) {
    notFound();
  }
}

export default async function ScoresPage() {
  await assertAdminViewer();
  const rows = await fetchRecentScores({ days: SCORES_LOOKBACK_DAYS });

  return (
    <PageCanvas variant="content" contentClassName="max-w-6xl">
        <PageHeader
          title="Evaluator scores"
          description={
            <>
              Rolling {SCORES_LOOKBACK_DAYS}-day view of managed-agent evaluator output stored in
              <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-caption">run_scores</code>.
            </>
          }
        />

        {rows.length === 0 ? (
          <PageSurface className="border-dashed p-8 type-empty-copy text-muted-foreground">
            No scores recorded yet.
          </PageSurface>
        ) : (
          <PageSurface padding="none" className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead>Evaluator</TableHead>
                  <TableHead>Score type</TableHead>
                  <TableHead className="text-right">Average</TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.day}-${row.evaluator_name}-${row.score_type}`}>
                    <TableCell>{row.day}</TableCell>
                    <TableCell>{row.evaluator_name}</TableCell>
                    <TableCell>{row.score_type}</TableCell>
                    <TableCell className="text-right">
                      {(row.avg_score * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right">{row.run_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PageSurface>
        )}
    </PageCanvas>
  );
}
