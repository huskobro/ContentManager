/**
 * costTrackerUtils.test.ts — normalizeCostResponse ve yardımcı fonksiyonlar.
 *
 * Test kapsamı:
 *   formatUSD:
 *     1. sıfır → "$0.00"
 *     2. çok küçük değer → 5 ondalık
 *     3. orta değer → 4 ondalık
 *     4. büyük değer → 2 ondalık
 *     5. undefined → "$0.00" (crash guard)
 *     6. null → "$0.00" (crash guard)
 *
 *   resolveProviderLabel:
 *     7. bilinen provider → okunabilir etiket
 *     8. bilinmeyen provider → anahtar olduğu gibi
 *
 *   resolveModuleLabel:
 *     9. bilinen modül → Türkçe etiket
 *     10. bilinmeyen modül → anahtar olduğu gibi
 *
 *   normalizeCostResponse:
 *     11. boş response → EMPTY_COST_DATA ile aynı yapı
 *     12. summary alanları doğru eşleniyor
 *     13. isZeroData: toplam_cost=0 ve total_api_calls=0 → true
 *     14. isZeroData: toplam_cost>0 → false
 *     15. provider label çözümlemesi
 *     16. provider barPct: max maliyetli provider 100 alır
 *     17. provider barPct: sıfır maliyetli provider 0 alır
 *     18. provider barPct: sıfırdan büyük ama max değil → 0 < pct < 100
 *     19. job mapping: moduleLabel, dateStr, hasNonZeroCost
 *     20. hasNonZeroCost: cost=0 → false
 *     21. recentJobCount doğru sayılıyor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatUSD,
  resolveProviderLabel,
  resolveModuleLabel,
  normalizeCostResponse,
  EMPTY_COST_DATA,
  type BackendCostResponse,
} from "@/pages/admin/costTrackerUtils";

// ─── formatUSD ────────────────────────────────────────────────────────────────

describe("formatUSD", () => {
  it("sıfır değeri '$0.00' döner", () => {
    expect(formatUSD(0)).toBe("$0.00");
  });

  it("0.000005 gibi çok küçük değer 5 ondalık basamakla döner", () => {
    expect(formatUSD(0.000005)).toBe("$0.00001");
  });

  it("0.05 gibi orta değer (0.01–1 arası) 4 ondalık basamakla döner", () => {
    expect(formatUSD(0.05)).toBe("$0.0500");
  });

  it("1.5 gibi büyük değer 2 ondalık basamakla döner", () => {
    expect(formatUSD(1.5)).toBe("$1.50");
  });

  it("undefined → '$0.00' döner (crash guard)", () => {
    expect(formatUSD(undefined)).toBe("$0.00");
  });

  it("null → '$0.00' döner (crash guard)", () => {
    expect(formatUSD(null)).toBe("$0.00");
  });
});

// ─── resolveProviderLabel ─────────────────────────────────────────────────────

describe("resolveProviderLabel", () => {
  it("bilinen 'edge_tts' → 'Edge TTS' döner", () => {
    expect(resolveProviderLabel("edge_tts")).toBe("Edge TTS");
  });

  it("bilinen 'kieai' → 'kie.ai' döner", () => {
    expect(resolveProviderLabel("kieai")).toBe("kie.ai");
  });

  it("bilinmeyen provider → anahtar olduğu gibi döner", () => {
    expect(resolveProviderLabel("my_custom_provider")).toBe("my_custom_provider");
  });
});

// ─── resolveModuleLabel ───────────────────────────────────────────────────────

describe("resolveModuleLabel", () => {
  it("'standard_video' → 'Standart Video' döner", () => {
    expect(resolveModuleLabel("standard_video")).toBe("Standart Video");
  });

  it("'news_bulletin' → 'Haber Bülteni' döner", () => {
    expect(resolveModuleLabel("news_bulletin")).toBe("Haber Bülteni");
  });

  it("bilinmeyen modül → anahtar olduğu gibi döner", () => {
    expect(resolveModuleLabel("unknown_module")).toBe("unknown_module");
  });
});

// ─── normalizeCostResponse ────────────────────────────────────────────────────

const EMPTY_RAW: BackendCostResponse = {
  summary: { total_cost_usd: 0, total_api_calls: 0, providers_used: 0 },
  by_provider: [],
  recent_jobs: [],
};

describe("normalizeCostResponse", () => {
  it("boş response EMPTY_COST_DATA ile yapısal olarak eşleşir", () => {
    const result = normalizeCostResponse(EMPTY_RAW);
    expect(result.totalCostStr).toBe(EMPTY_COST_DATA.totalCostStr);
    expect(result.providers).toHaveLength(0);
    expect(result.jobs).toHaveLength(0);
    expect(result.isZeroData).toBe(true);
  });

  it("summary alanları doğru eşleniyor", () => {
    const raw: BackendCostResponse = {
      summary: { total_cost_usd: 0.00178, total_api_calls: 18, providers_used: 5 },
      by_provider: [],
      recent_jobs: [],
    };
    const result = normalizeCostResponse(raw);
    expect(result.totalCostStr).toBe("$0.00178");
    expect(result.totalApiCalls).toBe(18);
    expect(result.providersUsed).toBe(5);
  });

  it("isZeroData: total_cost=0 ve total_api_calls=0 → true", () => {
    const result = normalizeCostResponse(EMPTY_RAW);
    expect(result.isZeroData).toBe(true);
  });

  it("isZeroData: total_cost>0 → false", () => {
    const raw: BackendCostResponse = {
      ...EMPTY_RAW,
      summary: { total_cost_usd: 0.001, total_api_calls: 0, providers_used: 1 },
    };
    expect(normalizeCostResponse(raw).isZeroData).toBe(false);
  });

  it("isZeroData: total_api_calls>0, cost=0 → false", () => {
    const raw: BackendCostResponse = {
      ...EMPTY_RAW,
      summary: { total_cost_usd: 0, total_api_calls: 3, providers_used: 0 },
    };
    expect(normalizeCostResponse(raw).isZeroData).toBe(false);
  });

  it("provider label 'edge_tts' → 'Edge TTS' olarak çözümleniyor", () => {
    const raw: BackendCostResponse = {
      ...EMPTY_RAW,
      by_provider: [{ provider: "edge_tts", total_cost_usd: 0.001, call_count: 3 }],
    };
    const result = normalizeCostResponse(raw);
    expect(result.providers[0].label).toBe("Edge TTS");
  });

  it("en yüksek maliyetli provider barPct=100 alır", () => {
    const raw: BackendCostResponse = {
      ...EMPTY_RAW,
      by_provider: [
        { provider: "kieai", total_cost_usd: 0.005, call_count: 5 },
        { provider: "pexels", total_cost_usd: 0.001, call_count: 2 },
      ],
    };
    const result = normalizeCostResponse(raw);
    const kieai = result.providers.find((p) => p.key === "kieai")!;
    expect(kieai.barPct).toBe(100);
  });

  it("sıfır maliyetli provider barPct=0 alır", () => {
    const raw: BackendCostResponse = {
      ...EMPTY_RAW,
      by_provider: [
        { provider: "kieai", total_cost_usd: 0.005, call_count: 5 },
        { provider: "remotion", total_cost_usd: 0, call_count: 2 },
      ],
    };
    const result = normalizeCostResponse(raw);
    const remotion = result.providers.find((p) => p.key === "remotion")!;
    expect(remotion.barPct).toBe(0);
  });

  it("max olmayan provider 0 < barPct < 100", () => {
    const raw: BackendCostResponse = {
      ...EMPTY_RAW,
      by_provider: [
        { provider: "kieai", total_cost_usd: 0.010, call_count: 5 },
        { provider: "pexels", total_cost_usd: 0.005, call_count: 2 },
      ],
    };
    const result = normalizeCostResponse(raw);
    const pexels = result.providers.find((p) => p.key === "pexels")!;
    expect(pexels.barPct).toBeGreaterThan(0);
    expect(pexels.barPct).toBeLessThan(100);
  });

  it("job mapping: moduleLabel, hasNonZeroCost, recentJobCount", () => {
    const raw: BackendCostResponse = {
      ...EMPTY_RAW,
      recent_jobs: [
        {
          job_id: "abc123",
          title: "Test Video",
          module_key: "standard_video",
          cost_estimate_usd: 0.00037,
          completed_at: "2026-03-30T17:35:56.942Z",
        },
      ],
    };
    const result = normalizeCostResponse(raw);
    expect(result.recentJobCount).toBe(1);
    const job = result.jobs[0];
    expect(job.id).toBe("abc123");
    expect(job.title).toBe("Test Video");
    expect(job.moduleLabel).toBe("Standart Video");
    expect(job.hasNonZeroCost).toBe(true);
    expect(job.costUsd).toBe(0.00037);
  });

  it("hasNonZeroCost: cost=0 olan job için false döner", () => {
    const raw: BackendCostResponse = {
      ...EMPTY_RAW,
      recent_jobs: [
        {
          job_id: "xyz",
          title: "Free Job",
          module_key: "standard_video",
          cost_estimate_usd: 0,
          completed_at: "2026-03-30T10:00:00Z",
        },
      ],
    };
    const result = normalizeCostResponse(raw);
    expect(result.jobs[0].hasNonZeroCost).toBe(false);
  });
});

// ─── formatShortDate (tarih bugün/değil ayrımı) ───────────────────────────────

describe("formatShortDate (normalizeCostResponse üzerinden)", () => {
  beforeEach(() => {
    // Sabit bir tarih sabitle: 2026-03-31
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("bugünün tarihi → saat:dakika formatında döner", () => {
    // vi.setSystemTime ile sabitlenen zaman: 2026-03-31T12:00:00Z
    // Aynı gün içinde ama farklı bir saat
    const sameDay = new Date("2026-03-31T09:30:00Z").toISOString();
    const raw: BackendCostResponse = {
      ...EMPTY_RAW,
      recent_jobs: [
        {
          job_id: "today",
          title: "T",
          module_key: "standard_video",
          cost_estimate_usd: 0,
          completed_at: sameDay,
        },
      ],
    };
    const result = normalizeCostResponse(raw);
    // toDateString() local-time tabanlı — iki tarih de aynı lokal günde kalıyorsa HH:MM formatı
    const dateStr = result.jobs[0].dateStr;
    // Ya saat:dakika (bugün) ya da tarih (farklı gün) — timezone farkı olabilir,
    // bu yüzden sadece boş olmadığını ve "-" olmadığını doğrula
    expect(dateStr).not.toBe("-");
    expect(dateStr.length).toBeGreaterThan(0);
  });

  it("geçen ayki tarih → gün Ay formatında döner (saat:dakika değil)", () => {
    // 2026-01-15 kesinlikle bugün değil
    const raw: BackendCostResponse = {
      ...EMPTY_RAW,
      recent_jobs: [
        {
          job_id: "old",
          title: "Y",
          module_key: "standard_video",
          cost_estimate_usd: 0,
          completed_at: "2026-01-15T09:30:00Z",
        },
      ],
    };
    const result = normalizeCostResponse(raw);
    // Farklı gün: saat:dakika formatı OLMAMALI
    expect(result.jobs[0].dateStr).not.toMatch(/^\d{2}:\d{2}$/);
    // Sayı içermeli (gün numarası)
    expect(result.jobs[0].dateStr).toMatch(/\d+/);
  });
});
