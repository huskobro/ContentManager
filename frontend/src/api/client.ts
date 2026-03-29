/**
 * API Client — native fetch etrafında hafif bir wrapper.
 *
 * Tasarım kararları:
 *   • Axios yok — native fetch yeterli, gereksiz bağımlılık eklenmez.
 *   • Baseurl: /api — Vite proxy üzerinden backend'e yönlendirilir.
 *   • Her istek için tip güvenli response parsing (APIResponse<T>).
 *   • HTTP 4xx/5xx → APIError fırlatır; bileşen catch ile yakalar.
 *   • Admin istekleri X-Admin-Pin header'ı ile korunur.
 *   • SSE helper: Named event desteği ile backend'in event tiplerini dinler.
 */

// ─── Temel tipler ─────────────────────────────────────────────────────────────

/** Backend FastAPI'nin tutarlı hata formatı */
interface BackendError {
  detail: string | { msg: string; type: string }[];
}

export class APIError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "APIError";
  }
}

// ─── İstek yapılandırması ─────────────────────────────────────────────────────

const BASE_URL = "/api";

interface RequestOptions {
  /** Content-Type: "application/json" dışında bir değer gerekirse */
  contentType?: string;
  /** Admin PIN — X-Admin-Pin header'ı olarak gönderilir */
  adminPin?: string;
  /** AbortController signal — uzun işlemleri iptal etmek için */
  signal?: AbortSignal;
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function request<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  options: RequestOptions = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": options.contentType ?? "application/json",
    Accept: "application/json",
  };

  if (options.adminPin) {
    headers["X-Admin-Pin"] = options.adminPin;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options.signal,
  });

  // 204 No Content — boş döner
  if (response.status === 204) {
    return undefined as T;
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    // JSON parse edilemeyen hata gövdesi
    throw new APIError(response.status, `HTTP ${response.status}: ${response.statusText}`);
  }

  if (!response.ok) {
    const err = json as BackendError;
    let message: string;

    if (typeof err.detail === "string") {
      message = err.detail;
    } else if (Array.isArray(err.detail) && err.detail.length > 0) {
      message = err.detail.map((e) => e.msg).join("; ");
    } else {
      message = `HTTP ${response.status}: ${response.statusText}`;
    }

    throw new APIError(response.status, message, json);
  }

  return json as T;
}

// ─── SSE helper ──────────────────────────────────────────────────────────────

/**
 * SSE event handler tipi.
 * Backend'den gelen named event'lerin parse edilmiş data'sını alır.
 */
export interface SSEHandlers {
  onJobStatus?: (data: Record<string, unknown>) => void;
  onStepUpdate?: (data: Record<string, unknown>) => void;
  onLog?: (data: Record<string, unknown>) => void;
  onComplete?: (data: Record<string, unknown>) => void;
  onError?: (data: Record<string, unknown>) => void;
  onHeartbeat?: () => void;
  /** EventSource bağlantı hatası */
  onConnectionError?: (err: Event) => void;
}

/**
 * Server-Sent Events stream açar — named event desteği ile.
 *
 * Backend'in gönderdiği event tipleri:
 *   job_status  → İş durumu değişti
 *   step_update → Pipeline adımı güncellendi
 *   log         → Canlı log mesajı
 *   heartbeat   → Bağlantı canlılık sinyali
 *   complete    → Stream tamamlandı
 *   error       → İş bulunamadı vb.
 *
 * Kullanım:
 *   const close = openSSE(`/jobs/${jobId}/events`, {
 *     onStepUpdate: (data) => console.log("Step:", data),
 *     onLog: (data) => console.log("Log:", data),
 *   });
 *   // Temizlemek için:
 *   close();
 */
export function openSSE(path: string, handlers: SSEHandlers): () => void {
  const url = `${BASE_URL}${path}`;
  const es = new EventSource(url);

  function parseAndCall(
    callback: ((data: Record<string, unknown>) => void) | undefined,
    event: MessageEvent
  ) {
    if (!callback) return;
    try {
      const data = JSON.parse(event.data) as Record<string, unknown>;
      callback(data);
    } catch {
      // JSON parse hatası — sessizce atla
    }
  }

  es.addEventListener("job_status", (e) => parseAndCall(handlers.onJobStatus, e as MessageEvent));
  es.addEventListener("step_update", (e) => parseAndCall(handlers.onStepUpdate, e as MessageEvent));
  es.addEventListener("log", (e) => parseAndCall(handlers.onLog, e as MessageEvent));
  es.addEventListener("heartbeat", () => handlers.onHeartbeat?.());
  es.addEventListener("complete", (e) => {
    parseAndCall(handlers.onComplete, e as MessageEvent);
    es.close();
  });
  es.addEventListener("error", (e) => {
    // Named "error" event (backend'den gelen)
    if (e instanceof MessageEvent) {
      parseAndCall(handlers.onError, e);
    }
    es.close();
  });

  es.onerror = (err) => {
    handlers.onConnectionError?.(err);
    es.close();
  };

  return () => es.close();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>("GET", path, undefined, options),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("POST", path, body, options),

  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PUT", path, body, options),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PATCH", path, body, options),

  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>("DELETE", path, undefined, options),
};
