/**
 * Dialog for creating a new case.
 * @module components/cases/create-case-dialog
 */
'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CalendarIcon } from "@/components/icons/lucide-compat";
import { useCreateCase } from "@/hooks/use-cases";
import { CreateCaseSchema } from "@/types/cases";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CreateCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormData {
  case_name: string;
  case_ref: string;
  description: string;
  case_opened_at: Date;
  event_date: Date | undefined;
}

const getInitialFormData = (): FormData => ({
  case_name: "",
  case_ref: "",
  description: "",
  case_opened_at: new Date(),
  event_date: undefined,
});

/**
 * Modal dialog for creating a new case.
 * On success, closes and navigates to case detail page.
 */
export function CreateCaseDialog({ open, onOpenChange }: CreateCaseDialogProps) {
  const router = useRouter();
  const createCase = useCreateCase();

  const [formData, setFormData] = useState<FormData>(getInitialFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setFormData(getInitialFormData());
      setErrors({});
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = CreateCaseSchema.safeParse({
      case_name: formData.case_name,
      case_ref: formData.case_ref,
      description: formData.description || undefined,
      case_opened_at: formData.case_opened_at.toISOString(),
      event_date: formData.event_date
        ? format(formData.event_date, "yyyy-MM-dd")
        : undefined,
    });

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        if (issue.path[0]) {
          fieldErrors[issue.path[0] as string] = issue.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    createCase.mutate(result.data, {
      onSuccess: (data) => {
        router.push(`/cases/${data.id}`);
      },
      onError: (error) => {
        if (error.message === "Case reference already exists") {
          setErrors({ case_ref: "Reference already exists" });
        } else {
          setErrors({ form: "Failed to create folder. Please try again." });
        }
      },
    });
  };

  const handleChange = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create new</DialogTitle>
          <DialogDescription>
            Fill in the details below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Case Name */}
          <div className="space-y-2">
            <Label htmlFor="case_name">Name</Label>
            <Input
              id="case_name"
              placeholder="Something memorable and descriptive"
              value={formData.case_name}
              onChange={(e) => handleChange("case_name", e.target.value)}
              aria-invalid={!!errors.case_name}
            />
            {errors.case_name && (
              <p className="text-sm text-destructive">{errors.case_name}</p>
            )}
          </div>

          {/* Case Reference */}
          <div className="space-y-2">
            <Label htmlFor="case_ref">Reference</Label>
            <Input
              id="case_ref"
              placeholder="Your firm's internal reference"
              value={formData.case_ref}
              onChange={(e) => handleChange("case_ref", e.target.value)}
              aria-invalid={!!errors.case_ref}
            />
            <p className="text-sm text-muted-foreground">
              References are unique and case-sensitive.
            </p>
            {errors.case_ref && (
              <p className="text-sm text-destructive">{errors.case_ref}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Brief description..."
              value={formData.description}
              onChange={(e) => handleChange("description", e.target.value)}
              rows={3}
            />
          </div>

          {/* Case Opened At */}
          <div className="space-y-2">
            <Label>Created at</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !formData.case_opened_at && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(formData.case_opened_at, "d MMM yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start" sticky="always">
                <Calendar
                  mode="single"
                  selected={formData.case_opened_at}
                  onSelect={(date) => date && handleChange("case_opened_at", date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <p className="text-sm text-muted-foreground">
              When you started working on this.
            </p>
          </div>

          {/* Event Date */}
          <div className="space-y-2">
            <Label>Event date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !formData.event_date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.event_date
                    ? format(formData.event_date, "d MMM yyyy")
                    : "Select date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start" sticky="always">
                <Calendar
                  mode="single"
                  selected={formData.event_date}
                  onSelect={(date) => handleChange("event_date", date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <p className="text-sm text-muted-foreground">
              When the incident or event occurred.
            </p>
          </div>

          {/* Form error */}
          {errors.form && (
            <p className="text-sm text-destructive">{errors.form}</p>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createCase.isPending}>
              {createCase.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
