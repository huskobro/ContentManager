/**
 * CreateVideo — Yeni pipeline işi başlatma formu.
 *
 * Kullanıcı:
 *   1. Modül seçer (standard_video, news_bulletin, product_review)
 *   2. Konu/konular girer (her satır = bir video → batch üretim)
 *   3. Video formatını seçer (long 16:9 / shorts 9:16)
 *   4. Dil seçer
 *   5. Modüle özgü alanlar (product_review: fiyat/puan/yorumlar; news_bulletin: breaking/network)
 *   6. (Opsiyonel) Gelişmiş ayarlar
 *   7. "Başlat" → her satır için POST /api/jobs → JobList'e yönlendirilir
 *
 * URL query parametresi: ?module=standard_video → modülü önceden seçer
 *
 * Admin default → user override zinciri:
 *   - fetchResolvedSettings(moduleKey) backend'den 5-katmanlı çözümlenmiş değerleri çeker
 *   - userDefaults ile form state'i önceden dolar
 *   - Kullanıcı değiştirirse settings_overrides payload'a eklenir
 */

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  PlusCircle,
  Video,
  Newspaper,
  ShoppingBag,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  Sparkles,
  MonitorPlay,
  Smartphone,
  Lock,
  DollarSign,
  Star,
  MessageSquare,
  AlertTriangle,
  Tv2,
} from "lucide-react";
import { useJobStore } from "@/stores/jobStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

// ─── Modül tanımları ─────────────────────────────────────────────────────────

const MODULES = [
  {
    key: "standard_video",
    label: "Standart Video",
    description: "Bir konu hakkında otomatik video üret",
    icon: <Video size={22} />,
    color: "text-blue-400",
    borderColor: "border-blue-500/40",
    bgColor: "bg-blue-500/10",
  },
  {
    key: "news_bulletin",
    label: "Haber Bülteni",
    description: "Güncel haberlerden video bülten oluştur",
    icon: <Newspaper size={22} />,
    color: "text-amber-400",
    borderColor: "border-amber-500/40",
    bgColor: "bg-amber-500/10",
  },
  {
    key: "product_review",
    label: "Ürün İnceleme",
    description: "Ürün bilgisiyle inceleme videosu üret",
    icon: <ShoppingBag size={22} />,
    color: "text-emerald-400",
    borderColor: "border-emerald-500/40",
    bgColor: "bg-emerald-500/10",
  },
] as const;

const LANGUAGES = [
  { code: "tr", label: "Türkçe" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
];

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function CreateVideo() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const createJob = useJobStore((s) => s.createJob);
  const { userDefaults, lockedKeys, fetchResolvedSettings, loaded } = useSettingsStore();
  const addToast = useUIStore((s) => s.addToast);

  // Form state
  const [selectedModule, setSelectedModule] = useState(
    searchParams.get("module") ?? "standard_video"
  );
  // Textarea: her satır = bir konu (batch üretim)
  const [topicsText, setTopicsText] = useState("");
  const [language, setLanguage] = useState(userDefaults.language || "tr");
  // Video format: adminin belirlediği default ile başlar, kullanıcı değiştirebilir
  const [videoFormat, setVideoFormat] = useState<"long" | "shorts">(
    (userDefaults.videoFormat as "long" | "shorts") || "long"
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [ttsProvider, setTtsProvider] = useState(userDefaults.ttsProvider || "edge_tts");
  const [subtitleStyle, setSubtitleStyle] = useState(userDefaults.subtitleStyle || "standard");

  // ── Product Review modül alanları ──────────────────────────────────────────
  // Fiyat Grubu
  const [reviewPriceEnabled, setReviewPriceEnabled] = useState(false);
  const [productPrice, setProductPrice] = useState("");
  const [productOriginalPrice, setProductOriginalPrice] = useState("");
  const [productCurrency, setProductCurrency] = useState("TL");
  // Puan Grubu
  const [reviewStarEnabled, setReviewStarEnabled] = useState(false);
  const [productStarRating, setProductStarRating] = useState("");
  const [productReviewCount, setProductReviewCount] = useState("");
  // Yorumlar Grubu
  const [reviewCommentsEnabled, setReviewCommentsEnabled] = useState(false);
  const [productTopComments, setProductTopComments] = useState("");
  // Ürün bilgisi
  const [productName, setProductName] = useState("");

  // ── News Bulletin modül alanları ───────────────────────────────────────────
  const [breakingEnabled, setBreakingEnabled] = useState(false);
  const [breakingText, setBreakingText] = useState("");
  const [networkName, setNetworkName] = useState("");

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<{ done: number; total: number } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Ayarları backend'den yükle; her modül değişiminde yenile
  useEffect(() => {
    fetchResolvedSettings(selectedModule);
  }, [selectedModule]); // eslint-disable-line react-hooks/exhaustive-deps

  // Store'daki videoFormat değişince form state'ini de güncelle (ilk yükleme)
  useEffect(() => {
    if (loaded && userDefaults.videoFormat) {
      setVideoFormat(userDefaults.videoFormat as "long" | "shorts");
    }
  }, [loaded, userDefaults.videoFormat]);

  // Textarea'dan geçerli konu listesini parse et
  function parseTopics(): string[] {
    return topicsText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  const topics = parseTopics();
  const isBatch = topics.length > 1;

  // Format seçimine göre çözünürlük belirle
  function resolveResolution(fmt: "long" | "shorts"): string {
    return fmt === "shorts" ? "1080x1920" : "1920x1080";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (topics.length === 0) {
      setFormError("Lütfen en az bir konu/başlık girin.");
      return;
    }

    setSubmitting(true);
    setSubmitProgress({ done: 0, total: topics.length });

    const overrides: Record<string, unknown> = {
      video_format: videoFormat,
      video_resolution: resolveResolution(videoFormat),
    };
    if (ttsProvider !== userDefaults.ttsProvider) overrides.tts_provider = ttsProvider;
    if (subtitleStyle !== userDefaults.subtitleStyle) overrides.subtitle_style = subtitleStyle;

    // ── Product Review overrides ──────────────────────────────────────────
    if (selectedModule === "product_review") {
      if (productName.trim()) {
        overrides._product_name = productName.trim();
      }
      overrides.review_price_enabled = reviewPriceEnabled;
      if (reviewPriceEnabled && productPrice.trim()) {
        const priceNum = parseFloat(productPrice.replace(/,/g, "."));
        if (!isNaN(priceNum)) overrides._product_price = priceNum;
        const origNum = productOriginalPrice.trim()
          ? parseFloat(productOriginalPrice.replace(/,/g, "."))
          : null;
        if (origNum !== null && !isNaN(origNum)) overrides._product_original_price = origNum;
        overrides._product_currency = productCurrency.trim() || "TL";
      }
      overrides.review_star_rating_enabled = reviewStarEnabled;
      if (reviewStarEnabled && productStarRating.trim()) {
        const starNum = parseFloat(productStarRating.replace(/,/g, "."));
        if (!isNaN(starNum)) overrides._product_star_rating = Math.min(5, Math.max(0, starNum));
        const countNum = productReviewCount.trim() ? parseInt(productReviewCount, 10) : null;
        if (countNum !== null && !isNaN(countNum)) overrides._product_review_count = countNum;
      }
      overrides.review_comments_enabled = reviewCommentsEnabled;
      if (reviewCommentsEnabled && productTopComments.trim()) {
        const lines = productTopComments
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
          .slice(0, 5);
        if (lines.length > 0) overrides._product_top_comments = lines;
      }
    }

    // ── News Bulletin overrides ───────────────────────────────────────────
    if (selectedModule === "news_bulletin") {
      overrides.bulletin_breaking_enabled = breakingEnabled;
      if (breakingEnabled && breakingText.trim()) {
        overrides.bulletin_breaking_text = breakingText.trim();
      }
      if (networkName.trim()) {
        overrides.bulletin_network_name = networkName.trim();
      }
    }

    let successCount = 0;
    let lastJobId: string | null = null;

    for (let i = 0; i < topics.length; i++) {
      const topic = topics[i];
      const job = await createJob({
        module_key: selectedModule,
        title: topic,
        language,
        settings_overrides: overrides,
      });

      if (job) {
        successCount++;
        lastJobId = job.id;
      }

      setSubmitProgress({ done: i + 1, total: topics.length });

      // SQLite kilidini önlemek için ardışık istekler arasında kısa bekleme
      if (i < topics.length - 1) {
        await new Promise((res) => setTimeout(res, 150));
      }
    }

    setSubmitting(false);
    setSubmitProgress(null);

    if (successCount === 0) {
      setFormError("Hiçbir iş oluşturulamadı. Lütfen tekrar deneyin.");
      return;
    }

    if (successCount < topics.length) {
      addToast({
        type: "info",
        title: `${successCount}/${topics.length} iş sıraya alındı`,
        description: "Bazı işler oluşturulamadı.",
      });
    } else if (successCount === 1 && lastJobId) {
      addToast({ type: "success", title: "İş oluşturuldu", description: `"${topics[0]}" kuyruğa alındı.` });
    } else {
      addToast({
        type: "success",
        title: `${successCount} adet video üretim işi başarıyla sıraya alındı!`,
      });
    }

    // Tek iş → detay sayfası, batch → iş listesi
    if (successCount === 1 && lastJobId) {
      navigate(`/jobs/${lastJobId}`);
    } else {
      navigate("/jobs");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Başlık */}
      <div className="flex items-center gap-2">
        <Sparkles size={20} className="text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Video Oluştur</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Modül seçimi */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">İçerik Modülü</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {MODULES.map((mod) => (
              <button
                key={mod.key}
                type="button"
                onClick={() => setSelectedModule(mod.key)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all",
                  selectedModule === mod.key
                    ? cn(mod.borderColor, mod.bgColor)
                    : "border-border bg-card hover:bg-accent/50"
                )}
              >
                <span className={mod.color}>{mod.icon}</span>
                <span className="text-sm font-medium text-foreground">{mod.label}</span>
                <span className="text-[11px] text-muted-foreground leading-snug">{mod.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Konu(lar) — textarea: her satır = bir video */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="topics" className="text-sm font-medium text-foreground">
              Konu / Başlık
            </label>
            {topics.length > 1 && (
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
                {topics.length} video
              </span>
            )}
          </div>
          <textarea
            id="topics"
            value={topicsText}
            onChange={(e) => {
              setTopicsText(e.target.value);
              setFormError(null);
            }}
            placeholder={
              selectedModule === "news_bulletin"
                ? "Günlük Teknoloji Haberleri\nEkonomi Özeti\nSpor Bülteni"
                : selectedModule === "product_review"
                  ? "iPhone 16 Pro Max İnceleme\nSamsung Galaxy S25 Ultra\nGoogle Pixel 9"
                  : "Yapay Zekanın Geleceği\nKuantum Bilgisayarlar\nMars Kolonizasyonu\n\nHer satıra bir konu yazarak aynı anda birden fazla video üretebilirsiniz..."
            }
            rows={5}
            className={cn(
              "w-full rounded-lg border bg-input px-4 py-3 text-sm text-foreground",
              "placeholder:text-muted-foreground/60",
              "outline-none focus:ring-2 focus:ring-ring transition-colors resize-y",
              formError ? "border-destructive" : "border-border"
            )}
          />
          {topics.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Her satır bağımsız bir video olarak sıraya alınacak.
            </p>
          )}
          {formError && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle size={12} />
              {formError}
            </p>
          )}
        </div>

        {/* Video Formatı */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Video Formatı</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setVideoFormat("long")}
              className={cn(
                "flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all",
                videoFormat === "long"
                  ? "border-blue-500/60 bg-blue-500/10"
                  : "border-border bg-card hover:bg-accent/50"
              )}
            >
              <MonitorPlay
                size={20}
                className={videoFormat === "long" ? "text-blue-400" : "text-muted-foreground"}
              />
              <div>
                <p className="text-sm font-medium text-foreground">Uzun Video</p>
                <p className="text-[11px] text-muted-foreground">16:9 · 1920×1080</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setVideoFormat("shorts")}
              className={cn(
                "flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all",
                videoFormat === "shorts"
                  ? "border-purple-500/60 bg-purple-500/10"
                  : "border-border bg-card hover:bg-accent/50"
              )}
            >
              <Smartphone
                size={20}
                className={videoFormat === "shorts" ? "text-purple-400" : "text-muted-foreground"}
              />
              <div>
                <p className="text-sm font-medium text-foreground">Shorts / Dikey</p>
                <p className="text-[11px] text-muted-foreground">9:16 · 1080×1920</p>
              </div>
            </button>
          </div>
        </div>

        {/* Dil seçimi */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <label htmlFor="language" className="text-sm font-medium text-foreground">
              İçerik Dili
            </label>
            {lockedKeys.includes("language") && (
              <Lock size={11} className="text-amber-400" aria-label="Admin tarafından kilitlendi" />
            )}
          </div>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={lockedKeys.includes("language")}
            className={cn(
              "w-full rounded-lg border bg-input px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring transition-colors",
              lockedKeys.includes("language")
                ? "border-border opacity-60 cursor-not-allowed"
                : "border-border"
            )}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        {/* ── Ürün İnceleme Modül Alanları ────────────────────────────────── */}
        {selectedModule === "product_review" && (
          <div className="space-y-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2">
              <ShoppingBag size={16} className="text-emerald-400" />
              <span className="text-sm font-semibold text-foreground">Ürün Bilgileri</span>
              <span className="text-xs text-muted-foreground">(opsiyonel — video görsellerini zenginleştirir)</span>
            </div>

            {/* Ürün adı */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Ürün Adı</label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Örn: Sony WH-1000XM5"
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-[11px] text-muted-foreground">Score ring ve bölüm etiketlerinde gösterilir.</p>
            </div>

            {/* Pricing grubu */}
            <div className="space-y-2 rounded-lg border border-border bg-background/50 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign size={14} className="text-emerald-400" />
                  <span className="text-xs font-semibold text-foreground">Fiyat Badge'i</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewPriceEnabled(!reviewPriceEnabled)}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                    reviewPriceEnabled ? "bg-emerald-500" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                      reviewPriceEnabled ? "translate-x-4.5" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Verdict sahnesinde animasyonlu fiyat sayacı gösterir.
              </p>
              {reviewPriceEnabled && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Fiyat *</label>
                    <input
                      type="number"
                      value={productPrice}
                      onChange={(e) => setProductPrice(e.target.value)}
                      placeholder="8499"
                      min={0}
                      className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Eski Fiyat</label>
                    <input
                      type="number"
                      value={productOriginalPrice}
                      onChange={(e) => setProductOriginalPrice(e.target.value)}
                      placeholder="10999"
                      min={0}
                      className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Para Birimi</label>
                    <select
                      value={productCurrency}
                      onChange={(e) => setProductCurrency(e.target.value)}
                      className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="TL">TL</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Rating grubu */}
            <div className="space-y-2 rounded-lg border border-border bg-background/50 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star size={14} className="text-amber-400" />
                  <span className="text-xs font-semibold text-foreground">Yıldız Puanı</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewStarEnabled(!reviewStarEnabled)}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                    reviewStarEnabled ? "bg-amber-500" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                      reviewStarEnabled ? "translate-x-4.5" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Verdict sahnesinde 5 yıldızlı animasyonlu puan gösterir.
              </p>
              {reviewStarEnabled && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Puan (0–5) *</label>
                    <input
                      type="number"
                      value={productStarRating}
                      onChange={(e) => setProductStarRating(e.target.value)}
                      placeholder="4.7"
                      min={0}
                      max={5}
                      step={0.1}
                      className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Yorum Sayısı</label>
                    <input
                      type="number"
                      value={productReviewCount}
                      onChange={(e) => setProductReviewCount(e.target.value)}
                      placeholder="2341"
                      min={0}
                      className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Comments grubu */}
            <div className="space-y-2 rounded-lg border border-border bg-background/50 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} className="text-blue-400" />
                  <span className="text-xs font-semibold text-foreground">Yüzen Yorumlar</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewCommentsEnabled(!reviewCommentsEnabled)}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                    reviewCommentsEnabled ? "bg-blue-500" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                      reviewCommentsEnabled ? "translate-x-4.5" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Overview/Pros sahnelerinde yüzen yorum kartları. Boş bırakılırsa LLM üretmeye çalışır.
              </p>
              {reviewCommentsEnabled && (
                <div className="mt-2 space-y-1">
                  <label className="text-[11px] text-muted-foreground">
                    Yorumlar (her satır = bir yorum, maks 5)
                  </label>
                  <textarea
                    value={productTopComments}
                    onChange={(e) => setProductTopComments(e.target.value)}
                    placeholder={"Gürültü engelleme inanılmaz!\nPil ömrü çok uzun.\nFiyatına değer kesinlikle."}
                    rows={3}
                    className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring resize-none"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Haber Bülteni Modül Alanları ─────────────────────────────────── */}
        {selectedModule === "news_bulletin" && (
          <div className="space-y-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2">
              <Newspaper size={16} className="text-amber-400" />
              <span className="text-sm font-semibold text-foreground">Bülten Ayarları</span>
              <span className="text-xs text-muted-foreground">(opsiyonel)</span>
            </div>

            {/* Yayın ağı adı */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Tv2 size={13} className="text-amber-400" />
                <label className="text-xs font-medium text-foreground">Yayın Ağı Adı</label>
              </div>
              <input
                type="text"
                value={networkName}
                onChange={(e) => setNetworkName(e.target.value)}
                placeholder="Örn: ContentManager Haber"
                maxLength={60}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-[11px] text-muted-foreground">
                Breaking news overlay badge'inde ve bülten ekranında gösterilir. Boş bırakılabilir.
              </p>
            </div>

            {/* Son dakika overlay grubu */}
            <div className="space-y-2 rounded-lg border border-border bg-background/50 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-red-400" />
                  <span className="text-xs font-semibold text-foreground">Son Dakika Overlay</span>
                </div>
                <button
                  type="button"
                  onClick={() => setBreakingEnabled(!breakingEnabled)}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                    breakingEnabled ? "bg-red-500" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                      breakingEnabled ? "translate-x-4.5" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Videonun başında kırmızı SON DAKİKA flash overlay gösterir.
              </p>
              {breakingEnabled && (
                <div className="mt-2 space-y-1">
                  <label className="text-[11px] text-muted-foreground">Son Dakika Başlığı *</label>
                  <input
                    type="text"
                    value={breakingText}
                    onChange={(e) => setBreakingText(e.target.value)}
                    placeholder="Örn: ACİL HABER"
                    maxLength={80}
                    className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Kısa ve vurucu bir başlık girin. Aşırı uzun başlıklar composition'da kesilebilir.
                  </p>
                </div>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground/70">
              💡 Kategori→stil eşleşmesi aktifse bülten görsel stili sahne kategorilerine göre otomatik seçilir.
              Admin paneli → Kategori Stil Eşleşmeleri'nden özelleştirilebilir.
            </p>
          </div>
        )}

        {/* Gelişmiş ayarlar toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          Gelişmiş Ayarlar
        </button>

        {/* Gelişmiş ayarlar panel */}
        {showAdvanced && (
          <div className="space-y-4 rounded-xl border border-border bg-card p-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <label htmlFor="ttsProvider" className="text-sm font-medium text-foreground">
                  TTS Provider
                </label>
                {lockedKeys.includes("tts_provider") && (
                  <Lock size={11} className="text-amber-400" aria-label="Admin tarafından kilitlendi" />
                )}
              </div>
              <select
                id="ttsProvider"
                value={ttsProvider}
                onChange={(e) => setTtsProvider(e.target.value)}
                disabled={lockedKeys.includes("tts_provider")}
                className={cn(
                  "w-full rounded-lg border bg-input px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring",
                  lockedKeys.includes("tts_provider")
                    ? "border-border opacity-60 cursor-not-allowed"
                    : "border-border"
                )}
              >
                <option value="edge_tts">Edge TTS (Ücretsiz)</option>
                <option value="elevenlabs">ElevenLabs (Premium)</option>
                <option value="openai_tts">OpenAI TTS</option>
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <label htmlFor="subtitleStyle" className="text-sm font-medium text-foreground">
                  Altyazı Stili
                </label>
                {lockedKeys.includes("subtitle_style") && (
                  <Lock size={11} className="text-amber-400" aria-label="Admin tarafından kilitlendi" />
                )}
              </div>
              <select
                id="subtitleStyle"
                value={subtitleStyle}
                onChange={(e) => setSubtitleStyle(e.target.value)}
                disabled={lockedKeys.includes("subtitle_style")}
                className={cn(
                  "w-full rounded-lg border bg-input px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring",
                  lockedKeys.includes("subtitle_style")
                    ? "border-border opacity-60 cursor-not-allowed"
                    : "border-border"
                )}
              >
                <option value="standard">Standard</option>
                <option value="neon_blue">Neon Mavi</option>
                <option value="gold">Altın</option>
                <option value="minimal">Minimal</option>
                <option value="hormozi">Hormozi Shorts</option>
              </select>
            </div>
          </div>
        )}

        {/* Gönder butonu */}
        <button
          type="submit"
          disabled={submitting || topics.length === 0}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium transition-all",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {submitProgress
                ? `Oluşturuluyor... (${submitProgress.done}/${submitProgress.total})`
                : "Oluşturuluyor..."}
            </>
          ) : (
            <>
              <PlusCircle size={16} />
              {isBatch
                ? `${topics.length} Video İşini Başlat`
                : "İşi Başlat"}
            </>
          )}
        </button>
      </form>
    </div>
  );
}
