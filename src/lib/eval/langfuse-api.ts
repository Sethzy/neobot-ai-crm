/**
 * Shared Langfuse REST API helpers for evaluators and QA analysis.
 * Provides typed wrappers for trace/observation reads and score writes.
 * @module lib/eval/langfuse-api
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface LangfuseTrace {
  id: string;
  name: string | null;
  timestamp: string;
  sessionId: string;
  userId: string;
  tags: string[];
  input: unknown;
  output: unknown;
  metadata: unknown;
  latency: number;
  totalCost: number;
  observations: string[];
}

export interface LangfuseObservation {
  id: string;
  name: string;
  type: string;
  model: string;
  input: unknown;
  output: unknown;
  startTime: string;
  endTime: string;
  completionStartTime: string;
  latency: number;
  totalCost: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  statusMessage: string;
  level: string;
}

// ── Auth ────────────────────────────────────────────────────────────────────

function getAuthHeader(): string {
  const secret = process.env.LANGFUSE_SECRET_KEY ?? "";
  const pub = process.env.LANGFUSE_PUBLIC_KEY ?? "";
  if (!secret || !pub) {
    throw new Error("LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY must be set");
  }
  return "Basic " + Buffer.from(`${pub}:${secret}`).toString("base64");
}

function getBaseUrl(): string {
  return process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com";
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

export async function langfuseGet(path: string): Promise<unknown> {
  const url = `${getBaseUrl()}/api/public${path}`;
  const res = await fetch(url, {
    headers: { Authorization: getAuthHeader() },
  });
  if (!res.ok) {
    throw new Error(`Langfuse API GET ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export async function langfusePost(
  path: string,
  body: unknown,
): Promise<unknown> {
  const url = `${getBaseUrl()}/api/public${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Langfuse API POST ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// ── Domain helpers ──────────────────────────────────────────────────────────

/** Fetch a single trace by ID. */
export async function getTraceById(
  traceId: string,
): Promise<LangfuseTrace> {
  return (await langfuseGet(`/traces/${traceId}`)) as LangfuseTrace;
}

/** Fetch all traces for a session, ordered by timestamp ascending. */
export async function getTracesForSession(
  sessionId: string,
): Promise<LangfuseTrace[]> {
  const traces: LangfuseTrace[] = [];
  let page = 1;

  while (true) {
    const data = (await langfuseGet(
      `/traces?sessionId=${sessionId}&orderBy=timestamp.asc&page=${page}&limit=50`,
    )) as { data: LangfuseTrace[]; meta: { totalPages: number } };

    traces.push(...data.data);
    if (page >= data.meta.totalPages) break;
    page++;
  }

  return traces;
}

/** Fetch observations for a trace. */
export async function getObservationsForTrace(
  traceId: string,
): Promise<LangfuseObservation[]> {
  const data = (await langfuseGet(
    `/observations?traceId=${traceId}&limit=100`,
  )) as { data: LangfuseObservation[] };
  return data.data;
}

/** Fetch recent traces (from a given ISO timestamp). */
export async function getRecentTraces(
  fromTimestamp: string,
  limit = 100,
): Promise<LangfuseTrace[]> {
  const data = (await langfuseGet(
    `/traces?fromTimestamp=${encodeURIComponent(fromTimestamp)}&orderBy=timestamp.desc&limit=${limit}`,
  )) as { data: LangfuseTrace[] };
  return data.data;
}

/** Write a score to Langfuse for a trace. */
export async function createScore(params: {
  traceId: string;
  name: string;
  value: number;
  dataType?: "BOOLEAN" | "NUMERIC" | "CATEGORICAL";
  comment?: string;
}): Promise<void> {
  await langfusePost("/scores", {
    traceId: params.traceId,
    name: params.name,
    value: params.value,
    dataType: params.dataType ?? "BOOLEAN",
    comment: params.comment,
  });
}
