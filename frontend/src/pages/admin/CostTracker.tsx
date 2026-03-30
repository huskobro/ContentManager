/**
 * CostTracker — Maliyet izleme ve provider kullanım analizi.
 *
 * Gösterir:
 *   • Özet stat kartları: toplam maliyet, bu ay, video başı ortalama
 *   • Provider bazlı kullanım dağılımı (LLM, TTS, Görsel)
 *   • Son işlerin maliyet listesi
 *
 * Veri kaynağı: GET /api/admin/costs endpoint'i
 * (Backend henüz hazır değilse mock data ile çalışır)
 */

import { useEffect, useState, useCallback } from "react";
import {
  DollarSign,
  TrendingUp,
  Video,
  Cpu,
  Mic,
  ImageIcon,
  RefreshCw,
  Loader2,
  AlertCircle,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { api } from "@/api/client";
import { cn } from "@/lib/utils";

// ─── Tipler ──────────────────────────────────────────────────────────────────

interface CostSummary {
  total_usd: number;
  this_month_usd: number;
  per_video_avg_usd: number;
  total_jobs: number;
  completed_jobs: number;
  trend_percent: number | null; // bu ay vs geçen ay
}

interface ProviderCost {
  provider: string;
  category: "llm" | "tts" | "visuals";
  total_usd: number;
  call_count: number;
  label: string;
}

interface RecentJobCost {
  job_id: string;
  title: string;
  module_key: string;
  status: string;
  cost_estimate_usd: number;
  created_at: string;
}

interface CostData {
  summary: CostSummary;
  by_provider: ProviderCost[];
  recent_jobs: RecentJobCost[];
}

// ─── Mock fallback ────────────────────────────────────────────────────────────

const MOCK_DATA: CostData = {
  summary: {
    total_usd: 0,
    this_month_usd: 0,
    per_video_avg_usd: 0,
    total_jobs: 0,
    completed_jobs: 0,
    trend_percent: null,
  },
  by_provider: [
    { provider: "kieai", category: "llm", total_usd: 0, call_count: 0, label: "kie.ai (Gemini)" },
    { provider: "edge_tts", category: "tts", total_usd: 0, call_count: 0, label: "Edge TTS" },
    { provider: "pexels", category: "visuals", total_usd: 0, call_count: 0, label: "Pexels" },
  ],
  recent_jobs: [],
};

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function formatUSD(val: number): string {
  if (val === 0) return "$0.00";
  if (val < 0.01) return `$${val.toFixed(5)}`;
  if (val < 1) return `$${val.toFixed(4)}`;
  return `$${val.toFixed(2)}`;
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  } catch {
    return "-";
  }
}

const MODULE_LABELS: Record<string, string> = {
  standard_video: "Standart Video",
  news_bulletin: "Haber Bülteni",
  product_review: "Ürün İnceleme",
};

const CATEGORY_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  llm: { icon: <Cpu size={14} />, color: "text-purple-400", label: "LLM" },
  tts: { icon: <Mic size={14} />, color: "text-blue-400", label: "TTS" },
  visuals: { icon: <ImageIcon size={14} />, color: "text-emerald-400", label: "Görseller" },
};

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function CostTracker() {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pin = localStorage.getItem("cm-admin-pin") ?? "0000";
      const result = await api.get<CostData>("/admin/costs", { adminPin: pin });
      setData(result);
    } catch {
      // Backend henüz cost endpoint'ini desteklemiyorsa mock data kullan
      setData(MOCK_DATA);
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

  const d = data ?? MOCK_DATA;
  const { summary, by_provider, recent_jobs } = d;

  // Provider kategorilere göre grupla
  const llmProviders = by_provider.filter((p) => p.category === "llm");
  const ttsProviders = by_provider.filter((p) => p.category === "tts");
  const visualsProviders = by_provider.filter((p) => p.category === "visuals");

  // Toplam provider maliyetlerinden max değer (bar normalizasyon için)
  const maxProviderCost = Math.max(...by_provider.map((p) => p.total_usd), 0.0001);

  const isZeroData = summary.total_usd === 0 && summary.total_jobs === 0;

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

      {/* Bilgi notu — boş data */}
      {isZeroData && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 text-xs text-amber-300">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>
            Henüz tamamlanmış iş yok. Video oluşturdukça maliyet verileri burada görünecek.
          </span>
        </div>
      )}

      {/* Özet kartlar */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<DollarSign size={18} />}
          label="Toplam Maliyet"
          value={formatUSD(summary.total_usd)}
          sub={`${summary.total_jobs} iş · ${summary.completed_jobs} tamamlandı`}
          color="amber"
        />
        <StatCard
          icon={<TrendingUp size={18} />}
          label="Bu Ay"
          value={formatUSD(summary.this_month_usd)}
          trend={summary.trend_percent}
          color="blue"
        />
        <StatCard
          icon={<Video size={18} />}
          label="Video Başı Ortalama"
          value={formatUSD(summary.per_video_avg_usd)}
          sub={summary.completed_jobs > 0 ? `${summary.completed_jobs} video üzerinden` : "Henüz veri yok"}
          color="emerald"
        />
      </div>

      {/* Provider bazlı dağılım */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ProviderGroupCard
          title="LLM"
          icon={<Cpu size={14} />}
          iconColor="text-purple-400"
          providers={llmProviders}
          maxCost={maxProviderCost}
        />
        <ProviderGroupCard
          title="TTS (Ses Sentezi)"
          icon={<Mic size={14} />}
          iconColor="text-blue-400"
          providers={ttsProviders}
          maxCost={maxProviderCost}
        />
        <ProviderGroupCard
          title="Görseller"
          icon={<ImageIcon size={14} />}
          iconColor="text-emerald-400"
          providers={visualsProviders}
          maxCost={maxProviderCost}
        />
      </div>

      {/* Son işler maliyet listesi */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Son İşler — Maliyet
          </p>
        </div>

        {recent_jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
            <DollarSign size={24} className="opacity-30" />
            <p>Henüz tamamlanmış iş yok</p>
          </div>
        ) : (
          <>
            {/* Tablo başlığı */}
            <div className="hidden sm:grid grid-cols-[1fr_120px_100px_80px] gap-2 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>Başlık</span>
              <span>Modül</span>
              <span>Durum</span>
              <span className="text-right">Maliyet</span>
            </div>
            <div className="divide-y divide-border">
              {recent_jobs.map((job) => (
                <JobCostRow key={job.job_id} job={job} />
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
  trend,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  trend?: number | null;
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
      {trend !== null && trend !== undefined ? (
        <div
          className={cn(
            "flex items-center gap-1 text-xs",
            trend > 0 ? "text-red-400" : trend < 0 ? "text-emerald-400" : "text-muted-foreground"
          )}
        >
          {trend > 0 ? (
            <ArrowUpRight size={12} />
          ) : trend < 0 ? (
            <ArrowDownRight size={12} />
          ) : (
            <Minus size={12} />
          )}
          {trend === 0
            ? "Geçen ayla aynı"
            : `Geçen aya göre %${Math.abs(trend)} ${trend > 0 ? "artış" : "azalış"}`}
        </div>
      ) : sub ? (
        <p className="text-xs text-muted-foreground">{sub}</p>
      ) : null}
    </div>
  );
}

// ─── Provider Grup Kartı ─────────────────────────────────────────────────────

function ProviderGroupCard({
  title,
  icon,
  iconColor,
  providers,
  maxCost,
}: {
  title: string;
  icon: React.ReactNode;
  iconColor: string;
  providers: ProviderCost[];
  maxCost: number;
}) {
  const totalCost = providers.reduce((sum, p) => sum + p.total_usd, 0);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={iconColor}>{icon}</span>
          <p className="text-xs font-semibold text-foreground">{title}</p>
        </div>
        <span className="text-xs font-mono text-muted-foreground">{formatUSD(totalCost)}</span>
      </div>

      <div className="space-y-2.5">
        {providers.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 italic">Provider tanımlı değil</p>
        ) : (
          providers.map((p) => {
            const pct = maxCost > 0 ? (p.total_usd / maxCost) * 100 : 0;
            return (
              <div key={p.provider} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground truncate max-w-[120px]" title={p.label}>
                    {p.label}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-muted-foreground/60">{p.call_count}x</span>
                    <span className="font-mono text-foreground">{formatUSD(p.total_usd)}</span>
                  </div>
                </div>
                <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", iconColor.replace("text-", "bg-"))}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── İş Maliyet Satırı ───────────────────────────────────────────────────────

function JobCostRow({ job }: { job: RecentJobCost }) {
  const moduleLabel = MODULE_LABELS[job.module_key] ?? job.module_key;

  const statusColors: Record<string, string> = {
    completed: "text-emerald-400 bg-emerald-400/10",
    failed: "text-red-400 bg-red-400/10",
    running: "text-blue-400 bg-blue-400/10",
    queued: "text-slate-400 bg-slate-400/10",
    cancelled: "text-slate-500 bg-slate-500/10",
  };
  const statusLabels: Record<string, string> = {
    completed: "Tamamlandı",
    failed: "Başarısız",
    running: "Çalışıyor",
    queued: "Kuyrukta",
    cancelled: "İptal",
  };

  const statusColor = statusColors[job.status] ?? "text-muted-foreground";
  const statusLabel = statusLabels[job.status] ?? job.status;
  const dateStr = formatShortDate(job.created_at);

  return (
    <div className="grid grid-cols-[1fr_120px_100px_80px] gap-2 px-4 py-3 text-sm items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{job.title}</p>
        <p className="text-xs text-muted-foreground sm:hidden">{moduleLabel}</p>
      </div>
      <span className="hidden sm:block text-xs text-muted-foreground truncate">{moduleLabel}</span>
      <span
        className={cn(
          "hidden sm:inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium w-fit",
          statusColor
        )}
      >
        {statusLabel}
      </span>
      <div className="text-right">
        <span className="text-xs font-mono text-foreground">
          {job.cost_estimate_usd > 0 ? formatUSD(job.cost_estimate_usd) : "—"}
        </span>
        <p className="text-[10px] text-muted-foreground/60">{dateStr}</p>
      </div>
    </div>
  );
}
