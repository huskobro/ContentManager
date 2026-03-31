/**
 * PromptManager — Master Prompt & İçerik Yönetimi.
 *
 * Üç sekme:
 *   1. Modül Promptları  — script_prompt_template / metadata_prompt_template (modül bazlı)
 *   2. Kategoriler       — DB tabanlı tam CRUD (builtin + custom)
 *   3. Açılış Hook'ları  — DB tabanlı tam CRUD (builtin + custom, tr/en)
 *
 * Kategori/Hook sistemi:
 *   • Builtin (is_builtin=true): Düzenlenebilir + enable/disable, SİLİNEMEZ
 *   • Custom (is_builtin=false): Tam CRUD — oluştur, düzenle, sil
 *   • API: GET/POST/PUT/DELETE /api/admin/categories, GET/POST/PUT/DELETE /api/admin/hooks
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
  Tag,
  Zap,
  RotateCcw,
  ToggleLeft,
  ToggleRight,
  Plus,
  Trash2,
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
  },
  {
    key: "news_bulletin" as const,
    label: "Haber Bülteni",
    description: "Haber kaynaklarından video bülten",
    icon: <Newspaper size={16} />,
    color: "text-amber-400",
    activeBg: "bg-amber-500/10 border-amber-500/30",
  },
  {
    key: "product_review" as const,
    label: "Ürün İnceleme",
    description: "Ürün bilgisiyle inceleme videosu",
    icon: <ShoppingBag size={16} />,
    color: "text-emerald-400",
    activeBg: "bg-emerald-500/10 border-emerald-500/30",
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

// ─── Backend Tipleri ──────────────────────────────────────────────────────────

interface CategoryDetail {
  id?: number;
  key: string;
  name_tr: string;
  name_en: string;
  tone: string;
  focus: string;
  style_instruction: string;
  // legacy (DB'de olmayan hardcoded fallback için)
  default_tone?: string;
  default_focus?: string;
  default_style_instruction?: string;
  has_override: boolean;
  enabled: boolean;
  is_builtin: boolean;
  sort_order?: number;
}

interface HookDetail {
  id?: number;
  type: string;
  lang?: string;
  name: string;
  template: string;
  // legacy
  default_name?: string;
  default_template?: string;
  has_override: boolean;
  enabled: boolean;
  is_builtin: boolean;
  sort_order?: number;
}

// Yeni kategori oluşturma formu
interface NewCategoryForm {
  key: string;
  name_tr: string;
  name_en: string;
  tone: string;
  focus: string;
  style_instruction: string;
}

// Yeni hook oluşturma formu
interface NewHookForm {
  type: string;
  name: string;
  template: string;
  lang: "tr" | "en";
}

// ─── Ana Bileşen ─────────────────────────────────────────────────────────────

type Tab = "prompts" | "categories" | "hooks";

export default function PromptManager() {
  const [activeTab, setActiveTab] = useState<Tab>("prompts");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "prompts", label: "Modül Promptları", icon: <FileText size={14} /> },
    { id: "categories", label: "Kategoriler", icon: <Tag size={14} /> },
    { id: "hooks", label: "Açılış Hook'ları", icon: <Zap size={14} /> },
  ];

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

  const [categories, setCategories] = useState<CategoryDetail[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [showNewCategoryForm, setShowNewCategoryForm] = useState(false);
  const [newCategory, setNewCategory] = useState<NewCategoryForm>({
    key: "", name_tr: "", name_en: "", tone: "", focus: "", style_instruction: "",
  });
  const [newCategorySaving, setNewCategorySaving] = useState(false);

  const [hooks, setHooks] = useState<{ tr: HookDetail[]; en: HookDetail[] }>({ tr: [], en: [] });
  const [hookLang, setHookLang] = useState<"tr" | "en">("tr");
  const [hookLoading, setHookLoading] = useState(false);
  const [showNewHookForm, setShowNewHookForm] = useState(false);
  const [newHook, setNewHook] = useState<NewHookForm>({
    type: "", name: "", template: "", lang: "tr",
  });
  const [newHookSaving, setNewHookSaving] = useState(false);

  const adminPin = localStorage.getItem("cm-admin-pin") ?? "0000";

  async function loadModuleSettings(moduleKey: ModuleKey) {
    setLoadingMap((prev) => ({ ...prev, [moduleKey]: true }));
    try {
      const query = new URLSearchParams({ scope: "module", scope_id: moduleKey });
      const res = await fetch(`/api/settings?${query.toString()}`, {
        headers: { "X-Admin-Pin": adminPin },
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

  async function loadCategories() {
    setCategoryLoading(true);
    try {
      const res = await fetch("/api/admin/categories", {
        headers: { "X-Admin-Pin": adminPin },
      });
      if (res.ok) {
        setCategories(await res.json());
      }
    } catch {
      // sessiz
    } finally {
      setCategoryLoading(false);
    }
  }

  async function loadHooks(lang: "tr" | "en") {
    setHookLoading(true);
    try {
      const res = await fetch(`/api/admin/hooks/${lang}`, {
        headers: { "X-Admin-Pin": adminPin },
      });
      if (res.ok) {
        const data: HookDetail[] = await res.json();
        setHooks((prev) => ({ ...prev, [lang]: data }));
      }
    } catch {
      // sessiz
    } finally {
      setHookLoading(false);
    }
  }

  const loadAll = useCallback(async () => {
    await Promise.all([
      ...MODULES.map((m) => loadModuleSettings(m.key)),
      loadCategories(),
      loadHooks("tr"),
      loadHooks("en"),
    ]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleSavePrompt(def: PromptDef, value: string) {
    const existing = settingsMap[activeModule].find((s) => s.key === def.key);

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

  async function handleSaveCategory(cat: CategoryDetail, patch: Partial<CategoryDetail>) {
    const body: Record<string, unknown> = {};
    if (patch.tone !== undefined) body.tone = patch.tone;
    if (patch.focus !== undefined) body.focus = patch.focus;
    if (patch.style_instruction !== undefined) body.style_instruction = patch.style_instruction;
    if (patch.name_tr !== undefined) body.name_tr = patch.name_tr;
    if (patch.name_en !== undefined) body.name_en = patch.name_en;
    if (patch.enabled !== undefined) body.enabled = patch.enabled;
    try {
      const res = await fetch(`/api/admin/categories/${cat.key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Admin-Pin": adminPin },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await loadCategories();
        addToast({ type: "success", title: "Kategori güncellendi", description: cat.name_tr });
      } else {
        const err = await res.json().catch(() => ({}));
        addToast({ type: "error", title: "Güncellenemedi", description: (err as { detail?: string }).detail ?? cat.name_tr });
      }
    } catch {
      addToast({ type: "error", title: "Bağlantı hatası", description: cat.name_tr });
    }
  }

  async function handleCreateCategory() {
    if (!newCategory.key || !newCategory.name_tr || !newCategory.name_en) {
      addToast({ type: "error", title: "Eksik alan", description: "key, Türkçe ad ve İngilizce ad zorunludur." });
      return;
    }
    setNewCategorySaving(true);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Pin": adminPin },
        body: JSON.stringify(newCategory),
      });
      if (res.ok) {
        await loadCategories();
        setShowNewCategoryForm(false);
        setNewCategory({ key: "", name_tr: "", name_en: "", tone: "", focus: "", style_instruction: "" });
        addToast({ type: "success", title: "Kategori oluşturuldu", description: newCategory.name_tr });
      } else {
        const err = await res.json().catch(() => ({}));
        addToast({ type: "error", title: "Oluşturulamadı", description: (err as { detail?: string }).detail ?? "Hata oluştu" });
      }
    } catch {
      addToast({ type: "error", title: "Bağlantı hatası", description: "Kategori oluşturulamadı" });
    } finally {
      setNewCategorySaving(false);
    }
  }

  async function handleDeleteCategory(cat: CategoryDetail) {
    if (!confirm(`"${cat.name_tr}" kategorisi silinsin mi? Bu işlem geri alınamaz.`)) return;
    try {
      const res = await fetch(`/api/admin/categories/${cat.key}`, {
        method: "DELETE",
        headers: { "X-Admin-Pin": adminPin },
      });
      if (res.ok) {
        await loadCategories();
        addToast({ type: "info", title: "Kategori silindi", description: cat.name_tr });
      } else {
        const err = await res.json().catch(() => ({}));
        addToast({ type: "error", title: "Silinemedi", description: (err as { detail?: string }).detail ?? cat.name_tr });
      }
    } catch {
      addToast({ type: "error", title: "Bağlantı hatası", description: cat.name_tr });
    }
  }

  async function handleSaveHook(hook: HookDetail, lang: "tr" | "en", patch: Partial<HookDetail>) {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.template !== undefined) body.template = patch.template;
    if (patch.enabled !== undefined) body.enabled = patch.enabled;
    try {
      const res = await fetch(`/api/admin/hooks/${hook.type}/${lang}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Admin-Pin": adminPin },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await loadHooks(lang);
        addToast({ type: "success", title: "Hook güncellendi", description: hook.name });
      } else {
        const err = await res.json().catch(() => ({}));
        addToast({ type: "error", title: "Güncellenemedi", description: (err as { detail?: string }).detail ?? hook.name });
      }
    } catch {
      addToast({ type: "error", title: "Bağlantı hatası", description: hook.name });
    }
  }

  async function handleCreateHook() {
    if (!newHook.type || !newHook.name || !newHook.template) {
      addToast({ type: "error", title: "Eksik alan", description: "type, ad ve şablon zorunludur." });
      return;
    }
    setNewHookSaving(true);
    try {
      const res = await fetch("/api/admin/hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Pin": adminPin },
        body: JSON.stringify({ ...newHook, lang: hookLang }),
      });
      if (res.ok) {
        await loadHooks(hookLang);
        setShowNewHookForm(false);
        setNewHook({ type: "", name: "", template: "", lang: "tr" });
        addToast({ type: "success", title: "Hook oluşturuldu", description: newHook.name });
      } else {
        const err = await res.json().catch(() => ({}));
        addToast({ type: "error", title: "Oluşturulamadı", description: (err as { detail?: string }).detail ?? "Hata oluştu" });
      }
    } catch {
      addToast({ type: "error", title: "Bağlantı hatası", description: "Hook oluşturulamadı" });
    } finally {
      setNewHookSaving(false);
    }
  }

  async function handleDeleteHook(hook: HookDetail, lang: "tr" | "en") {
    if (!confirm(`"${hook.name}" hook'u silinsin mi? Bu işlem geri alınamaz.`)) return;
    try {
      const res = await fetch(`/api/admin/hooks/${hook.type}/${lang}`, {
        method: "DELETE",
        headers: { "X-Admin-Pin": adminPin },
      });
      if (res.ok) {
        await loadHooks(lang);
        addToast({ type: "info", title: "Hook silindi", description: hook.name });
      } else {
        const err = await res.json().catch(() => ({}));
        addToast({ type: "error", title: "Silinemedi", description: (err as { detail?: string }).detail ?? hook.name });
      }
    } catch {
      addToast({ type: "error", title: "Bağlantı hatası", description: hook.name });
    }
  }

  const activeModuleMeta = MODULES.find((m) => m.key === activeModule)!;
  const activePrompts = PROMPTS_BY_MODULE[activeModule];
  const activeSettings = settingsMap[activeModule];
  const isModuleLoading = loadingMap[activeModule];

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

      {/* Sekme çubuğu */}
      <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all",
              activeTab === tab.id
                ? "bg-violet-500/15 text-violet-300 border border-violet-500/30"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Sekme 1: Modül Promptları ───────────────────────────────────────── */}
      {activeTab === "prompts" && (
        <>
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

          <div className="flex gap-4">
            {/* Sol: modül menüsü */}
            <div className="w-52 shrink-0 space-y-1">
              {MODULES.map((mod) => {
                const isActive = activeModule === mod.key;
                const modSettings = settingsMap[mod.key];
                const filledCount = PROMPTS_BY_MODULE[mod.key].filter((p) =>
                  modSettings.some((s) => s.key === p.key && s.value)
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
                      <p className={cn("text-xs font-medium", isActive ? "text-foreground" : "text-muted-foreground")}>
                        {mod.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">{mod.description}</p>
                      <div className="mt-1.5 flex items-center gap-1">
                        <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", isActive ? mod.color.replace("text-", "bg-") : "bg-muted-foreground/40")}
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
                <div className={cn("flex items-center gap-2 border-b border-border px-4 py-3", activeModuleMeta.activeBg.split(" ")[0])}>
                  <span className={activeModuleMeta.color}>{activeModuleMeta.icon}</span>
                  <p className="text-sm font-semibold text-foreground">{activeModuleMeta.label}</p>
                  <span className="text-xs text-muted-foreground">— Prompt Şablonları</span>
                </div>

                {isModuleLoading ? (
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
        </>
      )}

      {/* ── Sekme 2: Kategoriler ─────────────────────────────────────────────── */}
      {activeTab === "categories" && (
        <>
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 text-xs text-amber-300">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>
              Kategori içerikleri LLM system prompt'una eklenir.{" "}
              <span className="text-amber-300/70">
                Yerleşik (builtin) kategoriler düzenlenebilir, devre dışı bırakılabilir, ancak silinemez.
                Özel (custom) kategoriler eklenebilir ve silinebilir.
                Genel kategorisi hiçbir zaman prompt'a eklenmez.
                Pasif kategoriler prompt enhancement'ından atlanır.
              </span>
            </span>
          </div>

          {/* Yeni Kategori Ekle butonu */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowNewCategoryForm((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20 transition-colors"
            >
              <Plus size={12} />
              Yeni Kategori
            </button>
          </div>

          {/* Yeni Kategori Formu */}
          {showNewCategoryForm && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
              <p className="text-xs font-semibold text-amber-300">Yeni Kategori Oluştur</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Key (benzersiz, küçük harf/_ )</label>
                  <input type="text" value={newCategory.key} onChange={(e) => setNewCategory((p) => ({ ...p, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
                    placeholder="ornek_kategori"
                    className="w-full rounded-lg border border-border bg-input px-2.5 py-1.5 text-xs font-mono text-foreground outline-none focus:ring-2 focus:ring-amber-500/30" />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Türkçe Ad</label>
                  <input type="text" value={newCategory.name_tr} onChange={(e) => setNewCategory((p) => ({ ...p, name_tr: e.target.value }))}
                    placeholder="Örnek Kategori"
                    className="w-full rounded-lg border border-border bg-input px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-amber-500/30" />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">İngilizce Ad</label>
                  <input type="text" value={newCategory.name_en} onChange={(e) => setNewCategory((p) => ({ ...p, name_en: e.target.value }))}
                    placeholder="Example Category"
                    className="w-full rounded-lg border border-border bg-input px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-amber-500/30" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Ton (opsiyonel)</label>
                <input type="text" value={newCategory.tone} onChange={(e) => setNewCategory((p) => ({ ...p, tone: e.target.value }))}
                  placeholder="İçerik tonu..."
                  className="w-full rounded-lg border border-border bg-input px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-amber-500/30" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Odak (opsiyonel)</label>
                <input type="text" value={newCategory.focus} onChange={(e) => setNewCategory((p) => ({ ...p, focus: e.target.value }))}
                  placeholder="İçerik odağı..."
                  className="w-full rounded-lg border border-border bg-input px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-amber-500/30" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Stil Talimatı (opsiyonel)</label>
                <textarea value={newCategory.style_instruction} onChange={(e) => setNewCategory((p) => ({ ...p, style_instruction: e.target.value }))}
                  placeholder="Stil talimatı..."
                  rows={3}
                  className="w-full rounded-lg border border-border bg-input px-2.5 py-1.5 text-xs text-foreground font-mono outline-none focus:ring-2 focus:ring-amber-500/30 resize-y" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowNewCategoryForm(false)}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">İptal</button>
                <button type="button" onClick={handleCreateCategory} disabled={newCategorySaving}
                  className="flex items-center gap-1 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-400 transition-colors disabled:opacity-50">
                  {newCategorySaving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                  Oluştur
                </button>
              </div>
            </div>
          )}

          {categoryLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin mr-2" />
              Yükleniyor...
            </div>
          ) : (
            <div className="space-y-3">
              {categories.map((cat) => (
                <CategoryEditor
                  key={cat.key}
                  cat={cat}
                  onSave={handleSaveCategory}
                  onDelete={handleDeleteCategory}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Sekme 3: Hook'lar ────────────────────────────────────────────────── */}
      {activeTab === "hooks" && (
        <>
          <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 text-xs text-emerald-300">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>
              Açılış hook'ları use_hook_variety etkin olduğunda senaryonun user prompt'una eklenir.{" "}
              <span className="text-emerald-300/70">
                Yerleşik (builtin) hook'lar düzenlenebilir, devre dışı bırakılabilir, ancak silinemez.
                Özel (custom) hook'lar eklenebilir ve silinebilir.
                Pasif hook'lar seçim havuzundan çıkarılır. Tüm hook'lar pasifse sistem tüm havuzu etkinleştirir.
              </span>
            </span>
          </div>

          {/* Dil seçici + Yeni Hook butonu */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              {(["tr", "en"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setHookLang(lang)}
                  className={cn(
                    "rounded-lg border px-4 py-1.5 text-xs font-medium transition-colors",
                    hookLang === lang
                      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                      : "border-border bg-card text-muted-foreground hover:bg-accent/30"
                  )}
                >
                  {lang === "tr" ? "🇹🇷 Türkçe" : "🇬🇧 English"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowNewHookForm((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            >
              <Plus size={12} />
              Yeni Hook
            </button>
          </div>

          {/* Yeni Hook Formu */}
          {showNewHookForm && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
              <p className="text-xs font-semibold text-emerald-300">Yeni Hook Oluştur ({hookLang === "tr" ? "Türkçe" : "English"})</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Type (benzersiz, küçük harf/_ )</label>
                  <input type="text" value={newHook.type} onChange={(e) => setNewHook((p) => ({ ...p, type: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
                    placeholder="ornek_hook"
                    className="w-full rounded-lg border border-border bg-input px-2.5 py-1.5 text-xs font-mono text-foreground outline-none focus:ring-2 focus:ring-emerald-500/30" />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Görünen Ad</label>
                  <input type="text" value={newHook.name} onChange={(e) => setNewHook((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Örnek Hook"
                    className="w-full rounded-lg border border-border bg-input px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-emerald-500/30" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Talimat Şablonu</label>
                <textarea value={newHook.template} onChange={(e) => setNewHook((p) => ({ ...p, template: e.target.value }))}
                  placeholder="Hook talimatı..."
                  rows={4}
                  className="w-full rounded-lg border border-border bg-input px-2.5 py-1.5 text-xs text-foreground font-mono outline-none focus:ring-2 focus:ring-emerald-500/30 resize-y" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowNewHookForm(false)}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">İptal</button>
                <button type="button" onClick={handleCreateHook} disabled={newHookSaving}
                  className="flex items-center gap-1 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-emerald-400 transition-colors disabled:opacity-50">
                  {newHookSaving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                  Oluştur
                </button>
              </div>
            </div>
          )}

          {hookLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin mr-2" />
              Yükleniyor...
            </div>
          ) : (
            <div className="space-y-3">
              {hooks[hookLang].map((hook) => (
                <HookEditor
                  key={`${hook.type}-${hookLang}`}
                  hook={hook}
                  lang={hookLang}
                  onSave={handleSaveHook}
                  onDelete={handleDeleteHook}
                />
              ))}
            </div>
          )}
        </>
      )}
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
  function getDbValue(record: SettingRecord | null): string {
    if (!record) return "";
    return typeof record.value === "string" ? record.value : JSON.stringify(record.value);
  }

  const [value, setValue] = useState(() => getDbValue(dbRecord));
  const [savedValue, setSavedValue] = useState(() => getDbValue(dbRecord));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
            {saving ? <Loader2 size={11} className="animate-spin" /> : saved ? <CheckCircle2 size={11} /> : <Save size={11} />}
            {saved ? "Kaydedildi" : "Kaydet"}
          </button>
        </div>
      </div>

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
        {isDirty && <p className="text-[10px] text-amber-400/70">Kaydedilmemiş değişiklik var</p>}
      </div>
    </div>
  );
}

// ─── Kategori Editör ──────────────────────────────────────────────────────────

function CategoryEditor({
  cat,
  onSave,
  onDelete,
}: {
  cat: CategoryDetail;
  onSave: (cat: CategoryDetail, patch: Partial<CategoryDetail>) => Promise<void>;
  onDelete: (cat: CategoryDetail) => Promise<void>;
}) {
  const [tone, setTone] = useState(cat.tone);
  const [focus, setFocus] = useState(cat.focus);
  const [styleInstruction, setStyleInstruction] = useState(cat.style_instruction);
  const [nameTr, setNameTr] = useState(cat.name_tr);
  const [nameEn, setNameEn] = useState(cat.name_en);
  const [enabled, setEnabled] = useState(cat.enabled);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setTone(cat.tone);
    setFocus(cat.focus);
    setStyleInstruction(cat.style_instruction);
    setNameTr(cat.name_tr);
    setNameEn(cat.name_en);
    setEnabled(cat.enabled);
  }, [cat]);

  const isDirty =
    tone !== cat.tone ||
    focus !== cat.focus ||
    styleInstruction !== cat.style_instruction ||
    nameTr !== cat.name_tr ||
    nameEn !== cat.name_en ||
    enabled !== cat.enabled;

  async function handleSave() {
    setSaving(true);
    await onSave(cat, { tone, focus, style_instruction: styleInstruction, name_tr: nameTr, name_en: nameEn, enabled });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const isGeneral = cat.key === "general";

  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden", !enabled && "opacity-60")}>
      {/* Başlık */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 flex items-center gap-3 text-left min-w-0"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-foreground">{cat.name_tr}</p>
              <span className="text-[10px] text-muted-foreground font-mono">{cat.name_en}</span>
              <span className="text-[10px] font-mono text-muted-foreground/50">[{cat.key}]</span>
              {cat.has_override && (
                <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                  özel
                </span>
              )}
              {!cat.is_builtin && (
                <span className="text-[10px] text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded">
                  custom
                </span>
              )}
              {isGeneral && (
                <span className="text-[10px] text-muted-foreground/60 italic">içerik eklenmez</span>
              )}
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground/50 shrink-0">
            {expanded ? "▲" : "▼"}
          </span>
        </button>

        {/* Enabled toggle */}
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          title={enabled ? "Pasif yap" : "Aktif yap"}
          className={cn(
            "flex items-center gap-1 text-xs transition-colors shrink-0",
            enabled ? "text-emerald-400" : "text-muted-foreground/50"
          )}
        >
          {enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
        </button>
      </div>

      {/* Detay */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          {/* Custom: ad alanları düzenlenebilir */}
          {!cat.is_builtin && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">Türkçe Ad</label>
                <input type="text" value={nameTr} onChange={(e) => setNameTr(e.target.value)}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring transition-colors" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">İngilizce Ad</label>
                <input type="text" value={nameEn} onChange={(e) => setNameEn(e.target.value)}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring transition-colors" />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-muted-foreground">Ton</label>
            <input type="text" value={tone} onChange={(e) => setTone(e.target.value)}
              placeholder={cat.default_tone ?? "Ton..."}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring transition-colors" />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-muted-foreground">Odak</label>
            <input type="text" value={focus} onChange={(e) => setFocus(e.target.value)}
              placeholder={cat.default_focus ?? "Odak..."}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring transition-colors" />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-muted-foreground">Stil Talimatı</label>
            <textarea value={styleInstruction} onChange={(e) => setStyleInstruction(e.target.value)}
              placeholder={cat.default_style_instruction ?? "Stil talimatı..."}
              rows={4}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground font-mono outline-none focus:ring-2 focus:ring-ring transition-colors resize-y" />
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              {cat.is_builtin ? (
                <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1">
                  <RotateCcw size={9} />
                  Yerleşik — silinemez
                </span>
              ) : (
                <button type="button" onClick={() => onDelete(cat)}
                  className="flex items-center gap-1 text-xs text-red-400/70 hover:text-red-400 transition-colors">
                  <Trash2 size={11} />
                  Sil
                </button>
              )}
            </div>

            <button type="button" onClick={handleSave} disabled={saving || !isDirty}
              className={cn(
                "flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                saved ? "bg-emerald-500/15 text-emerald-400"
                  : isDirty ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
              )}>
              {saving ? <Loader2 size={11} className="animate-spin" /> : saved ? <CheckCircle2 size={11} /> : <Save size={11} />}
              {saved ? "Kaydedildi" : "Kaydet"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Hook Editör ──────────────────────────────────────────────────────────────

function HookEditor({
  hook,
  lang,
  onSave,
  onDelete,
}: {
  hook: HookDetail;
  lang: "tr" | "en";
  onSave: (hook: HookDetail, lang: "tr" | "en", patch: Partial<HookDetail>) => Promise<void>;
  onDelete: (hook: HookDetail, lang: "tr" | "en") => Promise<void>;
}) {
  const [name, setName] = useState(hook.name);
  const [template, setTemplate] = useState(hook.template);
  const [enabled, setEnabled] = useState(hook.enabled);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setName(hook.name);
    setTemplate(hook.template);
    setEnabled(hook.enabled);
  }, [hook]);

  const isDirty = name !== hook.name || template !== hook.template || enabled !== hook.enabled;

  async function handleSave() {
    setSaving(true);
    await onSave(hook, lang, { name, template, enabled });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden", !enabled && "opacity-60")}>
      {/* Başlık */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 flex items-center gap-3 text-left min-w-0"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-foreground">{name}</p>
              <span className="text-[10px] text-muted-foreground font-mono">{hook.type}</span>
              {hook.has_override && (
                <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                  özel
                </span>
              )}
              {!hook.is_builtin && (
                <span className="text-[10px] text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded">
                  custom
                </span>
              )}
              {!enabled && (
                <span className="text-[10px] text-red-400/70 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded">
                  pasif
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">{template}</p>
          </div>
          <span className="text-[10px] text-muted-foreground/50 shrink-0">
            {expanded ? "▲" : "▼"}
          </span>
        </button>

        {/* Enabled toggle */}
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          title={enabled ? "Pasif yap" : "Aktif yap"}
          className={cn(
            "flex items-center gap-1 text-xs transition-colors shrink-0",
            enabled ? "text-emerald-400" : "text-muted-foreground/50"
          )}
        >
          {enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
        </button>
      </div>

      {/* Detay */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-muted-foreground">Görünen Ad</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-muted-foreground">Talimat Şablonu</label>
            <textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground font-mono outline-none focus:ring-2 focus:ring-ring transition-colors resize-y"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              {hook.is_builtin ? (
                <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1">
                  <RotateCcw size={9} />
                  Yerleşik — silinemez
                </span>
              ) : (
                <button type="button" onClick={() => onDelete(hook, lang)}
                  className="flex items-center gap-1 text-xs text-red-400/70 hover:text-red-400 transition-colors">
                  <Trash2 size={11} />
                  Sil
                </button>
              )}
            </div>

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
              {saving ? <Loader2 size={11} className="animate-spin" /> : saved ? <CheckCircle2 size={11} /> : <Save size={11} />}
              {saved ? "Kaydedildi" : "Kaydet"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
