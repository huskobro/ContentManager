/**
 * CostTracker — Maliyet izleme ve provider kullanım analizi.
 *
 * Veri kaynağı: GET /api/admin/costs
 * Mapping mantığı: costTrackerUtils.ts → normalizeCostResponse()
 */

import { useEffect, useState, useCallback } from "react";
import {
  DollarSign,
  TrendingUp,
  Cpu,
  RefreshCw,
  Loader2,
  AlertCircle,
  BarChart3,
  ArrowUpRight,
} from "lucide-react";
import { api } from "@/api/client";
import { cn } from "@/lib/utils";
import {
  type BackendCostResponse,
  type NormalizedCostData,
  type NormalizedProvider,
  type NormalizedJob,
  normalizeCostResponse,
  formatUSD,
  EMPTY_COST_DATA,
} from "./costTrackerUtils";

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function CostTracker() {
  const [normalized, setNormalized] = useState<NormalizedCostData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const pin = localStorage.getItem("cm-admin-pin") ?? "0000";
      const raw = await api.get<BackendCostResponse>("/admin/costs", { adminPin: pin });
      setNormalized(normalizeCostResponse(raw));
    } catch {
      setNormalized(EMPTY_COST_DATA);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
        <Loader2 size={18} className="animate-spin mr-2" />
        Maliyet verileri yükleniyor...
      </div>
    );
  }

  const d = normalized ?? EMPTY_COST_DATA;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={20} className="text-amber-400" />
          <h2 className="text-lg font-semibold text-foreground">Maliyet Takibi</h2>
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

      {/* Boş durum bilgisi */}
      {d.isZeroData && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 text-xs text-amber-300">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>
            Henüz maliyet verisi yok. Video oluşturdukça maliyet verileri burada görünecek.
          </span>
        </div>
      )}

      {/* Özet kartlar */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<DollarSign size={18} />}
          label="Toplam Maliyet"
          value={d.totalCostStr}
          sub={`${d.providersUsed} aktif provider`}
          color="amber"
        />
        <StatCard
          icon={<TrendingUp size={18} />}
          label="Toplam API Çağrısı"
          value={String(d.totalApiCalls)}
          sub="tüm providerlar"
          color="blue"
        />
        <StatCard
          icon={<Cpu size={18} />}
          label="Aktif Provider"
          value={String(d.providersUsed)}
          sub={d.recentJobCount > 0 ? `${d.recentJobCount} tamamlanmış iş` : "Henüz iş yok"}
          color="emerald"
        />
      </div>

      {/* Provider bazlı dağılım */}
      {d.providers.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 size={14} className="text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Provider Dağılımı
            </p>
          </div>
          <div className="space-y-3">
            {d.providers.map((p) => (
              <ProviderBar key={p.key} provider={p} />
            ))}
          </div>
        </div>
      )}

      {/* Son işler maliyet listesi */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Son Tamamlanan İşler — Maliyet
          </p>
        </div>

        {d.jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
            <DollarSign size={24} className="opacity-30" />
            <p>Henüz tamamlanmış iş yok</p>
          </div>
        ) : (
          <>
            <div className="hidden sm:grid grid-cols-[1fr_120px_80px] gap-2 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>Başlık</span>
              <span>Modül</span>
              <span className="text-right">Maliyet</span>
            </div>
            <div className="divide-y divide-border">
              {d.jobs.map((job) => (
                <JobCostRow key={job.id} job={job} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Stat Kart ────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: "amber" | "blue" | "emerald";
}) {
  const colorMap = {
    amber: { bg: "bg-amber-500/10", text: "text-amber-400" },
    blue: { bg: "bg-blue-500/10", text: "text-blue-400" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  };
  const c = colorMap[color];

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", c.bg, c.text)}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Provider Bar ─────────────────────────────────────────────────────────────

function ProviderBar({ provider: p }: { provider: NormalizedProvider }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{p.label}</span>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-muted-foreground/60">{p.callCount} çağrı</span>
          <span className="font-mono text-foreground">{formatUSD(p.costUsd)}</span>
        </div>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-amber-400/70 transition-all duration-500"
          style={{ width: `${p.barPct}%` }}
        />
      </div>
    </div>
  );
}

// ─── İş Maliyet Satırı ───────────────────────────────────────────────────────

function JobCostRow({ job }: { job: NormalizedJob }) {
  return (
    <div className="grid grid-cols-[1fr_120px_80px] gap-2 px-4 py-3 items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{job.title}</p>
        <p className="text-xs text-muted-foreground sm:hidden">{job.moduleLabel}</p>
        <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1 mt-0.5">
          <ArrowUpRight size={10} className="text-emerald-400" />
          {job.dateStr}
        </p>
      </div>
      <span className="hidden sm:block text-xs text-muted-foreground truncate">{job.moduleLabel}</span>
      <div className="text-right">
        <span className="text-xs font-mono text-foreground">
          {job.hasNonZeroCost ? formatUSD(job.costUsd) : "—"}
        </span>
      </div>
    </div>
  );
}
