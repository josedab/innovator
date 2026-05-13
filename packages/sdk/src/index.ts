import { z } from "zod";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class InnovatorError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "InnovatorError";
  }
}

// ---------------------------------------------------------------------------
// Zod schemas — request bodies
// ---------------------------------------------------------------------------

/** Schema for {@link InvestigateRequest} — validates the body of `POST /api/investigate`. */
export const InvestigateRequestSchema = z.object({
  subject: z.string().min(1).max(500),
  model: z.string().optional(),
});

/** Schema for {@link InnovateRequest} — validates the body of `POST /api/innovate`. */
export const InnovateRequestSchema = z.object({
  subject: z.string().min(1).max(500),
  investigation: z.record(z.unknown()),
  angles: z.array(z.string()).min(1).max(8),
  model: z.string().optional(),
  synthesize: z.boolean().optional(),
  score: z.boolean().optional(),
});

/** Schema for {@link AutoRequest} — validates the body of `POST /api/auto` (full pipeline). */
export const AutoRequestSchema = z.object({
  subject: z.string().min(1).max(500),
  model: z.string().optional(),
});

/** Schema for {@link NLInnovateRequest} — validates natural-language pipeline descriptions. */
export const NLInnovateRequestSchema = z.object({
  prompt: z.string().min(1).max(5000),
  model: z.string().optional(),
});

/** Schema for {@link DiffMergeRequest} — validates diff, merge, and conflict-resolution requests. */
export const DiffMergeRequestSchema = z.object({
  action: z.enum(["diff", "merge", "resolve"]),
  sessionA: z.record(z.unknown()).optional(),
  sessionB: z.record(z.unknown()).optional(),
  conflict: z.record(z.unknown()).optional(),
  resolution: z.enum(["keep-a", "keep-b", "synthesize"]).optional(),
  model: z.string().optional(),
  format: z.enum(["json", "markdown"]).optional(),
});

/** Schema for {@link MemorySearchRequest} — validates semantic memory search queries. */
export const MemorySearchRequestSchema = z.object({
  query: z.string().min(1).max(2000),
  threshold: z.number().min(0).max(1).optional(),
  limit: z.number().min(1).max(50).optional(),
  sessionFilter: z.string().optional(),
});

/** Schema for {@link PersonaEvaluationRequest} — validates persona-based idea evaluation requests. */
export const PersonaEvaluationRequestSchema = z.object({
  action: z.enum(["evaluate", "assess", "alignment", "list-personas"]),
  idea: z
    .object({ title: z.string(), description: z.string() })
    .optional(),
  ideas: z
    .array(z.object({ title: z.string(), description: z.string() }))
    .optional(),
  personaIds: z.array(z.string()).max(12).optional(),
  model: z.string().optional(),
  format: z.enum(["json", "markdown"]).optional(),
});

/** Schema for {@link MonitorRequest} — validates innovation-monitor lifecycle actions. */
export const MonitorRequestSchema = z.object({
  action: z.enum([
    "add-source",
    "remove-source",
    "start",
    "stop",
    "generate-digest",
  ]),
  source: z
    .object({
      id: z.string(),
      type: z.enum([
        "codebase",
        "market",
        "competitor",
        "metrics",
        "custom",
      ]),
      name: z.string(),
      config: z.record(z.unknown()),
      enabled: z.boolean().optional(),
      pollIntervalMs: z.number().optional(),
    })
    .optional(),
  sourceId: z.string().optional(),
  period: z.enum(["daily", "weekly"]).optional(),
  model: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Inferred request types
// ---------------------------------------------------------------------------

export type InvestigateRequest = z.infer<typeof InvestigateRequestSchema>;
export type InnovateRequest = z.infer<typeof InnovateRequestSchema>;
export type AutoRequest = z.infer<typeof AutoRequestSchema>;
export type NLInnovateRequest = z.infer<typeof NLInnovateRequestSchema>;
export type DiffMergeRequest = z.infer<typeof DiffMergeRequestSchema>;
export type MemorySearchRequest = z.infer<typeof MemorySearchRequestSchema>;
export type PersonaEvaluationRequest = z.infer<typeof PersonaEvaluationRequestSchema>;
export type MonitorRequest = z.infer<typeof MonitorRequestSchema>;

// ---------------------------------------------------------------------------
// Response types (lightweight — kept loose so consumers can narrow as needed)
// ---------------------------------------------------------------------------

/** Raw investigation result returned by the investigate endpoint. Loosely typed to allow model variation. */
export interface Investigation {
  [key: string]: unknown;
}

/** Single angle generation result containing the angle identifier and generated ideas. */
export interface AngleResult {
  angleId: string;
  [key: string]: unknown;
}

/** Full innovation response containing results per angle plus optional synthesis and scoring. */
export interface InnovateResponse {
  angleResults: AngleResult[];
  synthesis?: Record<string, unknown>;
  scoring?: Record<string, unknown>;
}

/** Response from a diff, merge, or conflict-resolution operation between two sessions. */
export interface DiffMergeResponse {
  [key: string]: unknown;
}

/** Semantic memory search results with matched items and optional metadata. */
export interface MemorySearchResponse {
  results: unknown[];
  [key: string]: unknown;
}

/** Organization DNA profile extracted from codebase and team patterns. */
export interface OrgDNAResponse {
  [key: string]: unknown;
}

/** Persona-based idea evaluation result with per-persona scores and feedback. */
export interface PersonaEvaluationResponse {
  [key: string]: unknown;
}

/** Current state of the innovation monitor including active sources and schedules. */
export interface MonitorStateResponse {
  [key: string]: unknown;
}

/** Generated innovation digest summarizing monitored signals over a time period. */
export interface DigestResponse {
  [key: string]: unknown;
}

/** Generic SSE event emitted by streaming endpoints. */
export interface StreamEvent {
  event?: string;
  data: unknown;
}

// ---------------------------------------------------------------------------
// Client options
// ---------------------------------------------------------------------------

export interface InnovatorClientOptions {
  /** Base URL of the Innovator API (e.g. "https://innovator.example.com"). */
  baseUrl: string;
  /** Optional API key sent as `Authorization: Bearer <key>`. */
  apiKey?: string;
  /** Request timeout in milliseconds. Defaults to 120 000 (2 min). */
  timeout?: number;
  /** Maximum number of retries for transient failures. Defaults to 2. */
  maxRetries?: number;
}

// ---------------------------------------------------------------------------
// Shared option bag passed to individual methods
// ---------------------------------------------------------------------------

export interface RequestOptions {
  /** Override the model used for this request. */
  model?: string;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RETRYABLE_STATUS_CODES = new Set([408, 429, 502, 503, 504]);

function isRetryable(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// InnovatorClient
// ---------------------------------------------------------------------------

export class InnovatorClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeout: number;
  private readonly maxRetries: number;

  constructor(options: InnovatorClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.timeout = options.timeout ?? 120_000;
    this.maxRetries = options.maxRetries ?? 2;
  }

  // ---- internal helpers ---------------------------------------------------

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.apiKey) {
      h["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return h;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));
      }

      const controller = new AbortController();
      const externalSignal = options?.signal;

      // Link external signal to our controller
      if (externalSignal?.aborted) {
        throw new InnovatorError("Request aborted", 0, "ABORTED");
      }
      const onAbort = () => controller.abort();
      externalSignal?.addEventListener("abort", onAbort, { once: true });

      const timer = setTimeout(() => controller.abort(), this.timeout);

      try {
        const res = await fetch(url, {
          method,
          headers: this.headers(),
          body: body != null ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          const parsed = (() => {
            try {
              return JSON.parse(text);
            } catch {
              return undefined;
            }
          })();
          const err = new InnovatorError(
            parsed?.error ?? `HTTP ${res.status}`,
            res.status,
            parsed?.code,
            parsed,
          );

          if (isRetryable(res.status) && attempt < this.maxRetries) {
            lastError = err;
            continue;
          }
          throw err;
        }

        return (await res.json()) as T;
      } catch (err) {
        if (err instanceof InnovatorError) throw err;
        if ((err as Error).name === "AbortError") {
          throw new InnovatorError(
            externalSignal?.aborted ? "Request aborted" : "Request timed out",
            0,
            externalSignal?.aborted ? "ABORTED" : "TIMEOUT",
          );
        }
        lastError = err;
        if (attempt < this.maxRetries) continue;
        throw new InnovatorError(
          (err as Error).message ?? "Network error",
          0,
          "NETWORK_ERROR",
          err,
        );
      } finally {
        clearTimeout(timer);
        externalSignal?.removeEventListener("abort", onAbort);
      }
    }

    throw lastError;
  }

  private async requestStream(
    path: string,
    body: unknown,
    onEvent: (event: StreamEvent) => void,
    options?: RequestOptions,
  ): Promise<void> {
    const url = `${this.baseUrl}${path}`;

    const controller = new AbortController();
    const externalSignal = options?.signal;
    if (externalSignal?.aborted) {
      throw new InnovatorError("Request aborted", 0, "ABORTED");
    }
    const onAbort = () => controller.abort();
    externalSignal?.addEventListener("abort", onAbort, { once: true });

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...this.headers(),
          Accept: "text/event-stream",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const parsed = (() => {
          try {
            return JSON.parse(text);
          } catch {
            return undefined;
          }
        })();
        throw new InnovatorError(
          parsed?.error ?? `HTTP ${res.status}`,
          res.status,
          parsed?.code,
          parsed,
        );
      }

      if (!res.body) {
        throw new InnovatorError(
          "Response body is null",
          0,
          "NO_BODY",
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent: string | undefined;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last (possibly incomplete) line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const raw = line.slice(5).trim();
            if (!raw) continue;
            let data: unknown;
            try {
              data = JSON.parse(raw);
            } catch {
              data = raw;
            }
            onEvent({ event: currentEvent, data });
            currentEvent = undefined;
          } else if (line.trim() === "") {
            // Empty line resets event type per SSE spec
            currentEvent = undefined;
          }
        }
      }
    } catch (err) {
      if (err instanceof InnovatorError) throw err;
      if ((err as Error).name === "AbortError") {
        throw new InnovatorError(
          externalSignal?.aborted ? "Request aborted" : "Request timed out",
          0,
          externalSignal?.aborted ? "ABORTED" : "TIMEOUT",
        );
      }
      throw new InnovatorError(
        (err as Error).message ?? "Stream error",
        0,
        "STREAM_ERROR",
        err,
      );
    } finally {
      externalSignal?.removeEventListener("abort", onAbort);
    }
  }

  // ---- public API ---------------------------------------------------------

  /**
   * Investigate a subject — gathers background research.
   * POST /api/investigate
   */
  async investigate(
    subject: string,
    options?: RequestOptions,
  ): Promise<Investigation> {
    const body: InvestigateRequest = { subject, model: options?.model };
    return this.request<Investigation>("POST", "/api/investigate", body, options);
  }

  /**
   * Run innovation angles against a subject with prior investigation.
   * POST /api/innovate
   */
  async innovate(
    subject: string,
    angles: string[],
    options?: RequestOptions & {
      investigation?: Investigation;
      synthesize?: boolean;
      score?: boolean;
    },
  ): Promise<InnovateResponse> {
    const body: InnovateRequest = {
      subject,
      investigation: options?.investigation ?? {},
      angles,
      model: options?.model,
      synthesize: options?.synthesize,
      score: options?.score,
    };
    return this.request<InnovateResponse>("POST", "/api/innovate", body, options);
  }

  /**
   * Run the full auto pipeline (investigate → angles → synthesize).
   * Returns the final result after streaming completes.
   * POST /api/auto
   */
  async auto(
    subject: string,
    options?: RequestOptions,
  ): Promise<StreamEvent[]> {
    const events: StreamEvent[] = [];
    await this.streamAuto(subject, (e) => events.push(e), options);
    return events;
  }

  /**
   * Stream the auto pipeline events via SSE.
   * POST /api/auto
   */
  async streamAuto(
    subject: string,
    onEvent: (event: StreamEvent) => void,
    options?: RequestOptions,
  ): Promise<void> {
    const body: AutoRequest = { subject, model: options?.model };
    return this.requestStream("/api/auto", body, onEvent, options);
  }

  /**
   * Run natural-language innovation. Returns all events after streaming.
   * POST /api/nl-innovate
   */
  async nlInnovate(
    prompt: string,
    options?: RequestOptions,
  ): Promise<StreamEvent[]> {
    const events: StreamEvent[] = [];
    await this.streamNLInnovate(prompt, (e) => events.push(e), options);
    return events;
  }

  /**
   * Stream natural-language innovation events via SSE.
   * POST /api/nl-innovate
   */
  async streamNLInnovate(
    prompt: string,
    onEvent: (event: StreamEvent) => void,
    options?: RequestOptions,
  ): Promise<void> {
    const body: NLInnovateRequest = { prompt, model: options?.model };
    return this.requestStream("/api/nl-innovate", body, onEvent, options);
  }

  /**
   * Diff, merge, or resolve sessions.
   * POST /api/diff-merge
   */
  async diffMerge(
    action: DiffMergeRequest["action"],
    sessions: { sessionA?: Record<string, unknown>; sessionB?: Record<string, unknown> },
    options?: RequestOptions & {
      conflict?: Record<string, unknown>;
      resolution?: DiffMergeRequest["resolution"];
      format?: DiffMergeRequest["format"];
    },
  ): Promise<DiffMergeResponse> {
    const body: DiffMergeRequest = {
      action,
      sessionA: sessions.sessionA,
      sessionB: sessions.sessionB,
      conflict: options?.conflict,
      resolution: options?.resolution,
      model: options?.model,
      format: options?.format,
    };
    return this.request<DiffMergeResponse>("POST", "/api/diff-merge", body, options);
  }

  /**
   * Search the memory graph.
   * POST /api/memory-graph
   */
  async memorySearch(
    query: string,
    options?: RequestOptions & {
      threshold?: number;
      limit?: number;
      sessionFilter?: string;
    },
  ): Promise<MemorySearchResponse> {
    const body: MemorySearchRequest = {
      query,
      threshold: options?.threshold,
      limit: options?.limit,
      sessionFilter: options?.sessionFilter,
    };
    return this.request<MemorySearchResponse>("POST", "/api/memory-graph", body, options);
  }

  /**
   * Get the organisation DNA summary.
   * GET /api/memory-graph?action=org-dna
   */
  async getOrgDNA(
    format?: "json" | "markdown",
    options?: RequestOptions,
  ): Promise<OrgDNAResponse> {
    const params = new URLSearchParams({ action: "org-dna" });
    if (format) params.set("format", format);
    return this.request<OrgDNAResponse>("GET", `/api/memory-graph?${params}`, undefined, options);
  }

  /**
   * Evaluate an idea against a set of personas.
   * POST /api/persona-evaluation
   */
  async evaluatePersonas(
    idea: { title: string; description: string },
    personaIds: string[],
    options?: RequestOptions & {
      format?: "json" | "markdown";
    },
  ): Promise<PersonaEvaluationResponse> {
    const body: PersonaEvaluationRequest = {
      action: "evaluate",
      idea,
      personaIds,
      model: options?.model,
      format: options?.format,
    };
    return this.request<PersonaEvaluationResponse>(
      "POST",
      "/api/persona-evaluation",
      body,
      options,
    );
  }

  /**
   * Get the current monitor state.
   * GET /api/monitor
   */
  async getMonitorState(options?: RequestOptions): Promise<MonitorStateResponse> {
    return this.request<MonitorStateResponse>("GET", "/api/monitor?view=state", undefined, options);
  }

  /**
   * Generate an innovation digest.
   * POST /api/monitor
   */
  async generateDigest(
    period?: "daily" | "weekly",
    options?: RequestOptions,
  ): Promise<DigestResponse> {
    const body: MonitorRequest = {
      action: "generate-digest",
      period,
      model: options?.model,
    };
    return this.request<DigestResponse>("POST", "/api/monitor", body, options);
  }
}
