/**
 * PromptManager — Modül bazlı Master Prompt yönetimi.
 *
 * Sol: dikey modül menüsü (Standard Video / Haber Bülteni / Ürün İnceleme)
 * Sağ: seçili modüle ait prompt alanları (büyük Textarea)
 *
 * Kayıt: scope="module", scope_id="{module_key}", key="{prompt_key}"
 * Boş bırakılırsa system default kullanılır.
 */

import { useEffect, useState, useCallback } from "react";
import {
  FileText,
  Video,
  Newspaper,
  ShoppingBag,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Info,
} from "lucide-react";
import { useAdminStore, type SettingRecord } from "@/stores/adminStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

// ─── Modül tanımları ─────────────────────────────────────────────────────────

const MODULES = [
  {
    key: "standard_video" as const,
    label: "Standart Video",
    description: "Konu bazlı otomatik video üretimi",
    icon: <Video size={16} />,
    color: "text-blue-400",
    activeBg: "bg-blue-500/10 border-blue-500/30",
    accentColor: "text-blue-400",
  },
  {
    key: "news_bulletin" as const,
    label: "Haber Bülteni",
    description: "Haber kaynaklarından video bülten",
    icon: <Newspaper size={16} />,
    color: "text-amber-400",
    activeBg: "bg-amber-500/10 border-amber-500/30",
    accentColor: "text-amber-400",
  },
  {
    key: "product_review" as const,
    label: "Ürün İnceleme",
    description: "Ürün bilgisiyle inceleme videosu",
    icon: <ShoppingBag size={16} />,
    color: "text-emerald-400",
    activeBg: "bg-emerald-500/10 border-emerald-500/30",
    accentColor: "text-emerald-400",
  },
] as const;

type ModuleKey = (typeof MODULES)[number]["key"];

// ─── Prompt tanımları ─────────────────────────────────────────────────────────

interface PromptDef {
  key: string;
  label: string;
  description: string;
  placeholder: string;
  rows?: number;
}

const PROMPTS_BY_MODULE: Record<ModuleKey, PromptDef[]> = {
  standard_video: [
    {
      key: "script_prompt_template",
      label: "Senaryo Üretim Promptu",
      description:
        "LLM'e gönderilecek ana senaryo talimatı. {topic} değişkeni konu adıyla değiştirilir.",
      placeholder:
        "Aşağıdaki konu hakkında 10 sahneli bir video senaryosu yaz:\nKonu: {topic}\n\n" +
        "Her sahne şunları içermeli:\n- scene_number (1-10)\n- narration (seslendirilecek metin, 30-60 kelime)\n" +
        "- visual_keywords (görsel araması için 3-5 anahtar kelime)\n- duration_seconds (4-8 saniye)\n\n" +
        "JSON formatında döndür. Türkçe içerik üret.",
      rows: 10,
    },
    {
      key: "metadata_prompt_template",
      label: "Metadata Üretim Promptu",
      description:
        "YouTube başlık, açıklama ve etiket üretim talimatı. {topic} ve {script_summary} değişkenleri kullanılabilir.",
      placeholder:
        "Aşağıdaki video için YouTube metadata üret:\nKonu: {topic}\n\n" +
        "JSON döndür:\n- title (60 karakter max, SEO optimize)\n- description (300-500 kelime, anahtar kelimeler içermeli)\n" +
        "- tags (15 etiket, kısa ve alakalı)\n- category (YouTube kategori ID)\n\nTürkçe içerik üret.",
      rows: 8,
    },
  ],
  news_bulletin: [
    {
      key: "script_prompt_template",
      label: "Senaryo Üretim Promptu",
      description:
        "Haber bülteni senaryo talimatı. {news_items} değişkeni haber başlıklarıyla değiştirilir.",
      placeholder:
        "Aşağıdaki haber başlıklarından profesyonel bir video bülten senaryosu oluştur:\n{news_items}\n\n" +
        "Kurallar:\n- Her haber için 2-3 cümle kısa anlatım\n- Akıcı ve televizyon haberciliği tonu\n" +
        "- Bağlantı cümleleri ile haberler arası geçiş yap\n\nJSON formatında döndür.",
      rows: 9,
    },
    {
      key: "metadata_prompt_template",
      label: "Metadata Üretim Promptu",
      description: "Haber bülteni YouTube metadata üretim talimatı.",
      placeholder:
        "Haber bülteni videosu için YouTube metadata üret:\nHaberler: {news_summary}\n\n" +
        "JSON döndür: title, description, tags",
      rows: 6,
    },
  ],
  product_review: [
    {
      key: "script_prompt_template",
      label: "Senaryo Üretim Promptu",
      description:
        "Ürün inceleme senaryo talimatı. {product_name} ve {product_info} değişkenleri kullanılabilir.",
      placeholder:
        "Aşağıdaki ürün için kapsamlı bir inceleme videosu senaryosu yaz:\nÜrün: {product_name}\nBilgi: {product_info}\n\n" +
        "Senaryo yapısı:\n1. Ürün tanıtımı\n2. Tasarım ve kalite değerlendirmesi\n3. Performans testi\n" +
        "4. Artılar ve eksiler\n5. Fiyat/performans değerlendirmesi\n6. Sonuç\n\n" +
        "JSON formatında 8 sahnelik senaryo döndür.",
      rows: 12,
    },
    {
      key: "metadata_prompt_template",
      label: "Metadata Üretim Promptu",
      description: "Ürün inceleme YouTube metadata üretim talimatı.",
      placeholder:
        "Ürün inceleme videosu için YouTube metadata üret:\nÜrün: {product_name}\n\n" +
        "JSON döndür: title, description, tags",
      rows: 6,
    },
  ],
};

// ─── Ana Bileşen ─────────────────────────────────────────────────────────────

export default function PromptManager() {
  const { createSetting, updateSetting, deleteSetting } = useAdminStore();
  const addToast = useUIStore((s) => s.addToast);

  const [activeModule, setActiveModule] = useState<ModuleKey>("standard_video");
  const [settingsMap, setSettingsMap] = useState<Record<ModuleKey, SettingRecord[]>>({
    standard_video: [],
    news_bulletin: [],
    product_review: [],
  });
  const [loadingMap, setLoadingMap] = useState<Record<ModuleKey, boolean>>({
    standard_video: false,
    news_bulletin: false,
    product_review: false,
  });

  async function loadModuleSettings(moduleKey: ModuleKey) {
    setLoadingMap((prev) => ({ ...prev, [moduleKey]: true }));
    try {
      const pin = localStorage.getItem("cm-admin-pin") ?? "0000";
      const query = new URLSearchParams({ scope: "module", scope_id: moduleKey });
      const res = await fetch(`/api/settings?${query.toString()}`, {
        headers: { "X-Admin-Pin": pin },
      });
      if (res.ok) {
        const data: SettingRecord[] = await res.json();
        setSettingsMap((prev) => ({ ...prev, [moduleKey]: data }));
      }
    } catch {
      // sessiz
    } finally {
      setLoadingMap((prev) => ({ ...prev, [moduleKey]: false }));
    }
  }

  const loadAll = useCallback(async () => {
    await Promise.all(MODULES.map((m) => loadModuleSettings(m.key)));
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const activeModuleMeta = MODULES.find((m) => m.key === activeModule)!;
  const activePrompts = PROMPTS_BY_MODULE[activeModule];
  const activeSettings = settingsMap[activeModule];
  const isLoading = loadingMap[activeModule];

  async function handleSavePrompt(def: PromptDef, value: string) {
    const existing = activeSettings.find((s) => s.key === def.key);

    // Boş değer → kaydı sil (sistem varsayılan promptu kullanılacak)
    if (value.trim() === "") {
      if (existing) {
        const ok = await deleteSetting(existing.id);
        if (ok) {
          setSettingsMap((prev) => ({
            ...prev,
            [activeModule]: prev[activeModule].filter((s) => s.key !== def.key),
          }));
          addToast({ type: "info", title: "Prompt sıfırlandı", description: `${def.label} — sistem varsayılanı kullanılacak.` });
        } else {
          addToast({ type: "error", title: "Silinemedi", description: def.label });
        }
      }
      return;
    }

    if (existing) {
      const result = await updateSetting(existing.id, { value });
      if (result) {
        setSettingsMap((prev) => ({
          ...prev,
          [activeModule]: prev[activeModule].map((s) =>
            s.key === def.key ? { ...s, value } : s
          ),
        }));
        addToast({ type: "success", title: "Prompt güncellendi", description: def.label });
      } else {
        addToast({ type: "error", title: "Güncellenemedi", description: def.label });
      }
    } else {
      const result = await createSetting({
        scope: "module",
        scope_id: activeModule,
        key: def.key,
        value,
        locked: false,
        description: def.description,
      });
      if (result) {
        setSettingsMap((prev) => ({
          ...prev,
          [activeModule]: [...prev[activeModule], result],
        }));
        addToast({ type: "success", title: "Prompt kaydedildi", description: def.label });
      } else {
        addToast({ type: "error", title: "Kaydedilemedi", description: def.label });
      }
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={20} className="text-violet-400" />
          <h2 className="text-lg font-semibold text-foreground">Master Promptlar</h2>
        </div>
        <button
          onClick={loadAll}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <RefreshCw size={12} />
          Yenile
        </button>
      </div>

      {/* Bilgi notu */}
      <div className="flex items-start gap-2 rounded-lg bg-violet-500/10 border border-violet-500/20 px-3 py-2.5 text-xs text-violet-300">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>
          Buradaki promptlar video üretimi sırasında LLM'e gönderilir.{" "}
          <span className="text-violet-300/70">
            Boş bırakılan alanlar için sistem varsayılan promptu kullanılır.{" "}
            Değişkenler: <code className="font-mono bg-violet-500/20 px-1 rounded">&#123;topic&#125;</code>,{" "}
            <code className="font-mono bg-violet-500/20 px-1 rounded">&#123;product_name&#125;</code>,{" "}
            <code className="font-mono bg-violet-500/20 px-1 rounded">&#123;news_items&#125;</code>
          </span>
        </span>
      </div>

      {/* Ana içerik — sol modül menüsü + sağ editör */}
      <div className="flex gap-4">
        {/* Sol: modül menüsü */}
        <div className="w-52 shrink-0 space-y-1">
          {MODULES.map((mod) => {
            const isActive = activeModule === mod.key;
            const settings = settingsMap[mod.key];
            const filledCount = PROMPTS_BY_MODULE[mod.key].filter((p) =>
              settings.some((s) => s.key === p.key && s.value)
            ).length;
            const totalCount = PROMPTS_BY_MODULE[mod.key].length;

            return (
              <button
                key={mod.key}
                type="button"
                onClick={() => setActiveModule(mod.key)}
                className={cn(
                  "w-full flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
                  isActive
                    ? cn("border", mod.activeBg)
                    : "border-border bg-card hover:bg-accent/30"
                )}
              >
                <span className={cn("mt-0.5 shrink-0", isActive ? mod.color : "text-muted-foreground")}>
                  {mod.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-xs font-medium",
                      isActive ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {mod.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">{mod.description}</p>
                  <div className="mt-1.5 flex items-center gap-1">
                    <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          isActive ? mod.color.replace("text-", "bg-") : "bg-muted-foreground/40"
                        )}
                        style={{ width: `${(filledCount / totalCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground/50 shrink-0">
                      {filledCount}/{totalCount}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Sağ: prompt editörler */}
        <div className="flex-1 min-w-0">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Modül başlığı */}
            <div
              className={cn(
                "flex items-center gap-2 border-b border-border px-4 py-3",
                activeModuleMeta.activeBg.split(" ")[0]
              )}
            >
              <span className={activeModuleMeta.color}>{activeModuleMeta.icon}</span>
              <p className="text-sm font-semibold text-foreground">{activeModuleMeta.label}</p>
              <span className="text-xs text-muted-foreground">— Prompt Şablonları</span>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin mr-2" />
                Yükleniyor...
              </div>
            ) : (
              <div className="divide-y divide-border">
                {activePrompts.map((def) => {
                  const dbRecord = activeSettings.find((s) => s.key === def.key) ?? null;
                  return (
                    <PromptEditor
                      key={`${activeModule}-${def.key}`}
                      def={def}
                      dbRecord={dbRecord}
                      onSave={handleSavePrompt}
                      accentColor={activeModuleMeta.color}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Prompt Editör ────────────────────────────────────────────────────────────

function PromptEditor({
  def,
  dbRecord,
  onSave,
  accentColor,
}: {
  def: PromptDef;
  dbRecord: SettingRecord | null;
  onSave: (def: PromptDef, value: string) => Promise<void>;
  accentColor: string;
}) {
  // Kaydedilen değeri her zaman dbRecord'dan türet (stale closure önlemi)
  function getDbValue(record: SettingRecord | null): string {
    if (!record) return "";
    return typeof record.value === "string" ? record.value : JSON.stringify(record.value);
  }

  const [value, setValue] = useState(() => getDbValue(dbRecord));
  const [savedValue, setSavedValue] = useState(() => getDbValue(dbRecord));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // dbRecord güncellendiğinde (başarılı kayıt sonrası) yerel state'i senkronize et
  useEffect(() => {
    const v = getDbValue(dbRecord);
    setValue(v);
    setSavedValue(v);
  }, [dbRecord]);

  const isDirty = value !== savedValue;
  const isCustomized = !!dbRecord?.value;

  async function handleSave() {
    setSaving(true);
    await onSave(def, value);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="p-4 space-y-3">
      {/* Başlık + kaydet */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-foreground">{def.label}</p>
            {isCustomized && (
              <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", accentColor, "bg-current/10")}>
                <span className={accentColor}>özelleştirilmiş</span>
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{def.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {value && (
            <button
              type="button"
              onClick={() => setValue("")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Varsayılana dön
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className={cn(
              "flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
              saved
                ? "bg-emerald-500/15 text-emerald-400"
                : isDirty
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
            )}
          >
            {saving ? (
              <Loader2 size={11} className="animate-spin" />
            ) : saved ? (
              <CheckCircle2 size={11} />
            ) : (
              <Save size={11} />
            )}
            {saved ? "Kaydedildi" : "Kaydet"}
          </button>
        </div>
      </div>

      {/* Textarea */}
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={def.placeholder}
        rows={def.rows ?? 8}
        className={cn(
          "w-full rounded-lg border bg-input px-3 py-2.5 text-xs text-foreground outline-none transition-colors font-mono leading-relaxed resize-y placeholder:text-muted-foreground/35",
          isDirty
            ? "border-primary/40 focus:ring-2 focus:ring-primary/20"
            : "border-border focus:ring-2 focus:ring-ring"
        )}
      />

      {/* Alt bilgi */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground/50">
          {value === "" ? (
            <span className="flex items-center gap-1">
              <AlertCircle size={9} />
              Boş — sistem varsayılan prompt kullanılacak
            </span>
          ) : (
            `${value.length} karakter`
          )}
        </p>
        {isDirty && (
          <p className="text-[10px] text-amber-400/70">Kaydedilmemiş değişiklik var</p>
        )}
      </div>
    </div>
  );
}
