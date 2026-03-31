/**
 * ProviderManager — Provider (sağlayıcı) yönetimi sayfası.
 *
 * Faz 10.7 değişiklikleri:
 *   • Trash2 / delete butonları TAMAMEN kaldırıldı
 *   • FallbackOrderEditor: serbest metin yerine checkbox multi-select
 *   • Kullanıcı provider anahtarlarını ezberlemek zorunda değil
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Plug,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  RefreshCw,
  Save,
  ChevronDown,
  ChevronUp,
  Cpu,
  Mic,
  ImageIcon,
  CheckCircle2,
} from "lucide-react";
import { useAdminStore, type SettingRecord } from "@/stores/adminStore";
import { type Toast } from "@/stores/uiStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { useScopedKeyboardNavigation } from "@/hooks/useScopedKeyboardNavigation";
import { useRovingTabindex } from "@/hooks/useRovingTabindex";

// ─── Provider tanımları ──────────────────────────────────────────────────────

interface ProviderDef {
  key: string;
  label: string;
  category: "llm" | "tts" | "visuals";
  description: string;
  commonKeys: { key: string; label: string; sensitive?: boolean; placeholder?: string }[];
}

const PROVIDERS: ProviderDef[] = [
  {
    key: "kieai",
    label: "kie.ai (Gemini 2.5 Flash)",
    category: "llm",
    description: "Birincil LLM — OpenAI-uyumlu Gemini 2.5 Flash proxy",
    commonKeys: [
      { key: "api_key", label: "API Key", sensitive: true, placeholder: "kie-..." },
    ],
  },
  {
    key: "gemini",
    label: "Google Gemini (Yedek)",
    category: "llm",
    description: "Google Gemini API — kie.ai başarısız olursa yedek",
    commonKeys: [
      { key: "api_key", label: "API Key", sensitive: true, placeholder: "AIza..." },
      { key: "model", label: "Model", placeholder: "gemini-2.0-flash" },
    ],
  },
  {
    key: "openai_llm",
    label: "OpenAI LLM",
    category: "llm",
    description: "Alternatif LLM provider",
    commonKeys: [
      { key: "api_key", label: "API Key", sensitive: true, placeholder: "sk-..." },
      { key: "model", label: "Model", placeholder: "gpt-4o-mini" },
    ],
  },
  {
    key: "elevenlabs",
    label: "ElevenLabs",
    category: "tts",
    description: "Premium kalite ses sentezi",
    commonKeys: [
      { key: "api_key", label: "API Key", sensitive: true, placeholder: "xi-..." },
      { key: "voice_id", label: "Voice ID", placeholder: "21m00Tcm4TlvDq8ikWAM" },
      { key: "model_id", label: "Model", placeholder: "eleven_multilingual_v2" },
    ],
  },
  {
    key: "openai_tts",
    label: "OpenAI TTS",
    category: "tts",
    description: "OpenAI ses sentezi",
    commonKeys: [
      { key: "api_key", label: "API Key", sensitive: true, placeholder: "sk-..." },
      { key: "voice", label: "Voice", placeholder: "alloy" },
      { key: "model", label: "Model", placeholder: "tts-1" },
    ],
  },
  {
    key: "edge_tts",
    label: "Edge TTS",
    category: "tts",
    description: "Ücretsiz Microsoft Edge TTS",
    commonKeys: [
      { key: "voice", label: "Voice ID", placeholder: "tr-TR-EmelNeural" },
    ],
  },
  {
    key: "pexels",
    label: "Pexels",
    category: "visuals",
    description: "Ücretsiz stok video ve fotoğraf",
    commonKeys: [
      { key: "api_key", label: "API Key", sensitive: true, placeholder: "..." },
    ],
  },
  {
    key: "pixabay",
    label: "Pixabay",
    category: "visuals",
    description: "Ücretsiz stok medya",
    commonKeys: [
      { key: "api_key", label: "API Key", sensitive: true, placeholder: "..." },
    ],
  },
];

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  llm: { label: "LLM (Dil Modeli)", icon: <Cpu size={16} />, color: "text-purple-400" },
  tts: { label: "TTS (Ses Sentezi)", icon: <Mic size={16} />, color: "text-blue-400" },
  visuals: { label: "Görseller", icon: <ImageIcon size={16} />, color: "text-emerald-400" },
};

// Fallback seçenekleri — kullanıcı dostu isimlerle
// available: backend'de gerçekten kayıtlı olan provider'lar (providers/__init__.py register çağrıları)
// available=false olanlar UI'da gösterilir ama seçilemez — gerçekte kayıtlı değiller
const FALLBACK_OPTIONS = {
  tts: [
    { value: "edge_tts", label: "Edge TTS (Ücretsiz)", available: true },
    { value: "elevenlabs", label: "ElevenLabs (Premium)", available: false },
    { value: "openai_tts", label: "OpenAI TTS", available: false },
  ],
  llm: [
    { value: "kieai", label: "kie.ai (Gemini Proxy)", available: true },
    { value: "gemini", label: "Google Gemini (Native)", available: false },
    { value: "openai_llm", label: "OpenAI LLM", available: false },
  ],
  visuals: [
    { value: "pexels", label: "Pexels (Stok Video)", available: true },
    { value: "pixabay", label: "Pixabay", available: false },
  ],
};

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function ProviderManager() {
  const { settings, loading, error, fetchSettings } =
    useAdminStore();
  const addToast = useUIStore((s) => s.addToast);

  const [selectedProvider, setSelectedProvider] = useState<string>("kieai");
  const [expandedProvider, setExpandedProvider] = useState<string | null>("kieai");

  const [providerSettingsMap, setProviderSettingsMap] = useState<Record<string, SettingRecord[]>>({});
  const [adminSettings, setAdminSettings] = useState<SettingRecord[]>([]);

  // ── Klavye Navigasyonu ──────────────────────────────────────────────────
  const listRef = useRef<HTMLDivElement>(null);

  const notifyKeyboardRef = useRef<(() => void) | undefined>(undefined);

  const { focusedIdx, setFocusedIdx, scopeId } = useScopedKeyboardNavigation({
    itemCount: PROVIDERS.length,
    scrollRef: listRef as React.RefObject<HTMLElement | null>,
    homeEnd: true,
    onEnter: (idx) => {
      handleToggleExpand(PROVIDERS[idx].key);
    },
    onArrowRight: (idx) => {
      const key = PROVIDERS[idx].key;
      if (expandedProvider !== key) handleToggleExpand(key);
    },
    onArrowLeft: (idx) => {
      const key = PROVIDERS[idx].key;
      if (expandedProvider === key) setExpandedProvider(null);
    },
    onEscape: () => {
      if (expandedProvider !== null) {
        setExpandedProvider(null);
      }
    },
    onKeyboardMove: () => notifyKeyboardRef.current?.(),
  });

  const { getTabIndex, notifyKeyboard } = useRovingTabindex({
    focusedIdx,
    itemCount: PROVIDERS.length,
    containerRef: listRef as React.RefObject<HTMLElement | null>,
  });

  notifyKeyboardRef.current = notifyKeyboard;

  const loadProviderSettings = useCallback(
    async (providerKey: string) => {
      await fetchSettings("provider", providerKey);
    },
    [fetchSettings]
  );

  // Mount'ta admin ayarlarını çek (FallbackOrderEditor için)
  useEffect(() => {
    (async () => {
      const pin = localStorage.getItem("cm-admin-pin") ?? "0000";
      const query = new URLSearchParams({ scope: "admin", scope_id: "" });
      try {
        const { api: apiClient } = await import("@/api/client");
        const data = await apiClient.get<SettingRecord[]>(
          `/settings?${query.toString()}`,
          { adminPin: pin }
        );
        setAdminSettings(data);
      } catch {
        // sessizce devam
      }
    })();
  }, []);

  useEffect(() => {
    loadProviderSettings(selectedProvider);
  }, [selectedProvider, loadProviderSettings]);

  useEffect(() => {
    setProviderSettingsMap((prev) => ({
      ...prev,
      [selectedProvider]: settings,
    }));
  }, [settings, selectedProvider]);

  function handleToggleExpand(providerKey: string) {
    if (expandedProvider === providerKey) {
      setExpandedProvider(null);
    } else {
      setExpandedProvider(providerKey);
      setSelectedProvider(providerKey);
    }
  }

  const categories = ["llm", "tts", "visuals"] as const;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug size={20} className="text-emerald-400" />
          <h2 className="text-lg font-semibold text-foreground">Provider Yönetimi</h2>
        </div>
        <button
          onClick={() => loadProviderSettings(selectedProvider)}
          disabled={loading}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Yenile
        </button>
      </div>

      {/* Fallback sırası — multi-select */}
      <div className="rounded-xl border border-border bg-card p-4">
        <FallbackOrderEditor adminSettings={adminSettings} addToast={addToast} />
      </div>

      {/* Hata */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Kategoriler */}
      <div ref={listRef} role="tree" aria-label="Provider listesi">
      {categories.map((cat) => {
        const catConfig = CATEGORY_CONFIG[cat];
        const catProviders = PROVIDERS.filter((p) => p.category === cat);

        return (
          <div key={cat} className="space-y-2 mb-5">
            <div className="flex items-center gap-2 px-1" aria-hidden="true">
              <span className={catConfig.color}>{catConfig.icon}</span>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {catConfig.label}
              </p>
            </div>

            <div className="space-y-2" role="group" aria-label={catConfig.label}>
              {catProviders.map((provider) => {
                const isExpanded = expandedProvider === provider.key;
                const provSettings = providerSettingsMap[provider.key] ?? [];
                const globalIdx = PROVIDERS.findIndex((p) => p.key === provider.key);
                const isFocused = focusedIdx === globalIdx;
                const itemId    = `${scopeId}-prov-${globalIdx}`;
                const panelId   = `${scopeId}-prov-panel-${globalIdx}`;

                return (
                  <div
                    key={provider.key}
                    id={itemId}
                    data-nav-row
                    role="treeitem"
                    aria-expanded={isExpanded}
                    aria-selected={isFocused}
                    tabIndex={getTabIndex(globalIdx)}
                    onMouseEnter={() => setFocusedIdx(globalIdx)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); handleToggleExpand(provider.key); }
                    }}
                    className={cn(
                      "rounded-xl border bg-card overflow-hidden transition-colors",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                      isExpanded ? "border-primary/30" : "border-border",
                      isFocused && !isExpanded && "ring-1 ring-inset ring-primary/30 bg-accent/20"
                    )}
                  >
                    <button
                      onClick={() => handleToggleExpand(provider.key)}
                      aria-expanded={isExpanded}
                      aria-controls={panelId}
                      aria-label={`${provider.label} ${isExpanded ? "ayarlarını gizle" : "ayarlarını göster"}`}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{provider.label}</p>
                        <p className="text-xs text-muted-foreground">{provider.description}</p>
                      </div>

                      {provSettings.length > 0 && (
                        <span className="shrink-0 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">
                          {provSettings.length} ayar
                        </span>
                      )}

                      {isExpanded ? (
                        <ChevronUp size={14} className="shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
                      )}
                    </button>

                    {isExpanded && (
                      <div id={panelId} role="group" aria-label={`${provider.label} ayarları`}>
                        <ProviderSettingsPanel
                          provider={provider}
                          settings={selectedProvider === provider.key ? settings : provSettings}
                          loading={loading && selectedProvider === provider.key}
                          onReload={() => loadProviderSettings(provider.key)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      </div>{/* /listRef */}
    </div>
  );
}

// ─── Provider Ayarları Paneli ────────────────────────────────────────────────

function ProviderSettingsPanel({
  provider,
  settings: providerSettings,
  loading,
  onReload,
}: {
  provider: ProviderDef;
  settings: SettingRecord[];
  loading: boolean;
  onReload: () => void;
}) {
  const { createSetting, updateSetting, deleteSetting } = useAdminStore();
  const addToast = useUIStore((s) => s.addToast);

  async function handleSaveKey(key: string, value: string) {
    const existingSetting = providerSettings.find((s) => s.key === key);
    const trimmed = value.trim();

    // Boş değer → kaydı sil (unset)
    if (trimmed === "") {
      if (existingSetting) {
        const ok = await deleteSetting(existingSetting.id);
        if (ok) {
          addToast({ type: "info", title: "Ayar silindi", description: `${provider.label}: ${key} kaldırıldı.` });
          onReload();
        } else {
          addToast({ type: "error", title: "Silinemedi" });
        }
        // API key ise admin scope'daki kopyayı da temizle
        if (key === "api_key") {
          // admin scope kopyasını silmeye çalış — hata sessizce görmezden gelinir
          try {
            const pin = localStorage.getItem("cm-admin-pin") ?? "0000";
            const q = new URLSearchParams({ scope: "admin", scope_id: "" });
            const existing = await fetch(`/api/settings?${q.toString()}`, {
              headers: { "X-Admin-Pin": pin },
            }).then((r) => r.json() as Promise<SettingRecord[]>);
            const adminRecord = existing.find((r) => r.key === `${provider.key}_api_key`);
            if (adminRecord) {
              await deleteSetting(adminRecord.id);
            }
          } catch { /* sessiz */ }
        }
      }
      return;
    }

    if (existingSetting) {
      const result = await updateSetting(existingSetting.id, { value: trimmed });
      if (result) {
        addToast({ type: "success", title: "Güncellendi", description: `${provider.label}: ${key}` });
        onReload();
      } else {
        addToast({ type: "error", title: "Güncellenemedi" });
      }
    } else {
      const result = await createSetting({
        scope: "provider",
        scope_id: provider.key,
        key,
        value: trimmed,
        locked: key === "api_key",
        description: `${provider.label} ${key}`,
      });
      if (result) {
        addToast({ type: "success", title: "Kaydedildi", description: `${provider.label}: ${key}` });
        onReload();
      } else {
        addToast({ type: "error", title: "Kaydedilemedi" });
      }
    }

    // API key ise: admin scope'a da senkronize et
    if (key === "api_key") {
      const globalKey = `${provider.key}_api_key`;
      await createSetting({
        scope: "admin",
        scope_id: "",
        key: globalKey,
        value: trimmed,
        locked: true,
        description: `${provider.label} API anahtarı (provider panelinden senkronize)`,
      });
    }
  }

  return (
    <div className="border-t border-border px-4 py-3 space-y-3">
      {loading ? (
        <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin mr-2" />
          Yükleniyor...
        </div>
      ) : (
        <>
          {provider.commonKeys.map((ck) => {
            const existingSetting = providerSettings.find((s) => s.key === ck.key);
            const currentValue = existingSetting
              ? typeof existingSetting.value === "string"
                ? existingSetting.value
                : JSON.stringify(existingSetting.value)
              : "";

            return (
              <ProviderKeyRow
                key={ck.key}
                label={ck.label}
                fieldKey={ck.key}
                value={currentValue}
                sensitive={ck.sensitive}
                placeholder={ck.placeholder}
                onSave={(val) => handleSaveKey(ck.key, val)}
              />
            );
          })}

          {/* DB'deki ek ayarlar (commonKeys'te olmayanlar) */}
          {providerSettings
            .filter((s) => !provider.commonKeys.some((ck) => ck.key === s.key))
            .map((s) => (
              <ProviderKeyRow
                key={s.id}
                label={s.key}
                fieldKey={s.key}
                value={typeof s.value === "string" ? s.value : JSON.stringify(s.value)}
                sensitive={s.key.includes("key") || s.key.includes("secret")}
                onSave={(val) => handleSaveKey(s.key, val)}
              />
            ))}

        </>
      )}
    </div>
  );
}

// ─── Provider Anahtar Satırı (Trash2 kaldırıldı) ───────────────────────────

function ProviderKeyRow({
  label,
  fieldKey: _fieldKey,
  value,
  sensitive,
  placeholder,
  onSave,
}: {
  label: string;
  fieldKey: string;
  value: string;
  sensitive?: boolean;
  placeholder?: string;
  onSave: (value: string) => void;
}) {
  const [editValue, setEditValue] = useState(value);
  const [showSensitive, setShowSensitive] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setEditValue(value);
    setDirty(false);
  }, [value]);

  function handleChange(newVal: string) {
    setEditValue(newVal);
    setDirty(newVal !== value);
  }

  async function handleSave() {
    setSaving(true);
    onSave(editValue);
    setSaving(false);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex items-center gap-3">
      <label className="w-24 shrink-0 text-xs text-muted-foreground">{label}</label>
      <div className="relative flex-1">
        <input
          type={sensitive && !showSensitive ? "password" : "text"}
          value={editValue}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && dirty && handleSave()}
          placeholder={placeholder}
          className={cn(
            "w-full rounded-lg border bg-input px-3 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring transition-colors",
            dirty ? "border-primary/50" : "border-border"
          )}
        />
        {sensitive && (
          <button
            type="button"
            onClick={() => setShowSensitive(!showSensitive)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showSensitive ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        )}
      </div>

      {/* Kaydet / Kaydedildi butonu */}
      {(dirty || saved) && (
        <button
          onClick={handleSave}
          disabled={saving || (!dirty && !saved)}
          className={cn(
            "shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-all",
            saved && !dirty
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          )}
        >
          {saving ? (
            <Loader2 size={10} className="animate-spin" />
          ) : saved && !dirty ? (
            <CheckCircle2 size={10} />
          ) : (
            <Save size={10} />
          )}
        </button>
      )}
    </div>
  );
}

// ─── Fallback Sıra Düzenleyici (Multi-Select) ──────────────────────────────

function FallbackOrderEditor({
  adminSettings,
  addToast,
}: {
  adminSettings: SettingRecord[];
  addToast: (t: Omit<Toast, "id">) => void;
}) {
  const { createSetting } = useAdminStore();

  // Başlangıç state'leri BOŞ — DB'den gelince doldur
  const [ttsSelected, setTtsSelected] = useState<string[]>([]);
  const [llmSelected, setLlmSelected] = useState<string[]>([]);
  const [visualsSelected, setVisualsSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // DB değerlerini (adminSettings prop'u değişince) sync et
  useEffect(() => {
    for (const setting of adminSettings) {
      const val = Array.isArray(setting.value)
        ? (setting.value as string[])
        : typeof setting.value === "string"
          ? setting.value.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [];
      if (setting.key === "tts_fallback_order") setTtsSelected(val);
      if (setting.key === "llm_fallback_order") setLlmSelected(val);
      if (setting.key === "visuals_fallback_order") setVisualsSelected(val);
    }
  }, [adminSettings]);

  // isDirty: DB'deki değerlerle karşılaştır
  function getDbVal(key: string): string[] {
    const setting = adminSettings.find((s) => s.key === key);
    if (!setting) return [];
    if (Array.isArray(setting.value)) return setting.value as string[];
    if (typeof setting.value === "string")
      return setting.value.split(",").map((s) => s.trim()).filter(Boolean);
    return [];
  }

  const arrEq = (a: string[], b: string[]) =>
    a.length === b.length && a.every((v, i) => v === b[i]);

  const isDirty =
    !arrEq(ttsSelected, getDbVal("tts_fallback_order")) ||
    !arrEq(llmSelected, getDbVal("llm_fallback_order")) ||
    !arrEq(visualsSelected, getDbVal("visuals_fallback_order"));

  async function handleSaveFallback() {
    setSaving(true);

    const orders = [
      { key: "tts_fallback_order", value: ttsSelected },
      { key: "llm_fallback_order", value: llmSelected },
      { key: "visuals_fallback_order", value: visualsSelected },
    ];

    let allOk = true;
    for (const order of orders) {
      const result = await createSetting({
        scope: "admin",
        scope_id: "",
        key: order.key,
        value: order.value,
        locked: true,
        description: `${order.key.replace("_fallback_order", "")} provider fallback sırası`,
      });
      if (!result) allOk = false;
    }

    setSaving(false);
    if (allOk) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      addToast({ type: "success", title: "Fallback sırası kaydedildi" });
    } else {
      addToast({ type: "error", title: "Kaydedilemedi" });
    }
  }

  function toggleOption(
    current: string[],
    setter: (v: string[]) => void,
    value: string
  ) {
    if (current.includes(value)) {
      setter(current.filter((s) => s !== value));
    } else {
      setter([...current, value]);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Fallback Sırası
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Provider başarısız olduğunda sıradaki denenir. Aktif olanları seçin.
          </p>
        </div>
        <button
          onClick={handleSaveFallback}
          disabled={saving || !isDirty}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
            saved && !isDirty
              ? "bg-emerald-500/15 text-emerald-400"
              : isDirty
              ? "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
          )}
        >
          {saving ? (
            <Loader2 size={12} className="animate-spin" />
          ) : saved && !isDirty ? (
            <CheckCircle2 size={12} />
          ) : (
            <Save size={12} />
          )}
          {saved && !isDirty ? "Kaydedildi" : "Sırayı Kaydet"}
        </button>
      </div>

      <div className="space-y-3">
        {/* TTS */}
        <FallbackGroup
          label="TTS"
          icon={<Mic size={12} />}
          iconColor="text-blue-400"
          options={FALLBACK_OPTIONS.tts}
          selected={ttsSelected}
          onToggle={(v) => toggleOption(ttsSelected, setTtsSelected, v)}
        />

        {/* LLM */}
        <FallbackGroup
          label="LLM"
          icon={<Cpu size={12} />}
          iconColor="text-purple-400"
          options={FALLBACK_OPTIONS.llm}
          selected={llmSelected}
          onToggle={(v) => toggleOption(llmSelected, setLlmSelected, v)}
        />

        {/* Görseller */}
        <FallbackGroup
          label="Görseller"
          icon={<ImageIcon size={12} />}
          iconColor="text-emerald-400"
          options={FALLBACK_OPTIONS.visuals}
          selected={visualsSelected}
          onToggle={(v) => toggleOption(visualsSelected, setVisualsSelected, v)}
        />
      </div>
    </div>
  );
}

function FallbackGroup({
  label,
  icon,
  iconColor,
  options,
  selected,
  onToggle,
}: {
  label: string;
  icon: React.ReactNode;
  iconColor: string;
  options: { value: string; label: string; available: boolean }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("flex items-center gap-1 w-20 shrink-0", iconColor)}>
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = selected.includes(opt.value);
          const order = selected.indexOf(opt.value) + 1;
          const unavailable = !opt.available;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={unavailable}
              onClick={() => !unavailable && onToggle(opt.value)}
              title={unavailable ? "Bu provider henüz sisteme entegre edilmedi" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-all",
                unavailable
                  ? "cursor-not-allowed border-dashed border-border/40 bg-transparent text-muted-foreground/40 opacity-60"
                  : active
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border bg-input text-muted-foreground hover:border-border/80 hover:text-foreground"
              )}
            >
              {unavailable && (
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/20" />
              )}
              {!unavailable && active && (
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                  {order}
                </span>
              )}
              {!unavailable && !active && (
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
              )}
              {opt.label}
              {unavailable && (
                <span className="ml-0.5 text-[9px] text-muted-foreground/50">(yakında)</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
