/**
 * useRovingTabindex — Gerçek DOM Odak Yönetimi (Roving Tabindex Deseni)
 *
 * Erişilebilirlik standardı: ARIA Authoring Practices Guide § Roving Tabindex
 * https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#kbd_roving_tabindex
 *
 * Nasıl çalışır:
 *   - Aktif eleman tabIndex=0 alır → Tab tuşuyla odaklanılabilir
 *   - Diğer elemanlar tabIndex=-1 alır → Tab ile atlanır
 *   - focusedIdx değiştiğinde ve navigasyon klavyeyle yapılmışsa
 *     aktif elemanın DOM node'una focus() çağrılır
 *   - Fare navigasyonunda DOM focus() çağrılmaz (yalnızca görsel highlight)
 *   - Ekran okuyucuları bu pattern'ı tanır
 *
 * Kullanım:
 *   const { getTabIndex, focusItem, notifyKeyboard } = useRovingTabindex({ focusedIdx, containerRef });
 *   // Her satırda: <div tabIndex={getTabIndex(idx)} data-nav-row ...>
 *   // useScopedKeyboardNavigation ile birlikte: onKeyboardMove={notifyKeyboard}
 *
 * Not: Bu hook yalnızca DOM focus layer'ını yönetir.
 *      Navigasyon mantığı useScopedKeyboardNavigation içindedir.
 */

import { useEffect, useRef, useCallback } from "react";

interface UseRovingTabindexOptions {
  focusedIdx: number;
  itemCount: number;
  /**
   * true ise focusedIdx değiştiğinde DOM focus() çağrılır.
   * Yalnızca klavye navigasyonu sırasında true olmalı.
   * Fare hover senkronizasyonunda false bırakın.
   * @default false
   */
  autoFocus?: boolean;
  /** Liste container ref'i — item ref'leri bu container içinde aranır */
  containerRef: React.RefObject<HTMLElement | null>;
}

interface UseRovingTabindexReturn {
  /** Her liste öğesi için tabIndex hesaplar */
  getTabIndex: (idx: number) => 0 | -1;
  /** Belirli bir indeksi programatik olarak DOM'da odakla */
  focusItem: (idx: number) => void;
  /**
   * Klavye ile navigasyon yapıldığını bildirir.
   * Bu çağrıdan sonra bir sonraki focusedIdx değişimi DOM focus() tetikler.
   * useScopedKeyboardNavigation'ın onKeyboardMove callback'ine bağlayın.
   */
  notifyKeyboard: () => void;
}

export function useRovingTabindex({
  focusedIdx,
  itemCount,
  autoFocus = false,
  containerRef,
}: UseRovingTabindexOptions): UseRovingTabindexReturn {
  // Son navigasyonun klavyeyle mi fareyle mi yapıldığını izle
  const lastWasKeyboardRef = useRef(false);

  // itemCount değişince sıfırla (sayfalama vb.)
  useEffect(() => {
    lastWasKeyboardRef.current = false;
  }, [itemCount]);

  /** [data-nav-row] öğesini DOM'da bul */
  const getRow = useCallback(
    (idx: number): HTMLElement | undefined => {
      const rows = containerRef.current?.querySelectorAll("[data-nav-row]");
      return rows ? (rows[idx] as HTMLElement | undefined) : undefined;
    },
    [containerRef]
  );

  // focusedIdx değiştiğinde:
  //   - autoFocus=true VE son navigasyon klavyeyse → DOM focus()
  //   - autoFocus=false VE son navigasyon klavyeyse → DOM focus() (klavye mod zorunlu)
  //   - son navigasyon fareyle ise → sadece tabIndex güncellenir, focus() yok
  useEffect(() => {
    if (focusedIdx < 0) return;
    if (!lastWasKeyboardRef.current && !autoFocus) return;
    const el = getRow(focusedIdx);
    if (el && document.activeElement !== el) {
      el.focus({ preventScroll: true }); // scroll-into-view zaten useScopedKeyboardNavigation'da
    }
  }, [focusedIdx, autoFocus, getRow]);

  const getTabIndex = useCallback(
    (idx: number): 0 | -1 => {
      // İlk yüklemede hiçbir eleman odaklı değilse ilki Tab ile ulaşılabilir
      if (focusedIdx === -1) return idx === 0 ? 0 : -1;
      return idx === focusedIdx ? 0 : -1;
    },
    [focusedIdx]
  );

  const focusItem = useCallback(
    (idx: number) => {
      const el = getRow(idx);
      el?.focus({ preventScroll: true });
    },
    [getRow]
  );

  /** Klavye navigasyonu yapıldığında çağrılır — sonraki focus değişimi DOM focus() tetikler */
  const notifyKeyboard = useCallback(() => {
    lastWasKeyboardRef.current = true;
  }, []);

  return { getTabIndex, focusItem, notifyKeyboard };
}
