/** Generic sandbox delivery — content type inference and output file filtering. */

const CONTENT_TYPE_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".csv": "text/csv",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
};

const SKIP_FILES = new Set([
  "stream.jsonl",
  ".done",
  ".error",
  "summary.txt",
  "input",
]);

/** Infer MIME content type from filename extension. */
export function inferContentType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return CONTENT_TYPE_MAP[ext] ?? "application/octet-stream";
}

/** Filter output directory listing to uploadable files only. */
export function filterOutputFiles(filenames: string[]): string[] {
  return filenames.filter((f) => !SKIP_FILES.has(f) && f.trim().length > 0);
}
