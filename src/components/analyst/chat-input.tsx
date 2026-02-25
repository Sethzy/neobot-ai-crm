/**
 * Chat input component with integrated doc filter and send button.
 * Layout: Textarea on top, filter dropdown + submit button on bottom row.
 * @module components/analyst/chat-input
 */
import { memo, useEffect, useRef, useState } from 'react';
import { Send, ChevronDown, Lock, Folder, X, Plus, Paperclip, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn, formatTagLabel } from '@/lib/utils';
import { validateImageFile, MAX_IMAGES_PER_MESSAGE } from '@/lib/analyst/image-utils';
import { validateTemplateFile, TEMPLATE_ALLOWED_EXTENSIONS, TEMPLATE_MAX_FILES } from '@/lib/analyst/template-validation';
import { toast } from 'sonner';


interface ChatInputProps {
  /** Current input value */
  value: string;
  /** Called when input changes */
  onChange: (value: string) => void;
  /** Whether a message is being sent */
  isLoading: boolean;
  /** Available tag IDs to filter by */
  availableTags: string[];
  /** Currently selected tag IDs (empty = all) */
  selectedTags: string[];
  /** Called when tag selection changes */
  onTagChange: (tags: string[]) => void;
  /** Whether the filter is locked (session has started) */
  isFilterLocked: boolean;
  /** Map of tag ID to document count */
  tagCounts: Record<string, number>;
  /** Currently attached images */
  attachedImages?: File[];
  /** Called when images change (add/remove) */
  onImagesChange?: (images: File[]) => void;
  /** Currently attached template files */
  templateFiles?: File[];
  /** Called when template files change (add/remove) */
  onTemplateFilesChange?: (files: File[]) => void;
}

/**
 * Chat input with integrated doc filter.
 * - Textarea on top for message input
 * - Bottom row: doc type filter (left) + send button (right)
 * - Filter locks after first message is sent
 *
 * Memoized to prevent re-renders during streaming (when parent updates messages
 * but ChatInput props haven't changed).
 */
export const ChatInput = memo(function ChatInput({
  value,
  onChange,
  isLoading,
  availableTags,
  selectedTags,
  onTagChange,
  isFilterLocked,
  tagCounts,
  attachedImages,
  onImagesChange,
  templateFiles,
  onTemplateFilesChange,
}: ChatInputProps) {
  // Debug: log when component re-renders
  console.log('[ChatInput] render, isLoading=', isLoading, Date.now());

  const imageInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);

  /** Ref to track object URLs for cleanup (prevents memory leaks) */
  const objectUrlsRef = useRef<Map<File, string>>(new Map());

  /**
   * Get or create an object URL for a file.
   * Cached to prevent creating multiple URLs for the same file.
   */
  const getObjectUrl = (file: File): string => {
    if (!objectUrlsRef.current.has(file)) {
      objectUrlsRef.current.set(file, URL.createObjectURL(file));
    }
    return objectUrlsRef.current.get(file)!;
  };

  // Cleanup all object URLs on unmount
  useEffect(() => {
    const currentUrls = objectUrlsRef.current;
    return () => {
      currentUrls.forEach((url) => URL.revokeObjectURL(url));
      currentUrls.clear();
    };
  }, []);

  // Cleanup URLs for removed images when attachedImages changes
  useEffect(() => {
    const currentFiles = new Set(attachedImages ?? []);
    objectUrlsRef.current.forEach((url, file) => {
      if (!currentFiles.has(file)) {
        URL.revokeObjectURL(url);
        objectUrlsRef.current.delete(file);
      }
    });
  }, [attachedImages]);

  /**
   * Shared validation function for all image input methods.
   * Validates each file and shows toast errors for invalid ones.
   */
  const addImages = (files: File[]) => {
    if (!onImagesChange || !attachedImages) return;

    const currentCount = attachedImages.length;
    const availableSlots = MAX_IMAGES_PER_MESSAGE - currentCount;

    // Check if user is trying to add more than allowed
    if (files.length > availableSlots) {
      if (availableSlots === 0) {
        toast.error(`You can only attach ${MAX_IMAGES_PER_MESSAGE} images at a time`);
        return;
      }
      toast.error(
        `Some images could not be added because you can only attach ${MAX_IMAGES_PER_MESSAGE} images at a time`
      );
    }

    const validFiles: File[] = [];
    for (const file of files) {
      if (validFiles.length >= availableSlots) break;

      const validation = validateImageFile(file);
      if (!validation.valid) {
        toast.error(validation.error);
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      onImagesChange([...attachedImages, ...validFiles]);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    addImages(files);
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  /** Handle template file selection */
  const handleTemplateSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedCount = e.target.files?.length ?? 0;
    console.log(`[ChatInput] handleTemplateSelect: selected=${selectedCount}, current=${templateFiles?.length}, max=${TEMPLATE_MAX_FILES}`);
    if (!onTemplateFilesChange || !templateFiles) return;

    const files = Array.from(e.target.files ?? []);
    const currentCount = templateFiles.length;
    const availableSlots = TEMPLATE_MAX_FILES - currentCount;
    console.log(`[ChatInput] template check: files=${files.length} > slots=${availableSlots}? ${files.length > availableSlots}`);

    // Check if user is trying to add more than allowed
    if (files.length > availableSlots) {
      if (availableSlots === 0) {
        console.log('[ChatInput] TOAST: at limit, rejecting all');
        toast.error(`You can only attach ${TEMPLATE_MAX_FILES} template files at a time`);
        e.target.value = '';
        return;
      }
      console.log('[ChatInput] TOAST: partial rejection');
      toast.error(
        `Some files could not be added because you can only attach ${TEMPLATE_MAX_FILES} template files at a time`
      );
    }

    const validFiles: File[] = [];
    for (const file of files) {
      if (validFiles.length >= availableSlots) break;

      const validation = validateTemplateFile(file);
      if (!validation.valid) {
        toast.error(validation.error ?? 'Invalid file');
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      onTemplateFilesChange([...templateFiles, ...validFiles]);
    }
    e.target.value = '';
  };

  /** Remove a template file by index */
  const removeTemplateFile = (index: number) => {
    if (!onTemplateFilesChange || !templateFiles) return;
    onTemplateFilesChange(templateFiles.filter((_, i) => i !== index));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageFiles: File[] = [];

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      addImages(imageFiles);
    }
  };

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      addImages(files);
    }
  };

  const handleTagToggle = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagChange(selectedTags.filter((t) => t !== tag));
    } else {
      onTagChange([...selectedTags, tag]);
    }
  };

  /** Build the filter button label */
  const getFilterLabel = () => {
    if (selectedTags.length === 0) {
      return 'All Doc Types';
    }
    if (selectedTags.length === 1) {
      const count = tagCounts[selectedTags[0]];
      return `${formatTagLabel(selectedTags[0])}${count ? ` (${count})` : ''}`;
    }
    return `${selectedTags.length} selected`;
  };

  const hasAttachments = (attachedImages && attachedImages.length > 0) || (templateFiles && templateFiles.length > 0);

  return (
      <div
        className={cn(
          "w-full rounded-2xl border bg-muted/40 shadow-sm transition-shadow focus-within:shadow-md",
          isDragging && "border-dashed border-primary bg-primary/5"
        )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Attachments preview: images + template files (Perplexity-style) */}
      {hasAttachments && (
        <div className="flex flex-wrap gap-2 p-3 pb-0">
          {/* Image thumbnails */}
          {attachedImages?.map((file, index) => (
            <div key={`img-${file.name}-${index}`} className="relative group">
              <img
                src={getObjectUrl(file)}
                alt={file.name}
                className="h-20 w-20 rounded-lg object-cover border"
              />
              {!isFilterLocked && (
                <button
                  type="button"
                  onClick={() => onImagesChange?.(attachedImages.filter((_, i) => i !== index))}
                  className="absolute -top-1.5 -right-1.5 bg-black/70 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}

          {/* Template file cards */}
          {templateFiles?.map((file, index) => (
            <div
              key={`file-${file.name}-${index}`}
              className="relative group flex items-center gap-2 h-20 px-3 rounded-lg border bg-muted/60"
            >
              <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate max-w-[120px]">{file.name}</span>
                <span className="text-xs text-muted-foreground uppercase">
                  {file.name.split('.').pop()}
                </span>
              </div>
              {!isFilterLocked && (
                <button
                  type="button"
                  onClick={() => removeTemplateFile(index)}
                  className="absolute -top-1.5 -right-1.5 bg-black/70 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {isFilterLocked && (
                <Lock className="h-3 w-3 text-muted-foreground ml-1" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Textarea */}
      <div className="p-3 pb-0">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Assign work or ask anything"
          className="min-h-[60px] max-h-[200px] bg-transparent border-0 focus-visible:ring-0 resize-none p-2 shadow-none"
          disabled={isLoading}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              const hasContent = value.trim() || (attachedImages && attachedImages.length > 0);
              if (!isLoading && hasContent) {
                e.currentTarget.form?.requestSubmit();
              }
            }
          }}
        />
      </div>

      {/* Bottom row: filter (left) + attachment buttons + submit (right) */}
      <div className="flex items-center justify-between border-t border-border/40 px-3 py-1.5">
        {/* Left side: Doc type filter */}
        <div className="flex items-center gap-1">
          {isFilterLocked ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled
              className="opacity-60 cursor-not-allowed"
            >
              <Lock className="h-4 w-4 mr-1.5" />
              {getFilterLabel()}
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm">
                  <Folder className="h-4 w-4 mr-1.5" />
                  {getFilterLabel()}
                  <ChevronDown className="h-4 w-4 ml-1.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Filter by doc type</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availableTags.length === 0 ? (
                  <DropdownMenuItem disabled>No documents</DropdownMenuItem>
                ) : (
                  availableTags.map((tag) => (
                    <DropdownMenuCheckboxItem
                      key={tag}
                      checked={selectedTags.includes(tag)}
                      onCheckedChange={() => handleTagToggle(tag)}
                    >
                      <span className="flex items-center justify-between w-full">
                        <span>{formatTagLabel(tag)}</span>
                        {tagCounts[tag] !== undefined && (
                          <span className="ml-2 text-muted-foreground text-xs">
                            ({tagCounts[tag]})
                          </span>
                        )}
                      </span>
                    </DropdownMenuCheckboxItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Right side: attachment buttons + submit */}
        <div className="flex items-center gap-1">
          {/* Template files (paperclip) */}
          {onTemplateFilesChange && !isFilterLocked && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 -mr-1"
                  onClick={() => templateInputRef.current?.click()}
                  aria-label="Attach template files"
                  disabled={isLoading}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Attach template files (Excel, Word, PDF)</TooltipContent>
            </Tooltip>
          )}

          {/* Screenshots (plus) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => imageInputRef.current?.click()}
                aria-label="Add screenshots"
                disabled={isLoading}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Attach screenshots</TooltipContent>
          </Tooltip>

          {/* Submit button */}
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || (!value.trim() && (!attachedImages || attachedImages.length === 0))}
            className="shrink-0 rounded-xl h-8 w-8"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={handleImageSelect}
      />
      {onTemplateFilesChange && !isFilterLocked && (
        <input
          ref={templateInputRef}
          type="file"
          accept={TEMPLATE_ALLOWED_EXTENSIONS.join(',')}
          multiple
          className="hidden"
          onChange={handleTemplateSelect}
        />
      )}
      </div>

  );
});
