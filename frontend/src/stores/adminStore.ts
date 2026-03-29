/**
 * Admin Store — Admin paneli durum yönetimi.
 *
 * Admin-only API çağrıları bu store üzerinden yürütülür.
 * Tüm istekler X-Admin-Pin header'ı ile korunur.
 *
 * API Entegrasyonu:
 *   fetchSettings()   → GET  /api/settings?scope=X&scope_id=Y (admin PIN)
 *   createSetting()   → POST /api/settings (admin PIN)
 *   updateSetting()   → PUT  /api/settings/{id} (admin PIN)
 *   deleteSetting()   → DELETE /api/settings/{id} (admin PIN)
 *   deleteJob()       → DELETE /api/jobs/{id} (admin PIN)
 */

import { create } from "zustand";
import { api } from "@/api/client";

// ─── Tipler ───────────────────────────────────────────────────────────────────

export type SettingScope = "admin" | "module" | "provider" | "user";

export interface SettingRecord {
  id: number;
  scope: SettingScope;
  scope_id: string;
  key: string;
  value: unknown;
  locked: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface SettingCreatePayload {
  scope: SettingScope;
  scope_id: string;
  key: string;
  value: unknown;
  locked?: boolean;
  description?: string | null;
}

export interface SettingUpdatePayload {
  value: unknown;
  locked?: boolean | null;
  description?: string | null;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface AdminState {
  /** Mevcut scope'a ait ayar kayıtları */
  settings: SettingRecord[];
  /** Yükleme durumu */
  loading: boolean;
  /** Hata mesajı */
  error: string | null;

  // ── API Çağrıları ────────────────────────────────────────────────────────

  /** Belirli bir scope'un tüm ayarlarını çeker */
  fetchSettings: (scope: SettingScope, scopeId?: string) => Promise<void>;

  /** Yeni ayar oluşturur (upsert) */
  createSetting: (payload: SettingCreatePayload) => Promise<SettingRecord | null>;

  /** Mevcut ayarı günceller */
  updateSetting: (id: number, payload: SettingUpdatePayload) => Promise<SettingRecord | null>;

  /** Ayarı siler */
  deleteSetting: (id: number) => Promise<boolean>;

  /** İşi siler (admin) */
  deleteJob: (jobId: string) => Promise<boolean>;

  /** Ayar listesini temizle */
  clearSettings: () => void;
}

/** localStorage'daki admin PIN'ini okur */
function getAdminPin(): string {
  return localStorage.getItem("cm-admin-pin") ?? "0000";
}

export const useAdminStore = create<AdminState>()((set, get) => ({
  settings: [],
  loading: false,
  error: null,

  // ── API Çağrıları ────────────────────────────────────────────────────────

  fetchSettings: async (scope, scopeId = "") => {
    set({ loading: true, error: null });
    try {
      const pin = getAdminPin();
      const query = new URLSearchParams({ scope, scope_id: scopeId });
      const data = await api.get<SettingRecord[]>(
        `/settings?${query.toString()}`,
        { adminPin: pin }
      );
      set({ settings: data, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ayarlar yüklenemedi";
      set({ error: message, loading: false });
    }
  },

  createSetting: async (payload) => {
    try {
      const pin = getAdminPin();
      const data = await api.post<SettingRecord>("/settings", payload, {
        adminPin: pin,
      });
      // Listeye ekle
      set((s) => {
        const exists = s.settings.find((r) => r.id === data.id);
        if (exists) {
          return { settings: s.settings.map((r) => (r.id === data.id ? data : r)) };
        }
        return { settings: [...s.settings, data] };
      });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ayar oluşturulamadı";
      set({ error: message });
      return null;
    }
  },

  updateSetting: async (id, payload) => {
    try {
      const pin = getAdminPin();
      const data = await api.put<SettingRecord>(`/settings/${id}`, payload, {
        adminPin: pin,
      });
      set((s) => ({
        settings: s.settings.map((r) => (r.id === id ? data : r)),
      }));
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ayar güncellenemedi";
      set({ error: message });
      return null;
    }
  },

  deleteSetting: async (id) => {
    try {
      const pin = getAdminPin();
      await api.delete(`/settings/${id}`, { adminPin: pin });
      set((s) => ({
        settings: s.settings.filter((r) => r.id !== id),
      }));
      return true;
    } catch {
      return false;
    }
  },

  deleteJob: async (jobId) => {
    try {
      const pin = getAdminPin();
      await api.delete(`/jobs/${jobId}`, { adminPin: pin });
      return true;
    } catch {
      return false;
    }
  },

  clearSettings: () => set({ settings: [], error: null }),
}));
