/**
 * GlobalSettings — Admin genel ayar yönetimi.
 *
 * scope="global" ve scope="admin" olan ayarların CRUD yönetimi.
 * Ayar değerlerini değiştirme, kilitli durumu toggle etme ve silme.
 */

import { useEffect, useState, useCallback } from "react";
import {
  Sliders,
  Plus,
  Trash2,
  Lock,
  Unlock,
  Loader2,
  AlertCircle,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { useAdminStore, type SettingRecord, type SettingScope } from "@/stores/adminStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

// ─── Sabitler ────────────────────────────────────────────────────────────────

const SCOPE_TABS: { value: SettingScope; label: string }[] = [
  { value: "admin", label: "Admin Ayarları" },
];

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function GlobalSettings() {
  const { settings, loading, error, fetchSettings, createSetting, updateSetting, deleteSetting } =
    useAdminStore();
  const addToast = useUIStore((s) => s.addToast);

  const [activeScope] = useState<SettingScope>("admin");
  const [showAddForm, setShowAddForm] = useState(false);

  // Yeni ayar formu
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newLocked, setNewLocked] = useState(false);
  const [newDescription, setNewDescription] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const loadData = useCallback(() => {
    fetchSettings(activeScope, "");
  }, [activeScope, fetchSettings]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      scope: activeScope,
      scope_id: "",
      key: newKey.trim(),
      value: parsedValue,
      locked: newLocked,
      description: newDescription.trim() || undefined,
    });

    setAddLoading(false);

    if (result) {
      addToast({ type: "success", title: "Ayar oluşturuldu", description: newKey });
      setNewKey("");
      setNewValue("");
      setNewLocked(false);
      setNewDescription("");
      setShowAddForm(false);
    } else {
      addToast({ type: "error", title: "Ayar oluşturulamadı" });
    }
  }

  async function handleToggleLock(setting: SettingRecord) {
    const result = await updateSetting(setting.id, {
      value: setting.value,
      locked: !setting.locked,
    });
    if (result) {
      addToast({
        type: "info",
        title: result.locked ? "Ayar kilitlendi" : "Kilit kaldırıldı",
        description: setting.key,
      });
    }
  }

  async function handleDelete(setting: SettingRecord) {
    const ok = await deleteSetting(setting.id);
    if (ok) {
      addToast({ type: "success", title: "Ayar silindi", description: setting.key });
    } else {
      addToast({ type: "error", title: "Silinemedi" });
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders size={20} className="text-purple-400" />
          <h2 className="text-lg font-semibold text-foreground">Global Ayarlar</h2>
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {settings.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Yenile
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus size={12} />
            Yeni Ayar
          </button>
        </div>
      </div>

      {/* Yeni ayar formu */}
      {showAddForm && (
        <div className="rounded-xl border border-primary/30 bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Yeni Ayar Ekle</p>
            <button
              onClick={() => setShowAddForm(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Anahtar</label>
              <input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="tts_provider"
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Değer (JSON veya string)</label>
              <input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder='"edge_tts" veya 30'
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Açıklama (opsiyonel)</label>
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Bu ayarın ne işe yaradığını açıklayın"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={newLocked}
                onChange={(e) => setNewLocked(e.target.checked)}
                className="rounded"
              />
              Kullanıcı override'ını engelle (kilitli)
            </label>

            <button
              onClick={handleAdd}
              disabled={addLoading || !newKey.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {addLoading ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Kaydet
            </button>
          </div>
        </div>
      )}

      {/* Hata */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Ayar listesi */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading && settings.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin mr-2" />
            Yükleniyor...
          </div>
        ) : settings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-sm text-muted-foreground gap-2">
            <Sliders size={28} className="opacity-30" />
            <p>Henüz ayar tanımlı değil</p>
            <p className="text-xs">Yukarıdaki "Yeni Ayar" butonu ile ekleyin</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {settings.map((setting) => (
              <SettingRow
                key={setting.id}
                setting={setting}
                onToggleLock={() => handleToggleLock(setting)}
                onDelete={() => handleDelete(setting)}
                onUpdate={updateSetting}
                addToast={addToast}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Ayar Satırı ────────────────────────────────────────────────────────────

function SettingRow({
  setting,
  onToggleLock,
  onDelete,
  onUpdate,
  addToast,
}: {
  setting: SettingRecord;
  onToggleLock: () => void;
  onDelete: () => void;
  onUpdate: (id: number, payload: { value: unknown; locked?: boolean | null }) => Promise<SettingRecord | null>;
  addToast: (t: { type: string; title: string; description?: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(
    typeof setting.value === "string" ? setting.value : JSON.stringify(setting.value)
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    let parsedValue: unknown = editValue;
    try {
      parsedValue = JSON.parse(editValue);
    } catch {
      // String olarak bırak
    }

    const result = await onUpdate(setting.id, { value: parsedValue });
    setSaving(false);

    if (result) {
      addToast({ type: "success", title: "Güncellendi", description: setting.key });
      setEditing(false);
    } else {
      addToast({ type: "error", title: "Güncellenemedi" });
    }
  }

  const displayValue =
    typeof setting.value === "string" ? setting.value : JSON.stringify(setting.value);

  return (
    <div className="flex items-center gap-3 px-4 py-3 group">
      {/* Kilit durumu */}
      <button
        onClick={onToggleLock}
        className={cn(
          "shrink-0 flex h-7 w-7 items-center justify-center rounded-md transition-colors",
          setting.locked
            ? "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
            : "bg-muted text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
        title={setting.locked ? "Kilidi kaldır" : "Kilitle"}
      >
        {setting.locked ? <Lock size={12} /> : <Unlock size={12} />}
      </button>

      {/* Anahtar + açıklama */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground font-mono">{setting.key}</p>
        {setting.description && (
          <p className="text-xs text-muted-foreground truncate">{setting.description}</p>
        )}
      </div>

      {/* Değer */}
      <div className="shrink-0 w-48">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") setEditing(false);
              }}
              autoFocus
              className="w-full rounded border border-primary/50 bg-input px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="shrink-0 text-primary hover:text-primary/80"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setEditValue(displayValue);
              setEditing(true);
            }}
            className="w-full text-left rounded-md bg-muted px-2 py-1 text-xs text-foreground font-mono truncate hover:bg-accent transition-colors"
            title={displayValue}
          >
            {displayValue}
          </button>
        )}
      </div>

      {/* Sil */}
      <button
        onClick={onDelete}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all"
        title="Ayarı sil"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
