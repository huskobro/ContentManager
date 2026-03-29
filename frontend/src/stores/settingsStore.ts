/**
 * Settings Store — kullanıcı tercihlerinin frontend tarafındaki önbelleği.
 *
 * Backend'deki 5-katmanlı konfigürasyon sisteminden çözümlenmiş ayarları
 * çeker ve kullanıcı override'larını localStorage'da saklar.
 *
 * API Entegrasyonu:
 *   fetchResolvedSettings() → GET /api/settings/resolved
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/api/client";

// ─── Tipler ───────────────────────────────────────────────────────────────────

export interface UserVideoDefaults {
  language: string;           // "tr" | "en" | "de" | ...
  ttsProvider: string;        // "edge_tts" | "elevenlabs" | "openai_tts"
  ttsVoiceId: string;
  visualsProvider: string;    // "pexels" | "pixabay"
  subtitleStyle: string;      // "standard" | "neon_blue" | "gold" | "minimal" | "hormozi"
  subtitleEnabled: boolean;
  videoResolution: string;    // "1920x1080" | "1080x1920"
  videoFps: number;           // 30 | 60
  metadataEnabled: boolean;   // SEO metadata üretimi
  thumbnailEnabled: boolean;
  publishToYoutube: boolean;
  youtubePrivacy: "private" | "unlisted" | "public";
}

interface ResolvedSettingsResponse {
  settings: Record<string, unknown>;
  locked_keys: string[];
}

interface SettingsState {
  /** Backend'den yüklenen kullanıcı override'ları */
  userDefaults: UserVideoDefaults;

  /** Backend'den çözümlenmiş ham ayarlar (tüm katmanlar uygulanmış) */
  resolvedSettings: Record<string, unknown>;

  /** Admin tarafından kilitlenmiş anahtarlar */
  lockedKeys: string[];

  /** Ayarlar backend'den yüklendi mi? */
  loaded: boolean;

  /** Yükleme hatası */
  error: string | null;

  // ── Actions ───────────────────────────────────────────────────────────────
  setUserDefaults: (defaults: Partial<UserVideoDefaults>) => void;
  setLoaded: (loaded: boolean) => void;

  /** Tek bir ayar değerini güncelle */
  patchUserDefault: <K extends keyof UserVideoDefaults>(
    key: K,
    value: UserVideoDefaults[K]
  ) => void;

  /** Backend'den 5 katmanlı çözümlenmiş ayarları çeker */
  fetchResolvedSettings: (moduleKey?: string) => Promise<void>;
}

// ─── Varsayılan değerler ──────────────────────────────────────────────────────

const DEFAULT_USER_SETTINGS: UserVideoDefaults = {
  language: "tr",
  ttsProvider: "edge_tts",
  ttsVoiceId: "tr-TR-EmelNeural",
  visualsProvider: "pexels",
  subtitleStyle: "standard",
  subtitleEnabled: true,
  videoResolution: "1920x1080",
  videoFps: 30,
  metadataEnabled: true,
  thumbnailEnabled: false,
  publishToYoutube: false,
  youtubePrivacy: "private",
};

// ─── Yardımcı: Backend ayarlarını UserVideoDefaults'a eşle ──────────────────

function mapResolvedToDefaults(
  resolved: Record<string, unknown>,
  current: UserVideoDefaults
): Partial<UserVideoDefaults> {
  const mapped: Partial<UserVideoDefaults> = {};

  if (typeof resolved.language === "string") mapped.language = resolved.language;
  if (typeof resolved.tts_provider === "string") mapped.ttsProvider = resolved.tts_provider;
  if (typeof resolved.visuals_provider === "string") mapped.visualsProvider = resolved.visuals_provider;
  if (typeof resolved.subtitle_style === "string") mapped.subtitleStyle = resolved.subtitle_style;
  if (typeof resolved.video_resolution === "string") mapped.videoResolution = resolved.video_resolution;
  if (typeof resolved.video_fps === "number") mapped.videoFps = resolved.video_fps;

  return mapped;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      userDefaults: DEFAULT_USER_SETTINGS,
      resolvedSettings: {},
      lockedKeys: [],
      loaded: false,
      error: null,

      setUserDefaults: (defaults) =>
        set((s) => ({
          userDefaults: { ...s.userDefaults, ...defaults },
          loaded: true,
        })),

      setLoaded: (loaded) => set({ loaded }),

      patchUserDefault: (key, value) =>
        set((s) => ({
          userDefaults: { ...s.userDefaults, [key]: value },
        })),

      fetchResolvedSettings: async (moduleKey) => {
        try {
          const query = moduleKey ? `?module_key=${encodeURIComponent(moduleKey)}` : "";
          const data = await api.get<ResolvedSettingsResponse>(
            `/settings/resolved${query}`
          );

          const current = get().userDefaults;
          const mapped = mapResolvedToDefaults(data.settings, current);

          set({
            resolvedSettings: data.settings,
            lockedKeys: data.locked_keys,
            userDefaults: { ...current, ...mapped },
            loaded: true,
            error: null,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Ayarlar yüklenemedi";
          set({ error: message, loaded: true });
        }
      },
    }),
    {
      name: "cm-settings",
      partialize: (s) => ({ userDefaults: s.userDefaults }),
    }
  )
);
