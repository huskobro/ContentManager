/**
 * useFocusRestore — Overlay Kapandığında Odak Geri Yükleme
 *
 * Problem: Dialog/Sheet/QuickLook açıldığında focus modal içine girer.
 * Kapatıldığında focus body'ye veya hiçbir yere gider.
 *
 * Çözüm: Modal açılmadan önce hangi elemanın odaklı olduğunu sakla.
 * Modal kapandığında o elemana geri dön.
 *
 * Kullanım (JobList'te):
 *   const { captureForRestore, restoreFocus } = useFocusRestore();
 *
 *   // Modal açılmadan önce:
 *   captureForRestore();
 *   setQuickLookJob(job);
 *
 *   // Modal kapandıktan sonra (onClose içinde):
 *   setQuickLookJob(null);
 *   restoreFocus();  // ya da restoreFocusDeferred() animate eden dialoglar için
 *
 * Not: Radix Dialog zaten kendi focus restoration'ını yapar (returnFocus prop).
 * Bu hook, Radix kullanılmayan paneller veya Radix'in restore edemediği
 * durumlar (sayfalama sonrası eleman kayboldu) için tasarlanmıştır.
 */

import { useRef, useCallback } from "react";

interface UseFocusRestoreReturn {
  /**
   * Şu an odaklı olan elemanı kaydet.
   * Modal açmadan ÖNCE çağrılmalı.
   */
  captureForRestore: () => void;
  /**
   * Kaydedilen elemana odağı geri ver.
   * Modal kapandıktan SONRA (unmount animasyonu tamamlandıktan sonra) çağrılmalı.
   */
  restoreFocus: () => void;
  /**
   * restoreFocus'u belirli bir gecikmeyle çağırır.
   * Animasyonlu kapanış için: restoreFocusDeferred(150)
   */
  restoreFocusDeferred: (ms?: number) => void;
}

export function useFocusRestore(): UseFocusRestoreReturn {
  const savedRef = useRef<Element | null>(null);

  const captureForRestore = useCallback(() => {
    savedRef.current = document.activeElement;
  }, []);

  const restoreFocus = useCallback(() => {
    const el = savedRef.current as HTMLElement | null;
    if (el && typeof el.focus === "function" && document.contains(el)) {
      el.focus({ preventScroll: true });
    }
    savedRef.current = null;
  }, []);

  const restoreFocusDeferred = useCallback(
    (ms = 100) => {
      const el = savedRef.current;
      savedRef.current = null;
      setTimeout(() => {
        const target = el as HTMLElement | null;
        if (target && typeof target.focus === "function" && document.contains(target)) {
          target.focus({ preventScroll: true });
        }
      }, ms);
    },
    []
  );

  return { captureForRestore, restoreFocus, restoreFocusDeferred };
}
