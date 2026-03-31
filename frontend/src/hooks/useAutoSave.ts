/**
 * useAutoSave — Sistem genelinde tutarlı otomatik kayıt davranışı.
 *
 * Alan türüne göre farklı tetikleme stratejisi:
 *   - "immediate":  toggle, select, radio → değer değişir değişmez kaydet
 *   - "blur":       text, textarea, password, number → alan odağını kaybedince kaydet
 *   - "debounce":   text, textarea → yazarken debounce (800ms) + blur fallback
 *
 * autoSaveEnabled (uiStore) false iken:
 *   - `shouldAutoSave` = false döner
 *   - Çağıran bileşen bu flag'i kontrol edip manuel Kaydet butonu göstermeli
 *
 * Dönen değerler:
 *   - `shouldAutoSave`: mevcut oturum için auto-save açık mı
 *   - `saveState`: "idle" | "saving" | "saved" | "error"
 *   - `triggerSave(fn)`: kayıt fonksiyonunu tetikler, state'i yönetir
 *   - `debounceRef`: text input onChange'de kullanmak için debounce ref'i
 *   - `onBlurSave(fn)`: text input onBlur'da kullanmak için
 */

import { useRef, useState, useCallback } from "react";
import { useUIStore } from "@/stores/uiStore";

export type SaveState = "idle" | "saving" | "saved" | "error";

interface UseAutoSaveReturn {
  /** Auto-save şu an etkin mi (uiStore'dan) */
  shouldAutoSave: boolean;
  /** Kayıt durumu */
  saveState: SaveState;
  /** Herhangi bir kayıt fonksiyonunu çalıştır, durumları yönet */
  triggerSave: (fn: () => Promise<void>) => Promise<void>;
  /** Text/number input için: onChange'de debounce başlat */
  onChangeTrigger: (fn: () => Promise<void>) => void;
  /** Text/number input için: onBlur'da varsa bekleyen save'i flush et */
  onBlurTrigger: (fn: () => Promise<void>) => void;
  /** Debounce'u iptal et (input unmount'ta çağır) */
  cancelDebounce: () => void;
}

const DEBOUNCE_MS = 800;

export function useAutoSave(): UseAutoSaveReturn {
  const autoSaveEnabled = useUIStore((s) => s.autoSaveEnabled);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFn = useRef<(() => Promise<void>) | null>(null);

  const cancelDebounce = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
  }, []);

  const triggerSave = useCallback(async (fn: () => Promise<void>) => {
    cancelDebounce();
    setSaveState("saving");
    try {
      await fn();
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  }, [cancelDebounce]);

  const onChangeTrigger = useCallback((fn: () => Promise<void>) => {
    if (!autoSaveEnabled) return;
    pendingFn.current = fn;
    cancelDebounce();
    debounceTimer.current = setTimeout(() => {
      if (pendingFn.current) {
        triggerSave(pendingFn.current);
        pendingFn.current = null;
      }
    }, DEBOUNCE_MS);
  }, [autoSaveEnabled, cancelDebounce, triggerSave]);

  const onBlurTrigger = useCallback((fn: () => Promise<void>) => {
    if (!autoSaveEnabled) return;
    // Debounce varsa hemen flush et
    cancelDebounce();
    pendingFn.current = null;
    triggerSave(fn);
  }, [autoSaveEnabled, cancelDebounce, triggerSave]);

  return {
    shouldAutoSave: autoSaveEnabled,
    saveState,
    triggerSave,
    onChangeTrigger,
    onBlurTrigger,
    cancelDebounce,
  };
}
