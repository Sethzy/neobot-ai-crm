/**
 * File download/preview component for AI-generated files.
 * Renders images inline, shows styled download card for other files.
 * @module components/analyst/file-download
 */
import { useState, type ComponentType } from 'react';
import Image from "next/image";
import {
  DownloadIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileIcon,
  PresentationIcon,
  SheetIcon,
  type LucideProps,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileDownloadProps {
  /** Hosted URL or Data URL (data:mediaType;base64,...) */
  url: string;
  /** IANA media type (e.g., 'application/pdf', 'image/png') */
  mediaType: string;
  /** Optional filename for download */
  filename?: string;
}

/** File type config: icon component, color class, label */
interface FileTypeConfig {
  Icon: ComponentType<LucideProps>;
  colorClass: string;
  label: string;
}

/**
 * Get file type configuration based on file extension.
 * Returns icon component, color, and label for the file type.
 */
function getFileTypeConfig(filename: string): FileTypeConfig {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';

  switch (ext) {
    case 'xlsx':
    case 'xls':
      return {
        Icon: FileSpreadsheetIcon,
        colorClass: 'text-green-600',
        label: 'Spreadsheet',
      };
    case 'csv':
      return {
        Icon: SheetIcon,
        colorClass: 'text-emerald-600',
        label: 'Spreadsheet',
      };
    case 'pdf':
      return {
        Icon: FileTextIcon,
        colorClass: 'text-red-600',
        label: 'PDF',
      };
    case 'docx':
    case 'doc':
      return {
        Icon: FileTextIcon,
        colorClass: 'text-blue-600',
        label: 'Document',
      };
    case 'pptx':
    case 'ppt':
      return {
        Icon: PresentationIcon,
        colorClass: 'text-orange-600',
        label: 'Presentation',
      };
    default:
      return {
        Icon: FileIcon,
        colorClass: 'text-zinc-400',
        label: 'File',
      };
  }
}

/** File type icon */
function FileTypeIcon({ config }: { config: FileTypeConfig }) {
  const { Icon, colorClass } = config;
  return (
    <div className="h-10 w-10 flex items-center justify-center shrink-0">
      <Icon className={cn('size-8', colorClass)} />
    </div>
  );
}

/**
 * Renders inline images or styled download cards for generated files.
 * Falls back to download link if image fails to load.
 */
export function FileDownload({ url, mediaType, filename }: FileDownloadProps) {
  const [imageError, setImageError] = useState(false);
  const displayName = filename ?? 'download';
  const config = getFileTypeConfig(displayName);
  const isSupabaseHostedImage = url.startsWith("https://xtewwwycvapskgvfnliq.supabase.co/");

  // Show download card if image fails to load or if not an image
  if (!mediaType.startsWith('image/') || imageError) {
    return (
      <a
        href={url}
        download={displayName}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50',
          'transition-colors hover:bg-zinc-100 max-w-xs'
        )}
      >
        {/* File type icon */}
        <FileTypeIcon config={config} />

        {/* File info */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate text-zinc-900">
            {displayName}
          </p>
          <p className="text-xs text-zinc-500">
            {config.label}
          </p>
        </div>

        {/* Download indicator */}
        <DownloadIcon className="size-4 shrink-0 text-zinc-400" />
      </a>
    );
  }

  if (isSupabaseHostedImage) {
    return (
      <Image
        src={url}
        alt={displayName}
        width={1024}
        height={1024}
        sizes="(max-width: 768px) 100vw, 448px"
        onError={() => setImageError(true)}
        className="max-w-md rounded-lg h-auto"
      />
    );
  }

  return (
    <img
      src={url}
      alt={displayName}
      loading="lazy"
      onError={() => setImageError(true)}
      className="max-w-md rounded-lg"
    />
  );
}
