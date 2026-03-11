/**
 * Compact CRM task item for agent-generated inline views.
 * @module components/views/task-item
 */
import { TaskStatusBadge } from "@/components/crm/task-status-badge";
import { Card, CardContent } from "@/components/ui/card";

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

  return (
    <Card size="sm" className="border-border/60 bg-card/80">
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {(dueDate || status) ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {dueDate ? <span>{dueDate}</span> : null}
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
