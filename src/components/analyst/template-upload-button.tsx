/**
 * Template upload button with file picker and chip display.
 * Shows uploaded files as removable chips before session starts,
 * and locked chips after first message.
 * @module components/analyst/template-upload-button
 */
import { useRef } from 'react';
import { FileText, X, Lock } from '@/components/icons/lucide-compat';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { TEMPLATE_ALLOWED_EXTENSIONS } from '@/lib/analyst/template-validation';

export interface TemplateUploadButtonProps {
  /** Currently selected template files */
  files: File[];
  /** Callback when files change */
  onFilesChange: (files: File[]) => void;
  /** When true, files cannot be added/removed (session started) */
  isLocked: boolean;
}

/**
 * Button to upload template files (Excel, Word, PDF, etc).
 * Files are shown as chips and can be removed before the session starts.
 */
export function TemplateUploadButton({
  files,
  onFilesChange,
  isLocked,
}: TemplateUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (!isLocked) {
      inputRef.current?.click();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    onFilesChange([...files, ...newFiles]);
    e.target.value = ''; // Reset for re-selection
  };

  const handleRemove = (index: number) => {
    const updated = files.filter((_, i) => i !== index);
    onFilesChange(updated);
  };

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Upload templates"
            onClick={handleClick}
            disabled={isLocked && files.length === 0}
          >
            <FileText className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Upload templates</TooltipContent>
      </Tooltip>

      {!isLocked && (
        <input
          ref={inputRef}
          type="file"
          accept={TEMPLATE_ALLOWED_EXTENSIONS.join(',')}
          multiple
          className="hidden"
          onChange={handleChange}
        />
      )}

      {files.map((file, index) => (
        <Badge
          key={`${file.name}-${index}`}
          variant="secondary"
          className={`gap-1 ${isLocked ? 'cursor-default' : ''}`}
        >
          <span className="max-w-[120px] truncate">{file.name}</span>
          {isLocked ? (
            <Lock className="h-3 w-3 ml-1" />
          ) : (
            <button
              type="button"
              onClick={() => handleRemove(index)}
              className="ml-1 hover:text-destructive"
              aria-label={`Remove ${file.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </Badge>
      ))}
    </div>
  );
}
