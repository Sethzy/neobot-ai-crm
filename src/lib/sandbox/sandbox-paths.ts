/** Centralized output path helpers for async sandbox jobs. */

export function jobOutputDir(jobId: string): string {
  return `/workspace/jobs/${jobId}`;
}

export function jobStreamLog(jobId: string): string {
  return `/workspace/jobs/${jobId}/stream.jsonl`;
}

export function jobDoneMarker(jobId: string): string {
  return `/workspace/jobs/${jobId}/.done`;
}

export function jobErrorMarker(jobId: string): string {
  return `/workspace/jobs/${jobId}/.error`;
}
