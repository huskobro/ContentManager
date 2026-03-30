/**
 * CreateVideo — Yeni pipeline işi başlatma formu.
 *
 * Kullanıcı:
 *   1. Modül seçer (standard_video, news_bulletin, product_review)
 *   2. Konu/konular girer (her satır = bir video → batch üretim)
 *   3. Video formatını seçer (long 16:9 / shorts 9:16)
 *   4. Dil seçer
 *   5. (Opsiyonel) Gelişmiş ayarlar
 *   6. "Başlat" → her satır için POST /api/jobs → JobList'e yönlendirilir
 *
 * URL query parametresi: ?module=standard_video → modülü önceden seçer
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

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<{ done: number; total: number } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Ayarları backend'den yükle; her modül değişiminde yenile (stale localStorage sorununu önler)
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
            {lockedKeys.includes("default_language") && (
              <Lock size={11} className="text-amber-400" title="Admin tarafından kilitlendi" />
            )}
          </div>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={lockedKeys.includes("default_language")}
            className={cn(
              "w-full rounded-lg border bg-input px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring transition-colors",
              lockedKeys.includes("default_language")
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
                {lockedKeys.includes("default_tts_provider") && (
                  <Lock size={11} className="text-amber-400" title="Admin tarafından kilitlendi" />
                )}
              </div>
              <select
                id="ttsProvider"
                value={ttsProvider}
                onChange={(e) => setTtsProvider(e.target.value)}
                disabled={lockedKeys.includes("default_tts_provider")}
                className={cn(
                  "w-full rounded-lg border bg-input px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring",
                  lockedKeys.includes("default_tts_provider")
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
                {lockedKeys.includes("default_subtitle_style") && (
                  <Lock size={11} className="text-amber-400" title="Admin tarafından kilitlendi" />
                )}
              </div>
              <select
                id="subtitleStyle"
                value={subtitleStyle}
                onChange={(e) => setSubtitleStyle(e.target.value)}
                disabled={lockedKeys.includes("default_subtitle_style")}
                className={cn(
                  "w-full rounded-lg border bg-input px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring",
                  lockedKeys.includes("default_subtitle_style")
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
