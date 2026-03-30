/**
 * useKeyboardNavigation — Merkezi Klavye Navigasyon Hook'u
 *
 * Tüm listeler (JobList, AdminJobs, ModuleManager, ProviderManager) bu hook'u
 * kullanır. Mantık tek yerde yaşar, sayfalar sadece callback'leri verir.
 *
 * Parametreler:
 *   itemCount   — Listede kaç eleman var
 *   onSpace     — Space tuşu → Quick Look veya aksiyon tetikle
 *   onEnter     — Enter tuşu → Deep Dive veya detay aç
 *   onEscape    — ESC tuşu → sıfırlama veya panel kapat
 *   disabled    — true ise tüm klavye navigasyonu devre dışı (modal açıkken)
 *   scrollRef   — Liste container ref'i (odaklanan satırı görünüme kaydırmak için)
 *
 * Döndürür:
 *   focusedIdx  — Şu an odakta olan satır indeksi (-1 = yok)
 *   setFocusedIdx — Fare hover senkronizasyonu için dışarıdan set edilebilir
 *
 * Bellek Sızıntısı Önlemi:
 *   useEffect cleanup ile window event listener her zaman kaldırılır.
 *   Bağımlılıklar minimumda tutulur — stale closure yoktur (ref tabanlı callbacks).
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface UseKeyboardNavigationOptions {
  itemCount: number;
  onSpace?: (idx: number) => void;
  onEnter?: (idx: number) => void;
  onEscape?: () => void;
  /** true iken klavye navigasyonu pasif — modal/dialog açıkken kullanın */
  disabled?: boolean;
  /** Liste container ref'i — scroll-into-view için */
  scrollRef?: React.RefObject<HTMLElement | null>;
}

interface UseKeyboardNavigationReturn {
  focusedIdx: number;
  setFocusedIdx: (idx: number) => void;
}

export function useKeyboardNavigation({
  itemCount,
  onSpace,
  onEnter,
  onEscape,
  disabled = false,
  scrollRef,
}: UseKeyboardNavigationOptions): UseKeyboardNavigationReturn {
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);

  // Callback'leri ref'e alıyoruz → stale closure olmaz, bağımlılık dizisi sabit kalır
  const onSpaceRef  = useRef(onSpace);
  const onEnterRef  = useRef(onEnter);
  const onEscapeRef = useRef(onEscape);
  onSpaceRef.current  = onSpace;
  onEnterRef.current  = onEnter;
  onEscapeRef.current = onEscape;

  const focusedIdxRef = useRef(focusedIdx);
  focusedIdxRef.current = focusedIdx;

  const itemCountRef = useRef(itemCount);
  itemCountRef.current = itemCount;

  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  // Odaklanan satırı scroll-into-view yap
  useEffect(() => {
    if (focusedIdx < 0 || !scrollRef?.current) return;
    const rows = scrollRef.current.querySelectorAll("[data-nav-row]");
    const row = rows[focusedIdx] as HTMLElement | undefined;
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedIdx, scrollRef]);

  // Klavye event handler — window'a bağlanır, cleanup ile temizlenir
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Devre dışı modda hiçbir şey yapma
    if (disabledRef.current) return;

    // Input/textarea/select odakta ise liste navigasyonuna geçme
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    const count = itemCountRef.current;
    const idx   = focusedIdxRef.current;

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        setFocusedIdx((prev) => (count === 0 ? -1 : Math.min(prev + 1, count - 1)));
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        setFocusedIdx((prev) => (count === 0 ? -1 : Math.max(prev - 1, 0)));
        break;
      }
      case " ": {
        if (idx >= 0 && idx < count) {
          e.preventDefault();
          onSpaceRef.current?.(idx);
        }
        break;
      }
      case "Enter": {
        if (idx >= 0 && idx < count) {
          e.preventDefault();
          onEnterRef.current?.(idx);
        }
        break;
      }
      case "Escape": {
        onEscapeRef.current?.();
        break;
      }
    }
  }, []); // Bağımlılık yok — tüm değerler ref üzerinden erişiliyor

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // itemCount değiştiğinde (filtre/sayfalama) odağı sıfırla
  useEffect(() => {
    setFocusedIdx(-1);
  }, [itemCount]);

  return { focusedIdx, setFocusedIdx };
}
