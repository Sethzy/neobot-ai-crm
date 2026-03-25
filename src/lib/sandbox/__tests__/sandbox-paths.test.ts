/** Tests for sandbox job path helpers. */
import { describe, it, expect } from "vitest";

import {
  jobOutputDir,
  jobStreamLog,
  jobDoneMarker,
  jobErrorMarker,
} from "../sandbox-paths";

describe("sandbox-paths", () => {
  const jobId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

  it("returns job-scoped output directory", () => {
    expect(jobOutputDir(jobId)).toBe(`/workspace/jobs/${jobId}`);
  });

  it("returns job-scoped stream log path", () => {
    expect(jobStreamLog(jobId)).toBe(`/workspace/jobs/${jobId}/stream.jsonl`);
  });

  it("returns job-scoped done marker path", () => {
    expect(jobDoneMarker(jobId)).toBe(`/workspace/jobs/${jobId}/.done`);
  });

  it("returns job-scoped error marker path", () => {
    expect(jobErrorMarker(jobId)).toBe(`/workspace/jobs/${jobId}/.error`);
  });
});
