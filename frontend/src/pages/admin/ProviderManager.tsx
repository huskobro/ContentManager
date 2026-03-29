/**
 * ProviderManager — Provider (sağlayıcı) yönetimi sayfası.
 *
 * scope="provider" olan ayarların yönetimi.
 * LLM, TTS ve Görsel sağlayıcılarının:
 *   • API anahtarlarını (maskeli input)
 *   • Model/voice tercihlerini
 *   • Fallback öncelik sırasını yönetir
 */

import { useEffect, useState, useCallback } from "react";
import {
  Plug,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  RefreshCw,
  Save,
  X,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Cpu,
  Mic,
  ImageIcon,
} from "lucide-react";
import { useAdminStore, type SettingRecord } from "@/stores/adminStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

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
    key: "gemini",
    label: "Google Gemini",
    category: "llm",
    description: "Script ve metadata üretimi için LLM",
    commonKeys: [
      { key: "api_key", label: "API Key", sensitive: true, placeholder: "AIza..." },
      { key: "model", label: "Model", placeholder: "gemini-2.5-flash" },
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

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function ProviderManager() {
  const { settings, loading, error, fetchSettings, createSetting, updateSetting, deleteSetting } =
    useAdminStore();
  const addToast = useUIStore((s) => s.addToast);

  const [selectedProvider, setSelectedProvider] = useState<string>("gemini");
  const [expandedProvider, setExpandedProvider] = useState<string | null>("gemini");

  // Provider ayarları cache
  const [providerSettingsMap, setProviderSettingsMap] = useState<Record<string, SettingRecord[]>>(
    {}
  );

  const loadProviderSettings = useCallback(
    async (providerKey: string) => {
      await fetchSettings("provider", providerKey);
    },
    [fetchSettings]
  );

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

  // Kategorilere göre grupla
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

      {/* Fallback sırası bilgisi */}
      <div className="rounded-xl border border-border bg-card p-4">
        <FallbackOrderEditor addToast={addToast} />
      </div>

      {/* Hata */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Kategoriler */}
      {categories.map((cat) => {
        const catConfig = CATEGORY_CONFIG[cat];
        const catProviders = PROVIDERS.filter((p) => p.category === cat);

        return (
          <div key={cat} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span className={catConfig.color}>{catConfig.icon}</span>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {catConfig.label}
              </p>
            </div>

            <div className="space-y-2">
              {catProviders.map((provider) => {
                const isExpanded = expandedProvider === provider.key;
                const provSettings = providerSettingsMap[provider.key] ?? [];

                return (
                  <div
                    key={provider.key}
                    className="rounded-xl border border-border bg-card overflow-hidden"
                  >
                    {/* Provider başlık */}
                    <button
                      onClick={() => handleToggleExpand(provider.key)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{provider.label}</p>
                        <p className="text-xs text-muted-foreground">{provider.description}</p>
                      </div>

                      {/* Ayar sayısı */}
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

                    {/* Provider ayarları */}
                    {isExpanded && (
                      <ProviderSettingsPanel
                        provider={provider}
                        settings={selectedProvider === provider.key ? settings : provSettings}
                        loading={loading && selectedProvider === provider.key}
                        onReload={() => loadProviderSettings(provider.key)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
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

  const [showCustomAdd, setShowCustomAdd] = useState(false);
  const [customKey, setCustomKey] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [customAddLoading, setCustomAddLoading] = useState(false);

  async function handleSaveKey(key: string, value: string) {
    const existingSetting = providerSettings.find((s) => s.key === key);
    if (existingSetting) {
      const result = await updateSetting(existingSetting.id, { value });
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
        value,
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
  }

  async function handleDeleteKey(setting: SettingRecord) {
    const ok = await deleteSetting(setting.id);
    if (ok) {
      addToast({ type: "success", title: "Silindi", description: `${provider.label}: ${setting.key}` });
      onReload();
    }
  }

  async function handleCustomAdd() {
    if (!customKey.trim()) return;
    setCustomAddLoading(true);
    await handleSaveKey(customKey.trim(), customValue);
    setCustomAddLoading(false);
    setCustomKey("");
    setCustomValue("");
    setShowCustomAdd(false);
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
          {/* Bilinen anahtarlar */}
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
                onDelete={
                  existingSetting ? () => handleDeleteKey(existingSetting) : undefined
                }
              />
            );
          })}

          {/* Veritabanında olan ama commonKeys'te tanımlı olmayan ek ayarlar */}
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
                onDelete={() => handleDeleteKey(s)}
              />
            ))}

          {/* Özel ayar ekle */}
          {showCustomAdd ? (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
              <input
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                placeholder="Anahtar"
                className="w-32 rounded border border-border bg-input px-2 py-1.5 text-xs text-foreground outline-none"
              />
              <input
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder="Değer"
                onKeyDown={(e) => e.key === "Enter" && handleCustomAdd()}
                className="flex-1 rounded border border-border bg-input px-2 py-1.5 text-xs text-foreground outline-none"
              />
              <button
                onClick={handleCustomAdd}
                disabled={customAddLoading || !customKey.trim()}
                className="shrink-0 rounded bg-primary px-2.5 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
              >
                {customAddLoading ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
              </button>
              <button onClick={() => setShowCustomAdd(false)} className="text-muted-foreground">
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCustomAdd(true)}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <Plus size={12} />
              Özel Ayar Ekle
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Provider Anahtar Satırı ────────────────────────────────────────────────

function ProviderKeyRow({
  label,
  fieldKey,
  value,
  sensitive,
  placeholder,
  onSave,
  onDelete,
}: {
  label: string;
  fieldKey: string;
  value: string;
  sensitive?: boolean;
  placeholder?: string;
  onSave: (value: string) => void;
  onDelete?: () => void;
}) {
  const [editValue, setEditValue] = useState(value);
  const [showSensitive, setShowSensitive] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // value prop değişince senkronla
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

      {/* Kaydet butonu (sadece değişiklik varsa) */}
      {dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="shrink-0 flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs text-primary-foreground disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
        </button>
      )}

      {/* Sil */}
      {onDelete && (
        <button
          onClick={onDelete}
          className="shrink-0 text-muted-foreground hover:text-red-400 transition-colors"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

// ─── Fallback Sıra Düzenleyici ──────────────────────────────────────────────

function FallbackOrderEditor({
  addToast,
}: {
  addToast: (t: { type: string; title: string; description?: string }) => void;
}) {
  const { createSetting } = useAdminStore();

  const [ttsOrder, setTtsOrder] = useState("edge_tts,elevenlabs,openai_tts");
  const [llmOrder, setLlmOrder] = useState("gemini,openai_llm");
  const [visualsOrder, setVisualsOrder] = useState("pexels,pixabay");
  const [saving, setSaving] = useState(false);

  async function handleSaveFallback() {
    setSaving(true);

    const orders = [
      { key: "tts_fallback_order", value: ttsOrder.split(",").map((s) => s.trim()) },
      { key: "llm_fallback_order", value: llmOrder.split(",").map((s) => s.trim()) },
      { key: "visuals_fallback_order", value: visualsOrder.split(",").map((s) => s.trim()) },
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
      addToast({ type: "success", title: "Fallback sırası kaydedildi" });
    } else {
      addToast({ type: "error", title: "Kaydedilemedi" });
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Fallback Sırası
      </p>
      <p className="text-xs text-muted-foreground">
        Provider başarısız olduğunda sıradaki denenir. Virgülle ayrılmış provider anahtarları girin.
      </p>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <label className="w-20 shrink-0 text-xs text-muted-foreground">TTS</label>
          <input
            value={ttsOrder}
            onChange={(e) => setTtsOrder(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-input px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring font-mono"
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="w-20 shrink-0 text-xs text-muted-foreground">LLM</label>
          <input
            value={llmOrder}
            onChange={(e) => setLlmOrder(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-input px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring font-mono"
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="w-20 shrink-0 text-xs text-muted-foreground">Görseller</label>
          <input
            value={visualsOrder}
            onChange={(e) => setVisualsOrder(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-input px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring font-mono"
          />
        </div>
      </div>

      <button
        onClick={handleSaveFallback}
        disabled={saving}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
        Sırayı Kaydet
      </button>
    </div>
  );
}
