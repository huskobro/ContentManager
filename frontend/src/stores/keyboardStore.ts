/**
 * keyboardStore — Klavye Navigasyon Kapsam Yöneticisi
 *
 * Problem: Birden fazla liste veya overlay aynı anda window'a
 * keydown listener bağlayabilir. Bu durumda aynı tuş basışı
 * birden fazla scope tarafından işlenir.
 *
 * Çözüm: Aktif scope kimliğini merkezi bir store'da tut.
 * - Her scope mount olduğunda bir ID alır.
 * - Yalnızca en üstteki (son kayıtlı) scope olayları işler.
 * - Overlay açıldığında altındaki listenin scope'u otomatik pasif olur.
 * - Overlay kapandığında önceki scope yeniden aktif hale gelir.
 *
 * Stack Semantiği:
 *   push(id) → bu scope'u aktif yap
 *   pop(id)  → bu scope'u çıkar, önceki scope aktif olur
 *   isActive(id) → bu scope şu an en üstte mi?
 */

import { create } from "zustand";

interface KeyboardStoreState {
  /** Aktif scope ID'lerinin LIFO stack'i */
  scopeStack: string[];
  /** Scope'u stack'e ekle (aktif yap) */
  push: (id: string) => void;
  /** Scope'u stack'ten çıkar */
  pop: (id: string) => void;
  /** Bu scope şu an aktif (en üstte) mi? */
  isActive: (id: string) => boolean;
}

export const useKeyboardStore = create<KeyboardStoreState>((set, get) => ({
  scopeStack: [],

  push: (id) =>
    set((s) => ({
      scopeStack: [...s.scopeStack.filter((x) => x !== id), id],
    })),

  pop: (id) =>
    set((s) => ({
      scopeStack: s.scopeStack.filter((x) => x !== id),
    })),

  isActive: (id) => {
    const stack = get().scopeStack;
    return stack.length > 0 && stack[stack.length - 1] === id;
  },
}));
