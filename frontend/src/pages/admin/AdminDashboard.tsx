/**
 * AdminDashboard — Yönetici kontrol paneli.
 *
 * Gösterir:
 *   • İş istatistik kartları (toplam, başarı oranı, başarısız, maliyet)
 *   • Sistem sağlık durumu
 *   • Hızlı yönetim kısayolları
 */

import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  Boxes,
  Plug,
  Sliders,
  ListVideo,
  AlertCircle,
  Clock,
  Loader2,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { useJobStore } from "@/stores/jobStore";
import { cn } from "@/lib/utils";

// ─── Sağlık tipi ─────────────────────────────────────────────────────────────

interface HealthResponse {
  status: string;
  version: string;
  environment: string;
  database: { status: string; mode: string };
}

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { stats, fetchStats } = useJobStore();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
  }, [fetchStats]);

  useEffect(() => {
    loadData();
    fetch("/health")
      .then((r) => r.json())
      .then((data: HealthResponse) => setHealth(data))
      .catch(() => {})
      .finally(() => setHealthLoading(false));
  }, [loadData]);

  const successRate =
    stats.completed + stats.failed > 0
      ? Math.round((stats.completed / (stats.completed + stats.failed)) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} className="text-amber-400" />
          <h2 className="text-lg font-semibold text-foreground">Admin Dashboard</h2>
        </div>
        <button
          onClick={loadData}
          disabled={refreshing}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          Yenile
        </button>
      </div>

      {/* Uyarı bandı */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Admin modundasınız. Buradaki değişiklikler tüm kullanıcıların varsayılan davranışlarını etkiler.
        </p>
      </div>

      {/* İstatistik kartları */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={<ListVideo size={18} className="text-blue-400" />}
          label="Toplam İş"
          value={String(stats.total)}
          color="blue"
        />
        <StatCard
          icon={<TrendingUp size={18} className="text-emerald-400" />}
          label="Başarı Oranı"
          value={stats.total > 0 ? `%${successRate}` : "—"}
          color="emerald"
        />
        <StatCard
          icon={<AlertCircle size={18} className="text-red-400" />}
          label="Başarısız"
          value={String(stats.failed)}
          color="red"
        />
        <StatCard
          icon={<Clock size={18} className="text-purple-400" />}
          label="Aktif İşler"
          value={String(stats.queued + stats.running)}
          color="purple"
        />
      </div>

      {/* Durum detayları */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div className="space-y-2.5 text-sm">
              <StatusRow label="API Durumu" ok={health.status === "ok"} detail={`v${health.version}`} />
              <StatusRow
                label="Veritabanı"
                ok={health.database.status === "ok"}
                detail={`WAL: ${health.database.mode}`}
              />
              <StatusRow label="Ortam" ok detail={health.environment} />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle size={14} />
              Backend bağlantısı kurulamadı
            </div>
          )}
        </div>

        {/* İş dağılımı */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            İş Dağılımı
          </p>
          <div className="space-y-2">
            <DistributionRow
              label="Kuyrukta"
              count={stats.queued}
              total={stats.total}
              color="bg-slate-400"
            />
            <DistributionRow
              label="Çalışıyor"
              count={stats.running}
              total={stats.total}
              color="bg-blue-400"
            />
            <DistributionRow
              label="Tamamlandı"
              count={stats.completed}
              total={stats.total}
              color="bg-emerald-400"
            />
            <DistributionRow
              label="Başarısız"
              count={stats.failed}
              total={stats.total}
              color="bg-red-400"
            />
            <DistributionRow
              label="İptal"
              count={stats.cancelled}
              total={stats.total}
              color="bg-slate-500"
            />
          </div>
        </div>
      </div>

      {/* Hızlı Yönetim */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Hızlı Yönetim
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AdminQuickLink
            to="/admin/modules"
            icon={<Boxes size={18} className="text-blue-400" />}
            label="Modül Yönetimi"
            description="Modülleri ve varsayılanlarını yönet"
          />
          <AdminQuickLink
            to="/admin/providers"
            icon={<Plug size={18} className="text-emerald-400" />}
            label="Provider Yönetimi"
            description="API anahtarları ve fallback sırası"
          />
          <AdminQuickLink
            to="/admin/global-settings"
            icon={<Sliders size={18} className="text-purple-400" />}
            label="Global Ayarlar"
            description="Sistem geneli varsayımları yapılandır"
          />
          <AdminQuickLink
            to="/admin/jobs"
            icon={<ListVideo size={18} className="text-amber-400" />}
            label="Tüm İşler"
            description="İşleri yönet, temizle ve denetle"
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
  value: string;
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

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", ok ? "bg-emerald-400" : "bg-red-400")} />
        <span className="text-sm text-foreground">{label}</span>
      </div>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}

function DistributionRow({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs font-medium text-foreground">{count}</span>
    </div>
  );
}

function AdminQuickLink({
  to,
  icon,
  label,
  description,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
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
          {label}
        </p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
