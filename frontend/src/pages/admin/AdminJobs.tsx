/**
 * AdminJobs — Tüm işlerin admin yönetim ekranı.
 *
 * UX: Hibrit Navigasyon (Klavye + Fare Kusursuz Uyumu)
 *   • ArrowUp/ArrowDown → satır odaklanması
 *   • Fare hover → klavye odağını o satıra taşır
 *   • Space → Quick Look (Dialog önizleme)
 *   • Enter veya Sol Tık → Deep Dive (Sağ Çekmece + silme butonu)
 *   • ESC → açık pencereyi kapar
 *
 * Fare kullanıcıları için tıklanabilirlik/hover hiçbir şekilde bozulmaz.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  ListVideo,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Ban,
  Trash2,
  Eraser,
} from "lucide-react";
import { useScopedKeyboardNavigation } from "@/hooks/useScopedKeyboardNavigation";
import { useRovingTabindex } from "@/hooks/useRovingTabindex";
import { useFocusRestore } from "@/hooks/useFocusRestore";
import { useDismissOnEsc } from "@/hooks/useDismissStack";
import { useJobStore, type Job } from "@/stores/jobStore";
import { useAdminStore } from "@/stores/adminStore";
import { useUIStore } from "@/stores/uiStore";
import { STATUS_CONFIG, MODULE_INFO, STATUS_FILTERS, getModuleIcon } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { JobQuickLook } from "@/components/jobs/JobQuickLook";
import { JobDetailSheet } from "@/components/jobs/JobDetailSheet";

const ADMIN_LIST_ID = "admin-job-list-listbox";

// ─── Sabitler ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function AdminJobs() {
  const { jobs, totalJobs, loading, error, fetchJobs, cancelJob, connectGlobalStream } = useJobStore();
  const { deleteJob } = useAdminStore();
  const addToast = useUIStore((s) => s.addToast);

  const [page, setPage]               = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [bulkCleaning, setBulkCleaning] = useState(false);

  // ── Hibrit Navigasyon State ──────────────────────────────────────────────
  const [quickLookJob, setQuickLookJob] = useState<Job | null>(null);
  const [sheetJob, setSheetJob]         = useState<Job | null>(null);
  const listRef                         = useRef<HTMLDivElement>(null);
  const pendingSheetJobRef              = useRef<Job | null>(null);

  const anyPanelOpen = quickLookJob !== null || sheetJob !== null;

  // ── Odak Geri Yükleme ────────────────────────────────────────────────────
  const { captureForRestore, restoreFocusDeferred } = useFocusRestore();

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
    onKeyboardMove: notifyKeyboard,
  });

  const { getTabIndex, notifyKeyboard } = useRovingTabindex({
    focusedIdx,
    itemCount: jobs.length,
    containerRef: listRef as React.RefObject<HTMLElement | null>,
  });

  // ── ESC Kapatma Yığını ────────────────────────────────────────────────────
  useDismissOnEsc(quickLookJob !== null, () => setQuickLookJob(null), 20);
  useDismissOnEsc(sheetJob !== null, () => {
    setSheetJob(null);
    restoreFocusDeferred(150);
  }, 10);

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

  useEffect(() => {
    const closeStream = connectGlobalStream();
    return () => closeStream();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilterChange(type: "status" | "module", value: string) {
    setPage(1);
    if (type === "status") setStatusFilter(value);
    else setModuleFilter(value);
  }

  async function handleCancel(jobId: string) {
    setCancellingId(jobId);
    const ok = await cancelJob(jobId);
    setCancellingId(null);
    if (ok) {
      addToast({ type: "info", title: "İş iptal edildi" });
      loadData();
    } else {
      addToast({ type: "error", title: "İptal başarısız" });
    }
  }

  async function handleDelete(jobId: string) {
    setDeletingId(jobId);
    const ok = await deleteJob(jobId);
    setDeletingId(null);
    if (ok) {
      addToast({ type: "success", title: "İş silindi" });
      loadData();
    } else {
      addToast({ type: "error", title: "Silinemedi", description: "Aktif işler silinemez. Önce iptal edin." });
    }
  }

  async function handleBulkClean() {
    setBulkCleaning(true);
    const terminalJobs = jobs.filter(
      (j) => j.status === "completed" || j.status === "failed" || j.status === "cancelled"
    );
    let deleted = 0;
    for (const job of terminalJobs) {
      const ok = await deleteJob(job.id);
      if (ok) deleted++;
    }
    setBulkCleaning(false);
    if (deleted > 0) {
      addToast({ type: "success", title: `${deleted} iş temizlendi` });
      loadData();
    } else {
      addToast({ type: "info", title: "Temizlenecek iş bulunamadı" });
    }
  }

  // Klavye navigasyonu merkezi hook'a taşındı (useKeyboardNavigation).

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

  const totalPages   = Math.max(1, Math.ceil(totalJobs / PAGE_SIZE));
  const terminalCount = jobs.filter(
    (j) => j.status === "completed" || j.status === "failed" || j.status === "cancelled"
  ).length;

  return (
    <div className="space-y-4">
      {/* Başlık + kontroller */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListVideo size={20} className="text-amber-400" />
          <h2 className="text-lg font-semibold text-foreground">Tüm İşler</h2>
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {totalJobs}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Klavye ipucu */}
          <span className="hidden md:flex items-center gap-1 text-[10px] text-muted-foreground/60">
            <kbd className="rounded border border-border px-1 font-mono">↑↓</kbd>
            <span>seç</span>
            <kbd className="rounded border border-border px-1 font-mono ml-1">Space</kbd>
            <span>önizle</span>
            <kbd className="rounded border border-border px-1 font-mono ml-1">Enter</kbd>
            <span>detay</span>
          </span>

          {terminalCount > 0 && (
            <button
              onClick={handleBulkClean}
              disabled={bulkCleaning}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-red-500/30 px-3 text-xs text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              {bulkCleaning ? <Loader2 size={12} className="animate-spin" /> : <Eraser size={12} />}
              Tamamlananları Temizle ({terminalCount})
            </button>
          )}
          <button
            onClick={loadData}
            disabled={loading}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Yenile
          </button>
        </div>
      </div>

      {/* Filtreler */}
      <div className="flex flex-wrap gap-2">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => handleFilterChange("status", f.value)}
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

        <div className="flex rounded-lg border border-border overflow-hidden">
          {[
            { value: "", label: "Tüm Modüller" },
            { value: "standard_video", label: "Standart Video" },
            { value: "news_bulletin", label: "Haber Bülteni" },
            { value: "product_review", label: "Ürün İnceleme" },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => handleFilterChange("module", f.value)}
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

      {/* Tablo */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading && jobs.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin mr-2" />
            Yükleniyor...
          </div>
        ) : error && jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-sm text-muted-foreground gap-2">
            <AlertCircle size={24} className="text-destructive" />
            <p>Veri alınamadı</p>
            <button onClick={loadData} className="text-xs text-primary hover:underline">
              Tekrar dene
            </button>
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-sm text-muted-foreground gap-2">
            <ListVideo size={28} className="opacity-30" />
            <p>Eşleşen iş bulunamadı</p>
          </div>
        ) : (
          <>
            {/* Tablo başlığı */}
            <div className="hidden sm:grid grid-cols-[1fr_120px_100px_90px_70px_100px] gap-2 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>Başlık</span>
              <span>Modül</span>
              <span>Durum</span>
              <span>Maliyet</span>
              <span className="text-right">Tarih</span>
              <span className="text-right">İşlemler</span>
            </div>

            {/* Satırlar — ARIA listbox */}
            <div
              ref={listRef}
              id={ADMIN_LIST_ID}
              role="listbox"
              aria-label="Tüm İşler"
              aria-activedescendant={
                focusedIdx >= 0 ? `${scopeId}-opt-${focusedIdx}` : undefined
              }
              className="divide-y divide-border"
            >
              {jobs.map((job, idx) => (
                <AdminJobRow
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
                  onCancel={() => handleCancel(job.id)}
                  onDelete={() => handleDelete(job.id)}
                  isDeleting={deletingId === job.id}
                  isCancelling={cancellingId === job.id}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Sayfalama */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Sayfa {page} / {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setPage((p) => Math.max(1, p - 1)); setFocusedIdx(-1); }}
              disabled={page <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); setFocusedIdx(-1); }}
              disabled={page >= totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Quick Look Modal ── */}
      <JobQuickLook
        job={quickLookJob}
        open={quickLookJob !== null}
        onClose={closeQuickLook}
        onOpenDeepDive={handleOpenDeepDiveFromQuickLook}
      />

      {/* ── Deep Dive Sheet (admin modda silme butonu aktif) ── */}
      <JobDetailSheet
        job={sheetJob}
        open={sheetJob !== null}
        onClose={closeSheet}
        isAdmin
        onDeleted={loadData}
      />
    </div>
  );
}

// ─── Admin İş Satırı ────────────────────────────────────────────────────────

interface AdminJobRowProps {
  job: Job;
  idx: number;
  total: number;
  scopeId: string;
  isFocused: boolean;
  tabIndex: 0 | -1;
  onHover: () => void;
  onClick: () => void;
  onQuickLook: () => void;
  onCancel: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  isCancelling: boolean;
}

function AdminJobRow({
  job,
  idx,
  total,
  scopeId,
  isFocused,
  tabIndex,
  onHover,
  onClick,
  onQuickLook,
  onCancel,
  onDelete,
  isDeleting,
  isCancelling,
}: AdminJobRowProps) {
  const statusCfg = STATUS_CONFIG[job.status];
  const modMeta   = MODULE_INFO[job.module_key];
  const modInfo   = {
    label: modMeta?.label ?? job.module_key,
    icon:  getModuleIcon(job.module_key, 14),
  };

  const isActive   = job.status === "queued" || job.status === "running";
  const isTerminal = !isActive;
  const dateStr    = formatShortDate(job.created_at);
  const cost       = job.cost_estimate_usd > 0 ? `$${job.cost_estimate_usd.toFixed(4)}` : "—";

  return (
    <div
      id={`${scopeId}-opt-${idx}`}
      data-nav-row
      role="option"
      aria-selected={isFocused}
      aria-setsize={total}
      aria-posinset={idx + 1}
      tabIndex={tabIndex}
      onMouseEnter={onHover}
      onContextMenu={(e) => { e.preventDefault(); onQuickLook(); }}
      onClick={onClick}
      onKeyDown={(e) => {
        // div'e tabIndex=0 verildiğinde Enter/Space olayları için
        if (e.key === "Enter") { e.preventDefault(); onClick(); }
      }}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 transition-colors cursor-pointer",
        "sm:grid sm:grid-cols-[1fr_120px_100px_90px_70px_100px] sm:gap-2",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset",
        isFocused ? "bg-muted ring-1 ring-inset ring-primary/30" : "hover:bg-accent/30"
      )}
    >
      {/* Başlık */}
      <div className="min-w-0 flex-1 sm:flex-none text-left">
        <p className={cn(
          "truncate text-sm font-medium transition-colors",
          isFocused ? "text-primary" : "text-foreground"
        )}>
          {job.title}
        </p>
        <p className="truncate text-xs text-muted-foreground sm:hidden">{modInfo.label}</p>
      </div>

      {/* Modül */}
      <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground" aria-hidden="true">
        {modInfo.icon}
        <span className="truncate">{modInfo.label}</span>
      </div>

      {/* Durum */}
      <span
        className={cn(
          "shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
          statusCfg.color,
          statusCfg.bg
        )}
      >
        <span className="hidden sm:inline">{statusCfg.label}</span>
      </span>

      {/* Maliyet */}
      <span className="hidden sm:block text-xs text-muted-foreground font-mono">{cost}</span>

      {/* Tarih */}
      <span className="hidden sm:block text-xs text-muted-foreground text-right">{dateStr}</span>

      {/* İşlemler — inline butonlar (fare kullanıcıları için) */}
      <div className="hidden sm:flex items-center justify-end gap-1">
        {isActive && (
          <button
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            disabled={isCancelling}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
            title="İptal Et"
          >
            {isCancelling ? <Loader2 size={10} className="animate-spin" /> : <Ban size={10} />}
            İptal
          </button>
        )}
        {isTerminal && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            disabled={isDeleting}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            title="Sil"
          >
            {isDeleting ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
            Sil
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Tarih formatlama ────────────────────────────────────────────────────────

function formatShortDate(isoDate: string): string {
  try {
    const d   = new Date(isoDate);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  } catch {
    return "-";
  }
}
