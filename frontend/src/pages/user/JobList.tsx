/**
 * JobList — Tüm işlerin filtrelenebilir listesi.
 *
 * Özellikler:
 *   • Durum filtresi (Tümü / Kuyrukta / Çalışıyor / Tamamlandı / Başarısız / İptal)
 *   • Modül filtresi (Tümü / Standard Video / Haber Bülteni / Ürün İnceleme)
 *   • Sayfalama
 *   • Renk kodlu durum badge'leri
 *   • Progress bar (aktif işler için)
 *   • Tıklama → JobDetail sayfasına yönlendirme
 *
 * Gerçek Zamanlı Güncelleme:
 *   Global SSE stream'e (GET /api/jobs/stream) bağlanır.
 *   Herhangi bir job değiştiğinde liste sayfayı yenilemeden güncellenir.
 *   Polling (setInterval) kullanılmaz.
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
} from "lucide-react";
import { useJobStore, type Job } from "@/stores/jobStore";
import { STATUS_CONFIG, MODULE_INFO, STATUS_FILTERS, MODULE_FILTERS, getModuleIcon } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ─── Sabitler ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function JobList() {
  const navigate = useNavigate();
  const { jobs, totalJobs, loading, error, fetchJobs, connectGlobalStream } = useJobStore();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");

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
  // Polling yok: herhangi bir job değiştiğinde store güncellenir → liste reaktif yenilenir
  useEffect(() => {
    const closeStream = connectGlobalStream();
    return () => {
      closeStream();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtre değiştiğinde sayfayı sıfırla
  function handleFilterChange(type: "status" | "module", value: string) {
    setPage(1);
    if (type === "status") setStatusFilter(value);
    else setModuleFilter(value);
  }

  const totalPages = Math.max(1, Math.ceil(totalJobs / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Başlık + kontroller */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListVideo size={20} className="text-primary" />
          <h2 className="text-lg font-semibold text-foreground">İşler</h2>
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {totalJobs}
          </span>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Yenile
        </button>
      </div>

      {/* Filtreler */}
      <div className="flex flex-wrap gap-2">
        {/* Durum filtresi */}
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

        {/* Modül filtresi */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {MODULE_FILTERS.map((f) => (
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

      {/* İçerik */}
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
            <div className="hidden sm:grid grid-cols-[1fr_140px_120px_100px_80px] gap-2 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>Başlık</span>
              <span>Modül</span>
              <span>İlerleme</span>
              <span>Durum</span>
              <span className="text-right">Tarih</span>
            </div>

            {/* Satırlar */}
            <div className="divide-y divide-border">
              {jobs.map((job) => (
                <JobRow key={job.id} job={job} onClick={() => navigate(`/jobs/${job.id}`)} />
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

// ─── İş satırı ──────────────────────────────────────────────────────────────

function JobRow({ job, onClick }: { job: Job; onClick: () => void }) {
  const statusCfg = STATUS_CONFIG[job.status];
  const modMeta = MODULE_INFO[job.module_key];
  const modLabel = modMeta?.label ?? job.module_key;

  const completedSteps = job.steps.filter((s) => s.status === "completed").length;
  const totalSteps = job.steps.length;
  const pct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const dateStr = formatShortDate(job.created_at);

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors sm:grid sm:grid-cols-[1fr_140px_120px_100px_80px] sm:gap-2"
    >
      {/* Başlık */}
      <div className="min-w-0 flex-1 sm:flex-none">
        <p className="truncate text-sm font-medium text-foreground">{job.title}</p>
        <p className="truncate text-xs text-muted-foreground sm:hidden">{modLabel}</p>
      </div>

      {/* Modül (masaüstü) */}
      <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
        {getModuleIcon(job.module_key, 14)}
        <span className="truncate">{modLabel}</span>
      </div>

      {/* İlerleme (masaüstü) */}
      <div className="hidden sm:flex items-center gap-2">
        <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              job.status === "failed" ? "bg-red-400" :
              job.status === "completed" ? "bg-emerald-400" : "bg-primary"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground w-10">{completedSteps}/{totalSteps}</span>
      </div>

      {/* Durum */}
      <span className={cn("shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium", statusCfg.color, statusCfg.bg)}>
        <span className="hidden sm:inline">{statusCfg.label}</span>
      </span>

      {/* Tarih (masaüstü) */}
      <span className="hidden sm:block text-xs text-muted-foreground text-right">{dateStr}</span>
    </button>
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
