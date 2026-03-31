/**
 * UserSettings — Kullanıcı video üretim tercihlerini yönetme sayfası.
 *
 * Faz 10.7 değişiklikleri:
 *   • "Genel Ayarlar" ve "Görsel & Yayın Tercihleri" kategorize edilmiş kartlar
 *   • Daha temiz, tutarlı tasarım
 *   • Kilitli ayarlar readonly + lock ikonu gösterir
 */

import { useEffect, useState } from "react";
import { useAutoSave } from "@/hooks/useAutoSave";
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
  Share2,
  Palette,
  Zap,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useSettingsStore, type UserVideoDefaults } from "@/stores/settingsStore";
import { useUIStore } from "@/stores/uiStore";
import { isSettingAdminOnly } from "@/lib/constants";
// isSettingAdminOnly is used both for UI filtering (isHiddenFromUser) and save payload filtering
import { api } from "@/api/client";
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
  { value: "pexels", label: "Pexels (Stok Video)" },
  { value: "pixabay", label: "Pixabay" },
];

const RESOLUTIONS = [
  { value: "1920x1080", label: "1920×1080 — Yatay (16:9)" },
  { value: "1080x1920", label: "1080×1920 — Dikey / Shorts (9:16)" },
];

const FPS_OPTIONS = [
  { value: 30, label: "30 FPS — Standart" },
  { value: 60, label: "60 FPS — Yüksek Kalite" },
];

const SUBTITLE_ANIMATIONS = [
  { value: "none", label: "Animasyon Yok" },
  { value: "hype", label: "Hype (Slide-up + Zoom)" },
  { value: "explosive", label: "Explosive (Slide-left + Fire)" },
  { value: "vibrant", label: "Vibrant (Pop-in Bounce)" },
  { value: "minimal_anim", label: "Minimal (Renk Geçişi)" },
];

const SUBTITLE_FONTS = [
  { value: "inter", label: "Inter (Modern, Okunabilir)" },
  { value: "roboto", label: "Roboto (Temiz, Nötr)" },
  { value: "montserrat", label: "Montserrat (Geometric)" },
  { value: "oswald", label: "Oswald (Condensed, Kalın)" },
  { value: "bebas", label: "Bebas Neue (Display, Impact)" },
  { value: "serif", label: "Serif (Georgia, Klasik)" },
  { value: "sans", label: "Sans-Serif (Arial, Basit)" },
];

const SUBTITLE_BGS = [
  { value: "none", label: "Arka Plan Yok (Alt Gradient)" },
  { value: "box", label: "Kutu (Dikdörtgen)" },
  { value: "pill", label: "Kapsül (Yuvarlatılmış)" },
];

const KEN_BURNS_DIRECTIONS = [
  { value: "center", label: "Merkez (Varsayılan)" },
  { value: "pan-left", label: "Sola Pan" },
  { value: "pan-right", label: "Sağa Pan" },
  { value: "random", label: "Rastgele (Sahne başına köşe)" },
];

const VIDEO_EFFECTS = [
  { value: "none", label: "Efekt Yok" },
  { value: "vignette", label: "Vignette (Kenar Karartma)" },
  { value: "warm", label: "Sıcak Ton" },
  { value: "cool", label: "Soğuk Ton" },
  { value: "cinematic", label: "Sinematik (Letterbox)" },
];

// camelCase frontend key → snake_case backend key eşleştirmesi
const KEY_MAP: Partial<Record<string, string>> = {
  ttsProvider: "tts_provider",
  visualsProvider: "visuals_provider",
  subtitleStyle: "subtitle_style",
  videoResolution: "video_resolution",
  videoFps: "video_fps",
  subtitleAnimation: "subtitle_animation",
  subtitleFont: "subtitle_font",
  subtitleBg: "subtitle_bg",
  kenBurnsDirection: "ken_burns_direction",
  videoEffect: "video_effect",
  publishToYoutube: "publish_to_youtube",
  youtubePrivacy: "youtube_privacy",
};

const YOUTUBE_PRIVACY_OPTIONS = [
  { value: "private", label: "Gizli (Sadece sen)" },
  { value: "unlisted", label: "Liste Dışı (Link ile erişim)" },
  { value: "public", label: "Herkese Açık" },
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
  } = useSettingsStore();

  const addToast = useUIStore((s) => s.addToast);
  const autoSaveEnabled = useUIStore((s) => s.autoSaveEnabled);
  const setAutoSaveEnabled = useUIStore((s) => s.setAutoSaveEnabled);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<UserVideoDefaults>({ ...userDefaults });

  useEffect(() => {
    if (!loaded) {
      fetchResolvedSettings();
    }
  }, [loaded, fetchResolvedSettings]);

  useEffect(() => {
    setForm({ ...userDefaults });
  }, [userDefaults]);

  function isLocked(key: string): boolean {
    return lockedKeys.includes(key);
  }

  /** Admin-only ayarlar user panelde tamamen gizlenir (schema-driven). */
  function isHiddenFromUser(key: string): boolean {
    return isSettingAdminOnly(key);
  }

  const { shouldAutoSave, saveState, triggerSave } = useAutoSave();
  // saveState yalnızca son işlemin durumunu gösterir
  const autoSaving = saveState === "saving";
  const autoSaved = saveState === "saved";

  // Her select/toggle değişimi için tek key save fonksiyonu
  function buildKeySaveFn<K extends keyof UserVideoDefaults>(key: K, value: UserVideoDefaults[K]) {
    const backendKey = KEY_MAP[key] ?? key;
    return async () => {
      await api.post("/settings/user", {
        settings: [{ scope: "user" as const, scope_id: "", key: backendKey, value }],
      });
      setUserDefaults({ ...userDefaults, [key]: value });
    };
  }

  function handleChange<K extends keyof UserVideoDefaults>(
    key: K,
    value: UserVideoDefaults[K]
  ) {
    if (isLocked(key)) return;
    setForm((prev) => ({ ...prev, [key]: value }));
    if (shouldAutoSave && !isSettingAdminOnly(key as string)) {
      triggerSave(buildKeySaveFn(key, value));
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const allUserSettings = [
          { scope: "user" as const, scope_id: "", key: "language", value: form.language },
          { scope: "user" as const, scope_id: "", key: "tts_provider", value: form.ttsProvider },
          { scope: "user" as const, scope_id: "", key: "visuals_provider", value: form.visualsProvider },
          { scope: "user" as const, scope_id: "", key: "subtitle_style", value: form.subtitleStyle },
          { scope: "user" as const, scope_id: "", key: "video_resolution", value: form.videoResolution },
          { scope: "user" as const, scope_id: "", key: "video_fps", value: form.videoFps },
          { scope: "user" as const, scope_id: "", key: "subtitle_animation", value: form.subtitleAnimation },
          { scope: "user" as const, scope_id: "", key: "subtitle_font", value: form.subtitleFont },
          { scope: "user" as const, scope_id: "", key: "subtitle_bg", value: form.subtitleBg },
          { scope: "user" as const, scope_id: "", key: "ken_burns_direction", value: form.kenBurnsDirection },
          { scope: "user" as const, scope_id: "", key: "video_effect", value: form.videoEffect },
          { scope: "user" as const, scope_id: "", key: "publish_to_youtube", value: form.publishToYoutube },
          { scope: "user" as const, scope_id: "", key: "youtube_privacy", value: form.youtubePrivacy },
      ];
      const settingsPayload = {
        settings: allUserSettings.filter((s) => !isSettingAdminOnly(s.key)),
      };
      await api.post("/settings/user", settingsPayload);
      setUserDefaults(form);
      addToast({ type: "success", title: "Ayarlar kaydedildi" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ayarlar kaydedilemedi";
      addToast({ type: "error", title: "Kayıt başarısız", description: message });
    } finally {
      setSaving(false);
    }
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
          {/* Otomatik kayıt toggle */}
          <button
            onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors",
              autoSaveEnabled
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
            title={autoSaveEnabled ? "Otomatik kayıt açık — tıklayarak kapat" : "Otomatik kayıt kapalı — tıklayarak aç"}
          >
            {autoSaveEnabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
            Otomatik kayıt
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <RotateCcw size={12} />
            Sıfırla
          </button>
          {/* Auto-save açıksa durum göstergesi, kapalıysa Kaydet butonu */}
          {shouldAutoSave ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground">
              {autoSaving && <Loader2 size={12} className="animate-spin" />}
              {autoSaved && <CheckCircle2 size={12} className="text-emerald-400" />}
              {!autoSaving && !autoSaved && <CheckCircle2 size={12} className="text-muted-foreground/40" />}
              <span>{autoSaving ? "Kaydediliyor..." : autoSaved ? "Kaydedildi" : "Otomatik kayıt"}</span>
            </div>
          ) : (
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
          )}
        </div>
      </div>

      {/* Hata */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* ── Bölüm 1: Genel Ayarlar ── */}
      <div className="space-y-3">
        <SectionLabel icon={<Zap size={13} />} label="Genel Ayarlar" />

        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {/* Dil */}
          {!isHiddenFromUser("language") && (
          <SettingRow
            icon={<Globe size={14} />}
            label="İçerik Dili"
            description="Video içeriklerinin varsayılan dili"
            locked={isLocked("language")}
          >
            <SelectField
              value={form.language}
              onChange={(v) => handleChange("language", v)}
              options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
              locked={isLocked("language")}
            />
          </SettingRow>
          )}

          {/* TTS */}
          {!isHiddenFromUser("tts_provider") && (
          <SettingRow
            icon={<Mic size={14} />}
            label="Ses Sentezi (TTS)"
            description="Varsayılan konuşma sentezi sağlayıcısı"
            locked={isLocked("tts_provider")}
          >
            <SelectField
              value={form.ttsProvider}
              onChange={(v) => handleChange("ttsProvider", v)}
              options={TTS_PROVIDERS}
              locked={isLocked("tts_provider")}
            />
          </SettingRow>
          )}

          {/* Altyazı stili */}
          {!isHiddenFromUser("subtitle_style") && (
          <SettingRow
            icon={<Subtitles size={14} />}
            label="Altyazı Stili"
            description="Video altyazısının görünüm stili"
            locked={isLocked("subtitle_style")}
          >
            <SelectField
              value={form.subtitleStyle}
              onChange={(v) => handleChange("subtitleStyle", v)}
              options={SUBTITLE_STYLES}
              locked={isLocked("subtitle_style")}
              placeholder="Altyazı Stili"
            />
          </SettingRow>
          )}
        </div>
      </div>

      {/* ── Bölüm 2: Görsel & Video Tercihleri ── */}
      <div className="space-y-3">
        <SectionLabel icon={<Palette size={13} />} label="Görsel & Video Tercihleri" />

        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {/* Görsel kaynağı */}
          {!isHiddenFromUser("visuals_provider") && (
          <SettingRow
            icon={<Monitor size={14} />}
            label="Görsel Kaynağı"
            description="Sahneler için kullanılacak stok medya sağlayıcısı"
            locked={isLocked("visuals_provider")}
          >
            <SelectField
              value={form.visualsProvider}
              onChange={(v) => handleChange("visualsProvider", v)}
              options={VISUALS_PROVIDERS}
              locked={isLocked("visuals_provider")}
            />
          </SettingRow>
          )}

          {/* Çözünürlük */}
          {!isHiddenFromUser("video_resolution") && (
          <SettingRow
            icon={<Monitor size={14} />}
            label="Video Çözünürlüğü"
            description="Çıktı video boyutu ve yönü"
            locked={isLocked("video_resolution")}
          >
            <SelectField
              value={form.videoResolution}
              onChange={(v) => handleChange("videoResolution", v)}
              options={RESOLUTIONS}
              locked={isLocked("video_resolution")}
            />
          </SettingRow>
          )}

          {/* FPS */}
          {!isHiddenFromUser("video_fps") && (
          <SettingRow
            icon={<Zap size={14} />}
            label="Kare Hızı"
            description="Video akıcılığı için FPS seçimi"
            locked={isLocked("video_fps")}
          >
            <SelectField
              value={String(form.videoFps)}
              onChange={(v) => handleChange("videoFps", Number(v))}
              options={FPS_OPTIONS.map((f) => ({
                value: String(f.value),
                label: f.label,
              }))}
              locked={isLocked("video_fps")}
            />
          </SettingRow>
          )}

          {/* Ken Burns Yönü */}
          {!isHiddenFromUser("ken_burns_direction") && (
          <SettingRow
            icon={<Monitor size={14} />}
            label="Ken Burns Yönü"
            description="Sahne görselinde zoom hareket yönü"
            locked={isLocked("ken_burns_direction")}
          >
            <SelectField
              value={form.kenBurnsDirection}
              onChange={(v) => handleChange("kenBurnsDirection", v)}
              options={KEN_BURNS_DIRECTIONS}
              locked={isLocked("ken_burns_direction")}
            />
          </SettingRow>
          )}

          {/* Video Efekti */}
          {!isHiddenFromUser("video_effect") && (
          <SettingRow
            icon={<Palette size={14} />}
            label="Video Renk Efekti"
            description="Sahne üzerine uygulanan görsel filtre"
            locked={isLocked("video_effect")}
          >
            <SelectField
              value={form.videoEffect}
              onChange={(v) => handleChange("videoEffect", v)}
              options={VIDEO_EFFECTS}
              locked={isLocked("video_effect")}
            />
          </SettingRow>
          )}

          {/* Altyazı Animasyonu */}
          {!isHiddenFromUser("subtitle_animation") && (
          <SettingRow
            icon={<Subtitles size={14} />}
            label="Altyazı Animasyonu"
            description="Karaoke tarzı kelime giriş efekti"
            locked={isLocked("subtitle_animation")}
          >
            <SelectField
              value={form.subtitleAnimation}
              onChange={(v) => handleChange("subtitleAnimation", v)}
              options={SUBTITLE_ANIMATIONS}
              locked={isLocked("subtitle_animation")}
            />
          </SettingRow>
          )}

          {/* Altyazı Fontu */}
          {!isHiddenFromUser("subtitle_font") && (
          <SettingRow
            icon={<Subtitles size={14} />}
            label="Altyazı Fontu"
            description="Altyazı metni için kullanılacak font ailesi"
            locked={isLocked("subtitle_font")}
          >
            <SelectField
              value={form.subtitleFont}
              onChange={(v) => handleChange("subtitleFont", v)}
              options={SUBTITLE_FONTS}
              locked={isLocked("subtitle_font")}
            />
          </SettingRow>
          )}

          {/* Altyazı Arka Planı */}
          {!isHiddenFromUser("subtitle_bg") && (
          <SettingRow
            icon={<Subtitles size={14} />}
            label="Altyazı Arka Planı"
            description="Altyazı metninin arkasına eklenen konteyner stili"
            locked={isLocked("subtitle_bg")}
          >
            <SelectField
              value={form.subtitleBg}
              onChange={(v) => handleChange("subtitleBg", v)}
              options={SUBTITLE_BGS}
              locked={isLocked("subtitle_bg")}
            />
          </SettingRow>
          )}
        </div>
      </div>

      {/* ── Bölüm 3: Yayın & Ek Özellikler (henüz aktif değil) ── */}
      <div className="space-y-3">
        <SectionLabel icon={<Share2 size={13} />} label="Yayın & Ek Özellikler" />

        <div className="rounded-xl border border-border bg-card divide-y divide-border opacity-60">
          <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/10">
            <p className="text-[11px] text-amber-400 font-medium">
              Bu ayarlar henüz backend pipeline'da aktif değil. Yakında kullanıma sunulacak.
            </p>
          </div>

          {/* SEO Metadata */}
          <SettingRow
            icon={<Settings size={14} />}
            label="SEO Metadata"
            description="Başlık, açıklama ve etiket otomatik üretimi"
            locked
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Metadata Üretimi Aktif</span>
              <ToggleSwitch
                checked={form.metadataEnabled}
                onChange={() => {}}
                locked
              />
            </div>
          </SettingRow>

          {/* Thumbnail */}
          <SettingRow
            icon={<Monitor size={14} />}
            label="Thumbnail"
            description="Video kapak resmi otomatik üretimi"
            locked
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Thumbnail Üretimi Aktif</span>
              <ToggleSwitch
                checked={form.thumbnailEnabled}
                onChange={() => {}}
                locked
              />
            </div>
          </SettingRow>

          {/* Platform yayını */}
          <SettingRow
            icon={<Share2 size={14} />}
            label="Platform Yayını"
            description="Tamamlanan videoları platforma otomatik yükle"
            locked={isLocked("publish_to_youtube")}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Otomatik Yayınla</span>
                <ToggleSwitch
                  checked={form.publishToYoutube}
                  onChange={(v) => handleChange("publishToYoutube", v)}
                  locked={isLocked("publish_to_youtube")}
                />
              </div>
              {form.publishToYoutube && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Gizlilik</span>
                  <select
                    value={form.youtubePrivacy}
                    onChange={(e) => handleChange("youtubePrivacy", e.target.value as "private" | "unlisted" | "public")}
                    disabled={isLocked("youtube_privacy")}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {YOUTUBE_PRIVACY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </SettingRow>
        </div>
      </div>

      {/* Kaydet butonu (bottom) — değişiklik varsa belirgin */}
      {hasChanges && (
        <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="text-xs text-muted-foreground">Kaydedilmemiş değişiklik var</p>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Yardımcı Bileşenler ─────────────────────────────────────────────────────

function SectionLabel({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-1">
      <span className="text-muted-foreground">{icon}</span>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function SettingRow({
  icon,
  label,
  description,
  locked,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  locked: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
      {/* Sol */}
      <div className="flex items-start gap-2 sm:w-48 shrink-0">
        <span className="mt-0.5 text-muted-foreground shrink-0">{icon}</span>
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium text-foreground">{label}</p>
            {locked && <Lock size={10} className="text-amber-400" />}
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{description}</p>
        </div>
      </div>
      {/* Sağ */}
      <div className="flex-1">{children}</div>
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
  locked,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  locked: boolean;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={locked}
        className={cn(
          "w-full rounded-lg border bg-input px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring transition-colors appearance-none",
          locked
            ? "border-border opacity-60 cursor-not-allowed"
            : "border-border"
        )}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {locked && (
        <Lock
          size={12}
          className="absolute right-8 top-1/2 -translate-y-1/2 text-amber-400 pointer-events-none"
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
    </button>
  );
}
