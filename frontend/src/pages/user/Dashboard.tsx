/**
 * Dashboard — Sistemin ana kontrol paneli.
 *
 * Gösterir:
 *   • İstatistik kartları (aktif, tamamlanan, başarısız, toplam)
 *   • Sistem sağlık durumu (/health endpoint)
 *   • Son işler listesi (GET /api/jobs ile beslenir)
 *   • Hızlı eylem kısayolları
 *
 * Gerçek Zamanlı Güncelleme:
 *   Global SSE stream'e (GET /api/jobs/stream) bağlanır.
 *   Herhangi bir job değiştiğinde store reaktif olarak güncellenir.
 *   Polling (setInterval) kullanılmaz.
 */

import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  PlusCircle,
  ListVideo,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  RefreshCw,
  ArrowRight,
  Video,
  Newspaper,
  ShoppingBag,
} from "lucide-react";
import { useJobStore, type Job } from "@/stores/jobStore";
import { useUIStore } from "@/stores/uiStore";
import { STATUS_CONFIG, MODULE_INFO, getModuleIcon } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ─── Sağlık tipi ─────────────────────────────────────────────────────────────

interface HealthResponse {
  status: string;
  version: string;
  environment: string;
  database: { status: string; mode: string };
}

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { stats, jobs, loading, error, fetchJobs, fetchStats, connectGlobalStream } = useJobStore();
  const addToast = useUIStore((s) => s.addToast);
  const navigate = useNavigate();

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const loadData = useCallback(() => {
    fetchJobs({ page: 1, page_size: 10 });
    fetchStats();
  }, [fetchJobs, fetchStats]);

  useEffect(() => {
    // İlk veri yüklemesi
    loadData();

    // Health check
    fetch("/health")
      .then((r) => r.json())
      .then((data: HealthResponse) => setHealth(data))
      .catch(() => addToast({ type: "error", title: "Backend'e bağlanılamadı" }))
      .finally(() => setHealthLoading(false));

    // Global SSE stream'e bağlan — polling yok, push-based gerçek zamanlı güncelleme
    // Herhangi bir job değiştiğinde store otomatik güncellenir
    const closeStream = connectGlobalStream();

    return () => {
      closeStream();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Son 5 işi al (tarih sırasına göre)
  const recentJobs = [...jobs]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutDashboard size={20} className="text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Dashboard</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Yenile</span>
          </button>
          <Link
            to="/create"
            className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <PlusCircle size={16} />
            Yeni Video
          </Link>
        </div>
      </div>

      {/* İstatistik kartları */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={<Clock size={18} className="text-blue-400" />}
          label="Aktif İşler"
          value={stats.queued + stats.running}
          color="blue"
        />
        <StatCard
          icon={<CheckCircle2 size={18} className="text-emerald-400" />}
          label="Tamamlanan"
          value={stats.completed}
          color="emerald"
        />
        <StatCard
          icon={<AlertCircle size={18} className="text-red-400" />}
          label="Başarısız"
          value={stats.failed}
          color="red"
        />
        <StatCard
          icon={<ListVideo size={18} className="text-purple-400" />}
          label="Toplam"
          value={stats.total}
          color="purple"
        />
      </div>

      {/* Sistem durumu */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Sistem Durumu
        </p>
        {healthLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            Kontrol ediliyor...
          </div>
        ) : health ? (
          <div className="flex flex-wrap gap-4 text-sm">
            <StatusBadge label="API" ok={health.status === "ok"} detail={`v${health.version}`} />
            <StatusBadge label="Veritabanı" ok={health.database.status === "ok"} detail={`WAL: ${health.database.mode}`} />
            <StatusBadge label="Ortam" ok detail={health.environment} />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle size={14} />
            Backend bağlantısı kurulamadı
          </div>
        )}
      </div>

      {/* Son İşler */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Son İşler
          </p>
          <Link
            to="/jobs"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Tümünü Gör <ArrowRight size={12} />
          </Link>
        </div>

        {loading && recentJobs.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin mr-2" />
            Yükleniyor...
          </div>
        ) : error && recentJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
            <AlertCircle size={20} className="text-destructive" />
            <p>Veri alınamadı</p>
            <button
              onClick={loadData}
              className="text-xs text-primary hover:underline"
            >
              Tekrar dene
            </button>
          </div>
        ) : recentJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
            <ListVideo size={24} className="opacity-40" />
            <p>Henüz iş bulunmuyor</p>
            <Link to="/create" className="text-xs text-primary hover:underline">
              İlk videonuzu oluşturun
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentJobs.map((job) => (
              <RecentJobRow key={job.id} job={job} onClick={() => navigate(`/jobs/${job.id}`)} />
            ))}
          </div>
        )}
      </div>

      {/* Hızlı Başlat */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Hızlı Başlat
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuickAction
            to="/create?module=standard_video"
            icon={<Video size={18} className="text-blue-400" />}
            title="Standart Video"
            description="Konu girerek otomatik video üret"
          />
          <QuickAction
            to="/create?module=news_bulletin"
            icon={<Newspaper size={18} className="text-amber-400" />}
            title="Haber Bülteni"
            description="Haber kaynaklarından video üret"
          />
          <QuickAction
            to="/create?module=product_review"
            icon={<ShoppingBag size={18} className="text-emerald-400" />}
            title="Ürün İnceleme"
            description="Ürün bilgisiyle inceleme videosu"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Yardımcı bileşenler ──────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "blue" | "emerald" | "red" | "purple";
}) {
  const bgMap = {
    blue: "bg-blue-500/10",
    emerald: "bg-emerald-500/10",
    red: "bg-red-500/10",
    purple: "bg-purple-500/10",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-lg", bgMap[color])}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function StatusBadge({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", ok ? "bg-emerald-400" : "bg-red-400")} />
      <span className="font-medium text-foreground">{label}</span>
      <span className="text-muted-foreground">{detail}</span>
    </div>
  );
}

function QuickAction({
  to,
  icon,
  title,
  description,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-accent transition-colors group"
    >
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
          {title}
        </p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}

function RecentJobRow({ job, onClick }: { job: Job; onClick: () => void }) {
  const config = STATUS_CONFIG[job.status];
  const modMeta = MODULE_INFO[job.module_key];
  const moduleInfo = {
    label: modMeta?.label ?? job.module_key,
    color: modMeta?.color ?? "text-muted-foreground",
    icon: getModuleIcon(job.module_key, 14),
  };

  const completedSteps = job.steps.filter((s) => s.status === "completed").length;
  const totalSteps = job.steps.length;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const timeAgo = formatTimeAgo(job.created_at);

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-accent/50 transition-colors"
    >
      {/* Modül ikonu */}
      <div className={cn("shrink-0", moduleInfo.color)}>{moduleInfo.icon}</div>

      {/* Başlık + modül */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{job.title}</p>
        <p className="text-xs text-muted-foreground">{moduleInfo.label}</p>
      </div>

      {/* İlerleme çubuğu (sadece aktif işlerde) */}
      {(job.status === "running" || job.status === "queued") && totalSteps > 0 && (
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-8 text-right">{progressPercent}%</span>
        </div>
      )}

      {/* Durum badge */}
      <span className={cn("shrink-0 rounded-md px-2 py-1 text-xs font-medium", config.color, config.bg)}>
        {config.label}
      </span>

      {/* Zaman */}
      <span className="hidden md:block shrink-0 text-xs text-muted-foreground w-16 text-right">
        {timeAgo}
      </span>
    </button>
  );
}

// ─── Zaman formatlama ────────────────────────────────────────────────────────

function formatTimeAgo(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return "az önce";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}dk`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}sa`;
  return `${Math.floor(diffSec / 86400)}g`;
}
