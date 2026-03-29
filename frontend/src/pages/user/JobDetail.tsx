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
  Play,
  Ban,
  XCircle,
  SkipForward,
  Video,
  Newspaper,
  ShoppingBag,
  RefreshCw,
  FileVideo,
  Terminal,
  ChevronDown,
  ChevronUp,
  Copy,
  Zap,
} from "lucide-react";
import {
  useJobStore,
  type Job,
  type JobStatus,
  type StepStatus,
  type PipelineStep,
  type LogEntry,
} from "@/stores/jobStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

// ─── Sabitler ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  JobStatus,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  queued: {
    label: "Kuyrukta",
    color: "text-slate-400",
    bg: "bg-slate-400/15",
    icon: <Clock size={14} />,
  },
  running: {
    label: "Çalışıyor",
    color: "text-blue-400",
    bg: "bg-blue-400/15",
    icon: <Play size={14} />,
  },
  completed: {
    label: "Tamamlandı",
    color: "text-emerald-400",
    bg: "bg-emerald-400/15",
    icon: <CheckCircle2 size={14} />,
  },
  failed: {
    label: "Başarısız",
    color: "text-red-400",
    bg: "bg-red-400/15",
    icon: <XCircle size={14} />,
  },
  cancelled: {
    label: "İptal Edildi",
    color: "text-slate-500",
    bg: "bg-slate-500/15",
    icon: <Ban size={14} />,
  },
};

const STEP_STATUS_ICON: Record<StepStatus, React.ReactNode> = {
  pending: <Clock size={16} className="text-slate-500" />,
  running: <Loader2 size={16} className="text-blue-400 animate-spin" />,
  completed: <CheckCircle2 size={16} className="text-emerald-400" />,
  failed: <XCircle size={16} className="text-red-400" />,
  skipped: <SkipForward size={16} className="text-slate-500" />,
};

const MODULE_INFO: Record<string, { label: string; icon: React.ReactNode }> = {
  standard_video: { label: "Standart Video", icon: <Video size={16} /> },
  news_bulletin: { label: "Haber Bülteni", icon: <Newspaper size={16} /> },
  product_review: { label: "Ürün İnceleme", icon: <ShoppingBag size={16} /> },
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

  const { getJobById, fetchJobById, cancelJob, subscribeToJob } = useJobStore();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [logsOpen, setLogsOpen] = useState(true);

  const job = getJobById(jobId ?? "");

  // İlk yükleme
  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    fetchJobById(jobId).then((result) => {
      if (!result) setNotFound(true);
      setLoading(false);
    });
  }, [jobId, fetchJobById]);

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
  const modInfo = MODULE_INFO[job.module_key] ?? {
    label: job.module_key,
    icon: <Video size={16} />,
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
            {statusCfg.icon}
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

        {/* Tamamlandı — çıktı linki */}
        {job.status === "completed" && job.output_path && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-400">
            <FileVideo size={14} className="shrink-0" />
            <span className="truncate">Çıktı: {job.output_path}</span>
          </div>
        )}

        {/* Maliyet özeti */}
        {totalCost > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Zap size={12} />
            Tahmini maliyet: ${totalCost.toFixed(4)}
          </div>
        )}
      </div>

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
              <StepRow key={step.key} step={step} />
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

// ─── Pipeline Adım Satırı ──────────────────────────────────────────────────

function StepRow({ step }: { step: PipelineStep }) {
  const durationStr = step.duration_ms
    ? step.duration_ms >= 60000
      ? `${(step.duration_ms / 60000).toFixed(1)}dk`
      : step.duration_ms >= 1000
        ? `${(step.duration_ms / 1000).toFixed(1)}s`
        : `${step.duration_ms}ms`
    : null;

  return (
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

      {/* Süre */}
      {durationStr && (
        <span className="shrink-0 text-xs text-muted-foreground w-14 text-right">
          {durationStr}
        </span>
      )}

      {/* Maliyet */}
      {step.cost_estimate_usd > 0 && (
        <span className="hidden sm:block shrink-0 text-xs text-muted-foreground w-16 text-right">
          ${step.cost_estimate_usd.toFixed(4)}
        </span>
      )}
    </div>
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
