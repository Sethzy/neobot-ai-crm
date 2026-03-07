/**
 * @file StatusBadge component
 * @description Displays document processing status with appropriate styling
 */
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, CheckCircle, AlertCircle } from "@/components/icons/lucide-compat";
import { cn } from "@/lib/utils";

/**
 * All possible document status values.
 * Legacy: uploaded, processing, complete, failed
 * New: processed, in_review, reviewed
 */
export type DocumentStatusType =
  | "uploaded"
  | "processing"
  | "complete"
  | "failed"
  | "processed"
  | "in_review"
  | "reviewed";

interface StatusBadgeProps {
  status: DocumentStatusType;
  errorMessage?: string | null;
}

const statusConfig: Record<
  DocumentStatusType,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";
    className: string;
    icon: React.ReactNode | null;
  }
> = {
  uploaded: {
    label: "Uploaded",
    variant: "secondary",
    className: "",
    icon: null,
  },
  processing: {
    label: "Processing",
    variant: "secondary",
    className: "animate-pulse",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  complete: {
    label: "Complete",
    variant: "success",
    className: "",
    icon: null,
  },
  failed: {
    label: "Failed",
    variant: "destructive",
    className: "",
    icon: null,
  },
  // New extraction statuses
  processed: {
    label: "Processed",
    variant: "success",
    className: "",
    icon: <CheckCircle className="h-3 w-3" />,
  },
  in_review: {
    label: "In Review",
    variant: "warning",
    className: "",
    icon: <AlertCircle className="h-3 w-3" />,
  },
  reviewed: {
    label: "Reviewed",
    variant: "info",
    className: "",
    icon: <CheckCircle className="h-3 w-3" />,
  },
};

/**
 * Displays document processing status as a colored badge.
 * Shows tooltip with error message on failed status.
 */
export function StatusBadge({ status, errorMessage }: StatusBadgeProps) {
  const config = statusConfig[status];

  const badge = (
    <Badge
      variant={config.variant}
      className={cn("flex items-center gap-1", config.className)}
    >
      {config.icon}
      {config.label}
    </Badge>
  );

  if (status === "failed" && errorMessage) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent>
            <p>{errorMessage}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
}
