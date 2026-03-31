/**
 * PlatformAccountManager — Platform Hesap Yönetimi (Faz 11.3)
 *
 * Publishing Hub için platform-genel hesap yönetim sayfası.
 * YouTube kanalları dahil tüm platform bağlantıları buradan yönetilir.
 *
 * Özellikler:
 *   • Platform hesaplarını listele (GET /api/platform-accounts)
 *   • Platform filtresi (youtube | tiktok | instagram | facebook)
 *   • Aktif/pasif toggling (PATCH /{id}/active)
 *   • Varsayılan hesap seçimi (PATCH /{id}/default)
 *   • Hesap silme — iki aşamalı onay (DELETE /{id})
 *   • YouTube kanalı bağlama: inline OAuth popup (ChannelManager'a gitmez)
 *
 * Save standardı:
 *   toggle/default → anında kayıt + rollback on error
 *   delete         → iki aşamalı confirm + toast
 *
 * Diğer platformlar (TikTok, Instagram, Facebook):
 *   Bu sayfada listelenirler ama bağlama akışı henüz uygulanmamıştır.
 *   "Yakında" notu ile dürüstçe gösterilir.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Globe,
  Star,
  StarOff,
  ToggleLeft,
  ToggleRight,
  Loader2,
  AlertCircle,
  RefreshCw,
  Trash2,
  Youtube,
  Instagram,
  Twitter,
  Facebook,
} from "lucide-react";
import { api } from "@/api/client";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

// ─── Tipler ──────────────────────────────────────────────────────────────────

interface PlatformAccount {
  id: number;
  platform: string;
  account_name: string;
  external_account_id: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface PlatformAccountListResponse {
  accounts: PlatformAccount[];
  total: number;
}

// ─── Platform meta bilgileri ──────────────────────────────────────────────────

const PLATFORM_META: Record<
  string,
  { label: string; color: string; bg: string; icon: React.ReactNode; connectAction?: string; soon?: boolean }
> = {
  youtube: {
    label: "YouTube",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    icon: <Youtube size={16} />,
    connectAction: "youtube_oauth",
  },
  instagram: {
    label: "Instagram",
    color: "text-pink-400",
    bg: "bg-pink-500/10 border-pink-500/20",
    icon: <Instagram size={16} />,
    soon: true,
  },
  tiktok: {
    label: "TikTok",
    color: "text-slate-300",
    bg: "bg-slate-500/10 border-slate-500/20",
    icon: <Twitter size={16} />, // TikTok ikonu Lucide'da yok, placeholder
    soon: true,
  },
  facebook: {
    label: "Facebook",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    icon: <Facebook size={16} />,
    soon: true,
  },
};

function getPlatformMeta(platform: string) {
  return PLATFORM_META[platform] ?? {
    label: platform,
    color: "text-slate-400",
    bg: "bg-muted border-border",
    icon: <Globe size={16} />,
  };
}

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function PlatformAccountManager() {
  const adminPin = localStorage.getItem("cm-admin-pin") ?? "0000";
  const { addToast } = useUIStore();

  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const pendingToggle = useRef<Set<number>>(new Set());
  const pendingDefault = useRef<Set<number>>(new Set());

  const [connectingOAuth, setConnectingOAuth] = useState(false);

  // ─── URL param: oauth_success / oauth_error ─────────────────────────────────

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("oauth_success");
    const error = params.get("oauth_error");
    if (success) {
      addToast({ type: "success", title: "Kanal bağlandı", description: "YouTube kanalı başarıyla bağlandı." });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error) {
      const messages: Record<string, string> = {
        missing_code: "OAuth kodu eksik. Tekrar deneyin.",
        invalid_state: "Güvenlik doğrulaması başarısız. Tekrar deneyin.",
        no_channel: "Google hesabına bağlı YouTube kanalı bulunamadı.",
        server_error: "Sunucu hatası. Lütfen tekrar deneyin.",
      };
      addToast({ type: "error", title: "Kanal bağlanamadı", description: messages[error] ?? `OAuth hatası: ${error}` });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Hesap listesi yükle ────────────────────────────────────────────────────

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = platformFilter !== "all" ? `?platform=${platformFilter}` : "";
      const data = await api.get<PlatformAccountListResponse>(
        `/platform-accounts${params}`,
        { adminPin }
      );
      setAccounts(data.accounts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [adminPin, platformFilter]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // ─── YouTube OAuth: doğrudan popup ──────────────────────────────────────────

  const handleConnectYouTube = useCallback(async () => {
    if (connectingOAuth) return;
    setConnectingOAuth(true);
    try {
      const { url } = await api.get<{ url: string; state: string }>(
        "/youtube/oauth/url?redirect=/admin/platform-accounts",
        { adminPin }
      );
      const popup = window.open(url, "youtube_oauth", "width=600,height=700");
      if (popup) {
        const interval = setInterval(() => {
          if (popup.closed) {
            clearInterval(interval);
            loadAccounts();
          }
        }, 500);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({ type: "error", title: "OAuth başlatılamadı", description: msg });
    } finally {
      setConnectingOAuth(false);
    }
  }, [adminPin, addToast, connectingOAuth, loadAccounts]);

  // ─── Toggle aktif ───────────────────────────────────────────────────────────

  const handleToggleActive = useCallback(
    async (account: PlatformAccount) => {
      if (pendingToggle.current.has(account.id)) return;
      pendingToggle.current.add(account.id);

      const prev = account.is_active;
      // Optimistic update
      setAccounts((as) =>
        as.map((a) => (a.id === account.id ? { ...a, is_active: !prev } : a))
      );

      try {
        const updated = await api.patch<PlatformAccount>(
          `/platform-accounts/${account.id}/active`,
          undefined,
          { adminPin }
        );
        setAccounts((as) => as.map((a) => (a.id === account.id ? updated : a)));
        addToast({
          type: "info",
          title: updated.is_active ? "Hesap aktif edildi" : "Hesap pasif edildi",
        });
      } catch (err) {
        // Rollback
        setAccounts((as) =>
          as.map((a) => (a.id === account.id ? { ...a, is_active: prev } : a))
        );
        const msg = err instanceof Error ? err.message : String(err);
        addToast({ type: "error", title: "Durum güncellenemedi", description: msg });
      } finally {
        pendingToggle.current.delete(account.id);
      }
    },
    [adminPin, addToast]
  );

  // ─── Varsayılan yap ─────────────────────────────────────────────────────────

  const handleSetDefault = useCallback(
    async (account: PlatformAccount) => {
      if (account.is_default) return;
      if (!account.is_active) {
        addToast({
          type: "error",
          title: "Pasif hesap varsayılan yapılamaz",
          description: "Önce hesabı aktif edin.",
        });
        return;
      }
      if (pendingDefault.current.has(account.id)) return;
      pendingDefault.current.add(account.id);

      // Optimistic update
      setAccounts((as) =>
        as.map((a) => ({
          ...a,
          is_default: a.id === account.id ? true : a.platform === account.platform ? false : a.is_default,
        }))
      );

      try {
        const updated = await api.patch<PlatformAccount>(
          `/platform-accounts/${account.id}/default`,
          undefined,
          { adminPin }
        );
        setAccounts((as) => as.map((a) => (a.id === account.id ? updated : a)));
        addToast({ type: "success", title: "Varsayılan hesap güncellendi" });
      } catch (err) {
        // Reload on failure
        loadAccounts();
        const msg = err instanceof Error ? err.message : String(err);
        addToast({ type: "error", title: "Varsayılan güncellenemedi", description: msg });
      } finally {
        pendingDefault.current.delete(account.id);
      }
    },
    [adminPin, addToast, loadAccounts]
  );

  // ─── Silme ──────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (account: PlatformAccount) => {
      setDeleting(account.id);
      try {
        await api.delete(`/platform-accounts/${account.id}`, { adminPin });
        setAccounts((as) => as.filter((a) => a.id !== account.id));
        setDeleteConfirmId(null);
        addToast({ type: "success", title: "Hesap silindi" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        addToast({ type: "error", title: "Silme başarısız", description: msg });
      } finally {
        setDeleting(null);
      }
    },
    [adminPin, addToast]
  );

  // ─── Filtreli hesaplar ──────────────────────────────────────────────────────

  const filteredAccounts =
    platformFilter === "all"
      ? accounts
      : accounts.filter((a) => a.platform === platformFilter);

  const platforms = Array.from(new Set(accounts.map((a) => a.platform)));

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Platform Hesapları</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Publishing Hub için bağlı platform hesaplarını yönetin
          </p>
        </div>
        <button
          onClick={loadAccounts}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Yenile
        </button>
      </div>

      {/* Platform filtresi */}
      <div className="flex items-center gap-2 flex-wrap">
        {["all", ...platforms].map((p) => {
          const meta = p === "all" ? null : getPlatformMeta(p);
          return (
            <button
              key={p}
              onClick={() => setPlatformFilter(p)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs border transition-colors",
                platformFilter === p
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              {meta && <span className={meta.color}>{meta.icon}</span>}
              {p === "all" ? "Tümü" : meta?.label ?? p}
            </button>
          );
        })}
      </div>

      {/* Yükleniyor */}
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
          <Loader2 size={14} className="animate-spin" />
          Hesaplar yükleniyor...
        </div>
      )}

      {/* Hata */}
      {loadError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-400">
          <AlertCircle size={14} className="shrink-0" />
          {loadError}
        </div>
      )}

      {/* Hesap listesi */}
      {!loading && !loadError && (
        <>
          {filteredAccounts.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <Globe size={32} className="mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {platformFilter === "all"
                  ? "Henüz bağlı platform hesabı yok."
                  : `${getPlatformMeta(platformFilter).label} hesabı bulunamadı.`}
              </p>
              {platformFilter === "youtube" || platformFilter === "all" ? (
                <button
                  onClick={handleConnectYouTube}
                  disabled={connectingOAuth}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-red-400 hover:underline disabled:opacity-50"
                >
                  {connectingOAuth ? <Loader2 size={12} className="animate-spin" /> : <Youtube size={12} />}
                  YouTube kanalı bağla
                </button>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="divide-y divide-border">
                {filteredAccounts.map((account) => {
                  const meta = getPlatformMeta(account.platform);
                  const isDeleteConfirm = deleteConfirmId === account.id;
                  const isDeleting = deleting === account.id;

                  return (
                    <div key={account.id} className="p-4 flex items-center justify-between gap-4">
                      {/* Sol: platform + hesap bilgisi */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "flex items-center justify-center w-8 h-8 rounded-lg border shrink-0",
                            meta.bg,
                            meta.color
                          )}
                        >
                          {meta.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground truncate">
                              {account.account_name || account.external_account_id}
                            </span>
                            {account.is_default && (
                              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                Varsayılan
                              </span>
                            )}
                            {!account.is_active && (
                              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">
                                Pasif
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={cn("text-[10px] font-medium", meta.color)}>
                              {meta.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono truncate">
                              {account.external_account_id}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Sağ: aksiyonlar */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Varsayılan yap */}
                        <button
                          onClick={() => handleSetDefault(account)}
                          disabled={account.is_default || !account.is_active}
                          title={
                            account.is_default
                              ? "Zaten varsayılan"
                              : !account.is_active
                                ? "Pasif hesap varsayılan yapılamaz"
                                : "Varsayılan yap"
                          }
                          className={cn(
                            "p-1.5 rounded-md transition-colors",
                            account.is_default
                              ? "text-amber-400 cursor-default"
                              : "text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
                          )}
                        >
                          {account.is_default ? <Star size={14} fill="currentColor" /> : <StarOff size={14} />}
                        </button>

                        {/* Aktif toggle */}
                        <button
                          onClick={() => handleToggleActive(account)}
                          title={account.is_active ? "Pasif yap" : "Aktif yap"}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                          {account.is_active ? (
                            <ToggleRight size={16} className="text-emerald-400" />
                          ) : (
                            <ToggleLeft size={16} />
                          )}
                        </button>

                        {/* Sil */}
                        {!isDeleteConfirm ? (
                          <button
                            onClick={() => setDeleteConfirmId(account.id)}
                            title="Hesabı sil"
                            className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-red-400">Emin misiniz?</span>
                            <button
                              onClick={() => handleDelete(account)}
                              disabled={isDeleting}
                              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 disabled:opacity-50"
                            >
                              {isDeleting ? <Loader2 size={10} className="animate-spin" /> : null}
                              Sil
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:bg-accent"
                            >
                              İptal
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Platform bağlama rehberi */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Platform Bağlama
          </p>
        </div>
        <div className="divide-y divide-border">
          {Object.entries(PLATFORM_META).map(([key, meta]) => (
            <div key={key} className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className={cn("shrink-0", meta.color)}>{meta.icon}</span>
                <div>
                  <p className="text-xs font-medium text-foreground">{meta.label}</p>
                  {meta.soon && (
                    <p className="text-[10px] text-muted-foreground">Yakında — henüz aktif değil</p>
                  )}
                </div>
              </div>
              {meta.connectAction === "youtube_oauth" ? (
                <button
                  onClick={handleConnectYouTube}
                  disabled={connectingOAuth}
                  className={cn(
                    "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors",
                    "border-border text-muted-foreground hover:bg-accent disabled:opacity-50"
                  )}
                >
                  {connectingOAuth ? <Loader2 size={12} className="animate-spin" /> : null}
                  Kanal Bağla
                </button>
              ) : (
                <span className="text-[10px] text-muted-foreground px-3 py-1.5 rounded-md border border-border bg-muted">
                  Yakında
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
