/**
 * CategoryStyleMappingManager — Kategori → BulletinStyle eşleşme yönetimi.
 *
 * Admin paneli. Haber Bülteni modülü için kategori→stil otomatik eşleşme tablosunu yönetir.
 *
 * Özellikler:
 *   - Tüm eşleşmeleri listele (category_key ASC)
 *   - Yeni eşleşme ekle (kategori, stil, açıklama)
 *   - Eşleşme düzenle
 *   - Etkin/pasif toggle
 *   - Eşleşme sil
 *   - Global "mapping_enabled" toggle (category_style_mapping_enabled ayarı)
 *
 * API:
 *   GET    /api/admin/category-style-mappings
 *   POST   /api/admin/category-style-mappings
 *   PUT    /api/admin/category-style-mappings/{id}
 *   DELETE /api/admin/category-style-mappings/{id}
 *   GET/PUT /api/admin/settings (category_style_mapping_enabled)
 */

import { useEffect, useState, useCallback } from "react";
import {
  Palette,
  Plus,
  Trash2,
  Pencil,
  Save,
  X,
  Loader2,
  AlertCircle,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Tag,
  Info,
} from "lucide-react";
import { useAdminStore } from "@/stores/adminStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

// ─── Tipler ──────────────────────────────────────────────────────────────────

interface CategoryStyleMapping {
  id: number;
  category_key: string;
  bulletin_style: string;
  description: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface MappingFormState {
  category_key: string;
  bulletin_style: string;
  description: string;
  enabled: boolean;
}

const EMPTY_FORM: MappingFormState = {
  category_key: "",
  bulletin_style: "corporate",
  description: "",
  enabled: true,
};

// BulletinStyle enum değerleri (remotion/src/types.ts ile senkron)
const BULLETIN_STYLES: { value: string; label: string; color: string }[] = [
  { value: "breaking", label: "Breaking — Son Dakika", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  { value: "tech", label: "Tech — Teknoloji", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { value: "corporate", label: "Corporate — Kurumsal", color: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
  { value: "sport", label: "Sport — Spor", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  { value: "finance", label: "Finance — Finans/Ekonomi", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  { value: "weather", label: "Weather — Hava Durumu", color: "bg-sky-500/20 text-sky-400 border-sky-500/30" },
  { value: "science", label: "Science — Bilim/Sağlık", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { value: "entertainment", label: "Entertainment — Eğlence/Kültür", color: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
  { value: "dark", label: "Dark — Koyu Tema", color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30" },
];

function styleColor(style: string) {
  return (
    BULLETIN_STYLES.find((s) => s.value === style)?.color ??
    "bg-muted text-muted-foreground border-border"
  );
}

function styleLabel(style: string) {
  return BULLETIN_STYLES.find((s) => s.value === style)?.label ?? style;
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

function adminHeaders(pin: string) {
  return {
    "Content-Type": "application/json",
    "X-Admin-Pin": pin,
  };
}

// ─── Bileşen ──────────────────────────────────────────────────────────────────

export default function CategoryStyleMappingManager() {
  const { adminPin, settings, loadSettings, saveSetting } = useAdminStore();
  const { addToast } = useUIStore();

  const [mappings, setMappings] = useState<CategoryStyleMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<MappingFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // ── Global toggle (category_style_mapping_enabled) ────────────────────────

  useEffect(() => {
    if (!settings) loadSettings();
  }, [settings, loadSettings]);

  const globalEnabled =
    settings?.find((s: { key: string }) => s.key === "category_style_mapping_enabled")?.value !== "false" &&
    settings?.find((s: { key: string }) => s.key === "category_style_mapping_enabled")?.value !== false;

  async function toggleGlobalEnabled() {
    try {
      await saveSetting("category_style_mapping_enabled", !globalEnabled, "admin");
      addToast({
        type: "success",
        message: !globalEnabled
          ? "Kategori→Stil eşleşmesi etkinleştirildi."
          : "Kategori→Stil eşleşmesi devre dışı bırakıldı.",
      });
    } catch {
      addToast({ type: "error", message: "Global ayar değiştirilemedi." });
    }
  }

  // ── Yükle ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/category-style-mappings", {
        headers: adminHeaders(adminPin),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMappings(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eşleşmeler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [adminPin]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Form Helpers ──────────────────────────────────────────────────────────

  function startNew() {
    setEditingId("new");
    setForm(EMPTY_FORM);
    setConfirmDeleteId(null);
  }

  function startEdit(m: CategoryStyleMapping) {
    setEditingId(m.id);
    setForm({
      category_key: m.category_key,
      bulletin_style: m.bulletin_style,
      description: m.description || "",
      enabled: m.enabled,
    });
    setConfirmDeleteId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function setField<K extends keyof MappingFormState>(key: K, value: MappingFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ── Kaydet ────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.category_key.trim()) {
      addToast({ type: "error", message: "Kategori anahtarı boş olamaz." });
      return;
    }
    if (!form.bulletin_style) {
      addToast({ type: "error", message: "Stil seçiniz." });
      return;
    }

    setSaving(true);
    try {
      const isNew = editingId === "new";
      const url = isNew
        ? "/api/admin/category-style-mappings"
        : `/api/admin/category-style-mappings/${editingId}`;
      const method = isNew ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: adminHeaders(adminPin),
        body: JSON.stringify({
          category_key: form.category_key.trim().toLowerCase(),
          bulletin_style: form.bulletin_style,
          description: form.description.trim() || null,
          enabled: form.enabled,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data?.detail || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      addToast({
        type: "success",
        message: isNew ? "Eşleşme oluşturuldu." : "Eşleşme güncellendi.",
      });
      cancelEdit();
      await load();
    } catch (err: unknown) {
      addToast({
        type: "error",
        message: err instanceof Error ? err.message : "Kayıt başarısız.",
      });
    } finally {
      setSaving(false);
    }
  }

  // ── Toggle Etkin ──────────────────────────────────────────────────────────

  async function toggleEnabled(m: CategoryStyleMapping) {
    try {
      const res = await fetch(`/api/admin/category-style-mappings/${m.id}`, {
        method: "PUT",
        headers: adminHeaders(adminPin),
        body: JSON.stringify({ enabled: !m.enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch {
      addToast({ type: "error", message: "Durum değiştirilemedi." });
    }
  }

  // ── Sil ───────────────────────────────────────────────────────────────────

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/category-style-mappings/${id}`, {
        method: "DELETE",
        headers: adminHeaders(adminPin),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addToast({ type: "success", message: "Eşleşme silindi." });
      setConfirmDeleteId(null);
      await load();
    } catch {
      addToast({ type: "error", message: "Silme başarısız." });
    } finally {
      setDeletingId(null);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
            <Palette size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Kategori → Stil Eşleşmeleri</h1>
            <p className="text-sm text-muted-foreground">
              Haber kategorisi tespit edildiğinde otomatik uygulanacak görsel stil
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Yenile
          </button>
          <button
            onClick={startNew}
            disabled={editingId !== null}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Plus size={14} />
            Eşleşme Ekle
          </button>
        </div>
      </div>

      {/* Global Toggle Kartı */}
      <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <Info size={16} className="shrink-0 mt-0.5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Otomatik Stil Eşleşmesi</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Aktifken pipeline, dominant sahne kategorisini bu tabloda arar ve bulursa
              BulletinStyle'ı otomatik uygular. Pasifken tüm sahne stilleri global default'a döner.
            </p>
          </div>
        </div>
        <button
          onClick={toggleGlobalEnabled}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors border",
            globalEnabled
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
              : "bg-muted text-muted-foreground border-border hover:bg-accent"
          )}
        >
          {globalEnabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          {globalEnabled ? "Etkin" : "Pasif"}
        </button>
      </div>

      {/* Bilgi — zincir açıklaması */}
      <div className="mb-4 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 text-xs text-muted-foreground space-y-1">
        <p>
          <strong className="text-purple-400">Öncelik zinciri:</strong>{" "}
          <span className="inline-flex items-center gap-1">
            Kullanıcı override
          </span>{" "}
          →{" "}
          <span className="inline-flex items-center gap-1">
            CategoryStyleMapping (bu tablo)
          </span>{" "}
          → Global default{" "}
          <code className="bg-muted px-1 rounded">bulletin_style</code>
        </p>
        <p>
          <strong className="text-purple-400">Eşleşme mantığı:</strong> Pipeline, sahnelerdeki
          kategori değerlerini sayar, en çok tekrar eden "dominant kategori"yi bu tabloda arar.
          Eşleşen kayıt varsa ve etkinse o stil uygulanır.
        </p>
      </div>

      {/* Hata */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle size={16} />
          {error}
          <button onClick={load} className="ml-auto text-xs underline">
            Tekrar dene
          </button>
        </div>
      )}

      {/* Yeni Eşleşme Formu */}
      {editingId === "new" && (
        <MappingForm
          form={form}
          setField={setField}
          saving={saving}
          onSave={handleSave}
          onCancel={cancelEdit}
          isNew
        />
      )}

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 size={20} className="animate-spin mr-2" />
          Yükleniyor…
        </div>
      ) : mappings.length === 0 && editingId !== "new" ? (
        <EmptyState onAdd={startNew} />
      ) : (
        <div className="space-y-2">
          {mappings.map((mapping) => (
            <MappingRow
              key={mapping.id}
              mapping={mapping}
              editing={editingId === mapping.id}
              form={form}
              setField={setField}
              saving={saving}
              confirmDelete={confirmDeleteId === mapping.id}
              deleting={deletingId === mapping.id}
              onEdit={() => startEdit(mapping)}
              onCancelEdit={cancelEdit}
              onSave={handleSave}
              onToggle={() => toggleEnabled(mapping)}
              onDeleteRequest={() => setConfirmDeleteId(mapping.id)}
              onDeleteCancel={() => setConfirmDeleteId(null)}
              onDeleteConfirm={() => handleDelete(mapping.id)}
            />
          ))}
        </div>
      )}

      {/* Toplam */}
      {!loading && mappings.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Toplam {mappings.length} eşleşme — {mappings.filter((m) => m.enabled).length} etkin,{" "}
          {mappings.filter((m) => !m.enabled).length} pasif
        </p>
      )}
    </div>
  );
}

// ─── MappingForm ──────────────────────────────────────────────────────────────

interface MappingFormProps {
  form: MappingFormState;
  setField: <K extends keyof MappingFormState>(k: K, v: MappingFormState[K]) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  isNew?: boolean;
  disableCategoryKey?: boolean;
}

function MappingForm({
  form,
  setField,
  saving,
  onSave,
  onCancel,
  isNew,
  disableCategoryKey,
}: MappingFormProps) {
  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-4 space-y-3">
      <p className="text-sm font-medium text-foreground">
        {isNew ? "Yeni Eşleşme Ekle" : "Eşleşmeyi Düzenle"}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Kategori Anahtarı */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Kategori Anahtarı *</label>
          <input
            type="text"
            value={form.category_key}
            disabled={disableCategoryKey}
            onChange={(e) => setField("category_key", e.target.value.toLowerCase())}
            placeholder="spor, teknoloji, ekonomi…"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-muted-foreground">
            LLM'in ürettiği veya haber kaynağının kategori anahtarı (lowercase).
          </p>
        </div>

        {/* Stil Seçimi */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">BulletinStyle *</label>
          <select
            value={form.bulletin_style}
            onChange={(e) => setField("bulletin_style", e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {BULLETIN_STYLES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Açıklama — tam genişlik */}
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs text-muted-foreground">Açıklama (opsiyonel)</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            placeholder="Bu eşleşme hakkında not…"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Etkin toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setField("enabled", !form.enabled)}
          className={cn(
            "flex items-center gap-1.5 text-sm transition-colors",
            form.enabled ? "text-emerald-400" : "text-muted-foreground"
          )}
        >
          {form.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
          {form.enabled ? "Etkin" : "Pasif"}
        </button>
        <span className="text-xs text-muted-foreground">
          — Pasif eşleşmeler pipeline'a dahil edilmez
        </span>
      </div>

      {/* Butonlar */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Kaydet
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-md border border-border px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X size={14} />
          İptal
        </button>
      </div>
    </div>
  );
}

// ─── MappingRow ───────────────────────────────────────────────────────────────

interface MappingRowProps {
  mapping: CategoryStyleMapping;
  editing: boolean;
  form: MappingFormState;
  setField: <K extends keyof MappingFormState>(k: K, v: MappingFormState[K]) => void;
  saving: boolean;
  confirmDelete: boolean;
  deleting: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onToggle: () => void;
  onDeleteRequest: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
}

function MappingRow({
  mapping,
  editing,
  form,
  setField,
  saving,
  confirmDelete,
  deleting,
  onEdit,
  onCancelEdit,
  onSave,
  onToggle,
  onDeleteRequest,
  onDeleteCancel,
  onDeleteConfirm,
}: MappingRowProps) {
  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        editing
          ? "border-primary/40 bg-primary/5"
          : mapping.enabled
          ? "border-border bg-card"
          : "border-border/50 bg-card/50 opacity-70"
      )}
    >
      {/* Ana satır */}
      <div className="flex items-center gap-3 p-3">
        {/* Etkin toggle */}
        <button
          onClick={onToggle}
          className={cn(
            "shrink-0 transition-colors",
            mapping.enabled
              ? "text-emerald-400 hover:text-emerald-300"
              : "text-muted-foreground hover:text-foreground"
          )}
          title={mapping.enabled ? "Pasif yap" : "Etkinleştir"}
        >
          {mapping.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
        </button>

        {/* Kategori badge */}
        <span className="shrink-0 flex items-center gap-1 rounded-full bg-muted border border-border px-2.5 py-0.5 text-xs font-mono font-medium text-foreground">
          <Tag size={10} className="text-muted-foreground" />
          {mapping.category_key}
        </span>

        {/* Ok */}
        <span className="text-muted-foreground text-xs shrink-0">→</span>

        {/* Stil badge */}
        <span
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium",
            styleColor(mapping.bulletin_style)
          )}
        >
          {mapping.bulletin_style}
        </span>

        {/* Açıklama */}
        {mapping.description && (
          <span className="flex-1 min-w-0 text-xs text-muted-foreground truncate">
            {mapping.description}
          </span>
        )}
        {!mapping.description && <span className="flex-1" />}

        {/* Aksiyonlar */}
        {!confirmDelete && !editing && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onEdit}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Düzenle"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={onDeleteRequest}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Sil"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}

        {/* Silme onayı */}
        {confirmDelete && !editing && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-destructive font-medium">Emin misin?</span>
            <button
              onClick={onDeleteConfirm}
              disabled={deleting}
              className="flex items-center gap-1 rounded-md bg-destructive px-2.5 py-1 text-xs text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Sil
            </button>
            <button
              onClick={onDeleteCancel}
              className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Düzenleme formu */}
      {editing && (
        <div className="border-t border-border/50 p-3">
          <MappingForm
            form={form}
            setField={setField}
            saving={saving}
            onSave={onSave}
            onCancel={onCancelEdit}
            disableCategoryKey
          />
        </div>
      )}
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
      <Palette size={36} className="mb-3 text-muted-foreground/40" />
      <p className="text-sm font-medium text-muted-foreground">Henüz eşleşme yok</p>
      <p className="mt-1 text-xs text-muted-foreground/70">
        Kategori adını (ör. "spor") bir BulletinStyle ile eşleştirerek başlayın
      </p>
      <button
        onClick={onAdd}
        className="mt-4 flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <Plus size={14} />
        İlk Eşleşmeyi Ekle
      </button>
    </div>
  );
}
