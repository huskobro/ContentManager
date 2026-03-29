/**
 * UserSettings — Kullanıcı video üretim tercihlerini yönetme sayfası.
 *
 * Özellikler:
 *   • Backend'den çözümlenmiş ayarları gösterir (5-katmanlı sistem)
 *   • Kilitli ayarlar readonly gösterilir (admin tarafından kilitli)
 *   • Kullanıcının override edebileceği ayarlar: dil, TTS, altyazı stili, çözünürlük vb.
 *   • Değişiklikler localStorage'da saklanır (Zustand persist)
 */

import { useEffect, useState } from "react";
import {
  Settings,
  Globe,
  Mic,
  Subtitles,
  Monitor,
  Lock,
  RotateCcw,
  Loader2,
  AlertCircle,
  Save,
  CheckCircle2,
} from "lucide-react";
import { useSettingsStore, type UserVideoDefaults } from "@/stores/settingsStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

// ─── Seçenekler ──────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: "tr", label: "Türkçe" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
];

const TTS_PROVIDERS = [
  { value: "edge_tts", label: "Edge TTS (Ücretsiz)" },
  { value: "elevenlabs", label: "ElevenLabs (Premium)" },
  { value: "openai_tts", label: "OpenAI TTS" },
];

const SUBTITLE_STYLES = [
  { value: "standard", label: "Standard" },
  { value: "neon_blue", label: "Neon Mavi" },
  { value: "gold", label: "Altın" },
  { value: "minimal", label: "Minimal" },
  { value: "hormozi", label: "Hormozi Shorts" },
];

const VISUALS_PROVIDERS = [
  { value: "pexels", label: "Pexels" },
  { value: "pixabay", label: "Pixabay" },
];

const RESOLUTIONS = [
  { value: "1920x1080", label: "1920×1080 (Yatay)" },
  { value: "1080x1920", label: "1080×1920 (Dikey / Shorts)" },
];

const FPS_OPTIONS = [
  { value: 30, label: "30 FPS" },
  { value: 60, label: "60 FPS" },
];

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function UserSettings() {
  const {
    userDefaults,
    lockedKeys,
    loaded,
    error,
    fetchResolvedSettings,
    setUserDefaults,
    patchUserDefault,
  } = useSettingsStore();

  const addToast = useUIStore((s) => s.addToast);
  const [saving, setSaving] = useState(false);

  // Form state (local copy for editing)
  const [form, setForm] = useState<UserVideoDefaults>({ ...userDefaults });

  useEffect(() => {
    if (!loaded) {
      fetchResolvedSettings();
    }
  }, [loaded, fetchResolvedSettings]);

  // Store değiştiğinde form'u senkronla
  useEffect(() => {
    setForm({ ...userDefaults });
  }, [userDefaults]);

  function isLocked(key: string): boolean {
    return lockedKeys.includes(key);
  }

  function handleChange<K extends keyof UserVideoDefaults>(
    key: K,
    value: UserVideoDefaults[K]
  ) {
    if (isLocked(key)) return;
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    setSaving(true);
    // Zustand persist → localStorage
    setUserDefaults(form);
    setTimeout(() => {
      setSaving(false);
      addToast({ type: "success", title: "Ayarlar kaydedildi" });
    }, 300);
  }

  function handleReset() {
    fetchResolvedSettings().then(() => {
      addToast({ type: "info", title: "Ayarlar sıfırlandı", description: "Backend varsayılanları yüklendi." });
    });
  }

  const hasChanges = JSON.stringify(form) !== JSON.stringify(userDefaults);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings size={20} className="text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Kullanıcı Ayarları</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <RotateCcw size={12} />
            Sıfırla
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              hasChanges
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {saving ? (
              <Loader2 size={12} className="animate-spin" />
            ) : hasChanges ? (
              <Save size={12} />
            ) : (
              <CheckCircle2 size={12} />
            )}
            {saving ? "Kaydediliyor..." : hasChanges ? "Kaydet" : "Güncel"}
          </button>
        </div>
      </div>

      {/* Hata mesajı */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* İçerik Dili */}
      <SettingsSection
        icon={<Globe size={16} />}
        title="İçerik Dili"
        description="Video içeriklerinin varsayılan dili"
      >
        <SelectField
          value={form.language}
          onChange={(v) => handleChange("language", v)}
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
          locked={isLocked("language")}
        />
      </SettingsSection>

      {/* TTS Ayarları */}
      <SettingsSection
        icon={<Mic size={16} />}
        title="Ses Sentezi (TTS)"
        description="Varsayılan konuşma sentezi sağlayıcısı"
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">TTS Provider</label>
            <SelectField
              value={form.ttsProvider}
              onChange={(v) => handleChange("ttsProvider", v)}
              options={TTS_PROVIDERS}
              locked={isLocked("tts_provider")}
            />
          </div>
        </div>
      </SettingsSection>

      {/* Altyazı Ayarları */}
      <SettingsSection
        icon={<Subtitles size={16} />}
        title="Altyazı"
        description="Altyazı stili ve etkinleştirme"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Altyazı Aktif</label>
            <ToggleSwitch
              checked={form.subtitleEnabled}
              onChange={(v) => handleChange("subtitleEnabled", v)}
              locked={isLocked("subtitle_enabled")}
            />
          </div>
          {form.subtitleEnabled && (
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Altyazı Stili</label>
              <SelectField
                value={form.subtitleStyle}
                onChange={(v) => handleChange("subtitleStyle", v)}
                options={SUBTITLE_STYLES}
                locked={isLocked("subtitle_style")}
              />
            </div>
          )}
        </div>
      </SettingsSection>

      {/* Görsel Ayarları */}
      <SettingsSection
        icon={<Monitor size={16} />}
        title="Video & Görsel"
        description="Çözünürlük, FPS ve görsel sağlayıcı tercihleri"
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Görsel Kaynağı</label>
            <SelectField
              value={form.visualsProvider}
              onChange={(v) => handleChange("visualsProvider", v)}
              options={VISUALS_PROVIDERS}
              locked={isLocked("visuals_provider")}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Video Çözünürlüğü</label>
            <SelectField
              value={form.videoResolution}
              onChange={(v) => handleChange("videoResolution", v)}
              options={RESOLUTIONS}
              locked={isLocked("video_resolution")}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Kare Hızı</label>
            <SelectField
              value={String(form.videoFps)}
              onChange={(v) => handleChange("videoFps", Number(v))}
              options={FPS_OPTIONS.map((f) => ({
                value: String(f.value),
                label: f.label,
              }))}
              locked={isLocked("video_fps")}
            />
          </div>
        </div>
      </SettingsSection>

      {/* Yayın Ayarları */}
      <SettingsSection
        icon={<Settings size={16} />}
        title="Yayın & Ek Özellikler"
        description="Metadata, thumbnail ve YouTube yayın tercihleri"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">SEO Metadata Üretimi</label>
            <ToggleSwitch
              checked={form.metadataEnabled}
              onChange={(v) => handleChange("metadataEnabled", v)}
              locked={isLocked("metadata_enabled")}
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Thumbnail Üretimi</label>
            <ToggleSwitch
              checked={form.thumbnailEnabled}
              onChange={(v) => handleChange("thumbnailEnabled", v)}
              locked={isLocked("thumbnail_enabled")}
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">YouTube'a Yayınla</label>
            <ToggleSwitch
              checked={form.publishToYoutube}
              onChange={(v) => handleChange("publishToYoutube", v)}
              locked={isLocked("publish_to_youtube")}
            />
          </div>
          {form.publishToYoutube && (
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                YouTube Gizlilik
              </label>
              <SelectField
                value={form.youtubePrivacy}
                onChange={(v) =>
                  handleChange("youtubePrivacy", v as "private" | "unlisted" | "public")
                }
                options={[
                  { value: "private", label: "Özel (Private)" },
                  { value: "unlisted", label: "Liste Dışı (Unlisted)" },
                  { value: "public", label: "Herkese Açık (Public)" },
                ]}
                locked={isLocked("youtube_privacy")}
              />
            </div>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}

// ─── Yardımcı Bileşenler ─────────────────────────────────────────────────────

function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <div>
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
  locked,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  locked: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={locked}
        className={cn(
          "w-full rounded-lg border bg-input px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring transition-colors",
          locked
            ? "border-border opacity-60 cursor-not-allowed"
            : "border-border"
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {locked && (
        <Lock
          size={12}
          className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
      )}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  locked,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  locked: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={locked}
      onClick={() => !locked && onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted",
        locked && "opacity-50 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5"
        )}
      />
      {locked && (
        <Lock size={8} className="absolute -right-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
      )}
    </button>
  );
}
