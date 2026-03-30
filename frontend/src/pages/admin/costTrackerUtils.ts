/**
 * costTrackerUtils — CostTracker için backend→UI dönüşüm yardımcıları.
 *
 * Bu modül:
 *   • Backend response tiplerini tanımlar (BackendCostResponse)
 *   • UI'ın tükettiği normalize edilmiş tipleri tanımlar (NormalizedCostData)
 *   • normalizeCostResponse(): ham backend verisini UI modeline çevirir
 *   • formatUSD(): sayısal maliyeti dolar string'ine çevirir
 *   • formatShortDate(): ISO tarihi kısa Türkçe formata çevirir
 *
 * Bileşen bu modülü import eder — mapping mantığı component içinde dağılmaz.
 */

// ─── Backend response tipleri ─────────────────────────────────────────────────

export interface BackendSummary {
  total_cost_usd: number;
  total_api_calls: number;
  providers_used: number;
}

export interface BackendProviderCost {
  provider: string;
  total_cost_usd: number;
  call_count: number;
}

export interface BackendRecentJob {
  job_id: string;
  title: string;
  module_key: string;
  cost_estimate_usd: number;
  completed_at: string;
}

export interface BackendCostResponse {
  summary: BackendSummary;
  by_provider: BackendProviderCost[];
  recent_jobs: BackendRecentJob[];
}

// ─── UI modeli ────────────────────────────────────────────────────────────────

export interface NormalizedProvider {
  key: string;
  label: string;
  costUsd: number;
  callCount: number;
  /** 0–100 arası, max provider maliyetine göre normalize edilmiş bar genişliği */
  barPct: number;
}

export interface NormalizedJob {
  id: string;
  title: string;
  moduleLabel: string;
  costUsd: number;
  dateStr: string;
  hasNonZeroCost: boolean;
}

export interface NormalizedCostData {
  totalCostStr: string;
  totalApiCalls: number;
  providersUsed: number;
  recentJobCount: number;
  isZeroData: boolean;
  providers: NormalizedProvider[];
  jobs: NormalizedJob[];
}

// ─── Statik eşleştirmeler ─────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  kieai: "kie.ai",
  edge_tts: "Edge TTS",
  tts_word_timing: "TTS Timing",
  pexels: "Pexels",
  gemini: "Gemini",
  remotion: "Remotion",
};

const MODULE_LABELS: Record<string, string> = {
  standard_video: "Standart Video",
  news_bulletin: "Haber Bülteni",
  product_review: "Ürün İnceleme",
};

// ─── Yardımcı formatter'lar ───────────────────────────────────────────────────

/**
 * Sayısal maliyet değerini dolar string'ine çevirir.
 * undefined/null gelmesi durumunda "$0.00" döner (runtime crash önlenir).
 */
export function formatUSD(val: number | undefined | null): string {
  const n = typeof val === "number" ? val : 0;
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(5)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

/**
 * ISO tarih string'ini kısa Türkçe formata çevirir.
 * Bugün ise saat:dakika, değilse "gün Ay" formatında döner.
 */
export function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  } catch {
    return "-";
  }
}

/**
 * Provider anahtarını okunabilir etikete çevirir.
 * Bilinmeyen provider'lar için anahtar olduğu gibi döner.
 */
export function resolveProviderLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

/**
 * Modül anahtarını okunabilir Türkçe etikete çevirir.
 * Bilinmeyen modüller için anahtar olduğu gibi döner.
 */
export function resolveModuleLabel(moduleKey: string): string {
  return MODULE_LABELS[moduleKey] ?? moduleKey;
}

// ─── Ana normalize fonksiyonu ─────────────────────────────────────────────────

/**
 * Ham backend response'unu CostTracker bileşeninin tükettiği UI modeline çevirir.
 *
 * Tüm mapping mantığı burada toplanır:
 *   • provider label çözümlemesi
 *   • bar genişliği hesabı (max'a göre normalize)
 *   • modül label çözümlemesi
 *   • tarih formatlama
 *   • zero-data tespiti
 */
export function normalizeCostResponse(raw: BackendCostResponse): NormalizedCostData {
  const { summary, by_provider, recent_jobs } = raw;

  // Provider bar normalizasyonu
  const maxCost = Math.max(...by_provider.map((p) => p.total_cost_usd), 0.0001);

  const providers: NormalizedProvider[] = by_provider.map((p) => ({
    key: p.provider,
    label: resolveProviderLabel(p.provider),
    costUsd: p.total_cost_usd,
    callCount: p.call_count,
    barPct: maxCost > 0 ? Math.max((p.total_cost_usd / maxCost) * 100, p.total_cost_usd > 0 ? 2 : 0) : 0,
  }));

  const jobs: NormalizedJob[] = recent_jobs.map((j) => ({
    id: j.job_id,
    title: j.title,
    moduleLabel: resolveModuleLabel(j.module_key),
    costUsd: j.cost_estimate_usd,
    dateStr: formatShortDate(j.completed_at),
    hasNonZeroCost: j.cost_estimate_usd > 0,
  }));

  return {
    totalCostStr: formatUSD(summary.total_cost_usd),
    totalApiCalls: summary.total_api_calls,
    providersUsed: summary.providers_used,
    recentJobCount: recent_jobs.length,
    isZeroData: summary.total_cost_usd === 0 && summary.total_api_calls === 0,
    providers,
    jobs,
  };
}

/** Boş/sıfır durum için varsayılan normalize edilmiş veri */
export const EMPTY_COST_DATA: NormalizedCostData = normalizeCostResponse({
  summary: { total_cost_usd: 0, total_api_calls: 0, providers_used: 0 },
  by_provider: [],
  recent_jobs: [],
});
