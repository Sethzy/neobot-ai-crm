/**
 * Compact CRM task item for agent-generated inline views.
 * Renders as a borderless content block — the outer layout (Card/Grid) provides containment.
 * @module components/views/task-item
 */
import { Badge } from "@/components/ui/badge";
import { TaskStatusBadge } from "@/components/crm/task-status-badge";
import { cn } from "@/lib/utils";

export interface TaskItemProps {
  title: string;
  dueDate?: string;
  status?: "open" | "completed";
  contactName?: string;
  dealAddress?: string;
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
 * Renders a single task with optional status, due date, and linked CRM context chips.
 */
export function TaskItem({
  title,
  dueDate,
  status,
  contactName,
  dealAddress,
}: TaskItemProps) {
  const overdue = isOverdue(dueDate, status);
  const contextItems = [contactName, dealAddress].filter(Boolean) as string[];

  return (
    <div
      className={cn(
        "flex flex-col gap-3 p-4",
        overdue && "border-l-3 border-l-warning",
      )}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      {(dueDate || status) ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {dueDate ? (
            <span className={cn(overdue && "font-medium text-warning")}>
              {dueDate}{overdue ? " · Overdue" : ""}
            </span>
          ) : null}
          {status ? <TaskStatusBadge status={status} /> : null}
        </div>
      ) : null}
      {contextItems.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {contextItems.map((item) => (
            <Badge key={item} variant="secondary">
              {item}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
