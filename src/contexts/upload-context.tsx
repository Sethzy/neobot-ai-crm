/**
 * Global upload state management.
 * Provides upload queue state that persists across navigation.
 * @module contexts/upload-context
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

/**
 * Allowed file extensions for upload.
 * Blocked: TIFF (multi-page), Office docs (no viewer/splitter), CSV/TXT (no viewer).
 * These can be added in v2 when properly supported.
 */
export const ALLOWED_FILE_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "heic",
] as const;

/** File extension type */
export type AllowedFileExtension = (typeof ALLOWED_FILE_EXTENSIONS)[number];

/**
 * Checks if a file has an allowed extension.
 */
export function isAllowedFileType(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase();
  return !!ext && ALLOWED_FILE_EXTENSIONS.includes(ext as AllowedFileExtension);
}

/**
 * Human-readable list of allowed extensions for UI display.
 */
export const ALLOWED_EXTENSIONS_DISPLAY = "PDF, PNG, JPG, GIF, WEBP, BMP, HEIC";

/**
 * Status of a file in the upload queue.
 */
export type UploadStatus = "pending" | "uploading" | "complete" | "failed";

/**
 * Status of a background report generation task.
 */
export type ReportTaskStatus = "generating" | "complete" | "failed";

/**
 * A report generation task.
 */
export interface ReportTask {
  /** Report display name */
  name: string;
  /** Current status */
  status: ReportTaskStatus;
  /** Download URL when complete */
  downloadUrl?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * A file in the upload queue.
 */
export interface QueueItem {
  /** Unique identifier for this queue item */
  id: string;
  /** The file to upload */
  file: File;
  /** Target case ID */
  caseId: string;
  /** Current upload status */
  status: UploadStatus;
  /** Upload progress (0-100) */
  progress: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Upload context value.
 */
interface UploadContextValue {
  /** Current upload queue */
  queue: QueueItem[];
  /** Whether any items are currently uploading */
  isUploading: boolean;
  /** Whether the progress panel is visible */
  isPanelVisible: boolean;
  /** Add files to the upload queue */
  addToQueue: (files: File[], caseId: string) => void;
  /** Update status of a queue item */
  updateItemStatus: (id: string, status: UploadStatus, error?: string) => void;
  /** Remove completed/failed items from queue */
  clearCompleted: () => void;
  /** Hide the progress panel */
  dismissPanel: () => void;
  /** Show the progress panel */
  showPanel: () => void;
  /** Current report generation task (if any) */
  reportTask: ReportTask | null;
  /** Start a report generation task */
  startReportTask: (name: string) => void;
  /** Mark report task as complete */
  completeReportTask: (downloadUrl: string) => void;
  /** Mark report task as failed */
  failReportTask: (error: string) => void;
  /** Clear the report task */
  clearReportTask: () => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

/**
 * Provider for global upload state.
 * Wrap your app with this to enable upload tracking across navigation.
 */
export function UploadProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const [reportTask, setReportTask] = useState<ReportTask | null>(null);

  // Derived state: true if any item is pending or uploading
  const isUploading = queue.some(
    (item) => item.status === "pending" || item.status === "uploading"
  );

  const addToQueue = useCallback((files: File[], caseId: string) => {
    const newItems: QueueItem[] = files.map((file) => {
      const isValid = isAllowedFileType(file.name);
      return {
        id: crypto.randomUUID(),
        file,
        caseId,
        status: isValid ? ("pending" as const) : ("failed" as const),
        progress: 0,
        error: isValid
          ? undefined
          : `Unsupported file type. Supported: ${ALLOWED_EXTENSIONS_DISPLAY}`,
      };
    });

    if (newItems.length === 0) return;

    setQueue((prev) => [...prev, ...newItems]);
    setIsPanelVisible(true);
  }, []);

  const updateItemStatus = useCallback(
    (id: string, status: UploadStatus, error?: string) => {
      setQueue((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                status,
                error,
                progress: status === "complete" ? 100 : item.progress,
              }
            : item
        )
      );
    },
    []
  );

  const clearCompleted = useCallback(() => {
    setQueue((prev) =>
      prev.filter(
        (item) => item.status !== "complete" && item.status !== "failed"
      )
    );
  }, []);

  const dismissPanel = useCallback(() => {
    setIsPanelVisible(false);
  }, []);

  const showPanel = useCallback(() => {
    setIsPanelVisible(true);
  }, []);

  const startReportTask = useCallback((name: string) => {
    setReportTask({ name, status: "generating" });
    setIsPanelVisible(true);
  }, []);

  const completeReportTask = useCallback((downloadUrl: string) => {
    setReportTask((prev) =>
      prev ? { ...prev, status: "complete", downloadUrl } : null
    );
  }, []);

  const failReportTask = useCallback((error: string) => {
    setReportTask((prev) =>
      prev ? { ...prev, status: "failed", error } : null
    );
  }, []);

  const clearReportTask = useCallback(() => {
    setReportTask(null);
  }, []);

  /**
   * Auto-clear upload queue 3s after all uploads complete successfully.
   * Keeps panel open if any failures so user can see errors.
   */
  useEffect(() => {
    if (isUploading || queue.length === 0) return;

    const hasFailures = queue.some((item) => item.status === "failed");
    if (hasFailures) return;

    const timer = setTimeout(() => {
      setQueue([]);
      // Only hide panel if no report task is active
      if (!reportTask) {
        setIsPanelVisible(false);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [isUploading, queue, reportTask]);

  /**
   * Auto-download and clear report task 2s after completion.
   * Triggers download automatically so user doesn't need to click.
   */
  useEffect(() => {
    if (reportTask?.status !== "complete" || !reportTask.downloadUrl) return;

    // Auto-trigger download
    window.open(reportTask.downloadUrl, "_blank");

    const timer = setTimeout(() => {
      setReportTask(null);
      // Only hide panel if no upload queue items
      if (queue.length === 0) {
        setIsPanelVisible(false);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [reportTask, queue.length]);

  return (
    <UploadContext.Provider
      value={{
        queue,
        isUploading,
        isPanelVisible,
        addToQueue,
        updateItemStatus,
        clearCompleted,
        dismissPanel,
        showPanel,
        reportTask,
        startReportTask,
        completeReportTask,
        failReportTask,
        clearReportTask,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
}

/**
 * Hook to access upload context.
 * Must be used within UploadProvider.
 * @throws Error if used outside UploadProvider
 */
export function useUpload() {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error("useUpload must be used within UploadProvider");
  }
  return context;
}
