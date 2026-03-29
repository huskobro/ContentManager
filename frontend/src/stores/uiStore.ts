/**
 * UI Store — tema, sidebar ve genel arayüz durumu.
 *
 * Bu store, iş mantığı (job, settings) taşımaz;
 * yalnızca kullanıcı arayüzünün görsel durumunu yönetir.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "dark" | "light";

interface UIState {
  // ── Tema ──────────────────────────────────────────────────────────────────
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;

  // ── Sidebar ───────────────────────────────────────────────────────────────
  /** Masaüstünde sidebar daraltılmış mı (icon-only mod)? */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  /** Mobilde sidebar açık mı? */
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;

  // ── Admin Modu ────────────────────────────────────────────────────────────
  /** Admin paneli kilitli/açık durumu — PIN ile açılır */
  adminUnlocked: boolean;
  unlockAdmin: () => void;
  lockAdmin: () => void;

  // ── Toast / Bildirim (basit mesaj kuyruğu) ────────────────────────────────
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

export interface Toast {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  description?: string;
  /** Otomatik kapanma süresi ms; undefined ise manuel kapatılır */
  duration?: number;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
  } else {
    root.classList.remove("dark");
    root.classList.add("light");
  }
  try {
    localStorage.setItem("cm-theme", theme);
  } catch (_) {}
}

let toastIdCounter = 0;

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      // ── Tema ──────────────────────────────────────────────────────────────
      theme: "dark",

      toggleTheme: () => {
        const next: Theme = get().theme === "dark" ? "light" : "dark";
        applyTheme(next);
        set({ theme: next });
      },

      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },

      // ── Sidebar ───────────────────────────────────────────────────────────
      sidebarCollapsed: false,

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      mobileSidebarOpen: false,

      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),

      // ── Admin ─────────────────────────────────────────────────────────────
      adminUnlocked: false,

      unlockAdmin: () => set({ adminUnlocked: true }),

      lockAdmin: () => set({ adminUnlocked: false }),

      // ── Toasts ────────────────────────────────────────────────────────────
      toasts: [],

      addToast: (toast) => {
        const id = String(++toastIdCounter);
        const full: Toast = { id, duration: 4000, ...toast };
        set((s) => ({ toasts: [...s.toasts, full] }));

        if (full.duration) {
          setTimeout(() => {
            get().removeToast(id);
          }, full.duration);
        }
      },

      removeToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: "cm-ui",
      // Yalnızca bu alanları localStorage'a yaz
      partialize: (s) => ({
        theme: s.theme,
        sidebarCollapsed: s.sidebarCollapsed,
      }),
      // Hydration sonrası temayı DOM'a uygula
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    }
  )
);
