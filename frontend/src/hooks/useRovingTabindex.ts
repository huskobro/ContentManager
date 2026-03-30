/**
 * useRovingTabindex — Gerçek DOM Odak Yönetimi (Roving Tabindex Deseni)
 *
 * Erişilebilirlik standardı: ARIA Authoring Practices Guide § Roving Tabindex
 * https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#kbd_roving_tabindex
 *
 * Nasıl çalışır:
 *   - Aktif eleman tabIndex=0 alır → Tab tuşuyla odaklanılabilir
 *   - Diğer elemanlar tabIndex=-1 alır → Tab ile atlanır
 *   - focusedIdx değiştiğinde aktif elemanın DOM node'una focus() çağrılır
 *   - Ekran okuyucuları bu pattern'ı tanır
 *
 * Kullanım:
 *   const { getTabIndex, focusItem } = useRovingTabindex({ focusedIdx, containerRef });
 *   // Her satırda: <div tabIndex={getTabIndex(idx)} ref={(el) => setItemRef(idx, el)} ...>
 *
 * Not: Bu hook yalnızca DOM focus layer'ını yönetir.
 *      Navigasyon mantığı useScopedKeyboardNavigation içindedir.
 */

import { useEffect, useRef, useCallback } from "react";

interface UseRovingTabindexOptions {
  focusedIdx: number;
  itemCount: number;
  /** true ise focusedIdx değiştiğinde DOM focus() çağrılır */
  autoFocus?: boolean;
  /** Liste container ref'i — item ref'leri bu container içinde saklanır */
  containerRef: React.RefObject<HTMLElement | null>;
}

interface UseRovingTabindexReturn {
  /** Her liste öğesi için tabIndex hesaplar */
  getTabIndex: (idx: number) => 0 | -1;
  /** Belirli bir indeksi programatik olarak DOM'da odakla */
  focusItem: (idx: number) => void;
}

export function useRovingTabindex({
  focusedIdx,
  itemCount,
  autoFocus = false,
  containerRef,
}: UseRovingTabindexOptions): UseRovingTabindexReturn {
  // DOM node referanslarını sakla
  const itemRefs = useRef<Array<HTMLElement | null>>([]);

  // itemCount değişince array'i yeniden boyutlandır
  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, itemCount);
  }, [itemCount]);

  // autoFocus modunda: focusedIdx değiştiğinde DOM odakla
  useEffect(() => {
    if (!autoFocus || focusedIdx < 0) return;
    const rows = containerRef.current?.querySelectorAll("[data-nav-row]");
    if (!rows) return;
    const el = rows[focusedIdx] as HTMLElement | undefined;
    if (el && document.activeElement !== el) {
      el.focus({ preventScroll: true }); // scroll-into-view hook'u zaten yapıyor
    }
  }, [focusedIdx, autoFocus, containerRef]);

  const getTabIndex = useCallback(
    (idx: number): 0 | -1 => {
      // İlk yüklemede hiçbir eleman odaklı değilse ilki tab alabilir
      if (focusedIdx === -1) return idx === 0 ? 0 : -1;
      return idx === focusedIdx ? 0 : -1;
    },
    [focusedIdx]
  );

  const focusItem = useCallback((idx: number) => {
    const rows = containerRef.current?.querySelectorAll("[data-nav-row]");
    if (!rows) return;
    const el = rows[idx] as HTMLElement | undefined;
    el?.focus({ preventScroll: true });
  }, [containerRef]);

  return { getTabIndex, focusItem };
}
