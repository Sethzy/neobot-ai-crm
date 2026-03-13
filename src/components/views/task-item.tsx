/**
 * Compact CRM task item for agent-generated inline views.
 * @module components/views/task-item
 */
import { TaskStatusBadge } from "@/components/crm/task-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface TaskItemProps {
  title: string;
  dueDate?: string;
  status?: "open" | "completed";
  contactName?: string;
  dealAddress?: string;
}

function getContextText({
  contactName,
  dealAddress,
}: Pick<TaskItemProps, "contactName" | "dealAddress">) {
  return [contactName, dealAddress].filter(Boolean).join(" • ");
}

/** Returns true when the task is open and past its due date. */
function isOverdue(dueDate: string | undefined, status: string | undefined): boolean {
  if (!dueDate || status === "completed") return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

/**
 * Renders a single task with optional status, due date, and linked CRM context.
 */
export function TaskItem({
  title,
  dueDate,
  status,
  contactName,
  dealAddress,
}: TaskItemProps) {
  const contextText = getContextText({ contactName, dealAddress });
  const overdue = isOverdue(dueDate, status);

  return (
    <Card size="sm" className="border-border/60 bg-card/80">
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {(dueDate || status) ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {dueDate ? (
              <span className={cn(overdue && "font-medium text-rose-600")}>
                {dueDate}{overdue ? " · Overdue" : ""}
              </span>
            ) : null}
            {status ? <TaskStatusBadge status={status} /> : null}
          </div>
        ) : null}
        {contextText ? (
          <p className="text-sm text-muted-foreground">{contextText}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
