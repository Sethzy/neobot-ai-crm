/**
 * Slim case header with inline editing support.
 * Displays title, created date, and reviewed badge in a single row.
 * @module components/cases/case-header
 */
import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarIcon, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Case, UpdateCaseInput } from "@/types/cases";
import { useDocumentsWithStatus } from "@/hooks/use-documents";

interface CaseHeaderProps {
  /** Case ID for fetching related data */
  caseId: string;
  /** The case data to display */
  caseData: Case;
  /** Callback when case is saved */
  onSave: (data: UpdateCaseInput) => void;
  /** Whether save is in progress */
  isSaving: boolean;
}

/**
 * Renders a slim case header with view and edit modes.
 * Read mode shows title + CREATED date + REVIEWED badge.
 * Edit mode provides full form for all case fields.
 */
export function CaseHeader({
  caseId,
  caseData,
  onSave,
  isSaving,
}: CaseHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);

  // Fetch documents for reviewed stats (data already cached by route loader)
  const { data: documents = [], isLoading: isLoadingDocs } = useDocumentsWithStatus(caseId);

  // Calculate reviewed stats
  const filesCount = documents.length;
  const filesReviewed = documents.filter((d) => d.is_reviewed).length;

  const [formData, setFormData] = useState({
    case_name: caseData.case_name,
    case_ref: caseData.case_ref,
    description: caseData.description || "",
    case_opened_at: caseData.case_opened_at,
    event_date: caseData.event_date || "",
  });

  const handleSave = () => {
    onSave({
      case_name: formData.case_name,
      case_ref: formData.case_ref,
      description: formData.description || null,
      case_opened_at: formData.case_opened_at,
      event_date: formData.event_date || null,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFormData({
      case_name: caseData.case_name,
      case_ref: caseData.case_ref,
      description: caseData.description || "",
      case_opened_at: caseData.case_opened_at,
      event_date: caseData.event_date || "",
    });
    setIsEditing(false);
  };

  // Edit mode - condensed layout
  if (isEditing) {
    return (
      <div className="space-y-3 pb-3 pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
        {/* Row 1: Title and Actions */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <Label className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-[0.15em] mb-1 block">Case Name</Label>
            <Input
              value={formData.case_name}
              onChange={(e) =>
                setFormData({ ...formData, case_name: e.target.value })
              }
              className="h-8 text-sm font-semibold border-border/40 focus:ring-1 focus:ring-primary/20 transition-all"
              aria-label="Case name"
            />
          </div>
          <div className="flex gap-2 self-end">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="bg-foreground text-background hover:bg-foreground/90 h-8 px-4 font-bold text-[11px] uppercase tracking-wider transition-all"
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleCancel} 
              className="h-8 px-4 text-[11px] font-bold uppercase tracking-wider border-border/40 hover:bg-muted/50 transition-all"
            >
              Cancel
            </Button>
          </div>
        </div>

        {/* Row 2: Detailed Metadata */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-2 space-y-1">
            <Label className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-[0.15em] leading-none">Reference</Label>
            <Input
              value={formData.case_ref}
              onChange={(e) =>
                setFormData({ ...formData, case_ref: e.target.value })
              }
              className="h-8 text-[12px] font-medium border-border/40 tabular-nums"
              aria-label="Case reference"
            />
          </div>

          <div className="col-span-2 space-y-1">
            <Label className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-[0.15em] leading-none">Created</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-medium h-8 text-[12px] border-border/40 px-2",
                    !formData.case_opened_at && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-3 w-3 text-muted-foreground/40" />
                  {format(new Date(formData.case_opened_at), "d MMM yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={new Date(formData.case_opened_at)}
                  onSelect={(date) => {
                    if (date) {
                      setFormData({ ...formData, case_opened_at: date.toISOString() });
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="col-span-2 space-y-1">
            <Label className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-[0.15em] leading-none">Event Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-medium h-8 text-[12px] border-border/40 px-2",
                    !formData.event_date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-3 w-3 text-muted-foreground/40" />
                  {formData.event_date
                    ? format(new Date(formData.event_date), "d MMM yyyy")
                    : "Select date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={formData.event_date ? new Date(formData.event_date) : undefined}
                  onSelect={(date) =>
                    setFormData({
                      ...formData,
                      event_date: date ? format(date, "yyyy-MM-dd") : "",
                    })
                  }
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="col-span-6 space-y-1">
            <Label className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-[0.15em] leading-none">Description</Label>
            <Input
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="h-8 text-[12px] font-medium border-border/40"
              placeholder="Brief case summary..."
              aria-label="Description"
            />
          </div>
        </div>
      </div>
    );
  }

  // Read mode - slim single row
  return (
    <div className="flex items-center justify-between py-1">
      {/* Title + edit button */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{caseData.case_name}</h1>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setIsEditing(true)}
          aria-label="Edit case"
          className="text-muted-foreground/30 hover:text-foreground/60 h-7 w-7 transition-colors rounded-full"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Right side: CREATED + REVIEWED */}
      <div className="flex items-center gap-8">
        <div className="flex flex-col items-end gap-0.5">
          <span className="uppercase tracking-[0.15em] text-[9px] font-bold text-muted-foreground/50 leading-none">Created</span>
          <span className="text-[12px] font-semibold text-foreground/70 tabular-nums">
            {format(new Date(caseData.case_opened_at), "d MMM yyyy")}
          </span>
        </div>

        <div className="flex flex-col items-end gap-0.5">
          <span className="uppercase tracking-[0.15em] text-[9px] font-bold text-muted-foreground/50 leading-none">Reviewed</span>
          <span className="text-[12px] font-semibold text-foreground/70 tabular-nums">
            {isLoadingDocs ? "—" : `${filesReviewed} of ${filesCount}`}
          </span>
        </div>
      </div>
    </div>
  );
}
