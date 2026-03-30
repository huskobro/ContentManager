/**
 * JobDetailSheet — Enter/tıklama ile sağdan kayarak açılan mühendislik detay paneli.
 *
 * İçerik: Küçük video oynatıcı, Pipeline Adımları, Toplam Maliyet,
 *         Sağlayıcılar, Canlı Loglar (JobDetail.tsx verilerinden).
 * Aksiyonlar: Yeniden Dene | İptal Et | Sil
 *
 * Radix Dialog ile sağ panel (Sheet) efekti yapılıyor
 * (@radix-ui/react-dialog zaten mevcut).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  Loader2,
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
  Trash2,
} from "lucide-react";
import {
  type Job,
  type StepStatus,
  type PipelineStep,
  type LogEntry,
  type RenderProgress,
  useJobStore,
} from "@/stores/jobStore";
import { useAdminStore } from "@/stores/adminStore";
import { useUIStore } from "@/stores/uiStore";
import { STATUS_CONFIG, MODULE_INFO, getModuleIcon } from "@/lib/constants";
import { api } from "@/api/client";
import { cn } from "@/lib/utils";

// ─── Tipler ──────────────────────────────────────────────────────────────────

interface Props {
  job: Job | null;
  open: boolean;
  onClose: () => void;
  /** Admin modunda silme butonu gösterilir */
  isAdmin?: boolean;
  /** Silme sonrası liste yenilemek için */
  onDeleted?: () => void;
}

// ─── Step ikon haritası ────────────────────────────────────────────────────

const STEP_STATUS_ICON: Record<StepStatus, React.ReactNode> = {
  pending:   <Clock size={15} className="text-slate-500" />,
  running:   <Loader2 size={15} className="text-blue-400 animate-spin" />,
  completed: <CheckCircle2 size={15} className="text-emerald-400" />,
  failed:    <XCircle size={15} className="text-red-400" />,
  skipped:   <SkipForward size={15} className="text-slate-500" />,
};

const LOG_LEVEL_COLORS: Record<LogEntry["level"], string> = {
  DEBUG: "text-slate-500",
  INFO:  "text-slate-300",
  WARN:  "text-amber-400",
  ERROR: "text-red-400",
};

const PHASE_LABELS: Record<RenderProgress["phase"], string> = {
  bundling:  "Paketleniyor",
  rendering: "Render ediliyor",
  encoding:  "Encode ediliyor",
  done:      "Tamamlandı",
};

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export function JobDetailSheet({ job, open, onClose, isAdmin = false, onDeleted }: Props) {
  const addToast = useUIStore((s) => s.addToast);
  const { fetchJobById, cancelJob, subscribeToJob } = useJobStore();
  const { deleteJob } = useAdminStore();

  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying]     = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [logsOpen, setLogsOpen]     = useState(true);

  // SSE aboneliği — sadece aktif işler için
  useEffect(() => {
    if (!open || !job) return;
    const isActive = job.status === "queued" || job.status === "running";
    if (!isActive) return;
    const unsub = subscribeToJob(job.id);
    return () => unsub();
  }, [open, job?.id, job?.status, subscribeToJob]);

  const handleCancel = useCallback(async () => {
    if (!job || cancelling) return;
    setCancelling(true);
    const ok = await cancelJob(job.id);
    setCancelling(false);
    if (ok) {
      addToast({ type: "info", title: "İş iptal edildi" });
    } else {
      addToast({ type: "error", title: "İptal başarısız" });
    }
  }, [job, cancelling, cancelJob, addToast]);

  const handleRetry = useCallback(async () => {
    if (!job || retrying) return;
    setRetrying(true);
    try {
      await api.post(`/jobs/${job.id}/retry`);
      await fetchJobById(job.id);
      addToast({ type: "success", title: "İş yeniden başlatıldı" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      addToast({ type: "error", title: "Yeniden başlatma başarısız", description: msg });
    } finally {
      setRetrying(false);
    }
  }, [job, retrying, fetchJobById, addToast]);

  const handleDelete = useCallback(async () => {
    if (!job || deleting) return;
    setDeleting(true);
    const ok = await deleteJob(job.id);
    setDeleting(false);
    if (ok) {
      addToast({ type: "success", title: "İş silindi" });
      onClose();
      onDeleted?.();
    } else {
      addToast({ type: "error", title: "Silinemedi", description: "Aktif işler silinemez." });
    }
  }, [job, deleting, deleteJob, addToast, onClose, onDeleted]);

  const handleDownload = useCallback(async () => {
    if (!job) return;
    try {
      const response = await fetch(`/api/jobs/${job.id}/output`);
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: "İndirme hatası" }));
        addToast({ type: "error", title: "İndirme başarısız", description: err.detail });
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `video_${job.id.substring(0, 8)}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      addToast({ type: "success", title: "Video indiriliyor..." });
    } catch {
      addToast({ type: "error", title: "İndirme başarısız" });
    }
  }, [job, addToast]);

  if (!job) return null;

  const statusCfg   = STATUS_CONFIG[job.status];
  const modMeta     = MODULE_INFO[job.module_key];
  const modLabel    = modMeta?.label ?? job.module_key;
  const isActive    = job.status === "queued" || job.status === "running";
  const isTerminal  = !isActive;
  const totalCost   = job.steps.reduce((acc, s) => acc + (s.cost_estimate_usd || 0), 0);
  const completedSteps = job.steps.filter((s) => s.status === "completed").length;
  const totalSteps     = job.steps.length;
  const overallPct     = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        {/* Backdrop */}
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        {/* Sağ çekmece paneli */}
        <Dialog.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 w-full max-w-lg",
            "border-l border-border bg-card shadow-2xl",
            "flex flex-col overflow-hidden",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
            "focus:outline-none"
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* ── Başlık ── */}
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 shrink-0">
            <div className="min-w-0 flex-1 space-y-1">
              <Dialog.Title className="text-sm font-semibold text-foreground leading-tight truncate">
                {job.title}
              </Dialog.Title>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  {getModuleIcon(job.module_key, 12)}
                  {modLabel}
                </span>
                {job.language && (
                  <>
                    <span>•</span>
                    <span className="uppercase">{job.language}</span>
                  </>
                )}
                <span>•</span>
                <span
                  className={cn(
                    "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                    statusCfg.color,
                    statusCfg.bg
                  )}
                >
                  {statusCfg.label}
                </span>
              </div>
            </div>

            <Dialog.Close asChild>
              <button
                className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Kapat"
              >
                <X size={14} />
              </button>
            </Dialog.Close>
          </div>

          {/* ── Kaydırılabilir içerik ── */}
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-4 p-5">

              {/* Küçük video oynatıcı */}
              <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
                {job.status === "completed" && job.output_path ? (
                  <video
                    src={`/api/jobs/${job.id}/output`}
                    className="h-full w-full object-contain"
                    controls
                    preload="metadata"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center space-y-1.5">
                      <FileVideo size={32} className="mx-auto text-muted-foreground/30" />
                      <p className="text-xs text-muted-foreground">
                        {isActive ? `İşleniyor... %${overallPct}` : "Video mevcut değil"}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Genel ilerleme */}
              <div className="rounded-xl border border-border bg-background/50 p-4 space-y-2.5">
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
                      job.status === "failed" ? "bg-red-400" :
                      job.status === "completed" ? "bg-emerald-400" : "bg-primary"
                    )}
                    style={{ width: `${overallPct}%` }}
                  />
                </div>

                {job.error_message && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
                    <XCircle size={13} className="shrink-0 mt-0.5" />
                    <span>{job.error_message}</span>
                  </div>
                )}

                {job.status === "completed" && job.output_path && (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-400">
                    <FileVideo size={13} className="shrink-0" />
                    <span className="truncate">Çıktı: {job.output_path}</span>
                  </div>
                )}

                {totalCost > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Zap size={12} />
                    Toplam tahmini maliyet: ${totalCost.toFixed(4)}
                  </div>
                )}
              </div>

              {/* Pipeline adımları */}
              <div className="rounded-xl border border-border bg-background/50 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Pipeline Adımları
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {job.steps
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((step) => (
                      <SheetStepRow
                        key={step.key}
                        step={step}
                        renderProgress={step.key === "composition" ? job.renderProgress : null}
                      />
                    ))}
                </div>
              </div>

              {/* Canlı Loglar */}
              <div className="rounded-xl border border-border bg-background/50 overflow-hidden">
                <button
                  onClick={() => setLogsOpen((v) => !v)}
                  className="flex w-full items-center justify-between px-4 py-2.5 border-b border-border hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Terminal size={13} className="text-muted-foreground" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Canlı Loglar
                    </span>
                    {job.logs.length > 0 && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
                        {job.logs.length}
                      </span>
                    )}
                  </div>
                  {logsOpen
                    ? <ChevronUp size={13} className="text-muted-foreground" />
                    : <ChevronDown size={13} className="text-muted-foreground" />
                  }
                </button>
                {logsOpen && <SheetLogViewer logs={job.logs} />}
              </div>

            </div>
          </div>

          {/* ── Aksiyon footer ── */}
          <div className="shrink-0 border-t border-border px-5 py-4 flex items-center gap-2">
            {isActive && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
              >
                {cancelling ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />}
                İptal Et
              </button>
            )}

            {(job.status === "failed" || job.status === "cancelled") && (
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-500/30 px-3 py-2 text-xs font-medium text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-50"
              >
                {retrying ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                Yeniden Dene
              </button>
            )}

            {job.status === "completed" && (
              <button
                onClick={handleDownload}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 px-3 py-2 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors"
              >
                <Download size={11} />
                İndir
              </button>
            )}

            {(isAdmin || isTerminal) && (
              <button
                onClick={handleDelete}
                disabled={deleting || isActive}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                title={isActive ? "Aktif işler silinemez" : "Sil"}
              >
                {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                Sil
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Sheet içi Pipeline Adım Satırı ─────────────────────────────────────────

function SheetStepRow({
  step,
  renderProgress,
}: {
  step: PipelineStep;
  renderProgress?: RenderProgress | null;
}) {
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
          "flex items-center gap-3 px-4 py-2.5 transition-colors",
          step.status === "running" && "bg-blue-500/5"
        )}
      >
        <div className="shrink-0">{STEP_STATUS_ICON[step.status]}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">{step.label}</span>
            {step.cached && (
              <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-medium text-amber-400">
                CACHE
              </span>
            )}
          </div>
          {step.message && (
            <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{step.message}</p>
          )}
        </div>
        {step.provider && (
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {step.provider}
          </span>
        )}
        {durationStr && (
          <span className="shrink-0 text-[11px] text-muted-foreground w-12 text-right">
            {durationStr}
          </span>
        )}
        {step.cost_estimate_usd > 0 && (
          <span className="shrink-0 text-[11px] text-muted-foreground w-14 text-right font-mono">
            ${step.cost_estimate_usd.toFixed(4)}
          </span>
        )}
      </div>

      {step.key === "composition" && step.status === "running" && renderProgress && (
        <SheetRenderProgress progress={renderProgress} />
      )}
    </>
  );
}

// ─── Sheet içi Render Progress ────────────────────────────────────────────

function SheetRenderProgress({ progress }: { progress: RenderProgress }) {
  const pct = progress.overall_pct ?? 0;
  const isActive = progress.phase !== "done";

  return (
    <div className="mx-4 mb-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-2">
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2 font-medium text-blue-300">
          {isActive && <Loader2 size={11} className="animate-spin" />}
          <span>{PHASE_LABELS[progress.phase]}</span>
          {progress.phase === "rendering" && progress.total_frames > 0 && (
            <span className="text-blue-400/70">
              {progress.rendered_frames}/{progress.total_frames} frame
            </span>
          )}
        </div>
        {pct > 0 && (
          <span className="font-mono tabular-nums text-muted-foreground">%{pct.toFixed(0)}</span>
        )}
      </div>
      <div className="h-1.5 w-full rounded-full bg-blue-500/15 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            progress.phase === "done" ? "bg-emerald-400" : "bg-blue-400"
          )}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ─── Sheet içi Log Viewer ────────────────────────────────────────────────────

function SheetLogViewer({ logs }: { logs: LogEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const addToast     = useUIStore((s) => s.addToast);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!autoScroll || !containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [logs.length, autoScroll]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }

  function handleCopyLogs() {
    const text = logs
      .map((l) =>
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
      <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
        Henüz log mesajı yok
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
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
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="max-h-52 overflow-y-auto bg-[hsl(var(--background))] px-3 py-2 font-mono text-[10px] leading-relaxed"
      >
        {logs.map((log) => (
          <div key={log.id} className="flex gap-2 py-0.5 hover:bg-accent/20">
            <span className="shrink-0 text-slate-600 select-none">
              {log.timestamp.split("T")[1]?.slice(0, 8) ?? ""}
            </span>
            <span className={cn("shrink-0 w-10 text-right font-semibold select-none", LOG_LEVEL_COLORS[log.level])}>
              {log.level}
            </span>
            {log.step && <span className="shrink-0 text-slate-500">[{log.step}]</span>}
            <span className="text-slate-300 break-all">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
