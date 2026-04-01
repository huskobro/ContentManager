/**
 * ChannelManager — YouTube kanal bağlantı ve yönetim sayfası.
 *
 * Faz 11.1:
 *   • Kanal listele (GET /youtube/channels)
 *   • Kanal bağla → OAuth URL al → popup aç
 *   • oauth_success / oauth_error URL param → toast + reload
 *   • is_active toggle → anında PATCH + BST-001 rollback
 *   • is_default seç → anında POST + BST-001 rollback
 *   • Kanal sil → iki-aşamalı confirm → DELETE + toast
 *
 * Save standardı:
 *   toggle   → anında kayıt + rollback on error (BST-001 fix)
 *   CRUD     → manuel buton + toast bildirim
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Youtube,
  Link,
  Unlink,
  Star,
  StarOff,
  ToggleLeft,
  ToggleRight,
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { api } from "@/api/client";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

// ─── Tipler ──────────────────────────────────────────────────────────────────

interface ChannelRecord {
  id: number;
  channel_id: string;
  channel_name: string;
  channel_thumbnail: string;
  is_default: boolean;
  is_active: boolean;
  connected_at: string;
  updated_at: string;
}

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function ChannelManager() {
  const adminPin = localStorage.getItem("cm-admin-pin") ?? "0000";
  const { addToast } = useUIStore();

  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connectingOAuth, setConnectingOAuth] = useState(false);

  // Silme onay state'i
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  // Bir toggle/default işlemi in-flight mi?
  const pendingToggle = useRef<Set<number>>(new Set());
  const pendingDefault = useRef<Set<number>>(new Set());

  // ─── Kanal listesi yk ─────────────────────────────────────────────────────

  const loadChannels = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.get<ChannelRecord[]>("/youtube/channels", { adminPin });
      setChannels(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [adminPin]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // ─── OAuth: Kanal Bağla (postMessage akışı) ──────────────────────────────

  const handleConnectChannel = async () => {
    if (connectingOAuth) return;
    setConnectingOAuth(true);

    const errorMessages: Record<string, string> = {
      missing_code: "OAuth kodu eksik. Tekrar deneyin.",
      invalid_state: "Güvenlik doğrulaması başarısız. Tekrar deneyin.",
      no_channel: "Google hesabına bağlı YouTube kanalı bulunamadı.",
      server_error: "Sunucu hatası. Lütfen tekrar deneyin.",
    };

    const oauthMessageHandler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.type !== "oauth_result") return;
      window.removeEventListener("message", oauthMessageHandler);
      if (event.data.status === "success") {
        addToast({ type: "success", title: "Kanal bağlandı", description: "YouTube kanalı başarıyla bağlandı." });
        loadChannels();
      } else {
        const errCode = event.data.error ?? "unknown";
        addToast({ type: "error", title: "Kanal bağlanamadı", description: errorMessages[errCode] ?? `OAuth hatası: ${errCode}` });
      }
      setConnectingOAuth(false);
    };

    try {
      const { url } = await api.get<{ url: string; state: string }>(
        "/youtube/oauth/url",
        { adminPin }
      );
      window.addEventListener("message", oauthMessageHandler);
      const popup = window.open(url, "youtube_oauth", "width=600,height=700");

      if (!popup) {
        window.removeEventListener("message", oauthMessageHandler);
        addToast({ type: "error", title: "Popup engellendi", description: "Tarayıcınız popup'ı engelledi." });
        setConnectingOAuth(false);
        return;
      }

      // Kullanıcı popup'ı manuel kapatırsa
      const pollInterval = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollInterval);
          window.removeEventListener("message", oauthMessageHandler);
          setConnectingOAuth(false);
        }
      }, 500);
    } catch (err) {
      window.removeEventListener("message", oauthMessageHandler);
      const msg = err instanceof Error ? err.message : String(err);
      addToast({ type: "error", title: "OAuth başlatılamadı", description: msg });
      setConnectingOAuth(false);
    }
  };

  // ─── Toggle is_active (BST-001 rollback) ─────────────────────────────────

  const handleToggleActive = async (channel: ChannelRecord) => {
    if (pendingToggle.current.has(channel.id)) return;
    pendingToggle.current.add(channel.id);

    // Optimistic update
    const original = { ...channel };
    setChannels((prev) =>
      prev.map((c) =>
        c.id === channel.id ? { ...c, is_active: !c.is_active, is_default: c.is_active ? false : c.is_default } : c
      )
    );

    try {
      const updated = await api.patch<ChannelRecord>(
        `/youtube/channels/${channel.id}/active`,
        {},
        { adminPin }
      );
      // Sunucudan dönen gerçek değerle eşitle
      setChannels((prev) => prev.map((c) => (c.id === channel.id ? updated : c)));
    } catch (err) {
      // Rollback
      setChannels((prev) => prev.map((c) => (c.id === channel.id ? original : c)));
      const msg = err instanceof Error ? err.message : String(err);
      addToast({
        type: "error",
        title: "Değiştirilemedi",
        description: msg,
      });
    } finally {
      pendingToggle.current.delete(channel.id);
    }
  };

  // ─── Set default (BST-001 rollback) ──────────────────────────────────────

  const handleSetDefault = async (channel: ChannelRecord) => {
    if (channel.is_default || pendingDefault.current.has(channel.id)) return;
    pendingDefault.current.add(channel.id);

    // Optimistic update: tüm is_default sıfırla, seçileni işaretle
    const snapshot = channels.map((c) => ({ ...c }));
    setChannels((prev) =>
      prev.map((c) => ({ ...c, is_default: c.id === channel.id }))
    );

    try {
      const updated = await api.post<ChannelRecord>(
        `/youtube/channels/${channel.id}/default`,
        {},
        { adminPin }
      );
      // Sunucudan güncel hali al + listeyi yenile
      await loadChannels();
      void updated; // suppress unused warning
    } catch (err) {
      // Rollback
      setChannels(snapshot);
      const msg = err instanceof Error ? err.message : String(err);
      addToast({
        type: "error",
        title: "Varsayılan ayarlanamadı",
        description: msg,
      });
    } finally {
      pendingDefault.current.delete(channel.id);
    }
  };

  // ─── Disconnect channel ───────────────────────────────────────────────────

  const handleDisconnect = async (channel: ChannelRecord) => {
    if (deleteConfirmId !== channel.id) {
      setDeleteConfirmId(channel.id);
      return;
    }
    // Onaylandı
    setDeleting(channel.id);
    setDeleteConfirmId(null);
    try {
      await api.delete(`/youtube/channels/${channel.id}`, { adminPin });
      setChannels((prev) => prev.filter((c) => c.id !== channel.id));
      addToast({
        type: "success",
        title: "Kanal kaldırıldı",
        description: `"${channel.channel_name}" bağlantısı kesildi.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({
        type: "error",
        title: "Silinemedi",
        description: msg,
      });
    } finally {
      setDeleting(null);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Youtube className="text-red-500" size={24} />
          <div>
            <h1 className="text-xl font-semibold text-white">Kanal Yönetimi</h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              YouTube kanallarını bağla, varsayılan seç, aktif/pasif yönet.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadChannels}
            disabled={loading}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-40"
            title="Yenile"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={handleConnectChannel}
            disabled={connectingOAuth || loading}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              "bg-red-600 hover:bg-red-500 text-white",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {connectingOAuth ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Link size={16} />
            )}
            Kanal Bağla
          </button>
        </div>
      </div>

      {/* Hata */}
      {loadError && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Kanallar yüklenemedi</p>
            <p className="text-xs mt-1 opacity-80">{loadError}</p>
          </div>
        </div>
      )}

      {/* Yükleniyor */}
      {loading && !loadError && (
        <div className="flex items-center justify-center py-16 text-zinc-500">
          <Loader2 size={24} className="animate-spin mr-2" />
          <span className="text-sm">Kanallar yükleniyor…</span>
        </div>
      )}

      {/* Boş durum */}
      {!loading && !loadError && channels.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <Youtube size={40} className="text-zinc-600" />
          <div>
            <p className="text-zinc-300 font-medium">Henüz bağlı kanal yok</p>
            <p className="text-zinc-500 text-sm mt-1">
              "Kanal Bağla" butonuna tıklayarak Google OAuth ile kanal ekleyebilirsiniz.
            </p>
          </div>
        </div>
      )}

      {/* Kanal listesi */}
      {!loading && channels.length > 0 && (
        <div className="space-y-3">
          {channels.map((channel) => (
            <ChannelRow
              key={channel.id}
              channel={channel}
              deleteConfirmId={deleteConfirmId}
              deleting={deleting}
              onToggleActive={() => handleToggleActive(channel)}
              onSetDefault={() => handleSetDefault(channel)}
              onDisconnect={() => handleDisconnect(channel)}
              onCancelDelete={() => setDeleteConfirmId(null)}
            />
          ))}
        </div>
      )}

      {/* Bilgi notu */}
      <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-xs text-zinc-500 space-y-1">
        <p>
          <strong className="text-zinc-400">Varsayılan kanal:</strong> Yeni video işlerinde
          otomatik kullanılan kanaldır. Yalnızca aktif kanallar varsayılan yapılabilir.
        </p>
        <p>
          <strong className="text-zinc-400">Pasif kanal:</strong> Bağlantı bilgileri korunur
          ancak yeni işlerde kullanılmaz.
        </p>
      </div>
    </div>
  );
}

// ─── ChannelRow ───────────────────────────────────────────────────────────────

interface ChannelRowProps {
  channel: ChannelRecord;
  deleteConfirmId: number | null;
  deleting: number | null;
  onToggleActive: () => void;
  onSetDefault: () => void;
  onDisconnect: () => void;
  onCancelDelete: () => void;
}

function ChannelRow({
  channel,
  deleteConfirmId,
  deleting,
  onToggleActive,
  onSetDefault,
  onDisconnect,
  onCancelDelete,
}: ChannelRowProps) {
  const isDeleteConfirm = deleteConfirmId === channel.id;
  const isDeleting = deleting === channel.id;

  const connectedDate = (() => {
    try {
      return new Date(channel.connected_at).toLocaleDateString("tr-TR", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return channel.connected_at;
    }
  })();

  return (
    <div
      className={cn(
        "flex items-center gap-4 p-4 rounded-lg border transition-all",
        channel.is_active
          ? "bg-zinc-900 border-zinc-700"
          : "bg-zinc-900/50 border-zinc-800 opacity-70"
      )}
    >
      {/* Thumbnail */}
      <div className="shrink-0">
        {channel.channel_thumbnail ? (
          <img
            src={channel.channel_thumbnail}
            alt={channel.channel_name}
            className={cn(
              "w-12 h-12 rounded-full object-cover ring-2",
              channel.is_default ? "ring-red-500" : "ring-zinc-700"
            )}
          />
        ) : (
          <div
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center ring-2",
              channel.is_default ? "ring-red-500 bg-red-500/10" : "ring-zinc-700 bg-zinc-800"
            )}
          >
            <Youtube size={20} className="text-zinc-400" />
          </div>
        )}
      </div>

      {/* Kanal bilgisi */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white font-medium truncate">{channel.channel_name}</span>
          {channel.is_default && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30">
              <CheckCircle2 size={10} />
              Varsayılan
            </span>
          )}
          {!channel.is_active && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-500 border border-zinc-700">
              Pasif
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">
          {channel.channel_id} · Bağlandı: {connectedDate}
        </p>
      </div>

      {/* Aksiyonlar */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Varsayılan yap */}
        {!channel.is_default && channel.is_active && (
          <button
            onClick={onSetDefault}
            className="p-2 rounded-lg text-zinc-500 hover:text-yellow-400 hover:bg-zinc-800 transition-colors"
            title="Varsayılan kanal yap"
          >
            <Star size={16} />
          </button>
        )}
        {channel.is_default && (
          <div
            className="p-2 rounded-lg text-yellow-400"
            title="Varsayılan kanal"
          >
            <Star size={16} fill="currentColor" />
          </div>
        )}

        {/* Aktif/Pasif toggle */}
        <button
          onClick={onToggleActive}
          className={cn(
            "p-2 rounded-lg transition-colors",
            channel.is_active
              ? "text-green-400 hover:text-green-300 hover:bg-zinc-800"
              : "text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800"
          )}
          title={channel.is_active ? "Pasife al" : "Aktife al"}
        >
          {channel.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
        </button>

        {/* Sil / Onayla */}
        {isDeleteConfirm ? (
          <div className="flex items-center gap-1">
            <button
              onClick={onDisconnect}
              disabled={isDeleting}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
            >
              {isDeleting ? <Loader2 size={12} className="animate-spin" /> : "Sil"}
            </button>
            <button
              onClick={onCancelDelete}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              İptal
            </button>
          </div>
        ) : (
          <button
            onClick={onDisconnect}
            disabled={isDeleting}
            className="p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors disabled:opacity-50"
            title="Kanal bağlantısını kes"
          >
            <Unlink size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
