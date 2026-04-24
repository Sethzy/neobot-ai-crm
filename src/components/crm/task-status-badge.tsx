/**
 * Read-only badge for CRM task status.
 * @module components/crm/task-status-badge
 */
import { StatusBadge } from "@/components/crm/status-badge";
import type { CrmTask } from "@/lib/crm/schemas";

export const crmTaskStatusLabelMap: Record<CrmTask["status"], string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

const crmTaskStatusVariantMap: Record<CrmTask["status"], "outline" | "secondary" | "success"> = {
  todo: "outline",
  in_progress: "secondary",
  done: "success",
};

interface TaskStatusBadgeProps {
  status: CrmTask["status"];
}

/**
 * Renders a status-specific badge for CRM task rows.
 */
export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  return (
    <StatusBadge
      label={crmTaskStatusLabelMap[status]}
      value={status}
      variantMap={crmTaskStatusVariantMap}
    />
  );
}
