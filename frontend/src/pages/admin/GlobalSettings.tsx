/**
 * GlobalSettings — Admin genel ayar yönetimi (Schema-Driven UI).
 *
 * Bölümler:
 *   1. Sistem Ayarları (max_concurrent_jobs, output_dir, video_format, language)
 *   2. Pipeline Varsayılanları (default_tts/llm/visuals/subtitle, fallback orders)
 *   3. Script Ayarları (scene_count, category, use_hook_variety, sıcaklık, token)
 *   4. Video & Ses Ayarları (tts_voice, speed, resolution, fps, altyazı, ken burns)
 *
 * NOT: Tüm prompt/template alanları yalnızca /admin/prompts (Master Promptlar) sayfasında
 * yönetilir. Bu sayfada prompt alanı bulunmaz.
 *
 * Faz 10.7 değişiklikleri:
 *   • "multiselect" tip: fallback order için checkbox-style butonlar
 *   • Master Promptlar ayrı PromptManager.tsx sayfasına taşındı
 *
 * Faz 10.8 değişiklikleri:
 *   • "providers" kategorisi kaldırıldı — API anahtarları yalnızca ProviderManager'da
 *   • Boş değer kaydı: empty/whitespace → deleteSetting (unset)
 *   • React state sync: useEffect dbRecord bağımlılığı ile yerel state senkronize
 *
 * Faz 10.9 değişiklikleri:
 *   • PromptTemplatesCard tamamen kaldırıldı — çift yönetim yüzeyi ortadan kalktı
 */

import { useEffect, useState, useCallback } from "react";
import {
  Sliders,
  Lock,
  Unlock,
  Loader2,
  AlertCircle,
  RefreshCw,
  Save,
  Eye,
  EyeOff,
  FolderOpen,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  CheckCircle2,
  Home,
  X,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useAdminStore, type SettingRecord } from "@/stores/adminStore";
import { useUIStore } from "@/stores/uiStore";
import {
  SYSTEM_SETTINGS_SCHEMA,
  SETTING_CATEGORY_META,
  type SystemSettingDef,
  type SettingCategory,
} from "@/lib/constants";
import { api, APIError } from "@/api/client";

import { cn } from "@/lib/utils";

// Klasörü yerel dosya gezgininde açar (macOS Finder, Windows Explorer).
async function openFolderInFinder(path: string): Promise<{ ok: boolean; error?: string }> {
  const adminPin = localStorage.getItem("cm-admin-pin") ?? "";
  try {
    const res = await fetch("/api/settings/admin/open-folder", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Pin": adminPin,
      },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.detail ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Ağ hatası" };
  }
}

// Değer "boş" mı? Boş ise unset (deleteSetting) yapılacak.
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

// ─── Klasör Seçici Dialog ─────────────────────────────────────────────────────

interface DirectoryEntry {
  name: string;
  path: string;
}

interface DirectoryResponse {
  current_path: string;
  parent_path: string;
  is_root: boolean;
  subdirectories: DirectoryEntry[];
}

interface FolderPickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
}

function FolderPickerDialog({ isOpen, onClose, onSelect, initialPath }: FolderPickerDialogProps) {
  const [currentPath, setCurrentPath] = useState(initialPath ?? "");
  const [parentPath, setParentPath] = useState("");
  const [isRoot, setIsRoot] = useState(false);
  const [subdirs, setSubdirs] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adminPin = localStorage.getItem("cm-admin-pin") ?? "";

  const loadDir = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = path ? `?path=${encodeURIComponent(path)}` : "";
        const data = await api.get<DirectoryResponse>(`/admin/directories${params}`, {
          adminPin,
        });
        setCurrentPath(data.current_path);
        setParentPath(data.parent_path);
        setIsRoot(data.is_root);
        setSubdirs(data.subdirectories);
      } catch (err: unknown) {
        if (err instanceof APIError && err.status === 401) {
          setError("Admin PIN gerekli veya geçersiz — Ayarlar sayfasından PIN girin");
        } else {
          setError(err instanceof Error ? err.message : "Dizin yüklenemedi");
        }
      } finally {
        setLoading(false);
      }
    },
    [adminPin]
  );

  useEffect(() => {
    if (isOpen) {
      loadDir(initialPath ?? "");
    }
  }, [isOpen, initialPath, loadDir]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl flex flex-col max-h-[80vh]">
        {/* Başlık */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <FolderOpen size={16} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">Klasör Seç</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Mevcut yol breadcrumb */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border bg-muted/30 shrink-0">
          <Home size={12} className="text-muted-foreground shrink-0" />
          <p
            className="text-[11px] text-muted-foreground font-mono truncate flex-1"
            title={currentPath}
          >
            {currentPath || "—"}
          </p>
        </div>

        {/* Dizin listesi */}
        <div className="flex-1 overflow-y-auto px-2 py-2 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin mr-2" />
              Yükleniyor...
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400 m-2">
              <AlertCircle size={13} />
              {error}
            </div>
          ) : (
            <div className="space-y-0.5">
              {/* Üst dizine git */}
              {!isRoot && (
                <button
                  type="button"
                  onClick={() => loadDir(parentPath)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <FolderOpen size={13} className="text-amber-400 shrink-0" />
                  <span className="font-mono">..</span>
                  <span className="text-muted-foreground/50 ml-auto">(üst dizin)</span>
                </button>
              )}

              {subdirs.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  Bu dizinde alt klasör yok
                </p>
              )}

              {subdirs.map((dir) => (
                <button
                  key={dir.path}
                  type="button"
                  onClick={() => loadDir(dir.path)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors group"
                >
                  <FolderOpen size={13} className="text-amber-400 shrink-0" />
                  <span className="flex-1 truncate text-left font-mono">{dir.name}</span>
                  <ChevronRight
                    size={12}
                    className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Alt butonlar */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border shrink-0">
          <p className="text-[10px] text-muted-foreground truncate flex-1" title={currentPath}>
            Seçili: <span className="font-mono text-foreground">{currentPath || "—"}</span>
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              İptal
            </button>
            <button
              type="button"
              onClick={() => {
                if (currentPath) {
                  onSelect(currentPath);
                  onClose();
                }
              }}
              disabled={!currentPath}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Bu Klasörü Seç
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Değer dönüşüm yardımcıları ─────────────────────────────────────────────

function rawToDisplay(def: SystemSettingDef, raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") {
    if (def.type === "toggle") return String(def.default ?? false);
    return "";
  }
  if (def.type === "toggle") return String(raw) === "true" ? "true" : "false";
  if (def.type === "array" || def.type === "multiselect") {
    if (Array.isArray(raw)) return raw.join(", ");
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.join(", ");
      } catch {
        return raw;
      }
    }
    return String(raw);
  }
  if (def.type === "number") return String(raw);
  return String(raw);
}

function displayToPayload(def: SystemSettingDef, display: string): unknown {
  if (def.type === "toggle") return display === "true";
  if (def.type === "array" || def.type === "multiselect") {
    return display
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (def.type === "number") {
    const n = Number(display);
    return isNaN(n) ? def.default : n;
  }
  return display;
}

function defaultToDisplay(def: SystemSettingDef): string {
  return rawToDisplay(def, def.default);
}

// ─── Multi-Select bileşeni ──────────────────────────────────────────────────

function MultiSelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const selected = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  function toggle(optValue: string) {
    if (selected.includes(optValue)) {
      onChange(selected.filter((s) => s !== optValue).join(", "));
    } else {
      onChange([...selected, optValue].join(", "));
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        const order = selected.indexOf(opt.value) + 1;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-all",
              active
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border bg-input text-muted-foreground hover:text-foreground hover:border-border/80"
            )}
          >
            {active ? (
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {order}
              </span>
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Array Tag Input ─────────────────────────────────────────────────────────

function ArrayTagInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const tags = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  function removeTag(index: number) {
    const next = tags.filter((_, i) => i !== index).join(", ");
    onChange(next);
  }

  return (
    <div className="flex min-h-[34px] flex-wrap items-center gap-1 rounded-lg border border-border bg-input px-2 py-1 focus-within:ring-2 focus-within:ring-ring transition-colors">
      {tags.map((tag, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(i)}
            className="text-primary/60 hover:text-primary transition-colors leading-none"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        placeholder={tags.length === 0 ? "değer, değer, ..." : "ekle..."}
        className="min-w-[80px] flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
        onKeyDown={(e) => {
          if (e.key === "," || e.key === "Enter") {
            e.preventDefault();
            const newTag = (e.currentTarget.value ?? "").trim();
            if (newTag && !tags.includes(newTag)) {
              onChange([...tags, newTag].join(", "));
            }
            e.currentTarget.value = "";
          } else if (e.key === "Backspace" && e.currentTarget.value === "" && tags.length > 0) {
            removeTag(tags.length - 1);
          }
        }}
        onBlur={(e) => {
          const newTag = e.currentTarget.value.trim();
          if (newTag && !tags.includes(newTag)) {
            onChange([...tags, newTag].join(", "));
            e.currentTarget.value = "";
          }
        }}
      />
    </div>
  );
}

// ─── Kategori kartı ──────────────────────────────────────────────────────────

interface CategoryCardProps {
  category: SettingCategory;
  defs: SystemSettingDef[];
  dbSettings: SettingRecord[];
  onSave: (def: SystemSettingDef, value: unknown, locked: boolean) => Promise<void>;
}

function CategoryCard({ category, defs, dbSettings, onSave }: CategoryCardProps) {
  const meta = SETTING_CATEGORY_META[category];
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-accent/40 transition-colors"
      >
        <div className="text-left">
          <p className="text-sm font-semibold text-foreground">{meta.label}</p>
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        </div>
        {collapsed ? (
          <ChevronDown size={16} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronUp size={16} className="text-muted-foreground shrink-0" />
        )}
      </button>

      {!collapsed && (
        <div className="divide-y divide-border border-t border-border">
          {defs.map((def) => {
            const dbRecord = dbSettings.find((r) => r.key === def.key);
            return (
              <SettingRow
                key={def.key}
                def={def}
                dbRecord={dbRecord ?? null}
                onSave={onSave}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Ayar satırı ─────────────────────────────────────────────────────────────

interface SettingRowProps {
  def: SystemSettingDef;
  dbRecord: SettingRecord | null;
  onSave: (def: SystemSettingDef, value: unknown, locked: boolean) => Promise<void>;
}

function SettingRow({ def, dbRecord, onSave }: SettingRowProps) {
  const addToast = useUIStore((s) => s.addToast);
  const initialDisplay = dbRecord
    ? rawToDisplay(def, dbRecord.value)
    : defaultToDisplay(def);

  const [display, setDisplay] = useState(initialDisplay);
  const [locked, setLocked] = useState(dbRecord?.locked ?? false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [openingFolder, setOpeningFolder] = useState(false);

  useEffect(() => {
    setDisplay(dbRecord ? rawToDisplay(def, dbRecord.value) : defaultToDisplay(def));
    setLocked(dbRecord?.locked ?? false);
  }, [dbRecord, def]);

  const isDirty =
    display !== (dbRecord ? rawToDisplay(def, dbRecord.value) : defaultToDisplay(def)) ||
    locked !== (dbRecord?.locked ?? false);

  const isWideType = def.type === "multiselect" || def.type === "textarea";

  async function handleSave() {
    setSaving(true);
    const payload = displayToPayload(def, display);
    await onSave(def, payload, locked);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div
      className={cn(
        "flex gap-4 px-4 py-3",
        isWideType ? "flex-col" : "flex-col sm:flex-row sm:items-start"
      )}
    >
      {/* Sol: etiket + açıklama + pipeline stage */}
      <div className={cn("min-w-0", !isWideType && "sm:w-52 shrink-0")}>
        <p className="text-xs font-medium text-foreground">{def.label}</p>
        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{def.description}</p>
        {def.pipelineStage && (
          <p className="text-[10px] text-blue-400/70 leading-snug mt-0.5 flex items-center gap-1">
            <span className="inline-block h-1 w-1 rounded-full bg-blue-400/50 shrink-0" />
            {def.pipelineStage}
          </p>
        )}
      </div>

      {/* Sağ: input + kontroller */}
      <div className="flex flex-1 items-start gap-2">
        <div className="flex-1 min-w-0">
          {def.type === "multiselect" ? (
            <MultiSelectInput
              value={display}
              onChange={setDisplay}
              options={def.options ?? []}
            />
          ) : def.type === "select" ? (
            <select
              value={display}
              onChange={(e) => setDisplay(e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring transition-colors"
            >
              {def.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : def.type === "number" ? (
            <input
              type="number"
              value={display}
              min={def.min}
              max={def.max}
              onChange={(e) => setDisplay(e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring transition-colors"
            />
          ) : def.type === "password" ? (
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={display}
                onChange={(e) => setDisplay(e.target.value)}
                placeholder={display === "" ? "Ayarlanmamış" : undefined}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 pr-8 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          ) : def.type === "toggle" ? (
            <button
              type="button"
              role="switch"
              aria-checked={display === "true"}
              disabled={saving}
              onClick={async () => {
                const next = display === "true" ? "false" : "true";
                setDisplay(next);
                setSaving(true);
                await onSave(def, next === "true", locked);
                setSaving(false);
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
              }}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all w-full sm:w-auto",
                display === "true"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                  : "border-border bg-input text-muted-foreground hover:text-foreground hover:bg-accent",
                saving && "opacity-60 cursor-not-allowed"
              )}
            >
              {saving ? (
                <Loader2 size={13} className="animate-spin shrink-0" />
              ) : display === "true" ? (
                <ToggleRight size={15} className="shrink-0" />
              ) : (
                <ToggleLeft size={15} className="shrink-0" />
              )}
              {display === "true" ? "Etkin" : "Devre Dışı"}
            </button>
          ) : def.type === "array" ? (
            <ArrayTagInput value={display} onChange={setDisplay} />
          ) : def.type === "path" ? (
            <>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={display}
                  onChange={(e) => setDisplay(e.target.value)}
                  placeholder="/tam/dizin/yolu"
                  className="flex-1 rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => setFolderPickerOpen(true)}
                  title="Klasör seç"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <FolderOpen size={13} />
                </button>
                {/* Finder/Explorer'da aç — yalnızca kaydedilmiş path varsa aktif */}
                <button
                  type="button"
                  disabled={!display.trim() || openingFolder}
                  title={display.trim() ? "Klasörü Finder/Explorer'da aç" : "Önce bir klasör kaydedin"}
                  onClick={async () => {
                    if (!display.trim()) return;
                    setOpeningFolder(true);
                    const result = await openFolderInFinder(display.trim());
                    setOpeningFolder(false);
                    if (!result.ok) {
                      addToast({ type: "error", title: "Klasör açılamadı", description: result.error });
                    }
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {openingFolder ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}
                </button>
              </div>
              <FolderPickerDialog
                isOpen={folderPickerOpen}
                onClose={() => setFolderPickerOpen(false)}
                onSelect={(path) => setDisplay(path)}
                initialPath={display || undefined}
              />
            </>
          ) : (
            <input
              type="text"
              value={display}
              onChange={(e) => setDisplay(e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring transition-colors"
            />
          )}
        </div>

        {/* Kontroller */}
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <button
            type="button"
            onClick={() => setLocked((v) => !v)}
            title={locked ? "Kilidi kaldır" : "Kilitle (kullanıcı değiştiremez)"}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              locked
                ? "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {locked ? <Lock size={12} /> : <Unlock size={12} />}
          </button>

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
    </div>
  );
}

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────

export default function GlobalSettings() {
  const {
    settings,
    loading,
    error,
    fetchSettings,
    createSetting,
    updateSetting,
    deleteSetting,
    setOutputFolder,
    resetOutputFolder,
  } = useAdminStore();
  const addToast = useUIStore((s) => s.addToast);

  const loadData = useCallback(() => {
    fetchSettings("admin", "");
  }, [fetchSettings]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = useCallback(
    async (def: SystemSettingDef, value: unknown, locked: boolean) => {
      const existing = settings.find((r) => r.key === def.key);

      // ── output_dir: özel endpoint kullan ──────────────────────────────────
      // Generic settings endpoint yalnızca DB'ye yazar; runtime app_settings ve
      // dizin oluşturma/yazma doğrulaması için backend'in özel endpoint'i gerekir.
      if (def.key === "output_dir") {
        const pathStr = typeof value === "string" ? value.trim() : "";
        if (!pathStr) {
          // Boş → özel reset endpoint: DB kaydını sil + runtime app_settings.output_dir'i default'a döndür
          const defaultPath = await resetOutputFolder();
          if (defaultPath !== null) {
            addToast({
              type: "info",
              title: "Klasör sıfırlandı",
              description: `Varsayılan klasör kullanılacak: ${defaultPath}`,
            });
            loadData();
          } else {
            addToast({ type: "error", title: "Sıfırlanamadı", description: def.label });
          }
          return;
        }
        // Özel endpoint: path doğrula + dizin oluştur + runtime güncelle
        const normalized = await setOutputFolder(pathStr);
        if (normalized !== null) {
          addToast({ type: "success", title: "Klasör kaydedildi", description: normalized });
          loadData();
        } else {
          // setOutputFolder store'daki error'ı zaten set etti; ek toast göster
          addToast({ type: "error", title: "Klasör kaydedilemedi", description: "Yol geçersiz veya yazma izni yok." });
        }
        return;
      }

      // ── Diğer ayarlar: generic endpoint ───────────────────────────────────

      // Boş değer → kaydı sil (varsayılana dön)
      if (isEmpty(value)) {
        if (existing) {
          const ok = await deleteSetting(existing.id);
          if (ok) {
            addToast({ type: "info", title: "Ayar sıfırlandı", description: `${def.label} varsayılana döndürüldü.` });
            loadData();
          } else {
            addToast({ type: "error", title: "Silinemedi", description: def.label });
          }
        }
        return;
      }

      if (existing) {
        const result = await updateSetting(existing.id, { value, locked });
        if (result) {
          addToast({ type: "success", title: "Ayar güncellendi", description: def.label });
          loadData();
        } else {
          addToast({ type: "error", title: "Güncellenemedi", description: def.label });
        }
      } else {
        const result = await createSetting({
          scope: "admin",
          scope_id: "",
          key: def.key,
          value,
          locked,
          description: def.description,
        });
        if (result) {
          addToast({ type: "success", title: "Ayar kaydedildi", description: def.label });
          loadData();
        } else {
          addToast({ type: "error", title: "Kaydedilemedi", description: def.label });
        }
      }
    },
    [settings, updateSetting, createSetting, deleteSetting, setOutputFolder, resetOutputFolder, addToast, loadData]
  );

  const categories: SettingCategory[] = [
    "system", "pipeline", "script", "video_audio", "tts_processing",
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders size={20} className="text-purple-400" />
          <h2 className="text-lg font-semibold text-foreground">Global Ayarlar</h2>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Yenile
        </button>
      </div>

      {/* Bilgi bandı */}
      <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2.5 text-xs text-blue-300">
        <AlertCircle size={13} className="mt-0.5 shrink-0" />
        <span>
          Ayarlar veritabanında saklanır. Değiştirip <strong>Kaydet</strong>'e basın.{" "}
          <span className="text-blue-300/70">
            Kilit ikonu, kullanıcıların o ayarı değiştiremeyeceği anlamına gelir. API anahtarları
            yalnızca <strong>Provider Yönetimi</strong> sayfasından girilir.
          </span>
        </span>
      </div>

      {/* Hata */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Yükleniyor */}
      {loading && settings.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin mr-2" />
          Yükleniyor...
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => {
            const defs = SYSTEM_SETTINGS_SCHEMA.filter((d) => d.category === cat);
            return (
              <CategoryCard
                key={cat}
                category={cat}
                defs={defs}
                dbSettings={settings}
                onSave={handleSave}
              />
            );
          })}
        </div>
      )}

      {/* PIN hatırlatma */}
      <p className="text-center text-[11px] text-muted-foreground/50">
        Değişiklikler admin yetkisiyle kaydedilir · PIN:{" "}
        {localStorage.getItem("cm-admin-pin") ?? "—"}
      </p>
    </div>
  );
}

export type { SystemSettingDef };
