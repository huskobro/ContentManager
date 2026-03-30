/**
 * AdminJobs — Tüm işlerin admin yönetim ekranı.
 *
 * User panelindeki JobList'ten farklı olarak:
 *   • Tüm işleri gösterir (admin yetkisi ile)
 *   • İptal ve silme yetkisi vardır
 *   • Toplu temizlik (tamamlanan/başarısız işleri sil)
 *
 * Gerçek Zamanlı Güncelleme:
 *   Global SSE stream'e bağlanır — polling yok, push-based.
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ListVideo,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Video,
  Ban,
  Trash2,
  Eraser,
} from "lucide-react";
import { useJobStore, type Job } from "@/stores/jobStore";
import { useAdminStore } from "@/stores/adminStore";
import { useUIStore } from "@/stores/uiStore";
import { STATUS_CONFIG, MODULE_INFO, STATUS_FILTERS, getModuleIcon } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ─── Sabitler ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function AdminJobs() {
  const navigate = useNavigate();
  const { jobs, totalJobs, loading, error, fetchJobs, cancelJob, connectGlobalStream } = useJobStore();
  const { deleteJob } = useAdminStore();
  const addToast = useUIStore((s) => s.addToast);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [bulkCleaning, setBulkCleaning] = useState(false);

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

  // Global SSE stream — mount'ta bağlan, unmount'ta kapat
  // Polling yok: job değişikliklerinde liste reaktif güncellenir
  useEffect(() => {
    const closeStream = connectGlobalStream();
    return () => {
      closeStream();
    };
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

  const totalPages = Math.max(1, Math.ceil(totalJobs / PAGE_SIZE));

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
          {terminalCount > 0 && (
            <button
              onClick={handleBulkClean}
              disabled={bulkCleaning}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-red-500/30 px-3 text-xs text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              {bulkCleaning ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Eraser size={12} />
              )}
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

            {/* Satırlar */}
            <div className="divide-y divide-border">
              {jobs.map((job) => (
                <AdminJobRow
                  key={job.id}
                  job={job}
                  onNavigate={() => navigate(`/jobs/${job.id}`)}
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
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Admin İş Satırı ────────────────────────────────────────────────────────

function AdminJobRow({
  job,
  onNavigate,
  onCancel,
  onDelete,
  isDeleting,
  isCancelling,
}: {
  job: Job;
  onNavigate: () => void;
  onCancel: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  isCancelling: boolean;
}) {
  const statusCfg = STATUS_CONFIG[job.status];
  const modMeta = MODULE_INFO[job.module_key];
  const modInfo = {
    label: modMeta?.label ?? job.module_key,
    icon: getModuleIcon(job.module_key, 14),
  };

  const isActive = job.status === "queued" || job.status === "running";
  const isTerminal = !isActive;
  const dateStr = formatShortDate(job.created_at);
  const cost = job.cost_estimate_usd > 0 ? `$${job.cost_estimate_usd.toFixed(4)}` : "—";

  return (
    <div className="flex w-full items-center gap-3 px-4 py-3 sm:grid sm:grid-cols-[1fr_120px_100px_90px_70px_100px] sm:gap-2">
      {/* Başlık — tıklanabilir */}
      <button
        onClick={onNavigate}
        className="min-w-0 flex-1 sm:flex-none text-left hover:text-primary transition-colors"
      >
        <p className="truncate text-sm font-medium text-foreground">{job.title}</p>
        <p className="truncate text-xs text-muted-foreground sm:hidden">{modInfo.label}</p>
      </button>

      {/* Modül */}
      <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
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

      {/* İşlemler */}
      <div className="hidden sm:flex items-center justify-end gap-1">
        {isActive && (
          <button
            onClick={onCancel}
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
            onClick={onDelete}
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
    const d = new Date(isoDate);
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
