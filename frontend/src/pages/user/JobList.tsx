/**
 * JobList — Tüm işlerin filtrelenebilir listesi.
 *
 * UX: Hibrit Navigasyon (Klavye + Fare Kusursuz Uyumu)
 *   • ArrowUp / ArrowDown / Home / End → satır odaklanması
 *   • Fare hover → klavye odağını otomatik o satıra taşır
 *   • Space → Quick Look (Dialog önizleme)
 *   • Enter veya Sol Tık → Deep Dive (Sağ Çekmece detay paneli)
 *   • ESC → açık pencereyi kapar
 *
 * Erişilebilirlik:
 *   • role="listbox" + role="option" ile tam ARIA desteği
 *   • Roving tabindex: aktif satır tabIndex=0, diğerleri tabIndex=-1
 *   • aria-selected, aria-setsize, aria-posinset
 *   • Scope yönetimi: useScopedKeyboardNavigation ile
 *     overlay açıkken altındaki scope otomatik pasif
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  ListVideo,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useJobStore, type Job, type PublishTarget } from "@/stores/jobStore";
import {
  STATUS_CONFIG,
  MODULE_INFO,
  STATUS_FILTERS,
  MODULE_FILTERS,
  getModuleIcon,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { JobQuickLook } from "@/components/jobs/JobQuickLook";
import { JobDetailSheet } from "@/components/jobs/JobDetailSheet";
import { useScopedKeyboardNavigation } from "@/hooks/useScopedKeyboardNavigation";
import { useRovingTabindex } from "@/hooks/useRovingTabindex";
import { useFocusRestore } from "@/hooks/useFocusRestore";
import { useDismissOnEsc } from "@/hooks/useDismissStack";

// ─── Sabitler ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;
const LIST_ID   = "job-list-listbox";

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function JobList() {
  const { jobs, totalJobs, loading, error, fetchJobs, connectGlobalStream } =
    useJobStore();

  const [page, setPage]                 = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");

  // ── Panel State ──────────────────────────────────────────────────────────
  const [quickLookJob, setQuickLookJob] = useState<Job | null>(null);
  const [sheetJob, setSheetJob]         = useState<Job | null>(null);
  const listRef                         = useRef<HTMLDivElement>(null);
  const pendingSheetJobRef              = useRef<Job | null>(null);

  const anyPanelOpen = quickLookJob !== null || sheetJob !== null;

  // ── Odak Geri Yükleme ────────────────────────────────────────────────────
  const { captureForRestore, restoreFocusDeferred } = useFocusRestore();

  // ── Klavye Navigasyonu & Roving Tabindex ─────────────────────────────────
  // useRovingTabindex önce çağrılmalı: notifyKeyboard referansı
  // useScopedKeyboardNavigation'a onKeyboardMove olarak geçiliyor.
  // İlk render'da onKeyboardMoveRef undefined olur, ikinci render'da
  // düzgün set edilir — hook içinde ref pattern kullanıldığı için sorunsuz.
  // notifyKeyboard referansı, useScopedKeyboardNavigation'a geçmek için
  // önce bir ref üzerinden sabitlenir.
  const notifyKeyboardRef = useRef<(() => void) | undefined>(undefined);

  const { focusedIdx, setFocusedIdx, scopeId } = useScopedKeyboardNavigation({
    itemCount: jobs.length,
    disabled: anyPanelOpen,
    scrollRef: listRef as React.RefObject<HTMLElement | null>,
    homeEnd: true,
    onSpace: (idx) => openQuickLook(jobs[idx]),
    onEnter: (idx) => {
      setFocusedIdx(idx);
      captureForRestore();
      setSheetJob(jobs[idx]);
    },
    onEscape: () => {
      setQuickLookJob(null);
      setSheetJob(null);
    },
    onKeyboardMove: () => notifyKeyboardRef.current?.(),
  });

  const { getTabIndex, notifyKeyboard } = useRovingTabindex({
    focusedIdx,
    itemCount: jobs.length,
    containerRef: listRef as React.RefObject<HTMLElement | null>,
  });

  // Ref'i her render'da güncel tut
  notifyKeyboardRef.current = notifyKeyboard;

  // ── ESC Kapatma Yığını — Overlay önceliği ────────────────────────────────
  // QuickLook: priority 20 (en üstte), Sheet: priority 10
  // Scope'un kendi ESC handler'ı (onEscape) scope disabled iken çalışmaz;
  // bu kayıtlar scope bağımsız olarak çalışır.
  useDismissOnEsc(quickLookJob !== null, () => setQuickLookJob(null), 20);
  useDismissOnEsc(sheetJob !== null, () => {
    setSheetJob(null);
    restoreFocusDeferred(150);
  }, 10);

  // ── Data Loading ─────────────────────────────────────────────────────────
  const loadData = useCallback(() => {
    fetchJobs({
      page,
      page_size: PAGE_SIZE,
      status: statusFilter || undefined,
      module_key: moduleFilter || undefined,
    });
  }, [fetchJobs, page, statusFilter, moduleFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Global SSE stream
  useEffect(() => {
    const closeStream = connectGlobalStream();
    return () => closeStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Filtre ────────────────────────────────────────────────────────────────
  function handleFilterChange(type: "status" | "module", value: string) {
    setPage(1);
    setFocusedIdx(-1);
    if (type === "status") setStatusFilter(value);
    else setModuleFilter(value);
  }

  // ── Quick Look / Sheet ───────────────────────────────────────────────────
  function openQuickLook(job: Job) {
    captureForRestore();
    pendingSheetJobRef.current = job;
    setQuickLookJob(job);
  }

  function closeQuickLook() {
    setQuickLookJob(null);
    restoreFocusDeferred(80);
  }

  function handleOpenDeepDiveFromQuickLook() {
    const job = pendingSheetJobRef.current;
    if (job) {
      setSheetJob(job);
      pendingSheetJobRef.current = null;
    }
  }

  function closeSheet() {
    setSheetJob(null);
    restoreFocusDeferred(150);
  }

  const totalPages = Math.max(1, Math.ceil(totalJobs / PAGE_SIZE));
  const listLabelId = `${LIST_ID}-label`;

  return (
    <div className="space-y-4">
      {/* Başlık + kontroller */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListVideo size={20} className="text-primary" aria-hidden="true" />
          <h2 id={listLabelId} className="text-lg font-semibold text-foreground">
            İşler
          </h2>
          <span
            className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            aria-label={`Toplam ${totalJobs} iş`}
          >
            {totalJobs}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Klavye kısayolları ipucu */}
          <span
            className="hidden md:flex items-center gap-1 text-[10px] text-muted-foreground/60"
            aria-hidden="true"
          >
            <kbd className="rounded border border-border px-1 font-mono">↑↓</kbd>
            <span>seç</span>
            <kbd className="rounded border border-border px-1 font-mono ml-1">Space</kbd>
            <span>önizle</span>
            <kbd className="rounded border border-border px-1 font-mono ml-1">Enter</kbd>
            <span>detay</span>
            <kbd className="rounded border border-border px-1 font-mono ml-1">Home/End</kbd>
          </span>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            aria-label="Listeyi yenile"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} aria-hidden="true" />
            Yenile
          </button>
        </div>
      </div>

      {/* Filtreler */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtreler">
        <div
          className="flex rounded-lg border border-border overflow-hidden"
          role="group"
          aria-label="Durum filtresi"
        >
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => handleFilterChange("status", f.value)}
              aria-pressed={statusFilter === f.value}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                statusFilter === f.value
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div
          className="flex rounded-lg border border-border overflow-hidden"
          role="group"
          aria-label="Modül filtresi"
        >
          {MODULE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => handleFilterChange("module", f.value)}
              aria-pressed={moduleFilter === f.value}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                moduleFilter === f.value
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* İçerik */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading && jobs.length === 0 ? (
          <div
            className="flex items-center justify-center py-20 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <Loader2 size={16} className="animate-spin mr-2" aria-hidden="true" />
            Yükleniyor...
          </div>
        ) : error && jobs.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-20 text-sm text-muted-foreground gap-2"
            role="alert"
          >
            <AlertCircle size={24} className="text-destructive" aria-hidden="true" />
            <p>Veri alınamadı</p>
            <button onClick={loadData} className="text-xs text-primary hover:underline">
              Tekrar dene
            </button>
          </div>
        ) : jobs.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-20 text-sm text-muted-foreground gap-2"
            role="status"
          >
            <ListVideo size={28} className="opacity-30" aria-hidden="true" />
            <p>Eşleşen iş bulunamadı</p>
          </div>
        ) : (
          <>
            {/* Tablo başlığı */}
            <div
              className="hidden sm:grid grid-cols-[1fr_140px_120px_100px_80px] gap-2 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground"
              aria-hidden="true"
            >
              <span>Başlık</span>
              <span>Modül</span>
              <span>İlerleme</span>
              <span>Durum</span>
              <span className="text-right">Tarih</span>
            </div>

            {/* Satırlar — ARIA listbox */}
            <div
              ref={listRef}
              id={LIST_ID}
              role="listbox"
              aria-labelledby={listLabelId}
              aria-activedescendant={
                focusedIdx >= 0 ? `${scopeId}-opt-${focusedIdx}` : undefined
              }
              className="divide-y divide-border"
            >
              {jobs.map((job, idx) => (
                <JobRow
                  key={job.id}
                  job={job}
                  idx={idx}
                  total={jobs.length}
                  scopeId={scopeId}
                  isFocused={focusedIdx === idx}
                  tabIndex={getTabIndex(idx)}
                  onHover={() => setFocusedIdx(idx)}
                  onClick={() => {
                    setFocusedIdx(idx);
                    captureForRestore();
                    setSheetJob(job);
                  }}
                  onQuickLook={() => {
                    setFocusedIdx(idx);
                    openQuickLook(job);
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Sayfalama */}
      {totalPages > 1 && (
        <nav
          className="flex items-center justify-between"
          aria-label="Sayfalama"
        >
          <p className="text-xs text-muted-foreground">
            Sayfa {page} / {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setPage((p) => Math.max(1, p - 1));
                setFocusedIdx(-1);
              }}
              disabled={page <= 1}
              aria-label="Önceki sayfa"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={14} aria-hidden="true" />
            </button>
            <button
              onClick={() => {
                setPage((p) => Math.min(totalPages, p + 1));
                setFocusedIdx(-1);
              }}
              disabled={page >= totalPages}
              aria-label="Sonraki sayfa"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}

      {/* ── Quick Look Modal ── */}
      <JobQuickLook
        job={quickLookJob}
        open={quickLookJob !== null}
        onClose={closeQuickLook}
        onOpenDeepDive={handleOpenDeepDiveFromQuickLook}
      />

      {/* ── Deep Dive Sheet ── */}
      <JobDetailSheet
        job={sheetJob}
        open={sheetJob !== null}
        onClose={closeSheet}
      />
    </div>
  );
}

// ─── İş Satırı ───────────────────────────────────────────────────────────────

interface JobRowProps {
  job: Job;
  idx: number;
  total: number;
  scopeId: string;
  isFocused: boolean;
  tabIndex: 0 | -1;
  onHover: () => void;
  onClick: () => void;
  onQuickLook: () => void;
}

function JobRow({
  job,
  idx,
  total,
  scopeId,
  isFocused,
  tabIndex,
  onHover,
  onClick,
  onQuickLook,
}: JobRowProps) {
  const statusCfg = STATUS_CONFIG[job.status];
  const modMeta   = MODULE_INFO[job.module_key];
  const modLabel  = modMeta?.label ?? job.module_key;

  const completedSteps = job.steps.filter((s) => s.status === "completed").length;
  const totalSteps     = job.steps.length;
  const pct            = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  const dateStr        = formatShortDate(job.created_at);

  return (
    <button
      id={`${scopeId}-opt-${idx}`}
      data-nav-row
      role="option"
      aria-selected={isFocused}
      aria-setsize={total}
      aria-posinset={idx + 1}
      tabIndex={tabIndex}
      onClick={onClick}
      onMouseEnter={onHover}
      onContextMenu={(e) => {
        e.preventDefault();
        onQuickLook();
      }}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
        "sm:grid sm:grid-cols-[1fr_140px_120px_100px_80px] sm:gap-2",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset",
        isFocused
          ? "bg-muted ring-1 ring-inset ring-primary/30"
          : "hover:bg-accent/50"
      )}
    >
      {/* Başlık */}
      <div className="min-w-0 flex-1 sm:flex-none">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{job.title}</p>
          {job.status === "completed" && (
            <PublishBadge
              targets={job.publishTargets}
              ytVideoId={job.youtube_video_id}
            />
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground sm:hidden">{modLabel}</p>
      </div>

      {/* Modül */}
      <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
        <span aria-hidden="true">{getModuleIcon(job.module_key, 14)}</span>
        <span className="truncate">{modLabel}</span>
      </div>

      {/* İlerleme */}
      <div className="hidden sm:flex items-center gap-2" aria-hidden="true">
        <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              job.status === "failed"    ? "bg-red-400" :
              job.status === "completed" ? "bg-emerald-400" : "bg-primary"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground w-10">
          {completedSteps}/{totalSteps}
        </span>
      </div>

      {/* Durum */}
      <span
        className={cn(
          "shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
          statusCfg.color,
          statusCfg.bg
        )}
        aria-label={`Durum: ${statusCfg.label}`}
      >
        <span className="hidden sm:inline" aria-hidden="true">
          {statusCfg.label}
        </span>
      </span>

      {/* Tarih */}
      <span
        className="hidden sm:block text-xs text-muted-foreground text-right"
        aria-label={`Oluşturulma: ${dateStr}`}
      >
        {dateStr}
      </span>
    </button>
  );
}

// ─── Yayın Rozeti ────────────────────────────────────────────────────────────

interface PublishBadgeProps {
  targets?: PublishTarget[];
  /** @deprecated compat fallback */
  ytVideoId?: string | null;
}

function PublishBadge({ targets, ytVideoId }: PublishBadgeProps) {
  // publishTargets yüklüyse onlardan türet
  if (targets && targets.length > 0) {
    const published = targets.filter((t) => t.status === "published").length;
    const failed    = targets.filter((t) => t.status === "failed").length;
    const publishing = targets.filter((t) => t.status === "publishing").length;

    if (publishing > 0) {
      return (
        <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-600">
          Yayınlanıyor
        </span>
      );
    }
    if (published > 0) {
      return (
        <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-600">
          Yayınlandı {targets.length > 1 ? `(${published}/${targets.length})` : ""}
        </span>
      );
    }
    if (failed > 0 && published === 0) {
      return (
        <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium bg-red-500/10 text-red-600">
          Yayın Hatası
        </span>
      );
    }
    return null;
  }

  // Compat fallback: deprecated youtube_video_id
  if (ytVideoId) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-600">
        Yayınlandı
      </span>
    );
  }

  return null;
}

// ─── Tarih Formatlama ─────────────────────────────────────────────────────────

function formatShortDate(isoDate: string): string {
  try {
    const d       = new Date(isoDate);
    const now     = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  } catch {
    return "-";
  }
}
