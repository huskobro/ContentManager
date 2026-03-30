/**
 * useKeyboardNavigation — Uyumluluk Katmanı
 *
 * Bu hook geriye dönük uyumluluk için korunmuştur.
 * Yeni kod için useScopedKeyboardNavigation kullanın.
 *
 * Dahili olarak useScopedKeyboardNavigation'ı çağırır;
 * böylece scope yönetimi, guard koşulları, Home/End desteği
 * ve ArrowLeft/Right desteği otomatik olarak devralınır.
 */

import { useScopedKeyboardNavigation } from "./useScopedKeyboardNavigation";

export interface UseKeyboardNavigationOptions {
  itemCount: number;
  onSpace?: (idx: number) => void;
  onEnter?: (idx: number) => void;
  onEscape?: () => void;
  disabled?: boolean;
  scrollRef?: React.RefObject<HTMLElement | null>;
}

export interface UseKeyboardNavigationReturn {
  focusedIdx: number;
  setFocusedIdx: (idx: number) => void;
}

export function useKeyboardNavigation(
  opts: UseKeyboardNavigationOptions
): UseKeyboardNavigationReturn {
  const { focusedIdx, setFocusedIdx } = useScopedKeyboardNavigation({
    itemCount: opts.itemCount,
    disabled: opts.disabled,
    onSpace: opts.onSpace,
    onEnter: opts.onEnter,
    onEscape: opts.onEscape,
    scrollRef: opts.scrollRef,
    homeEnd: true,
    vimKeys: false,
    loop: false,
  });

  return { focusedIdx, setFocusedIdx };
}
