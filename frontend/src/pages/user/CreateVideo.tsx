/**
 * CreateVideo — Yeni pipeline işi başlatma formu.
 *
 * Kullanıcı:
 *   1. Modül seçer (standard_video, news_bulletin, product_review)
 *   2. Başlık/konu girer
 *   3. Dil seçer
 *   4. (Opsiyonel) Gelişmiş ayarlar
 *   5. "Başlat" → POST /api/jobs → JobDetail sayfasına yönlendirilir
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
  const { userDefaults, fetchResolvedSettings, loaded } = useSettingsStore();
  const addToast = useUIStore((s) => s.addToast);

  // Form state
  const [selectedModule, setSelectedModule] = useState(
    searchParams.get("module") ?? "standard_video"
  );
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState(userDefaults.language || "tr");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [ttsProvider, setTtsProvider] = useState(userDefaults.ttsProvider || "edge_tts");
  const [subtitleStyle, setSubtitleStyle] = useState(userDefaults.subtitleStyle || "standard");

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Ayarları backend'den yükle
  useEffect(() => {
    if (!loaded) {
      fetchResolvedSettings(selectedModule);
    }
  }, [loaded, fetchResolvedSettings, selectedModule]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError("Lütfen bir başlık/konu girin.");
      return;
    }

    setSubmitting(true);

    const overrides: Record<string, unknown> = {};
    if (ttsProvider !== userDefaults.ttsProvider) overrides.tts_provider = ttsProvider;
    if (subtitleStyle !== userDefaults.subtitleStyle) overrides.subtitle_style = subtitleStyle;

    const job = await createJob({
      module_key: selectedModule,
      title: title.trim(),
      language,
      settings_overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
    });

    setSubmitting(false);

    if (job) {
      addToast({ type: "success", title: "İş oluşturuldu", message: `"${job.title}" kuyruğa alındı.` });
      navigate(`/jobs/${job.id}`);
    } else {
      setFormError("İş oluşturulamadı. Lütfen tekrar deneyin.");
    }
  }

  const selectedModuleInfo = MODULES.find((m) => m.key === selectedModule) ?? MODULES[0];

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

        {/* Başlık / Konu */}
        <div className="space-y-2">
          <label htmlFor="title" className="text-sm font-medium text-foreground">
            Başlık / Konu
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setFormError(null);
            }}
            placeholder={
              selectedModule === "news_bulletin"
                ? "Günlük Teknoloji Haberleri"
                : selectedModule === "product_review"
                  ? "iPhone 16 Pro Max İnceleme"
                  : "Yapay Zekanın Geleceği"
            }
            maxLength={512}
            className={cn(
              "w-full rounded-lg border bg-input px-4 py-3 text-sm text-foreground",
              "placeholder:text-muted-foreground",
              "outline-none focus:ring-2 focus:ring-ring transition-colors",
              formError ? "border-destructive" : "border-border"
            )}
          />
          {formError && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle size={12} />
              {formError}
            </p>
          )}
        </div>

        {/* Dil seçimi */}
        <div className="space-y-2">
          <label htmlFor="language" className="text-sm font-medium text-foreground">
            İçerik Dili
          </label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full rounded-lg border border-border bg-input px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring transition-colors"
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
              <label htmlFor="ttsProvider" className="text-sm font-medium text-foreground">
                TTS Provider
              </label>
              <select
                id="ttsProvider"
                value={ttsProvider}
                onChange={(e) => setTtsProvider(e.target.value)}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="edge_tts">Edge TTS (Ücretsiz)</option>
                <option value="elevenlabs">ElevenLabs (Premium)</option>
                <option value="openai_tts">OpenAI TTS</option>
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="subtitleStyle" className="text-sm font-medium text-foreground">
                Altyazı Stili
              </label>
              <select
                id="subtitleStyle"
                value={subtitleStyle}
                onChange={(e) => setSubtitleStyle(e.target.value)}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
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
          disabled={submitting || !title.trim()}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium transition-all",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Oluşturuluyor...
            </>
          ) : (
            <>
              <PlusCircle size={16} />
              İşi Başlat
            </>
          )}
        </button>
      </form>
    </div>
  );
}
