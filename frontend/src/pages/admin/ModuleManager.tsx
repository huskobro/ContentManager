/**
 * ModuleManager — Modül yönetimi sayfası.
 *
 * Her modül için accordion paneli içinde:
 *   - Genel Modül Ayarları (admin scope settings)
 *   - Modüle özel bölümler:
 *       news_bulletin: Görsel Stil · Kategori→Stil · Haber Kaynakları · Breaking/Branding
 *       product_review: Görsel Stil · Fiyat · Yıldız Puanı · Yorumlar
 *       standard_video:  Genel DB ayarları
 *
 * Bug fix (aktif/pasif tutarsızlığı):
 *   Önceki versiyonda accordion kapalıyken fetchSettings çağrılmadığından
 *   moduleSettingsMap[key] = undefined → isModuleEnabled() her zaman true dönüyordu.
 *   Düzeltme: sayfa mount'ta tüm modüllerin "enabled" key'i paralel yükleniyor.
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
  Rss,
  Palette,
  Zap,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Plus,
  Pencil,
  Tag,
  Globe,
  Info,
} from "lucide-react";
import { useAdminStore, type SettingRecord } from "@/stores/adminStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { SYSTEM_SETTINGS_SCHEMA, type SystemSettingDef } from "@/lib/constants";

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

type ModuleKey = (typeof MODULES)[number]["key"];

// ─── Admin API Yardımcıları ───────────────────────────────────────────────────

function adminHeaders(pin: string) {
  return { "Content-Type": "application/json", "X-Admin-Pin": pin };
}

function getAdminPin() {
  return localStorage.getItem("cm-admin-pin") ?? "";
}

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────

export default function ModuleManager() {
  const { settings, loading, error, fetchSettings, createSetting, updateSetting } =
    useAdminStore();
  const addToast = useUIStore((s) => s.addToast);

  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  // Her modülün admin-scope ayarlarını ayrı map'te tut
  const [moduleSettingsMap, setModuleSettingsMap] = useState<Record<string, SettingRecord[]>>({});
  const [moduleLoadingMap, setModuleLoadingMap] = useState<Record<string, boolean>>({});

  // ── Sayfa açılışında tüm modüllerin enabled state'ini yükle (bug fix) ─────
  // Önceki versiyon: sadece açık accordion için fetchSettings çağırıyordu.
  // Bu sebeple kapalı modüllerin "enabled" kaydı bilinmiyordu → her zaman true görünüyordu.
  // Düzeltme: mount'ta tüm modüller için hafif bir "enabled" sorgusu yap.

  const loadAllEnabledStates = useCallback(async () => {
    const pin = getAdminPin();
    await Promise.all(
      MODULES.map(async (mod) => {
        try {
          const res = await fetch(
            `/api/settings?scope=module&scope_id=${mod.key}`,
            { headers: { "X-Admin-Pin": pin } }
          );
          if (!res.ok) return;
          const data: SettingRecord[] = await res.json();
          setModuleSettingsMap((prev) => ({ ...prev, [mod.key]: data }));
        } catch {
          // Sessizce atla — enabled varsayılan true kalır
        }
      })
    );
  }, []);

  useEffect(() => {
    loadAllEnabledStates();
  }, [loadAllEnabledStates]);

  // Belirli bir modülün tüm ayarlarını yükle (accordion açılırken)
  const loadModuleSettings = useCallback(
    async (moduleKey: string) => {
      setModuleLoadingMap((prev) => ({ ...prev, [moduleKey]: true }));
      await fetchSettings("module", moduleKey);
      setModuleLoadingMap((prev) => ({ ...prev, [moduleKey]: false }));
    },
    [fetchSettings]
  );

  // fetchSettings global settings[] state'ini günceller → map'e yaz
  useEffect(() => {
    if (expandedModule) {
      setModuleSettingsMap((prev) => ({ ...prev, [expandedModule]: settings }));
    }
  }, [settings, expandedModule]);

  function handleToggleAccordion(key: string) {
    if (expandedModule === key) {
      setExpandedModule(null);
    } else {
      setExpandedModule(key);
      loadModuleSettings(key);
    }
  }

  // ── enabled state ─────────────────────────────────────────────────────────
  function isModuleEnabled(moduleKey: string): boolean {
    const s = moduleSettingsMap[moduleKey] ?? [];
    const rec = s.find((r) => r.key === "enabled");
    if (!rec) return true; // DB'de kayıt yok → varsayılan aktif
    return rec.value === true || rec.value === "true";
  }

  async function handleToggleEnabled(moduleKey: string) {
    const currentSettings = moduleSettingsMap[moduleKey] ?? [];
    const enabledRec = currentSettings.find((r) => r.key === "enabled");
    const current = isModuleEnabled(moduleKey);

    if (enabledRec) {
      const result = await updateSetting(enabledRec.id, { value: !current });
      if (result) {
        setModuleSettingsMap((prev) => ({
          ...prev,
          [moduleKey]: prev[moduleKey]?.map((r) =>
            r.key === "enabled" ? { ...r, value: !current } : r
          ) ?? [],
        }));
        addToast({
          type: "info",
          title: !current ? "Modül etkinleştirildi" : "Modül devre dışı",
          description: moduleKey,
        });
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
        setModuleSettingsMap((prev) => ({
          ...prev,
          [moduleKey]: [...(prev[moduleKey] ?? []), result],
        }));
        addToast({ type: "info", title: "Modül devre dışı bırakıldı", description: moduleKey });
      }
    }
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
          onClick={loadAllEnabledStates}
          disabled={loading}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Yenile
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Modül kartları */}
      <div className="space-y-3">
        {MODULES.map((mod) => {
          const enabled = isModuleEnabled(mod.key);
          const isExpanded = expandedModule === mod.key;
          const isLoading = moduleLoadingMap[mod.key] ?? false;

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

                {/* Aktif/Pasif toggle — her zaman doğru kaynaktan okur */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleEnabled(mod.key); }}
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
                  onClick={() => handleToggleAccordion(mod.key)}
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? `${mod.label} ayarlarını gizle` : `${mod.label} ayarlarını göster`}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>

              {/* Genişletilmiş panel */}
              {isExpanded && (
                <div className="border-t border-border">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                      <Loader2 size={14} className="animate-spin mr-2" />
                      Yükleniyor...
                    </div>
                  ) : mod.key === "news_bulletin" ? (
                    <NewsBulletinPanel
                      moduleSettings={moduleSettingsMap[mod.key] ?? []}
                      onReload={() => loadModuleSettings(mod.key)}
                      onSettingUpdated={(updated) => {
                        setModuleSettingsMap((prev) => ({
                          ...prev,
                          [mod.key]: prev[mod.key]?.map((r) =>
                            r.id === updated.id ? updated : r
                          ) ?? [updated],
                        }));
                      }}
                    />
                  ) : mod.key === "product_review" ? (
                    <ProductReviewPanel
                      moduleSettings={moduleSettingsMap[mod.key] ?? []}
                      onReload={() => loadModuleSettings(mod.key)}
                      onSettingUpdated={(updated) => {
                        setModuleSettingsMap((prev) => ({
                          ...prev,
                          [mod.key]: prev[mod.key]?.map((r) =>
                            r.id === updated.id ? updated : r
                          ) ?? [updated],
                        }));
                      }}
                    />
                  ) : (
                    <StandardModulePanel
                      moduleSettings={moduleSettingsMap[mod.key] ?? []}
                      onReload={() => loadModuleSettings(mod.key)}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Ortak Ayar Satırı ────────────────────────────────────────────────────────

function AdminSettingRow({ def, dbSettings, onSave }: {
  def: SystemSettingDef;
  dbSettings: SettingRecord[];
  onSave: (def: SystemSettingDef, value: unknown) => Promise<void>;
}) {
  const rec = dbSettings.find((s) => s.key === def.key);
  const rawVal = rec !== undefined ? rec.value : def.default;

  function toDisplay(v: unknown): string {
    if (def.type === "toggle") return String(v) === "true" ? "true" : "false";
    if (def.type === "select") return String(v ?? def.default);
    if (Array.isArray(v)) return v.join(", ");
    return String(v ?? "");
  }

  const [localVal, setLocalVal] = useState(toDisplay(rawVal));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setLocalVal(toDisplay(rawVal));
    setDirty(false);
  }, [rawVal]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true);
    let parsed: unknown = localVal;
    if (def.type === "toggle") parsed = localVal === "true";
    else if (def.type === "number") parsed = parseFloat(localVal) || def.default;
    await onSave(def, parsed);
    setSaving(false);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-1.5 py-2 border-b border-border/50 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">{def.label}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{def.description}</p>
          {def.pipelineStage && (
            <p className="text-[10px] text-blue-400/60 mt-0.5">{def.pipelineStage}</p>
          )}
        </div>
        {saved && <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />}
      </div>

      <div className="flex items-center gap-2">
        {def.type === "toggle" ? (
          <button
            type="button"
            onClick={async () => {
              const next = localVal !== "true";
              setLocalVal(String(next));
              setSaving(true);
              await onSave(def, next);
              setSaving(false);
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            }}
            className={cn(
              "flex items-center gap-1.5 text-sm transition-colors",
              localVal === "true" ? "text-emerald-400" : "text-muted-foreground"
            )}
          >
            {localVal === "true" ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
            {localVal === "true" ? "Açık" : "Kapalı"}
          </button>
        ) : def.type === "select" && def.options ? (
          <div className="flex items-center gap-2 flex-1">
            <select
              value={localVal}
              onChange={(e) => { setLocalVal(e.target.value); setDirty(true); }}
              className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {def.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {dirty && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                Kaydet
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <input
              type={def.type === "number" ? "number" : "text"}
              value={localVal}
              onChange={(e) => { setLocalVal(e.target.value); setDirty(true); }}
              onKeyDown={(e) => e.key === "Enter" && dirty && handleSave()}
              placeholder={String(def.default ?? "")}
              min={def.min}
              max={def.max}
              className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {dirty && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                Kaydet
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Ortak useAdminSave hook ──────────────────────────────────────────────────

function useAdminSave(moduleKey: string) {
  const { createSetting, updateSetting } = useAdminStore();
  const addToast = useUIStore((s) => s.addToast);

  return useCallback(
    async (
      def: SystemSettingDef,
      value: unknown,
      dbSettings: SettingRecord[]
    ): Promise<SettingRecord | null> => {
      const existing = dbSettings.find((r) => r.key === def.key);
      if (existing) {
        const result = await updateSetting(existing.id, { value });
        if (!result) addToast({ type: "error", title: "Güncellenemedi", description: def.label });
        return result ?? null;
      } else {
        const result = await createSetting({
          scope: "module",
          scope_id: moduleKey,
          key: def.key,
          value,
          description: def.description,
        });
        if (!result) addToast({ type: "error", title: "Kaydedilemedi", description: def.label });
        return result ?? null;
      }
    },
    [moduleKey, createSetting, updateSetting, addToast]
  );
}

// ─── Sekme Başlığı ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title, description }: {
  icon: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-2 mb-3">
      <div className="shrink-0 mt-0.5 text-muted-foreground">{icon}</div>
      <div>
        <p className="text-xs font-semibold text-foreground uppercase tracking-wider">{title}</p>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HABER BÜLTENİ PANELİ
// ─────────────────────────────────────────────────────────────────────────────

function NewsBulletinPanel({
  moduleSettings,
  onReload,
  onSettingUpdated,
}: {
  moduleSettings: SettingRecord[];
  onReload: () => void;
  onSettingUpdated: (r: SettingRecord) => void;
}) {
  const save = useAdminSave("news_bulletin");
  const addToast = useUIStore((s) => s.addToast);
  const [activeTab, setActiveTab] = useState<"settings" | "sources" | "mappings">("settings");

  const newsDefs = SYSTEM_SETTINGS_SCHEMA.filter((d) => d.category === "module_news");

  async function handleSave(def: SystemSettingDef, value: unknown) {
    const result = await save(def, value, moduleSettings);
    if (result) {
      onSettingUpdated(result);
      onReload();
    }
  }

  const tabs = [
    { id: "settings" as const, label: "Ayarlar", icon: <Zap size={12} /> },
    { id: "sources" as const, label: "Haber Kaynakları", icon: <Rss size={12} /> },
    { id: "mappings" as const, label: "Kategori→Stil", icon: <Palette size={12} /> },
  ];

  return (
    <div className="p-4 space-y-4">
      {/* Sekme navigasyonu */}
      <div className="flex gap-1 rounded-lg bg-muted/40 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors flex-1 justify-center",
              activeTab === tab.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sekme içerikleri */}
      {activeTab === "settings" && (
        <div className="space-y-0">
          {/* Görsel Stil */}
          <div className="mb-4">
            <SectionHeader icon={<Palette size={14} />} title="Görsel Stil" description="Bülten renk teması ve overlay davranışı" />
            {newsDefs
              .filter((d) => ["bulletin_style", "bulletin_ticker_enabled"].includes(d.key))
              .map((def) => (
                <AdminSettingRow key={def.key} def={def} dbSettings={moduleSettings} onSave={handleSave} />
              ))}
          </div>

          {/* Breaking / Branding */}
          <div className="mb-4">
            <SectionHeader icon={<Zap size={14} />} title="Son Dakika & Kanal Kimliği" description="Breaking overlay ve yayın ağı adı" />
            {newsDefs
              .filter((d) => ["bulletin_breaking_enabled", "bulletin_breaking_text", "bulletin_network_name"].includes(d.key))
              .map((def) => (
                <AdminSettingRow key={def.key} def={def} dbSettings={moduleSettings} onSave={handleSave} />
              ))}
          </div>

          {/* Kategori→Stil Toggle */}
          <div>
            <SectionHeader icon={<Tag size={14} />} title="Kategori→Stil Otomasyonu" description="Dominant sahne kategorisine göre otomatik stil seçimi" />
            {newsDefs
              .filter((d) => d.key === "category_style_mapping_enabled")
              .map((def) => (
                <AdminSettingRow key={def.key} def={def} dbSettings={moduleSettings} onSave={handleSave} />
              ))}
            <p className="text-[11px] text-muted-foreground mt-1 pl-0.5">
              Eşleşme tablosunu düzenlemek için "Kategori→Stil" sekmesine geçin.
            </p>
          </div>
        </div>
      )}

      {activeTab === "sources" && (
        <NewsSourcesSection onToast={(t) => addToast(t)} />
      )}

      {activeTab === "mappings" && (
        <CategoryMappingsSection onToast={(t) => addToast(t)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ÜRÜN İNCELEME PANELİ
// ─────────────────────────────────────────────────────────────────────────────

function ProductReviewPanel({
  moduleSettings,
  onReload,
  onSettingUpdated,
}: {
  moduleSettings: SettingRecord[];
  onReload: () => void;
  onSettingUpdated: (r: SettingRecord) => void;
}) {
  const save = useAdminSave("product_review");
  const reviewDefs = SYSTEM_SETTINGS_SCHEMA.filter((d) => d.category === "module_review");

  async function handleSave(def: SystemSettingDef, value: unknown) {
    const result = await save(def, value, moduleSettings);
    if (result) {
      onSettingUpdated(result);
      onReload();
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Görsel Stil */}
      <div>
        <SectionHeader icon={<Palette size={14} />} title="Görsel Stil" description="İnceleme videosu renk paleti ve kart stili" />
        {reviewDefs
          .filter((d) => d.key === "review_style")
          .map((def) => (
            <AdminSettingRow key={def.key} def={def} dbSettings={moduleSettings} onSave={handleSave} />
          ))}
      </div>

      {/* Fiyat Badge */}
      <div className="border-t border-border/50 pt-4">
        <SectionHeader icon={<Tag size={14} />} title="Fiyat Badge'i" description="Verdict sahnesinde ürün fiyatı gösterimi (varsayılan: kapalı)" />
        {reviewDefs
          .filter((d) => d.key === "review_price_enabled")
          .map((def) => (
            <AdminSettingRow key={def.key} def={def} dbSettings={moduleSettings} onSave={handleSave} />
          ))}
        <p className="text-[11px] text-muted-foreground mt-1">
          Fiyat verisi iş oluştururken kullanıcı tarafından girilir. Bu toggle admin varsayılanıdır; kullanıcı CreateVideo formundan override edebilir.
        </p>
      </div>

      {/* Yıldız Puanı */}
      <div className="border-t border-border/50 pt-4">
        <SectionHeader icon={<Tag size={14} />} title="Yıldız Puanı" description="Verdict sahnesinde 5 yıldız puan gösterimi (varsayılan: kapalı)" />
        {reviewDefs
          .filter((d) => d.key === "review_star_rating_enabled")
          .map((def) => (
            <AdminSettingRow key={def.key} def={def} dbSettings={moduleSettings} onSave={handleSave} />
          ))}
        <p className="text-[11px] text-muted-foreground mt-1">
          Yıldız değeri iş oluştururken girilir. Bu toggle admin varsayılanıdır.
        </p>
      </div>

      {/* Floating Comments */}
      <div className="border-t border-border/50 pt-4">
        <SectionHeader icon={<Tag size={14} />} title="Floating Yorumlar" description="Overview/Pros sahnelerinde süzülen yorum kartları (varsayılan: kapalı)" />
        {reviewDefs
          .filter((d) => d.key === "review_comments_enabled")
          .map((def) => (
            <AdminSettingRow key={def.key} def={def} dbSettings={moduleSettings} onSave={handleSave} />
          ))}
        <p className="text-[11px] text-muted-foreground mt-1">
          Yorumlar iş oluştururken girilebilir veya LLM tarafından üretilebilir.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STANDART VİDEO PANELİ
// ─────────────────────────────────────────────────────────────────────────────

function StandardModulePanel({
  moduleSettings,
  onReload,
}: {
  moduleSettings: SettingRecord[];
  onReload: () => void;
}) {
  const { updateSetting } = useAdminStore();
  const addToast = useUIStore((s) => s.addToast);

  const visibleSettings = moduleSettings.filter((s) => s.key !== "enabled");

  async function handleUpdate(setting: SettingRecord, newVal: string) {
    let parsedValue: unknown = newVal;
    try { parsedValue = JSON.parse(newVal); } catch { /* string */ }
    const result = await updateSetting(setting.id, { value: parsedValue });
    if (result) {
      addToast({ type: "success", title: "Güncellendi", description: setting.key });
      onReload();
    } else {
      addToast({ type: "error", title: "Güncellenemedi" });
    }
  }

  return (
    <div className="px-4 py-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
        Modül Ayarları
      </p>
      {visibleSettings.length === 0 ? (
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

// ─── Inline Setting Row (mevcut ham kayıtlar için) ────────────────────────────

function InlineSettingRow({
  setting,
  onUpdate,
}: {
  setting: SettingRecord;
  onUpdate: (newVal: string) => void;
}) {
  const displayValue =
    typeof setting.value === "string" ? setting.value : JSON.stringify(setting.value);
  const [editing, setEditing] = useState(false);
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
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
            autoFocus
            className="flex-1 rounded border border-primary/50 bg-input px-2 py-1 text-xs text-foreground outline-none"
          />
          <button onClick={handleSave} className="text-primary"><Save size={10} /></button>
          <button onClick={() => setEditing(false)} className="text-muted-foreground"><X size={10} /></button>
        </div>
      ) : (
        <button
          onClick={() => { setEditValue(displayValue); setEditing(true); }}
          className="flex-1 text-left text-xs font-mono text-muted-foreground truncate hover:text-foreground transition-colors"
          title={displayValue}
        >
          {displayValue}
        </button>
      )}
      {saved && !editing && <CheckCircle2 size={11} className="shrink-0 text-emerald-400" />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HABER KAYNAKLARI SEKSİYONU (NewsSourceManager içeriği, inline)
// ─────────────────────────────────────────────────────────────────────────────

interface NewsSource {
  id: number;
  name: string;
  url: string;
  category_key: string;
  lang: string;
  enabled: boolean;
  sort_order: number;
}

interface SourceFormState {
  name: string;
  url: string;
  category_key: string;
  lang: string;
  enabled: boolean;
  sort_order: number;
}

const EMPTY_SOURCE_FORM: SourceFormState = { name: "", url: "", category_key: "", lang: "tr", enabled: true, sort_order: 0 };

function NewsSourcesSection({ onToast }: { onToast: (t: { type: "success" | "error" | "info"; message: string }) => void }) {
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<SourceFormState>(EMPTY_SOURCE_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/admin/news-sources", { headers: adminHeaders(getAdminPin()) });
      if (res.ok) setSources(await res.json());
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function setField<K extends keyof SourceFormState>(k: K, v: SourceFormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSave() {
    if (!form.name.trim() || !form.url.trim()) { onToast({ type: "error", message: "Ad ve URL zorunludur." }); return; }
    if (!/^https?:\/\//i.test(form.url)) { onToast({ type: "error", message: "URL http:// veya https:// ile başlamalı." }); return; }
    setSaving(true);
    try {
      const isNew = editingId === "new";
      const res = await fetch(isNew ? "/api/admin/news-sources" : `/api/admin/news-sources/${editingId}`, {
        method: isNew ? "POST" : "PUT",
        headers: adminHeaders(getAdminPin()),
        body: JSON.stringify({ name: form.name.trim(), url: form.url.trim(), category_key: form.category_key.trim() || null, lang: form.lang, enabled: form.enabled, sort_order: form.sort_order }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.detail ?? `HTTP ${res.status}`); }
      onToast({ type: "success", message: isNew ? "Kaynak oluşturuldu." : "Kaynak güncellendi." });
      setEditingId(null); setForm(EMPTY_SOURCE_FORM); await load();
    } catch (e: unknown) {
      onToast({ type: "error", message: e instanceof Error ? e.message : "Kayıt başarısız." });
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await fetch(`/api/admin/news-sources/${id}`, { method: "DELETE", headers: adminHeaders(getAdminPin()) });
      onToast({ type: "success", message: "Kaynak silindi." });
      setConfirmDeleteId(null); await load();
    } finally { setDeletingId(null); }
  }

  async function toggleEnabled(s: NewsSource) {
    await fetch(`/api/admin/news-sources/${s.id}`, {
      method: "PUT", headers: adminHeaders(getAdminPin()),
      body: JSON.stringify({ enabled: !s.enabled }),
    });
    await load();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionHeader icon={<Rss size={14} />} title="Haber Kaynakları" description="RSS feed ve haber URL'leri — bülten pipeline'ında URL girilmezse kullanılır" />
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><RefreshCw size={12} /></button>
          <button
            onClick={() => { setEditingId("new"); setForm({ ...EMPTY_SOURCE_FORM, sort_order: sources.length }); }}
            disabled={editingId !== null}
            className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus size={12} /> Ekle
          </button>
        </div>
      </div>

      {editingId === "new" && (
        <SourceFormInline form={form} setField={setField} saving={saving} onSave={handleSave} onCancel={() => { setEditingId(null); setForm(EMPTY_SOURCE_FORM); }} isNew />
      )}

      {loadingList ? (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin mr-2" />Yükleniyor…</div>
      ) : sources.length === 0 && editingId !== "new" ? (
        <div className="flex flex-col items-center py-8 text-center">
          <Rss size={28} className="mb-2 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">Henüz haber kaynağı yok</p>
          <button onClick={() => { setEditingId("new"); setForm(EMPTY_SOURCE_FORM); }} className="mt-3 flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90">
            <Plus size={12} /> Kaynak Ekle
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {sources.map((s) => (
            <div key={s.id} className={cn("rounded-lg border p-2.5", s.enabled ? "border-border bg-card" : "border-border/40 bg-card/50 opacity-60")}>
              {editingId === s.id ? (
                <SourceFormInline form={form} setField={setField} saving={saving} onSave={handleSave} onCancel={() => { setEditingId(null); setForm(EMPTY_SOURCE_FORM); }} />
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleEnabled(s)} className={s.enabled ? "text-emerald-400" : "text-muted-foreground"} title={s.enabled ? "Pasif yap" : "Etkinleştir"}>
                    {s.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium text-foreground">{s.name}</span>
                      {s.category_key && <span className="flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"><Tag size={9} />{s.category_key}</span>}
                      <span className="flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"><Globe size={9} />{s.lang}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{s.url}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {confirmDeleteId === s.id ? (
                      <>
                        <span className="text-[10px] text-destructive font-medium">Emin misin?</span>
                        <button onClick={() => handleDelete(s.id)} disabled={deletingId === s.id} className="rounded px-1.5 py-0.5 bg-destructive text-[10px] text-destructive-foreground">
                          {deletingId === s.id ? <Loader2 size={10} className="animate-spin" /> : "Sil"}
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)} className="rounded px-1.5 py-0.5 border border-border text-[10px] text-muted-foreground"><X size={9} /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditingId(s.id); setForm({ name: s.name, url: s.url, category_key: s.category_key, lang: s.lang, enabled: s.enabled, sort_order: s.sort_order }); }} className="text-muted-foreground hover:text-foreground p-1"><Pencil size={12} /></button>
                        <button onClick={() => setConfirmDeleteId(s.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 size={12} /></button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground mt-1">{sources.length} kaynak — {sources.filter((s) => s.enabled).length} etkin</p>
        </div>
      )}
    </div>
  );
}

function SourceFormInline({ form, setField, saving, onSave, onCancel, isNew }: {
  form: SourceFormState;
  setField: <K extends keyof SourceFormState>(k: K, v: SourceFormState[K]) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  isNew?: boolean;
}) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <p className="text-xs font-medium">{isNew ? "Yeni Kaynak" : "Düzenle"}</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">Ad *</label>
          <input type="text" value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="TRT Haber" className="w-full rounded border border-input bg-background px-2 py-1 text-xs mt-0.5" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Dil</label>
          <select value={form.lang} onChange={(e) => setField("lang", e.target.value)} className="w-full rounded border border-input bg-background px-2 py-1 text-xs mt-0.5">
            {["tr", "en", "de", "fr", "es", "ar"].map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-[10px] text-muted-foreground">URL *</label>
          <input type="url" value={form.url} onChange={(e) => setField("url", e.target.value)} placeholder="https://..." className="w-full rounded border border-input bg-background px-2 py-1 text-xs font-mono mt-0.5" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Kategori</label>
          <input type="text" value={form.category_key} onChange={(e) => setField("category_key", e.target.value.toLowerCase())} placeholder="spor, teknoloji…" className="w-full rounded border border-input bg-background px-2 py-1 text-xs mt-0.5" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Sıra</label>
          <input type="number" value={form.sort_order} onChange={(e) => setField("sort_order", parseInt(e.target.value) || 0)} className="w-full rounded border border-input bg-background px-2 py-1 text-xs mt-0.5" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <button onClick={() => setField("enabled", !form.enabled)} className={cn("flex items-center gap-1 text-xs", form.enabled ? "text-emerald-400" : "text-muted-foreground")}>
          {form.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          {form.enabled ? "Etkin" : "Pasif"}
        </button>
        <div className="flex gap-2">
          <button onClick={onSave} disabled={saving} className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-50">
            {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />} Kaydet
          </button>
          <button onClick={onCancel} className="rounded border border-border px-2.5 py-1 text-xs text-muted-foreground"><X size={10} /></button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KATEGORİ→STİL EŞLEŞMELERİ SEKSİYONU
// ─────────────────────────────────────────────────────────────────────────────

interface CategoryMapping {
  id: number;
  category_key: string;
  bulletin_style: string;
  description: string;
  enabled: boolean;
}

const BULLETIN_STYLES = [
  { value: "breaking", label: "Breaking" }, { value: "tech", label: "Tech" },
  { value: "corporate", label: "Corporate" }, { value: "sport", label: "Sport" },
  { value: "finance", label: "Finance" }, { value: "weather", label: "Weather" },
  { value: "science", label: "Science" }, { value: "entertainment", label: "Entertainment" },
  { value: "dark", label: "Dark" },
];

interface MappingFormState { category_key: string; bulletin_style: string; description: string; enabled: boolean; }
const EMPTY_MAPPING_FORM: MappingFormState = { category_key: "", bulletin_style: "corporate", description: "", enabled: true };

function CategoryMappingsSection({ onToast }: { onToast: (t: { type: "success" | "error" | "info"; message: string }) => void }) {
  const [mappings, setMappings] = useState<CategoryMapping[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<MappingFormState>(EMPTY_MAPPING_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/admin/category-style-mappings", { headers: adminHeaders(getAdminPin()) });
      if (res.ok) setMappings(await res.json());
    } finally { setLoadingList(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function setField<K extends keyof MappingFormState>(k: K, v: MappingFormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSave() {
    if (!form.category_key.trim()) { onToast({ type: "error", message: "Kategori anahtarı boş olamaz." }); return; }
    setSaving(true);
    try {
      const isNew = editingId === "new";
      const res = await fetch(isNew ? "/api/admin/category-style-mappings" : `/api/admin/category-style-mappings/${editingId}`, {
        method: isNew ? "POST" : "PUT",
        headers: adminHeaders(getAdminPin()),
        body: JSON.stringify({ category_key: form.category_key.trim().toLowerCase(), bulletin_style: form.bulletin_style, description: form.description.trim() || null, enabled: form.enabled }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.detail ?? `HTTP ${res.status}`); }
      onToast({ type: "success", message: isNew ? "Eşleşme oluşturuldu." : "Eşleşme güncellendi." });
      setEditingId(null); setForm(EMPTY_MAPPING_FORM); await load();
    } catch (e: unknown) {
      onToast({ type: "error", message: e instanceof Error ? e.message : "Kayıt başarısız." });
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await fetch(`/api/admin/category-style-mappings/${id}`, { method: "DELETE", headers: adminHeaders(getAdminPin()) });
      onToast({ type: "success", message: "Eşleşme silindi." });
      setConfirmDeleteId(null); await load();
    } finally { setDeletingId(null); }
  }

  async function toggleEnabled(m: CategoryMapping) {
    await fetch(`/api/admin/category-style-mappings/${m.id}`, {
      method: "PUT", headers: adminHeaders(getAdminPin()),
      body: JSON.stringify({ enabled: !m.enabled }),
    });
    await load();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionHeader icon={<Palette size={14} />} title="Kategori→Stil Eşleşmeleri" description="Sahne kategorisi tespit edildiğinde otomatik uygulanacak BulletinStyle" />
        <div className="flex gap-2">
          <button onClick={load} className="text-muted-foreground hover:text-foreground"><RefreshCw size={12} /></button>
          <button
            onClick={() => { setEditingId("new"); setForm(EMPTY_MAPPING_FORM); }}
            disabled={editingId !== null}
            className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus size={12} /> Ekle
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-2 text-[11px] text-muted-foreground">
        <Info size={11} className="inline mr-1 text-blue-400" />
        Pipeline dominant sahne kategorisini bu tabloda arar. Eşleşirse BulletinStyle otomatik uygulanır.
        Öncelik: kullanıcı override → bu tablo → global varsayılan.
      </div>

      {editingId === "new" && (
        <MappingFormInline form={form} setField={setField} saving={saving} onSave={handleSave} onCancel={() => { setEditingId(null); setForm(EMPTY_MAPPING_FORM); }} isNew />
      )}

      {loadingList ? (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin mr-2" />Yükleniyor…</div>
      ) : mappings.length === 0 && editingId !== "new" ? (
        <div className="flex flex-col items-center py-8 text-center">
          <Palette size={28} className="mb-2 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">Henüz eşleşme yok</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {mappings.map((m) => (
            <div key={m.id} className={cn("rounded-lg border p-2.5", m.enabled ? "border-border bg-card" : "border-border/40 bg-card/50 opacity-60")}>
              {editingId === m.id ? (
                <MappingFormInline form={form} setField={setField} saving={saving} onSave={handleSave} onCancel={() => { setEditingId(null); setForm(EMPTY_MAPPING_FORM); }} disableKey />
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleEnabled(m)} className={m.enabled ? "text-emerald-400" : "text-muted-foreground"}>
                    {m.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                  </button>
                  <span className="rounded-full bg-muted border border-border px-2 py-0.5 text-[10px] font-mono">{m.category_key}</span>
                  <span className="text-muted-foreground text-[10px]">→</span>
                  <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">{m.bulletin_style}</span>
                  {m.description && <span className="flex-1 text-[10px] text-muted-foreground truncate">{m.description}</span>}
                  {!m.description && <span className="flex-1" />}
                  <div className="flex gap-1 shrink-0">
                    {confirmDeleteId === m.id ? (
                      <>
                        <span className="text-[10px] text-destructive font-medium">Emin misin?</span>
                        <button onClick={() => handleDelete(m.id)} disabled={deletingId === m.id} className="rounded px-1.5 py-0.5 bg-destructive text-[10px] text-destructive-foreground">
                          {deletingId === m.id ? <Loader2 size={10} className="animate-spin" /> : "Sil"}
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)} className="rounded px-1.5 py-0.5 border border-border text-[10px] text-muted-foreground"><X size={9} /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditingId(m.id); setForm({ category_key: m.category_key, bulletin_style: m.bulletin_style, description: m.description, enabled: m.enabled }); }} className="text-muted-foreground hover:text-foreground p-1"><Pencil size={12} /></button>
                        <button onClick={() => setConfirmDeleteId(m.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 size={12} /></button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground">{mappings.length} eşleşme — {mappings.filter((m) => m.enabled).length} etkin</p>
        </div>
      )}
    </div>
  );
}

function MappingFormInline({ form, setField, saving, onSave, onCancel, isNew, disableKey }: {
  form: MappingFormState;
  setField: <K extends keyof MappingFormState>(k: K, v: MappingFormState[K]) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  isNew?: boolean;
  disableKey?: boolean;
}) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <p className="text-xs font-medium">{isNew ? "Yeni Eşleşme" : "Düzenle"}</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">Kategori Anahtarı *</label>
          <input type="text" value={form.category_key} disabled={disableKey} onChange={(e) => setField("category_key", e.target.value.toLowerCase())} placeholder="spor, teknoloji…" className="w-full rounded border border-input bg-background px-2 py-1 text-xs mt-0.5 disabled:opacity-60" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">BulletinStyle *</label>
          <select value={form.bulletin_style} onChange={(e) => setField("bulletin_style", e.target.value)} className="w-full rounded border border-input bg-background px-2 py-1 text-xs mt-0.5">
            {BULLETIN_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-[10px] text-muted-foreground">Açıklama</label>
          <input type="text" value={form.description} onChange={(e) => setField("description", e.target.value)} placeholder="opsiyonel…" className="w-full rounded border border-input bg-background px-2 py-1 text-xs mt-0.5" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <button onClick={() => setField("enabled", !form.enabled)} className={cn("flex items-center gap-1 text-xs", form.enabled ? "text-emerald-400" : "text-muted-foreground")}>
          {form.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          {form.enabled ? "Etkin" : "Pasif"}
        </button>
        <div className="flex gap-2">
          <button onClick={onSave} disabled={saving} className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-50">
            {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />} Kaydet
          </button>
          <button onClick={onCancel} className="rounded border border-border px-2.5 py-1 text-xs text-muted-foreground"><X size={10} /></button>
        </div>
      </div>
    </div>
  );
}
