/**
 * ModuleManager — Modül yönetimi sayfası.
 *
 * scope="module" olan ayarların yönetimi.
 * Her modül (standard_video, news_bulletin, product_review) için:
 *   • Aktif/pasif toggle
 *   • Modüle özgü default ayarları (dil, TTS provider, altyazı stili vb.)
 */

import { useEffect, useState, useCallback } from "react";
import {
  Boxes,
  Video,
  Newspaper,
  ShoppingBag,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  RefreshCw,
  Save,
  X,
  ChevronDown,
  ChevronUp,
  Power,
  PowerOff,
} from "lucide-react";
import { useAdminStore, type SettingRecord } from "@/stores/adminStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

// ─── Modül tanımları ─────────────────────────────────────────────────────────

const MODULES = [
  {
    key: "standard_video",
    label: "Standart Video",
    description: "Bir konu hakkında otomatik video üretimi",
    icon: <Video size={20} />,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
  },
  {
    key: "news_bulletin",
    label: "Haber Bülteni",
    description: "Güncel haberlerden video bülten oluşturma",
    icon: <Newspaper size={20} />,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
  },
  {
    key: "product_review",
    label: "Ürün İnceleme",
    description: "Ürün bilgisiyle inceleme videosu üretimi",
    icon: <ShoppingBag size={20} />,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
  },
] as const;

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function ModuleManager() {
  const { settings, loading, error, fetchSettings, createSetting, updateSetting, deleteSetting, clearSettings } =
    useAdminStore();
  const addToast = useUIStore((s) => s.addToast);

  const [selectedModule, setSelectedModule] = useState<string>("standard_video");
  const [expandedModule, setExpandedModule] = useState<string | null>("standard_video");

  // Tüm modüller için ayarları tutacak map
  const [moduleSettingsMap, setModuleSettingsMap] = useState<Record<string, SettingRecord[]>>({});

  // Seçili modül değiştiğinde fetch
  const loadModuleSettings = useCallback(
    async (moduleKey: string) => {
      await fetchSettings("module", moduleKey);
    },
    [fetchSettings]
  );

  useEffect(() => {
    loadModuleSettings(selectedModule);
  }, [selectedModule, loadModuleSettings]);

  // Store'daki settings değiştiğinde map'e yaz
  useEffect(() => {
    setModuleSettingsMap((prev) => ({
      ...prev,
      [selectedModule]: settings,
    }));
  }, [settings, selectedModule]);

  function handleSelectModule(key: string) {
    setSelectedModule(key);
    setExpandedModule(expandedModule === key ? null : key);
  }

  async function handleToggleEnabled(moduleKey: string, currentSettings: SettingRecord[]) {
    const enabledSetting = currentSettings.find((s) => s.key === "enabled");
    if (enabledSetting) {
      const result = await updateSetting(enabledSetting.id, {
        value: !enabledSetting.value,
      });
      if (result) {
        addToast({
          type: "info",
          title: result.value ? "Modül etkinleştirildi" : "Modül devre dışı",
          description: moduleKey,
        });
        loadModuleSettings(moduleKey);
      }
    } else {
      // enabled ayarı yok, oluştur (default: true → false)
      const result = await createSetting({
        scope: "module",
        scope_id: moduleKey,
        key: "enabled",
        value: false,
        description: "Modülün aktif/pasif durumu",
      });
      if (result) {
        addToast({ type: "info", title: "Modül devre dışı bırakıldı", description: moduleKey });
        loadModuleSettings(moduleKey);
      }
    }
  }

  function isModuleEnabled(moduleKey: string): boolean {
    const moduleSettings = moduleSettingsMap[moduleKey] ?? [];
    const enabledSetting = moduleSettings.find((s) => s.key === "enabled");
    if (!enabledSetting) return true; // Varsayılan: aktif
    return enabledSetting.value === true;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Boxes size={20} className="text-blue-400" />
          <h2 className="text-lg font-semibold text-foreground">Modül Yönetimi</h2>
        </div>
        <button
          onClick={() => loadModuleSettings(selectedModule)}
          disabled={loading}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Yenile
        </button>
      </div>

      {/* Hata */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Modül kartları */}
      <div className="space-y-3">
        {MODULES.map((mod) => {
          const moduleSettings = moduleSettingsMap[mod.key] ?? [];
          const enabled = isModuleEnabled(mod.key);
          const isExpanded = expandedModule === mod.key;

          return (
            <div
              key={mod.key}
              className={cn(
                "rounded-xl border bg-card overflow-hidden transition-colors",
                isExpanded ? mod.borderColor : "border-border"
              )}
            >
              {/* Modül başlığı */}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className={cn("shrink-0", mod.color)}>{mod.icon}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{mod.label}</p>
                  <p className="text-xs text-muted-foreground">{mod.description}</p>
                </div>

                {/* Aktif/Pasif toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Önce settings'i yükle, sonra toggle et
                    if (!moduleSettingsMap[mod.key]) {
                      fetchSettings("module", mod.key).then(() => {
                        handleToggleEnabled(mod.key, useAdminStore.getState().settings);
                      });
                    } else {
                      handleToggleEnabled(mod.key, moduleSettings);
                    }
                  }}
                  className={cn(
                    "shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    enabled
                      ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                      : "bg-red-500/15 text-red-400 hover:bg-red-500/25"
                  )}
                >
                  {enabled ? <Power size={12} /> : <PowerOff size={12} />}
                  {enabled ? "Aktif" : "Pasif"}
                </button>

                {/* Genişlet/Daralt */}
                <button
                  onClick={() => handleSelectModule(mod.key)}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>

              {/* Modül ayarları (genişletilmiş) */}
              {isExpanded && (
                <ModuleSettingsPanel
                  moduleKey={mod.key}
                  settings={selectedModule === mod.key ? settings : moduleSettings}
                  loading={loading && selectedModule === mod.key}
                  onReload={() => loadModuleSettings(mod.key)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Modül Ayarları Paneli ────────────────────────────────────────────────────

function ModuleSettingsPanel({
  moduleKey,
  settings: moduleSettings,
  loading,
  onReload,
}: {
  moduleKey: string;
  settings: SettingRecord[];
  loading: boolean;
  onReload: () => void;
}) {
  const { createSetting, updateSetting, deleteSetting } = useAdminStore();
  const addToast = useUIStore((s) => s.addToast);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // "enabled" dışındaki ayarlar
  const visibleSettings = moduleSettings.filter((s) => s.key !== "enabled");

  async function handleAdd() {
    if (!newKey.trim()) return;
    setAddLoading(true);

    let parsedValue: unknown = newValue;
    try {
      parsedValue = JSON.parse(newValue);
    } catch {
      // String olarak bırak
    }

    const result = await createSetting({
      scope: "module",
      scope_id: moduleKey,
      key: newKey.trim(),
      value: parsedValue,
      description: `${moduleKey} modülü için ${newKey} ayarı`,
    });

    setAddLoading(false);

    if (result) {
      addToast({ type: "success", title: "Ayar eklendi" });
      setNewKey("");
      setNewValue("");
      setShowAddForm(false);
      onReload();
    } else {
      addToast({ type: "error", title: "Ayar eklenemedi" });
    }
  }

  async function handleUpdate(setting: SettingRecord, newVal: string) {
    let parsedValue: unknown = newVal;
    try {
      parsedValue = JSON.parse(newVal);
    } catch {
      // String
    }
    const result = await updateSetting(setting.id, { value: parsedValue });
    if (result) {
      addToast({ type: "success", title: "Güncellendi", description: setting.key });
    } else {
      addToast({ type: "error", title: "Güncellenemedi" });
    }
  }

  async function handleDelete(setting: SettingRecord) {
    const ok = await deleteSetting(setting.id);
    if (ok) {
      addToast({ type: "success", title: "Silindi", description: setting.key });
      onReload();
    }
  }

  return (
    <div className="border-t border-border px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Modül Ayarları
        </p>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          <Plus size={12} />
          Ayar Ekle
        </button>
      </div>

      {/* Yeni ayar mini formu */}
      {showAddForm && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="Anahtar"
            className="flex-1 rounded border border-border bg-input px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Değer"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 rounded border border-border bg-input px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={handleAdd}
            disabled={addLoading || !newKey.trim()}
            className="shrink-0 flex items-center gap-1 rounded bg-primary px-2.5 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
          >
            {addLoading ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
          </button>
          <button
            onClick={() => setShowAddForm(false)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin mr-2" />
          Yükleniyor...
        </div>
      ) : visibleSettings.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          Bu modül için özel ayar tanımlı değil — global varsayılanlar kullanılacak.
        </p>
      ) : (
        <div className="space-y-1">
          {visibleSettings.map((s) => (
            <InlineSettingRow
              key={s.id}
              setting={s}
              onUpdate={(val) => handleUpdate(s, val)}
              onDelete={() => handleDelete(s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Inline Ayar Satırı ──────────────────────────────────────────────────────

function InlineSettingRow({
  setting,
  onUpdate,
  onDelete,
}: {
  setting: SettingRecord;
  onUpdate: (newVal: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const displayValue =
    typeof setting.value === "string" ? setting.value : JSON.stringify(setting.value);
  const [editValue, setEditValue] = useState(displayValue);

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/30 group">
      <span className="text-xs font-mono text-foreground w-36 truncate shrink-0" title={setting.key}>
        {setting.key}
      </span>

      {editing ? (
        <div className="flex items-center gap-1.5 flex-1">
          <input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onUpdate(editValue);
                setEditing(false);
              }
              if (e.key === "Escape") setEditing(false);
            }}
            autoFocus
            className="flex-1 rounded border border-primary/50 bg-input px-2 py-1 text-xs text-foreground outline-none"
          />
          <button
            onClick={() => {
              onUpdate(editValue);
              setEditing(false);
            }}
            className="text-primary"
          >
            <Save size={10} />
          </button>
          <button onClick={() => setEditing(false)} className="text-muted-foreground">
            <X size={10} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => {
            setEditValue(displayValue);
            setEditing(true);
          }}
          className="flex-1 text-left text-xs font-mono text-muted-foreground truncate hover:text-foreground transition-colors"
          title={displayValue}
        >
          {displayValue}
        </button>
      )}

      <button
        onClick={onDelete}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
