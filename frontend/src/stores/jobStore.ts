/**
 * Job Store — aktif işlerin, pipeline adımlarının ve log akışının durumu.
 *
 * Backend'deki SQLite job tablosuyla senkron çalışır.
 * SSE (Server-Sent Events) stream'den gelen güncellemeler bu store'a yazılır.
 *
 * API Entegrasyonu:
 *   fetchJobs()           → GET /api/jobs (sayfalanmış liste)
 *   fetchJobById()        → GET /api/jobs/{id} (tekil detay)
 *   fetchStats()          → GET /api/jobs/stats (istatistikler)
 *   createJob()           → POST /api/jobs (yeni iş)
 *   cancelJob()           → PATCH /api/jobs/{id} (iptal)
 *   subscribeToJob()      → GET /api/jobs/{id}/events (tekil SSE stream)
 *   connectGlobalStream() → GET /api/jobs/stream (global SSE — tüm job değişiklikleri)
 *
 * Global SSE Notu:
 *   connectGlobalStream() Dashboard ve JobList tarafından çağrılır.
 *   Herhangi bir job'ın durumu veya adımı değiştiğinde store reaktif olarak güncellenir.
 *   Polling (setInterval) kullanılmaz — tamamen push-based.
 */

import { create } from "zustand";
import { api, openSSE } from "@/api/client";

// ─── Tipler ───────────────────────────────────────────────────────────────────

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

// ─── Publishing Hub Tipleri ───────────────────────────────────────────────────

export type PublishTargetStatus =
  | "pending"
  | "publishing"
  | "published"
  | "failed"
  | "skipped";

export type PublishAttemptStatus = "pending" | "success" | "failed" | "cancelled";

export interface PublishAttempt {
  id: string;
  publish_target_id: string;
  status: PublishAttemptStatus;
  action_type: "publish" | "retry" | "cancel";
  error_message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
}

export interface PublishTarget {
  id: string;
  job_id: string;
  platform_account_id?: number | null;
  platform: string;
  publish_type: string;
  content_type: string;
  status: PublishTargetStatus;
  privacy_status: string;
  scheduled_publish_time?: string | null;
  external_object_id?: string | null;
  external_url?: string | null;
  error_message?: string | null;
  attempts_count: number;
  last_attempt_at?: string | null;
  created_at: string;
  updated_at: string;
  attempts: PublishAttempt[];
}

export interface PublishTargetListResponse {
  job_id: string;
  targets: PublishTarget[];
  total: number;
}

export interface PipelineStep {
  id: number;
  job_id: string;
  key: string;          // örn. "script", "tts", "visuals"
  label: string;        // örn. "Senaryo Üretimi"
  order: number;
  status: StepStatus;
  started_at?: string | null;
  completed_at?: string | null;
  duration_ms?: number | null;
  provider?: string | null;
  message?: string | null;
  cost_estimate_usd: number;
  cached: boolean;
  output_artifact?: string | null;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  step?: string;
  message: string;
}

export interface RenderProgress {
  phase: "bundling" | "rendering" | "encoding" | "done";
  bundling_pct?: number;
  rendered_frames: number;
  total_frames: number;
  encoded_frames?: number;
  overall_pct: number | null;
  eta: string | null;
  updated_at: string;
}

export interface Job {
  id: string;
  module_key: string;
  title: string;
  language: string;
  status: JobStatus;
  current_step?: string | null;
  error_message?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  session_dir?: string | null;
  output_path?: string | null;
  cost_estimate_usd: number;
  steps: PipelineStep[];
  /** Frontend-only: canlı loglar (SSE'den beslenir, DB'de saklanmaz) */
  logs: LogEntry[];
  /** Frontend-only: render ilerleme durumu (SSE'den beslenir) */
  renderProgress?: RenderProgress | null;
  /**
   * @deprecated Faz 11.2C — Bu alanlar artık source of truth değil.
   * Kaynak: JobPublishTarget (job.publishTargets).
   * _mirror_youtube_compat() tarafından senkronize tutulur (okuma-only compat).
   * Faz 11.3'te kaldırılacak.
   */
  youtube_video_id?: string | null;
  youtube_video_url?: string | null;
  youtube_channel_id?: string | null;
  youtube_upload_status?: string | null;
  youtube_error_code?: string | null;
  youtube_uploaded_at?: string | null;
  /** Publishing Hub yayın hedefleri (fetchPublishTargets ile yüklenir) */
  publishTargets?: PublishTarget[];
}

export interface JobStats {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}

interface JobListResponse {
  items: Omit<Job, "logs">[];
  total: number;
  page: number;
  page_size: number;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface JobState {
  jobs: Job[];
  stats: JobStats;
  /** Toplam job sayısı (sayfalama için) */
  totalJobs: number;
  /** Yükleme durumları */
  loading: boolean;
  error: string | null;
  /** Şu an detay panelinde görüntülenen job ID'si */
  selectedJobId: string | null;

  // ── API Çağrıları ────────────────────────────────────────────────────────
  fetchJobs: (params?: {
    page?: number;
    page_size?: number;
    status?: string;
    module_key?: string;
  }) => Promise<void>;
  fetchJobById: (id: string) => Promise<Job | null>;
  fetchStats: () => Promise<void>;
  createJob: (payload: {
    module_key: string;
    title: string;
    language?: string;
    settings_overrides?: Record<string, unknown>;
  }) => Promise<Job | null>;
  cancelJob: (id: string) => Promise<boolean>;
  /** Publishing Hub: Job'a ait yayın hedeflerini yükler ve job.publishTargets'a yazar */
  fetchPublishTargets: (jobId: string) => Promise<PublishTarget[]>;
  /** Publishing Hub: Yayın hedefini yeniden dener */
  retryPublishTarget: (targetId: string, force?: boolean) => Promise<PublishTarget | null>;

  // ── SSE Abonelik ─────────────────────────────────────────────────────────
  subscribeToJob: (jobId: string) => () => void;
  /**
   * Global SSE stream'e bağlanır — tüm job değişikliklerini dinler.
   * Dashboard ve JobList bu fonksiyonu mount'ta çağırır.
   * Dönen fonksiyon bağlantıyı kapatır (cleanup için).
   * Polling (setInterval) kullanmaz.
   */
  connectGlobalStream: () => () => void;

  // ── Lokal State ──────────────────────────────────────────────────────────
  selectJob: (id: string | null) => void;
  upsertJob: (job: Job) => void;
  updateJobStatus: (id: string, status: JobStatus, errorMessage?: string) => void;
  updateStep: (jobId: string, stepKey: string, update: Partial<PipelineStep>) => void;
  appendLog: (jobId: string, entry: LogEntry) => void;
  updateRenderProgress: (jobId: string, progress: RenderProgress) => void;
  patchJob: (jobId: string, patch: Partial<Job>) => void;
  /** Publishing Hub: job.publishTargets listesini günceller */
  updatePublishTargets: (jobId: string, targets: PublishTarget[]) => void;
  /** Publishing Hub: Tek bir publish target'ı (id eşleşmesiyle) günceller */
  patchPublishTarget: (jobId: string, targetId: string, patch: Partial<PublishTarget>) => void;

  // ── Filtre yardımcıları ───────────────────────────────────────────────────
  getJobById: (id: string) => Job | undefined;
  getActiveJobs: () => Job[];
  getCompletedJobs: () => Job[];
}

let logIdCounter = 0;

/** Backend job response'unu frontend Job tipine dönüştürür (logs ekler) */
function toJob(raw: Omit<Job, "logs">): Job {
  return { ...raw, logs: [] };
}

export const useJobStore = create<JobState>()((set, get) => ({
  jobs: [],
  stats: { total: 0, queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 },
  totalJobs: 0,
  loading: false,
  error: null,
  selectedJobId: null,

  // ── API Çağrıları ────────────────────────────────────────────────────────

  fetchJobs: async (params) => {
    set({ loading: true, error: null });
    try {
      const query = new URLSearchParams();
      if (params?.page) query.set("page", String(params.page));
      if (params?.page_size) query.set("page_size", String(params.page_size));
      if (params?.status) query.set("status", params.status);
      if (params?.module_key) query.set("module_key", params.module_key);

      const qs = query.toString();
      const path = `/jobs${qs ? `?${qs}` : ""}`;
      const data = await api.get<JobListResponse>(path);

      // Mevcut logları koru — sadece job verilerini güncelle
      const existingJobs = get().jobs;
      const merged = data.items.map((item) => {
        const existing = existingJobs.find((j) => j.id === item.id);
        return { ...toJob(item), logs: existing?.logs ?? [] };
      });

      set({ jobs: merged, totalJobs: data.total, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "İşler yüklenemedi";
      set({ error: message, loading: false });
    }
  },

  fetchJobById: async (id) => {
    try {
      const data = await api.get<Omit<Job, "logs">>(`/jobs/${id}`);
      const existing = get().jobs.find((j) => j.id === id);
      const job = { ...toJob(data), logs: existing?.logs ?? [] };
      // Store'a upsert et
      set((s) => {
        const idx = s.jobs.findIndex((j) => j.id === id);
        if (idx === -1) return { jobs: [...s.jobs, job] };
        const updated = [...s.jobs];
        updated[idx] = job;
        return { jobs: updated };
      });
      return job;
    } catch {
      return null;
    }
  },

  fetchStats: async () => {
    try {
      const data = await api.get<JobStats>("/jobs/stats");
      set({ stats: data });
    } catch {
      // Stats yüklenemezse sessizce geç — kritik değil
    }
  },

  createJob: async (payload) => {
    try {
      const data = await api.post<Omit<Job, "logs">>("/jobs", payload);
      const job = toJob(data);
      set((s) => ({ jobs: [job, ...s.jobs] }));
      return job;
    } catch (err) {
      const message = err instanceof Error ? err.message : "İş oluşturulamadı";
      set({ error: message });
      return null;
    }
  },

  cancelJob: async (id) => {
    try {
      const data = await api.patch<Omit<Job, "logs">>(`/jobs/${id}`, {
        status: "cancelled",
      });
      const existing = get().jobs.find((j) => j.id === id);
      const job = { ...toJob(data), logs: existing?.logs ?? [] };
      set((s) => ({
        jobs: s.jobs.map((j) => (j.id === id ? job : j)),
      }));
      return true;
    } catch {
      return false;
    }
  },

  fetchPublishTargets: async (jobId) => {
    try {
      const data = await api.get<PublishTargetListResponse>(`/jobs/${jobId}/publish-targets`);
      get().updatePublishTargets(jobId, data.targets);
      return data.targets;
    } catch {
      return [];
    }
  },

  retryPublishTarget: async (targetId, force = false) => {
    try {
      const data = await api.post<PublishTarget>(
        `/publish-targets/${targetId}/retry`,
        { force }
      );
      return data;
    } catch {
      return null;
    }
  },

  // ── SSE Abonelik ─────────────────────────────────────────────────────────

  subscribeToJob: (jobId) => {
    const close = openSSE(`/jobs/${jobId}/events`, {
      onJobStatus: (data) => {
        const status = data.status as JobStatus;
        const errorMessage = data.error_message as string | undefined;
        get().updateJobStatus(jobId, status, errorMessage);
      },

      onStepUpdate: (data) => {
        get().updateStep(jobId, data.step_key as string, {
          status: data.status as StepStatus,
          message: data.message as string | null,
          provider: data.provider as string | null,
          duration_ms: data.duration_ms as number | null,
          cost_estimate_usd: data.cost_estimate_usd as number ?? 0,
          cached: (data.cached as boolean) ?? false,
          output_artifact: data.output_artifact as string | null,
          started_at: data.started_at as string | null,
        });
      },

      onLog: (data) => {
        get().appendLog(jobId, {
          id: String(++logIdCounter),
          timestamp: data.timestamp as string,
          level: (data.level as LogEntry["level"]) ?? "INFO",
          step: data.step as string | undefined,
          message: data.message as string,
        });
      },

      onRenderProgress: (data) => {
        get().updateRenderProgress(jobId, {
          phase: (data.phase as RenderProgress["phase"]) ?? "rendering",
          bundling_pct: data.bundling_pct as number | undefined,
          rendered_frames: (data.rendered_frames as number) ?? 0,
          total_frames: (data.total_frames as number) ?? 0,
          encoded_frames: data.encoded_frames as number | undefined,
          overall_pct: data.overall_pct as number | null,
          eta: data.eta as string | null,
          updated_at: new Date().toISOString(),
        });
      },

      // [DEPRECATED — Faz 11.2C]
      // onUploadProgress: step_youtube_upload pipeline'dan kaldırıldı.
      // Bu handler artık normal akışta tetiklenmez. Eski job kayıtları veya
      // manual çağrılar için sessizce yok sayılır.
      onUploadProgress: (_data) => {
        // step_youtube_upload (order=6) Faz 11.2C'de pipeline'dan kaldırıldı.
        // Ana yayın adımı: step_publish → onPublishProgress handler'ını kullanır.
        // Bu event geliyorsa deprecated bir yoldan geliyor demektir — yok say.
      },

      onPublishProgress: (data) => {
        // Publishing Hub (order=7) publish_progress eventi
        // Tamamlandığında publish targets'ı yenile
        const phase = data.phase as string;
        if (phase === "completed" || phase === "failed") {
          get().fetchPublishTargets(jobId);
        } else {
          // publishing aşamasında ilgili target'ı optimistic olarak güncelle
          const platform = data.platform as string | undefined;
          if (platform) {
            const job = get().jobs.find((j) => j.id === jobId);
            const target = job?.publishTargets?.find((t) => t.platform === platform);
            if (target) {
              get().patchPublishTarget(jobId, target.id, {
                status: "publishing",
              });
            }
          }
        }
      },

      onComplete: () => {
        // Stream tamamlandı — gerekirse final state'i backend'den al
        get().fetchJobById(jobId);
        // Publishing Hub hedeflerini de yenile
        get().fetchPublishTargets(jobId);
      },

      onConnectionError: () => {
        get().appendLog(jobId, {
          id: String(++logIdCounter),
          timestamp: new Date().toISOString(),
          level: "ERROR",
          message: "SSE bağlantısı kesildi",
        });
      },
    });

    return close;
  },

  // ── Global SSE Stream ────────────────────────────────────────────────────

  connectGlobalStream: () => {
    /**
     * Global SSE stream'e bağlanır: GET /api/jobs/stream
     *
     * Gelen event tipleri:
     *   job_status  → store'da ilgili job'un status'unu güncelle
     *   step_update → store'da ilgili job'un step'ini güncelle
     *   heartbeat   → sessizce yoksay
     *
     * Bağlantı kesilirse EventSource otomatik yeniden bağlanır.
     * Polling kullanılmaz.
     */
    const close = openSSE("/jobs/stream", {
      onJobStatus: (data) => {
        const jobId = data.job_id as string;
        const status = data.status as JobStatus;
        const errorMessage = data.error_message as string | undefined;

        // Store'da job varsa güncelle
        const existing = get().jobs.find((j) => j.id === jobId);
        if (existing) {
          get().updateJobStatus(jobId, status, errorMessage);
        } else {
          // Store'da yoksa backend'den al (yeni iş oluşturulmuş olabilir)
          get().fetchJobById(jobId);
        }

        // Stats'ı da güncel tut — terminal durum değişikliği stats'ı etkiler
        if (["completed", "failed", "cancelled", "running", "queued"].includes(status)) {
          get().fetchStats();
        }
      },

      onStepUpdate: (data) => {
        const jobId = data.job_id as string;
        const existing = get().jobs.find((j) => j.id === jobId);
        if (existing) {
          get().updateStep(jobId, data.step_key as string, {
            status: data.status as StepStatus,
            message: data.message as string | null,
            provider: data.provider as string | null,
            duration_ms: data.duration_ms as number | null,
            cost_estimate_usd: (data.cost_estimate_usd as number) ?? 0,
            cached: (data.cached as boolean) ?? false,
            output_artifact: data.output_artifact as string | null,
            started_at: data.started_at as string | null,
          });
        }
      },

      onConnectionError: () => {
        // Global stream bağlantı hatası — sessizce logla, EventSource yeniden bağlanır
        console.warn("[GlobalSSE] Bağlantı hatası, yeniden bağlanıyor...");
      },
    });

    return close;
  },

  // ── Lokal State ──────────────────────────────────────────────────────────

  selectJob: (id) => set({ selectedJobId: id }),

  upsertJob: (job) =>
    set((s) => {
      const idx = s.jobs.findIndex((j) => j.id === job.id);
      if (idx === -1) return { jobs: [...s.jobs, job] };
      const updated = [...s.jobs];
      updated[idx] = job;
      return { jobs: updated };
    }),

  updateJobStatus: (id, status, errorMessage) =>
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === id
          ? {
              ...j,
              status,
              ...(errorMessage !== undefined ? { error_message: errorMessage } : {}),
              ...(status === "running" && !j.started_at
                ? { started_at: new Date().toISOString() }
                : {}),
              ...(["completed", "failed", "cancelled"].includes(status)
                ? { completed_at: new Date().toISOString() }
                : {}),
            }
          : j
      ),
    })),

  updateStep: (jobId, stepKey, update) =>
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId
          ? {
              ...j,
              steps: j.steps.map((step) =>
                step.key === stepKey ? { ...step, ...update } : step
              ),
            }
          : j
      ),
    })),

  appendLog: (jobId, entry) => {
    const id = entry.id || String(++logIdCounter);
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId
          ? {
              ...j,
              logs: [...j.logs, { ...entry, id }].slice(-500),
            }
          : j
      ),
    }));
  },

  updateRenderProgress: (jobId, progress) =>
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId ? { ...j, renderProgress: progress } : j
      ),
    })),

  patchJob: (jobId, patch) =>
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, ...patch } : j)),
    })),

  updatePublishTargets: (jobId, targets) =>
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, publishTargets: targets } : j)),
    })),

  patchPublishTarget: (jobId, targetId, patch) =>
    set((s) => ({
      jobs: s.jobs.map((j) => {
        if (j.id !== jobId) return j;
        return {
          ...j,
          publishTargets: (j.publishTargets ?? []).map((t) =>
            t.id === targetId ? { ...t, ...patch } : t
          ),
        };
      }),
    })),

  // ── Filtreler ─────────────────────────────────────────────────────────────

  getJobById: (id) => get().jobs.find((j) => j.id === id),

  getActiveJobs: () =>
    get().jobs.filter((j) => j.status === "queued" || j.status === "running"),

  getCompletedJobs: () =>
    get().jobs.filter(
      (j) =>
        j.status === "completed" ||
        j.status === "failed" ||
        j.status === "cancelled"
    ),
}));
