/**
 * Platform Account Store — Faz 11.3
 *
 * PlatformAccount kayıtlarının frontend önbelleği.
 * Yalnızca credentials_json içermeyen güvenli yanıtlar saklanır.
 *
 * API Entegrasyonu:
 *   fetchPlatformAccounts()      → GET /api/platform-accounts
 *   fetchPlatformAccountsByPlatform() → GET /api/platform-accounts?platform=youtube
 *   toggleActive(id)             → PATCH /api/platform-accounts/{id}/active
 *   setDefault(id)               → PATCH /api/platform-accounts/{id}/default
 *   deletePlatformAccount(id)    → DELETE /api/platform-accounts/{id}
 */

import { create } from "zustand";
import { api } from "@/api/client";
import { useAdminStore } from "@/stores/adminStore";

// ─── Tipler ───────────────────────────────────────────────────────────────────

export interface PlatformAccount {
  id: number;
  platform: string;
  account_name: string;
  external_account_id: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlatformAccountListResponse {
  accounts: PlatformAccount[];
  total: number;
}

interface PlatformAccountState {
  accounts: PlatformAccount[];
  total: number;
  loading: boolean;
  error: string | null;

  // Actions
  fetchPlatformAccounts: (platform?: string) => Promise<void>;
  toggleActive: (id: number) => Promise<PlatformAccount>;
  setDefault: (id: number) => Promise<PlatformAccount>;
  deletePlatformAccount: (id: number) => Promise<void>;

  /** Tek bir hesabı optimistic olarak günceller (rollback için orijinali döner) */
  patchAccount: (id: number, patch: Partial<PlatformAccount>) => PlatformAccount | undefined;
  /** Optimistic güncellemeyi geri alır */
  revertAccount: (original: PlatformAccount) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePlatformAccountStore = create<PlatformAccountState>((set, get) => ({
  accounts: [],
  total: 0,
  loading: false,
  error: null,

  fetchPlatformAccounts: async (platform?: string) => {
    set({ loading: true, error: null });
    try {
      const url = platform
        ? `/api/platform-accounts?platform=${encodeURIComponent(platform)}`
        : "/api/platform-accounts";
      const data = await api<PlatformAccountListResponse>(url);
      set({ accounts: data.accounts, total: data.total, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  toggleActive: async (id: number): Promise<PlatformAccount> => {
    const pin = _getAdminPin();
    const data = await api<PlatformAccount>(`/api/platform-accounts/${id}/active`, {
      method: "PATCH",
      headers: { "X-Admin-Pin": pin },
    });
    set((s) => ({
      accounts: s.accounts.map((a) => (a.id === id ? data : a)),
    }));
    return data;
  },

  setDefault: async (id: number): Promise<PlatformAccount> => {
    const pin = _getAdminPin();
    const data = await api<PlatformAccount>(`/api/platform-accounts/${id}/default`, {
      method: "PATCH",
      headers: { "X-Admin-Pin": pin },
    });
    // Aynı platform'daki tüm hesapların is_default'unu güncelle
    set((s) => ({
      accounts: s.accounts.map((a) => {
        if (a.id === id) return data;
        if (a.platform === data.platform) return { ...a, is_default: false };
        return a;
      }),
    }));
    return data;
  },

  deletePlatformAccount: async (id: number): Promise<void> => {
    const pin = _getAdminPin();
    await api(`/api/platform-accounts/${id}`, {
      method: "DELETE",
      headers: { "X-Admin-Pin": pin },
    });
    set((s) => ({
      accounts: s.accounts.filter((a) => a.id !== id),
      total: s.total - 1,
    }));
  },

  patchAccount: (id, patch) => {
    const original = get().accounts.find((a) => a.id === id);
    if (!original) return undefined;
    set((s) => ({
      accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
    return original;
  },

  revertAccount: (original) => {
    set((s) => ({
      accounts: s.accounts.map((a) => (a.id === original.id ? original : a)),
    }));
  },
}));

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function _getAdminPin(): string {
  try {
    return useAdminStore.getState().adminPin ?? "";
  } catch {
    return localStorage.getItem("cm-admin-pin") ?? "";
  }
}
