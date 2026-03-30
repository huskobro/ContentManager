/**
 * useFocusRestore — Overlay Kapandığında Odak Geri Yükleme
 *
 * Problem: Dialog/Sheet/QuickLook açıldığında focus modal içine girer.
 * Kapatıldığında focus body'ye veya hiçbir yere gider.
 *
 * Çözüm: Modal açılmadan önce hangi elemanın odaklı olduğunu sakla.
 * Modal kapandığında o elemana geri dön.
 *
 * Race condition güvenliği:
 * - Bekleyen deferred restore timer'ı, yeni captureForRestore veya yeni
 *   restoreFocusDeferred çağrısında iptal edilir — iki timer çakışmaz.
 * - Hedef eleman DOM'dan çıkmışsa (unmount, sayfalama, silme) restore
 *   sessizce iptal olur, hata fırlatılmaz.
 * - captureForRestore çağrısı olmadan restoreFocus no-op'tur.
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
   * Bekleyen deferred restore varsa iptal eder.
   */
  captureForRestore: () => void;
  /**
   * Kaydedilen elemana odağı geri ver.
   * Modal kapandıktan SONRA çağrılmalı.
   * Hedef DOM'da yoksa sessizce no-op.
   */
  restoreFocus: () => void;
  /**
   * restoreFocus'u belirli bir gecikmeyle çağırır.
   * Animasyonlu kapanış için: restoreFocusDeferred(150)
   * Daha önce çağrılmış bekleyen timer iptal edilir.
   */
  restoreFocusDeferred: (ms?: number) => void;
}

export function useFocusRestore(): UseFocusRestoreReturn {
  const savedRef  = useRef<Element | null>(null);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Bekleyen deferred restore'u iptal et */
  const cancelPending = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const captureForRestore = useCallback(() => {
    // Bekleyen restore timer'ını iptal et — eski hedef artık geçersiz
    cancelPending();
    savedRef.current = document.activeElement;
  }, [cancelPending]);

  const restoreFocus = useCallback(() => {
    cancelPending();
    const el = savedRef.current as HTMLElement | null;
    savedRef.current = null;
    // Hedef hâlâ DOM'daysa ve odaklanabilirse geri dön
    if (el && typeof el.focus === "function" && document.contains(el)) {
      el.focus({ preventScroll: true });
    }
  }, [cancelPending]);

  const restoreFocusDeferred = useCallback(
    (ms = 100) => {
      // Önceki bekleyen timer'ı iptal et — tek timer garantisi
      cancelPending();
      const el = savedRef.current;
      savedRef.current = null;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const target = el as HTMLElement | null;
        // Hedef DOM'da yoksa (unmount, sayfalama, silme) sessizce iptal
        if (target && typeof target.focus === "function" && document.contains(target)) {
          target.focus({ preventScroll: true });
        }
      }, ms);
    },
    [cancelPending]
  );

  return { captureForRestore, restoreFocus, restoreFocusDeferred };
}
