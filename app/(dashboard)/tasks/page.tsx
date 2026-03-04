/**
 * Agent Tasks page backed by CRM tasks in v1.
 * @module app/(dashboard)/tasks/page
 */
"use client";

import { CheckSquare, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { CrmTasksTable } from "@/components/crm/crm-tasks-table";
import { RecordDrawer } from "@/components/crm/record-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCrmTasks } from "@/hooks/use-crm-tasks";
import { useRecordDrawer } from "@/hooks/use-record-drawer";

export default function TasksPage() {
  const [search, setSearch] = useState("");
  const { isOpen, recordId, open, close } = useRecordDrawer();

  const filters = useMemo(() => {
    const normalizedSearch = search.trim();

    return {
      search: normalizedSearch.length > 0 ? normalizedSearch : undefined,
    };
  }, [search]);

  const { data: tasks = [], isLoading, isError, refetch } = useCrmTasks(filters);

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Tasks</h1>
        <p className="mt-2 text-sm text-muted-foreground/80">
          Browse and inspect CRM follow-ups created by your AI agent.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tasks by title or description..."
            className="h-12 w-full border-border/50 pl-11 shadow-sm focus-visible:ring-1"
          />
        </div>
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
            <p className="text-sm text-destructive">Unable to load tasks</p>
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
        ) : tasks.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card p-10 text-center shadow-sm md:p-20">
            <CheckSquare className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-6 text-muted-foreground">
              {filters.search ? "No tasks match your search" : "No tasks yet"}
            </p>
          </div>
        ) : (
          <CrmTasksTable tasks={tasks} onRowClick={open} />
        )}
      </div>

      <RecordDrawer isOpen={isOpen} recordId={recordId} objectType="task" onClose={close} />
    </div>
  );
}
