/**
 * Read-only badge for CRM task status.
 * @module components/crm/task-status-badge
 */
import { Badge } from "@/components/ui/badge";
import type { CrmTask } from "@/lib/crm/schemas";

const crmTaskStatusLabelMap: Record<CrmTask["status"], string> = {
  open: "Open",
  completed: "Completed",
};

const crmTaskStatusVariantMap: Record<CrmTask["status"], "outline" | "success"> = {
  open: "outline",
  completed: "success",
};

interface TaskStatusBadgeProps {
  status: CrmTask["status"];
}

/**
 * Renders a status-specific badge for CRM task rows.
 */
export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  return <Badge variant={crmTaskStatusVariantMap[status]}>{crmTaskStatusLabelMap[status]}</Badge>;
}
