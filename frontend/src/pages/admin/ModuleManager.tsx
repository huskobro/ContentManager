/**
 * ModuleManager — Modül yönetimi sayfası.
 *
 * Faz 10.7 değişiklikleri:
 *   • Trash2 / delete butonları TAMAMEN kaldırıldı
 *   • Modüller sadece aktif/pasif yapılabilir
 *   • Ayarlar sadece güncellenebilir, silinemez
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Boxes,
  Video,
  Newspaper,
  ShoppingBag,
  Loader2,
  AlertCircle,
  RefreshCw,
  Save,
  X,
  ChevronDown,
  ChevronUp,
  Power,
  PowerOff,
  CheckCircle2,
} from "lucide-react";
import { useAdminStore, type SettingRecord } from "@/stores/adminStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { useScopedKeyboardNavigation } from "@/hooks/useScopedKeyboardNavigation";
import { useRovingTabindex } from "@/hooks/useRovingTabindex";

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
  const { settings, loading, error, fetchSettings, createSetting, updateSetting, clearSettings } =
    useAdminStore();
  const addToast = useUIStore((s) => s.addToast);

  const [selectedModule, setSelectedModule] = useState<string>("standard_video");
  const [expandedModule, setExpandedModule] = useState<string | null>("standard_video");

  const [moduleSettingsMap, setModuleSettingsMap] = useState<Record<string, SettingRecord[]>>({});

  // ── Klavye Navigasyonu ──────────────────────────────────────────────────
  const listRef = useRef<HTMLDivElement>(null);

  const { focusedIdx, setFocusedIdx, scopeId } = useScopedKeyboardNavigation({
    itemCount: MODULES.length,
    scrollRef: listRef as React.RefObject<HTMLElement | null>,
    homeEnd: true,
    onEnter: (idx) => {
      // Enter → toggle accordion
      handleSelectModule(MODULES[idx].key);
    },
    onArrowRight: (idx) => {
      // ArrowRight → open accordion (eğer kapalıysa)
      const mod = MODULES[idx];
      if (expandedModule !== mod.key) {
        handleSelectModule(mod.key);
      }
    },
    onArrowLeft: (idx) => {
      // ArrowLeft → close accordion (eğer açıksa)
      const mod = MODULES[idx];
      if (expandedModule === mod.key) {
        setExpandedModule(null);
      }
    },
    onEscape: () => {
      if (expandedModule !== null) {
        setExpandedModule(null);
      }
    },
  });

  const { getTabIndex } = useRovingTabindex({
    focusedIdx,
    itemCount: MODULES.length,
    autoFocus: false,
    containerRef: listRef as React.RefObject<HTMLElement | null>,
  });

  const loadModuleSettings = useCallback(
    async (moduleKey: string) => {
      await fetchSettings("module", moduleKey);
    },
    [fetchSettings]
  );

  useEffect(() => {
    loadModuleSettings(selectedModule);
  }, [selectedModule, loadModuleSettings]);

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
    if (!enabledSetting) return true;
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
      <div
        ref={listRef}
        role="tree"
        aria-label="Modül listesi"
        className="space-y-3"
      >
        {MODULES.map((mod, idx) => {
          const moduleSettings = moduleSettingsMap[mod.key] ?? [];
          const enabled    = isModuleEnabled(mod.key);
          const isExpanded = expandedModule === mod.key;
          const isFocused  = focusedIdx === idx;
          const itemId     = `${scopeId}-mod-${idx}`;
          const panelId    = `${scopeId}-mod-panel-${idx}`;

          return (
            <div
              key={mod.key}
              id={itemId}
              data-nav-row
              role="treeitem"
              aria-expanded={isExpanded}
              aria-selected={isFocused}
              tabIndex={getTabIndex(idx)}
              onMouseEnter={() => setFocusedIdx(idx)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelectModule(mod.key);
                }
              }}
              className={cn(
                "rounded-xl border bg-card overflow-hidden transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                isExpanded ? mod.borderColor : "border-border",
                isFocused && !isExpanded && "ring-1 ring-inset ring-primary/30 bg-accent/20"
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
                  onClick={(e) => { e.stopPropagation(); handleSelectModule(mod.key); }}
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                  aria-label={isExpanded ? `${mod.label} ayarlarını gizle` : `${mod.label} ayarlarını göster`}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>

              {/* Modül ayarları */}
              {isExpanded && (
                <div id={panelId} role="group" aria-label={`${mod.label} ayarları`}>
                <ModuleSettingsPanel
                  moduleKey={mod.key}
                  settings={selectedModule === mod.key ? settings : moduleSettings}
                  loading={loading && selectedModule === mod.key}
                  onReload={() => loadModuleSettings(mod.key)}
                />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Modül Ayarları Paneli (delete kaldırıldı) ────────────────────────────────

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
  const { updateSetting } = useAdminStore();
  const addToast = useUIStore((s) => s.addToast);

  // "enabled" dışındaki ayarlar
  const visibleSettings = moduleSettings.filter((s) => s.key !== "enabled");

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
      onReload();
    } else {
      addToast({ type: "error", title: "Güncellenemedi" });
    }
  }

  return (
    <div className="border-t border-border px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Modül Ayarları
        </p>
      </div>

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
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Inline Ayar Satırı (delete kaldırıldı) ─────────────────────────────────

function InlineSettingRow({
  setting,
  onUpdate,
}: {
  setting: SettingRecord;
  onUpdate: (newVal: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const displayValue =
    typeof setting.value === "string" ? setting.value : JSON.stringify(setting.value);
  const [editValue, setEditValue] = useState(displayValue);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    onUpdate(editValue);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

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
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") setEditing(false);
            }}
            autoFocus
            className="flex-1 rounded border border-primary/50 bg-input px-2 py-1 text-xs text-foreground outline-none"
          />
          <button onClick={handleSave} className="text-primary">
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

      {saved && !editing && (
        <CheckCircle2 size={11} className="shrink-0 text-emerald-400" />
      )}
    </div>
  );
}
