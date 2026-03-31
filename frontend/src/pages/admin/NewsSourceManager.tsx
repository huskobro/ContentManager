/**
 * NewsSourceManager — Haber/RSS kaynakları yönetimi.
 *
 * Admin panelinde news_bulletin modülü için kaynak listesi CRUD.
 *
 * Özellikler:
 *   - Tüm kaynakları listele (sort_order ASC)
 *   - Yeni kaynak ekle (ad, URL, kategori, dil, sıralama)
 *   - Kaynağı düzenle (inline veya modal-benzeri genişleme)
 *   - Etkin/pasif toggle
 *   - Kaynak sil (onaylı)
 *
 * API:
 *   GET    /api/admin/news-sources
 *   POST   /api/admin/news-sources
 *   PUT    /api/admin/news-sources/{id}
 *   DELETE /api/admin/news-sources/{id}
 */

import { useEffect, useState, useCallback } from "react";
import {
  Rss,
  Plus,
  Trash2,
  Pencil,
  Save,
  X,
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  ToggleLeft,
  ToggleRight,
  Globe,
  Tag,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useAdminStore } from "@/stores/adminStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

// ─── Tipler ──────────────────────────────────────────────────────────────────

interface NewsSource {
  id: number;
  name: string;
  url: string;
  category_key: string;
  lang: string;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface SourceFormState {
  name: string;
  url: string;
  category_key: string;
  lang: string;
  enabled: boolean;
  sort_order: number;
}

const EMPTY_FORM: SourceFormState = {
  name: "",
  url: "",
  category_key: "",
  lang: "tr",
  enabled: true,
  sort_order: 0,
};

const LANG_OPTIONS = [
  { value: "tr", label: "Türkçe (tr)" },
  { value: "en", label: "İngilizce (en)" },
  { value: "de", label: "Almanca (de)" },
  { value: "fr", label: "Fransızca (fr)" },
  { value: "es", label: "İspanyolca (es)" },
  { value: "ar", label: "Arapça (ar)" },
];

// ─── API Helpers ──────────────────────────────────────────────────────────────

function adminHeaders(pin: string) {
  return {
    "Content-Type": "application/json",
    "X-Admin-Pin": pin,
  };
}

// ─── Bileşen ──────────────────────────────────────────────────────────────────

export default function NewsSourceManager() {
  const { adminPin } = useAdminStore();
  const { addToast } = useUIStore();

  const [sources, setSources] = useState<NewsSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Düzenleme: id=null → yeni, id>0 → var olan
  const [editingId, setEditingId] = useState<number | null | "new">(null);
  const [form, setForm] = useState<SourceFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // ── Yükle ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/news-sources", {
        headers: adminHeaders(adminPin),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSources(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kaynaklar yüklenemedi");
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
    setForm({ ...EMPTY_FORM, sort_order: sources.length });
    setConfirmDeleteId(null);
  }

  function startEdit(s: NewsSource) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      url: s.url,
      category_key: s.category_key || "",
      lang: s.lang || "tr",
      enabled: s.enabled,
      sort_order: s.sort_order,
    });
    setConfirmDeleteId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function setField<K extends keyof SourceFormState>(key: K, value: SourceFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ── Kaydet ────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.name.trim()) {
      addToast({ type: "error", message: "Kaynak adı boş olamaz." });
      return;
    }
    if (!form.url.trim() || !/^https?:\/\//i.test(form.url.trim())) {
      addToast({ type: "error", message: "Geçerli bir URL giriniz (http:// veya https:// ile başlamalı)." });
      return;
    }

    setSaving(true);
    try {
      const isNew = editingId === "new";
      const url = isNew
        ? "/api/admin/news-sources"
        : `/api/admin/news-sources/${editingId}`;
      const method = isNew ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: adminHeaders(adminPin),
        body: JSON.stringify({
          name: form.name.trim(),
          url: form.url.trim(),
          category_key: form.category_key.trim() || null,
          lang: form.lang,
          enabled: form.enabled,
          sort_order: form.sort_order,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data?.detail || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      addToast({
        type: "success",
        message: isNew ? "Kaynak oluşturuldu." : "Kaynak güncellendi.",
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

  async function toggleEnabled(s: NewsSource) {
    try {
      const res = await fetch(`/api/admin/news-sources/${s.id}`, {
        method: "PUT",
        headers: adminHeaders(adminPin),
        body: JSON.stringify({ enabled: !s.enabled }),
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
      const res = await fetch(`/api/admin/news-sources/${id}`, {
        method: "DELETE",
        headers: adminHeaders(adminPin),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addToast({ type: "success", message: "Kaynak silindi." });
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
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
            <Rss size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Haber Kaynakları</h1>
            <p className="text-sm text-muted-foreground">
              RSS / haber URL kaynaklarını yönet — Haber Bülteni modülünde kullanılır
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
            Kaynak Ekle
          </button>
        </div>
      </div>

      {/* Bilgi kutusu */}
      <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-muted-foreground">
        <p>
          <strong className="text-amber-400">Pipeline entegrasyonu:</strong> Haber Bülteni işi
          oluşturulurken URL belirtilmezse, etkin kaynaklar <code className="text-xs bg-muted px-1 rounded">sort_order</code> sırasına
          göre otomatik kullanılır. Kategorisi atanmış kaynaklar, sahne kategorisi eşleşmediğinde
          stil belirleme zincirinde yedek kaynak olarak devreye girer.
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

      {/* Yeni Kaynak Formu */}
      {editingId === "new" && (
        <SourceForm
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
      ) : sources.length === 0 && editingId !== "new" ? (
        <EmptyState onAdd={startNew} />
      ) : (
        <div className="space-y-2">
          {sources.map((source, idx) => (
            <SourceRow
              key={source.id}
              source={source}
              isFirst={idx === 0}
              isLast={idx === sources.length - 1}
              editing={editingId === source.id}
              form={form}
              setField={setField}
              saving={saving}
              confirmDelete={confirmDeleteId === source.id}
              deleting={deletingId === source.id}
              onEdit={() => startEdit(source)}
              onCancelEdit={cancelEdit}
              onSave={handleSave}
              onToggle={() => toggleEnabled(source)}
              onDeleteRequest={() => setConfirmDeleteId(source.id)}
              onDeleteCancel={() => setConfirmDeleteId(null)}
              onDeleteConfirm={() => handleDelete(source.id)}
            />
          ))}
        </div>
      )}

      {/* Toplam */}
      {!loading && sources.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Toplam {sources.length} kaynak — {sources.filter((s) => s.enabled).length} etkin,{" "}
          {sources.filter((s) => !s.enabled).length} pasif
        </p>
      )}
    </div>
  );
}

// ─── SourceForm ───────────────────────────────────────────────────────────────

interface SourceFormProps {
  form: SourceFormState;
  setField: <K extends keyof SourceFormState>(k: K, v: SourceFormState[K]) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  isNew?: boolean;
}

function SourceForm({ form, setField, saving, onSave, onCancel, isNew }: SourceFormProps) {
  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-4 space-y-3">
      <p className="text-sm font-medium text-foreground">
        {isNew ? "Yeni Kaynak Ekle" : "Kaynağı Düzenle"}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Ad */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Kaynak Adı *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder="TRT Haber, BBC Türkçe…"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Dil */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Dil</label>
          <select
            value={form.lang}
            onChange={(e) => setField("lang", e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {LANG_OPTIONS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {/* URL — tam genişlik */}
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs text-muted-foreground">URL *</label>
          <input
            type="url"
            value={form.url}
            onChange={(e) => setField("url", e.target.value)}
            placeholder="https://www.trthaber.com/rss/..."
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
          />
          <p className="text-xs text-muted-foreground">
            RSS feed URL veya haber sitesi URL'si. http:// veya https:// ile başlamalı.
          </p>
        </div>

        {/* Kategori */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Kategori Anahtarı</label>
          <input
            type="text"
            value={form.category_key}
            onChange={(e) => setField("category_key", e.target.value.toLowerCase())}
            placeholder="spor, teknoloji, ekonomi…"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Opsiyonel. Kategori→Stil eşleşmesi için kullanılır.
          </p>
        </div>

        {/* Sıralama */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Sıra (düşük = önce)</label>
          <input
            type="number"
            min={0}
            value={form.sort_order}
            onChange={(e) => setField("sort_order", parseInt(e.target.value) || 0)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
          — Pasif kaynaklar pipeline'a dahil edilmez
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

// ─── SourceRow ────────────────────────────────────────────────────────────────

interface SourceRowProps {
  source: NewsSource;
  isFirst: boolean;
  isLast: boolean;
  editing: boolean;
  form: SourceFormState;
  setField: <K extends keyof SourceFormState>(k: K, v: SourceFormState[K]) => void;
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

function SourceRow({
  source,
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
}: SourceRowProps) {
  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        editing
          ? "border-primary/40 bg-primary/5"
          : source.enabled
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
            source.enabled ? "text-emerald-400 hover:text-emerald-300" : "text-muted-foreground hover:text-foreground"
          )}
          title={source.enabled ? "Pasif yap" : "Etkinleştir"}
        >
          {source.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
        </button>

        {/* İkon */}
        <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/10 text-amber-400">
          <Rss size={16} />
        </div>

        {/* Bilgiler */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate">
              {source.name}
            </span>
            {source.category_key && (
              <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                <Tag size={10} />
                {source.category_key}
              </span>
            )}
            <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              <Globe size={10} />
              {source.lang}
            </span>
            {source.sort_order > 0 && (
              <span className="text-xs text-muted-foreground">#{source.sort_order}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {source.url}
          </p>
        </div>

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

      {/* Düzenleme formu — satır genişlemesi */}
      {editing && (
        <div className="border-t border-border/50 p-3">
          <SourceForm
            form={form}
            setField={setField}
            saving={saving}
            onSave={onSave}
            onCancel={onCancelEdit}
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
      <Rss size={36} className="mb-3 text-muted-foreground/40" />
      <p className="text-sm font-medium text-muted-foreground">Henüz haber kaynağı yok</p>
      <p className="mt-1 text-xs text-muted-foreground/70">
        RSS feed veya haber sitesi URL'si ekleyerek başlayın
      </p>
      <button
        onClick={onAdd}
        className="mt-4 flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <Plus size={14} />
        İlk Kaynağı Ekle
      </button>
    </div>
  );
}
