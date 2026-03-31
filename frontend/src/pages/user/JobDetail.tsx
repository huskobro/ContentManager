/**
 * JobDetail — Tek bir işin detaylı izleme ekranı.
 *
 * Özellikler:
 *   • SSE ile canlı pipeline adım ilerlemesi
 *   • Her adım için durum ikonu, provider bilgisi, süre
 *   • Canlı log viewer (SSE'den beslenir)
 *   • İptal butonu (aktif işler için)
 *   • Hata detayı ve "Tekrar Dene" olanağı
 *   • Tamamlanan işler için çıktı dosyası linki
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  SkipForward,
  RefreshCw,
  FileVideo,
  Terminal,
  ChevronDown,
  ChevronUp,
  Copy,
  Zap,
  Ban,
  Download,
  ExternalLink,
} from "lucide-react";
import {
  useJobStore,
  type StepStatus,
  type PipelineStep,
  type LogEntry,
  type RenderProgress,
  type PublishTarget,
} from "@/stores/jobStore";
import { useUIStore } from "@/stores/uiStore";
import { STATUS_CONFIG, MODULE_INFO, getModuleIcon } from "@/lib/constants";
import { api } from "@/api/client";
import { cn } from "@/lib/utils";

// ─── Sabitler ────────────────────────────────────────────────────────────────

const STEP_STATUS_ICON: Record<StepStatus, React.ReactNode> = {
  pending: <Clock size={16} className="text-slate-500" />,
  running: <Loader2 size={16} className="text-blue-400 animate-spin" />,
  completed: <CheckCircle2 size={16} className="text-emerald-400" />,
  failed: <XCircle size={16} className="text-red-400" />,
  skipped: <SkipForward size={16} className="text-slate-500" />,
};

const LOG_LEVEL_COLORS: Record<LogEntry["level"], string> = {
  DEBUG: "text-slate-500",
  INFO: "text-slate-300",
  WARN: "text-amber-400",
  ERROR: "text-red-400",
};

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const addToast = useUIStore((s) => s.addToast);

  const { getJobById, fetchJobById, cancelJob, subscribeToJob, fetchPublishTargets, retryPublishTarget } = useJobStore();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [logsOpen, setLogsOpen] = useState(true);
  const [retryingTarget, setRetryingTarget] = useState<string | null>(null);
  /** Publishing Hub hedefleri ilk kez yüklenirken true */
  const [publishTargetsLoading, setPublishTargetsLoading] = useState(true);

  const job = getJobById(jobId ?? "");

  // İlk yükleme
  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    fetchJobById(jobId).then((result) => {
      if (!result) setNotFound(true);
      setLoading(false);
      // Publishing Hub hedeflerini yükle
      setPublishTargetsLoading(true);
      fetchPublishTargets(jobId).finally(() => setPublishTargetsLoading(false));
    });
  }, [jobId, fetchJobById, fetchPublishTargets]);

  // SSE aboneliği — aktif işler için
  useEffect(() => {
    if (!jobId || !job) return;

    const isActive = job.status === "queued" || job.status === "running";
    if (!isActive) return;

    const unsubscribe = subscribeToJob(jobId);
    return () => unsubscribe();
  }, [jobId, job?.status, subscribeToJob]);

  const handleCancel = useCallback(async () => {
    if (!jobId || cancelling) return;
    setCancelling(true);
    const ok = await cancelJob(jobId);
    setCancelling(false);
    if (ok) {
      addToast({ type: "info", title: "İş iptal edildi" });
    } else {
      addToast({ type: "error", title: "İptal başarısız", description: "İş iptal edilemedi." });
    }
  }, [jobId, cancelling, cancelJob, addToast]);

  const handleRetry = useCallback(async () => {
    if (!jobId || retrying) return;
    setRetrying(true);
    try {
      await api.post(`/jobs/${jobId}/retry`);
      await fetchJobById(jobId);
      addToast({ type: "success", title: "İş yeniden başlatıldı" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      addToast({ type: "error", title: "Yeniden başlatma başarısız", description: msg });
    } finally {
      setRetrying(false);
    }
  }, [jobId, retrying, fetchJobById, addToast]);

  const handleDownload = useCallback(async () => {
    if (!jobId) return;
    try {
      const response = await fetch(`/api/jobs/${jobId}/output`);
      if (!response.ok) {
        const error = await response.json();
        addToast({ type: "error", title: "İndirme başarısız", description: error.detail });
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `video_${jobId.substring(0, 8)}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      addToast({ type: "success", title: "Video indiriliyor..." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      addToast({ type: "error", title: "İndirme başarısız", description: msg });
    }
  }, [jobId, addToast]);

  // ── Yükleniyor ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Bulunamadı ─────────────────────────────────────────────────────────────
  if (notFound || !job) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <AlertCircle size={32} className="text-destructive" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">İş Bulunamadı</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bu ID ile eşleşen bir iş yok veya silinmiş olabilir.
          </p>
        </div>
        <Link
          to="/jobs"
          className="flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <ArrowLeft size={14} />
          İş Listesine Dön
        </Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[job.status];
  const modMeta = MODULE_INFO[job.module_key];
  const modInfo = {
    label: modMeta?.label ?? job.module_key,
    icon: getModuleIcon(job.module_key, 16),
  };

  const completedSteps = job.steps.filter((s) => s.status === "completed").length;
  const totalSteps = job.steps.length;
  const overallPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const isActive = job.status === "queued" || job.status === "running";
  const totalCost = job.steps.reduce((acc, s) => acc + (s.cost_estimate_usd || 0), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Geri + Başlık */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <button
            onClick={() => navigate("/jobs")}
            className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={12} />
            İşlere Dön
          </button>
          <h2 className="text-lg font-semibold text-foreground leading-tight">{job.title}</h2>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              {modInfo.icon}
              {modInfo.label}
            </span>
            <span>•</span>
            <span>{formatDateTime(job.created_at)}</span>
            {job.language && (
              <>
                <span>•</span>
                <span className="uppercase">{job.language}</span>
              </>
            )}
          </div>
        </div>

        {/* Durum badge + aksiyonlar */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
              statusCfg.color,
              statusCfg.bg
            )}
          >
            {statusCfg.label}
          </span>

          {isActive && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              {cancelling ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Ban size={12} />
              )}
              İptal Et
            </button>
          )}

          {(job.status === "failed" || job.status === "cancelled") && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
            >
              {retrying ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              Yeniden Dene
            </button>
          )}

          {job.status === "completed" && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            >
              <Download size={12} />
              İndir
            </button>
          )}

          <button
            onClick={() => fetchJobById(jobId!)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Yenile"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Genel ilerleme çubuğu */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">Genel İlerleme</span>
          <span className="text-muted-foreground">
            {completedSteps}/{totalSteps} adım — %{overallPct}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out",
              job.status === "failed"
                ? "bg-red-400"
                : job.status === "completed"
                  ? "bg-emerald-400"
                  : "bg-primary"
            )}
            style={{ width: `${overallPct}%` }}
          />
        </div>

        {/* Hata mesajı */}
        {job.error_message && (
          <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{job.error_message}</span>
          </div>
        )}

        {/* Tamamlandı — çıktı dosyası + Finder/Explorer'da aç */}
        {job.status === "completed" && job.output_path && (
          <OutputPathRow jobId={jobId!} outputPath={job.output_path} />
        )}

        {/* Maliyet özeti */}
        {totalCost > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Zap size={12} />
            Tahmini maliyet: ${totalCost.toFixed(4)}
          </div>
        )}
      </div>

      {/* Publishing Hub — yayın hedefleri (Faz 11.2C: tek kaynak JobPublishTarget) */}
      {publishTargetsLoading ? (
        /* İlk yüklemede iskelet göster — compat fallback yok */
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" />
          Yayın hedefleri yükleniyor...
        </div>
      ) : job.publishTargets && job.publishTargets.length > 0 ? (
        <PublishHubCard
          targets={job.publishTargets}
          jobId={job.id}
          retryingTargetId={retryingTarget}
          onRetry={async (targetId, force) => {
            setRetryingTarget(targetId);
            const result = await retryPublishTarget(targetId, force);
            setRetryingTarget(null);
            if (result) {
              addToast({ type: "info", title: "Yeniden yayın başlatıldı" });
              fetchPublishTargets(job.id);
            } else {
              addToast({ type: "error", title: "Yeniden deneme başarısız" });
            }
          }}
        />
      ) : null
      /* publishTargets boşsa (publish_to_youtube=false veya henüz publish yapılmadıysa) kart gösterilmez */}

      {/* Pipeline adımları */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Pipeline Adımları
          </p>
        </div>

        <div className="divide-y divide-border">
          {job.steps
            .sort((a, b) => a.order - b.order)
            .map((step) => (
              <StepRow
                key={step.key}
                step={step}
                renderProgress={step.key === "composition" ? job.renderProgress : null}
              />
            ))}
        </div>
      </div>

      {/* Canlı Log Viewer */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <button
          onClick={() => setLogsOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 border-b border-border hover:bg-accent/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Canlı Loglar
            </span>
            {job.logs.length > 0 && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {job.logs.length}
              </span>
            )}
          </div>
          {logsOpen ? (
            <ChevronUp size={14} className="text-muted-foreground" />
          ) : (
            <ChevronDown size={14} className="text-muted-foreground" />
          )}
        </button>

        {logsOpen && <LogViewer logs={job.logs} />}
      </div>
    </div>
  );
}

// ─── Output Path Row — Finder/Explorer'da aç ─────────────────────────────

function OutputPathRow({ jobId, outputPath }: { jobId: string; outputPath: string }) {
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  async function handleReveal() {
    setOpening(true);
    setOpenError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/open-output`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setOpenError(data.detail ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : "Ağ hatası");
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-400">
        <FileVideo size={14} className="shrink-0" />
        <span className="flex-1 truncate font-mono" title={outputPath}>
          {outputPath}
        </span>
        <button
          type="button"
          onClick={handleReveal}
          disabled={opening}
          title="Finder/Explorer'da klasörü aç"
          className="shrink-0 flex items-center gap-1 rounded-md border border-emerald-500/30 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
        >
          {opening ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <ExternalLink size={11} />
          )}
          Klasörü Aç
        </button>
      </div>
      {openError && (
        <div className="flex items-center gap-1.5 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-[10px] text-red-400">
          <AlertCircle size={11} className="shrink-0" />
          {openError}
        </div>
      )}
    </div>
  );
}

// ─── Publish Hub Card — platform-agnostik yayın durumu (Faz 11.2C ana kaynak: JobPublishTarget) ────────

const PLATFORM_LABELS: Record<string, string> = {
  youtube:   "YouTube",
  tiktok:    "TikTok",
  instagram: "Instagram",
  facebook:  "Facebook",
};

const TARGET_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  pending:    { label: "Bekliyor",          color: "text-slate-400",   bg: "bg-muted border-border",                icon: <Clock size={13} /> },
  publishing: { label: "Yayınlanıyor...",   color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20",     icon: <Loader2 size={13} className="animate-spin" /> },
  published:  { label: "Yayınlandı",        color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: <CheckCircle2 size={13} /> },
  failed:     { label: "Başarısız",         color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20",       icon: <XCircle size={13} /> },
  skipped:    { label: "Atlandı",           color: "text-slate-400",   bg: "bg-muted border-border",                icon: <SkipForward size={13} /> },
};

interface PublishHubCardProps {
  targets: PublishTarget[];
  jobId: string;
  retryingTargetId: string | null;
  onRetry: (targetId: string, force?: boolean) => void;
}

function PublishHubCard({ targets, retryingTargetId, onRetry }: PublishHubCardProps) {
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Platform Yayınları
        </p>
      </div>

      <div className="divide-y divide-border">
        {targets.map((target) => {
          const cfg = TARGET_STATUS_CONFIG[target.status] ?? TARGET_STATUS_CONFIG.pending;
          const isRetrying = retryingTargetId === target.id;
          const platformLabel = PLATFORM_LABELS[target.platform] ?? target.platform;
          const historyOpen = expandedHistory === target.id;

          return (
            <div key={target.id} className="p-4 space-y-2">
              {/* Başlık satırı */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cfg.color}>{cfg.icon}</span>
                  <span className="text-xs font-medium text-foreground">{platformLabel}</span>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", cfg.bg, cfg.color)}>
                    {cfg.label}
                  </span>
                </div>

                {/* Aksiyon butonları */}
                <div className="flex items-center gap-1">
                  {/* Geçmişi göster/gizle */}
                  {target.attempts_count > 0 && (
                    <button
                      onClick={() => setExpandedHistory(historyOpen ? null : target.id)}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent"
                    >
                      {historyOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      {target.attempts_count} deneme
                    </button>
                  )}

                  {/* Retry butonu — failed veya skipped durumunda */}
                  {(target.status === "failed" || target.status === "skipped" || target.status === "pending") && (
                    <button
                      disabled={isRetrying}
                      onClick={() => onRetry(target.id, false)}
                      className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded hover:bg-blue-500/10 disabled:opacity-50"
                    >
                      {isRetrying ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <RefreshCw size={10} />
                      )}
                      Yeniden Dene
                    </button>
                  )}

                  {/* Force retry — published durumunda */}
                  {target.status === "published" && (
                    <button
                      disabled={isRetrying}
                      onClick={() => onRetry(target.id, true)}
                      className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-300 transition-colors px-2 py-1 rounded hover:bg-accent disabled:opacity-50"
                    >
                      {isRetrying ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <RefreshCw size={10} />
                      )}
                      Tekrar Yükle
                    </button>
                  )}
                </div>
              </div>

              {/* Yayınlanan URL */}
              {target.status === "published" && target.external_url && (
                <a
                  href={target.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-emerald-400 hover:underline truncate"
                >
                  <ExternalLink size={11} />
                  {target.external_url}
                </a>
              )}

              {/* Hata kodu */}
              {target.status === "failed" && target.error_message && (
                <div className="text-xs text-red-400 font-mono bg-red-500/5 rounded px-2 py-1 border border-red-500/20 truncate">
                  {target.error_message}
                </div>
              )}

              {/* Son deneme zamanı */}
              {target.last_attempt_at && (
                <p className="text-[10px] text-muted-foreground">
                  Son deneme: {new Date(target.last_attempt_at).toLocaleString("tr-TR")}
                </p>
              )}

              {/* Girişim geçmişi */}
              {historyOpen && target.attempts.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-border pt-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                    Girişim Geçmişi
                  </p>
                  {target.attempts.map((attempt, i) => (
                    <div
                      key={attempt.id}
                      className={cn(
                        "flex items-center justify-between text-[10px] px-2 py-1 rounded",
                        attempt.status === "success"
                          ? "bg-emerald-500/5 text-emerald-400"
                          : attempt.status === "failed"
                            ? "bg-red-500/5 text-red-400"
                            : "bg-muted text-muted-foreground"
                      )}
                    >
                      <span>
                        #{i + 1} — {attempt.action_type}
                        {attempt.error_message && (
                          <span className="ml-1 opacity-75">: {attempt.error_message}</span>
                        )}
                      </span>
                      <span className="shrink-0 ml-2">
                        {attempt.started_at
                          ? new Date(attempt.started_at).toLocaleTimeString("tr-TR")
                          : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Elapsed Timer (çalışan adımlar için canlı süre) ──────────────────────

// 5 dakikayı aşan running adım "takılmış olabilir" uyarısı gösterir
const STALE_THRESHOLD_S = 300;

function ElapsedTimer({ startedAt }: { startedAt: string | null | undefined }) {
  const [elapsedSec, setElapsedSec] = useState<number | null>(null);

  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    if (isNaN(start)) return;

    function update() {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (elapsedSec === null) {
    // started_at yok — step çalışıyor ama süre bilinmiyor
    return (
      <span
        className="shrink-0 flex items-center gap-1 text-xs text-blue-400/60 tabular-nums"
        title="Adım başlangıç zamanı alınamadı"
      >
        <Clock size={11} />
        <span className="text-[10px]">çalışıyor</span>
      </span>
    );
  }

  const isStale = elapsedSec >= STALE_THRESHOLD_S;

  function fmt(s: number): string {
    if (s < 60) return `${s}s`;
    if (s < 3600) {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m}dk ${sec}s`;
    }
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}sa ${m}dk`;
  }

  return (
    <span
      className={cn(
        "shrink-0 flex items-center gap-1 text-xs tabular-nums",
        isStale ? "text-amber-400" : "text-blue-400"
      )}
      title={
        isStale
          ? "Bu adım 5 dakikayı aştı — takılmış olabilir. İptal edip tekrar deneyebilirsiniz."
          : "Geçen süre (bu adım başladığından beri)"
      }
    >
      <Clock size={11} />
      <span className={cn("text-[10px]", isStale ? "text-amber-400/70" : "text-blue-400/60")}>
        {isStale ? "uzun!" : "geçen"}
      </span>
      {fmt(elapsedSec)}
    </span>
  );
}

// ─── Render Progress Widget ────────────────────────────────────────────────

const PHASE_LABELS: Record<RenderProgress["phase"], string> = {
  bundling:  "Paketleniyor",
  rendering: "Render ediliyor",
  encoding:  "Encode ediliyor",
  done:      "Tamamlandı",
};

// Bundling aşamasında overall_pct genellikle 0–10 arası gelir.
// Rendering/encoding daha yüksek. Bar görünmesi için min %2 padding.
const MIN_BAR_PCT = 2;

function RenderProgressWidget({ progress }: { progress: RenderProgress }) {
  const rawPct = progress.overall_pct ?? 0;
  // Bar daima görünür: veri varsa gerçek değer, yoksa animasyonlu indeterminate
  const barPct = rawPct > 0 ? Math.max(rawPct, MIN_BAR_PCT) : 0;
  const isActive = progress.phase !== "done";
  const indeterminate = isActive && rawPct === 0;

  return (
    <div className="mx-4 mb-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-2">
      {/* Başlık satırı */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 font-medium text-blue-300">
          {isActive && <Loader2 size={12} className="animate-spin" />}
          <span>{PHASE_LABELS[progress.phase]}</span>
          {progress.phase === "rendering" && progress.total_frames > 0 && (
            <span className="text-blue-400/70">
              {progress.rendered_frames} / {progress.total_frames} frame
            </span>
          )}
          {progress.phase === "bundling" && (
            <span className="text-blue-400/70">
              {progress.bundling_pct != null ? `%${progress.bundling_pct}` : "başlatılıyor..."}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          {progress.eta && (
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {progress.eta}
            </span>
          )}
          {rawPct > 0 ? (
            <span className="font-mono tabular-nums">%{rawPct.toFixed(0)}</span>
          ) : isActive ? (
            <span className="text-blue-400/50 text-[10px]">hesaplanıyor</span>
          ) : null}
        </div>
      </div>

      {/* Progress bar — indeterminate (pulse) veya determinate */}
      <div className="h-1.5 w-full rounded-full bg-blue-500/15 overflow-hidden">
        {indeterminate ? (
          <div className="h-full w-1/3 rounded-full bg-blue-400/60 animate-pulse" />
        ) : (
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              progress.phase === "done" ? "bg-emerald-400" : "bg-blue-400"
            )}
            style={{ width: `${Math.min(barPct, 100)}%` }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Pipeline Adım Satırı ──────────────────────────────────────────────────

function StepRow({ step, renderProgress }: { step: PipelineStep; renderProgress?: RenderProgress | null }) {
  const durationStr = step.duration_ms
    ? step.duration_ms >= 60000
      ? `${(step.duration_ms / 60000).toFixed(1)}dk`
      : step.duration_ms >= 1000
        ? `${(step.duration_ms / 1000).toFixed(1)}s`
        : `${step.duration_ms}ms`
    : null;

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3 transition-colors",
          step.status === "running" && "bg-blue-500/5"
        )}
      >
        {/* Durum ikonu */}
        <div className="shrink-0">{STEP_STATUS_ICON[step.status]}</div>

        {/* Adım bilgisi */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{step.label}</span>
            {step.cached && (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                CACHE
              </span>
            )}
          </div>
          {step.message && (
            <p className="mt-0.5 text-xs text-muted-foreground truncate">{step.message}</p>
          )}
        </div>

        {/* Provider */}
        {step.provider && (
          <span className="hidden sm:block shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {step.provider}
          </span>
        )}

        {/* Süre: tamamlanmış → statik, çalışan → canlı sayaç (started_at null ise "çalışıyor" gösterir) */}
        {step.status === "running" ? (
          <ElapsedTimer startedAt={step.started_at} />
        ) : durationStr ? (
          <span className="shrink-0 text-xs text-muted-foreground w-14 text-right">
            {durationStr}
          </span>
        ) : null}

        {/* Maliyet */}
        {step.cost_estimate_usd > 0 && (
          <span className="hidden sm:block shrink-0 text-xs text-muted-foreground w-16 text-right">
            ${step.cost_estimate_usd.toFixed(4)}
          </span>
        )}
      </div>

      {/* Render progress — yalnızca composition adımı running iken */}
      {step.key === "composition" && step.status === "running" && renderProgress && (
        <RenderProgressWidget progress={renderProgress} />
      )}
    </>
  );
}

// ─── Log Viewer ──────────────────────────────────────────────────────────────

function LogViewer({ logs }: { logs: LogEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const addToast = useUIStore((s) => s.addToast);

  // Auto-scroll
  useEffect(() => {
    if (!autoScroll || !containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [logs.length, autoScroll]);

  // Kullanıcı scroll yaptığında auto-scroll'u kapat
  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }

  function handleCopyLogs() {
    const text = logs
      .map(
        (l) =>
          `[${l.timestamp.split("T")[1]?.slice(0, 8) ?? l.timestamp}] [${l.level}]${l.step ? ` [${l.step}]` : ""} ${l.message}`
      )
      .join("\n");

    navigator.clipboard.writeText(text).then(
      () => addToast({ type: "success", title: "Loglar kopyalandı" }),
      () => addToast({ type: "error", title: "Kopyalama başarısız" })
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
        {logs.length === 0 ? "Henüz log mesajı yok" : ""}
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card">
        <span className="text-[10px] text-muted-foreground">
          {autoScroll ? "Otomatik kaydırma açık" : "Kaydırma durduruldu"}
        </span>
        <button
          onClick={handleCopyLogs}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Copy size={10} />
          Kopyala
        </button>
      </div>

      {/* Log satırları */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="max-h-72 overflow-y-auto bg-[hsl(var(--background))] px-3 py-2 font-mono text-[11px] leading-relaxed"
      >
        {logs.map((log) => (
          <div key={log.id} className="flex gap-2 py-0.5 hover:bg-accent/20">
            <span className="shrink-0 text-slate-600 select-none">
              {log.timestamp.split("T")[1]?.slice(0, 8) ?? ""}
            </span>
            <span
              className={cn(
                "shrink-0 w-10 text-right font-semibold select-none",
                LOG_LEVEL_COLORS[log.level]
              )}
            >
              {log.level}
            </span>
            {log.step && (
              <span className="shrink-0 text-slate-500">[{log.step}]</span>
            )}
            <span className="text-slate-300 break-all">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tarih formatlama ────────────────────────────────────────────────────────

function formatDateTime(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    return d.toLocaleString("tr-TR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}
