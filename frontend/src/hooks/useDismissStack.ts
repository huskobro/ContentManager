/**
 * useDismissStack — Merkezi ESC Kapatma Yığını
 *
 * Problem: Birden fazla overlay açık olduğunda ESC tuşu
 * yanlış katmanı kapatabilir.
 *
 * Çözüm: LIFO (Last-In-First-Out) yığını ile en üstteki
 * overlay'i kapatır. Altındaki overlay'ler etkilenmez.
 *
 * Kullanım:
 *   const { register, unregister } = useDismissStack();
 *   useEffect(() => {
 *     const id = register(() => setOpen(false));
 *     return () => unregister(id);
 *   }, [open]);
 *
 *   // Veya kısayol hook'u:
 *   useDismissOnEsc(open, () => setOpen(false));
 *
 * NOT: Radix Dialog, kendi içinde ESC'yi zaten yönetir.
 * Bu hook; Radix'in yakalamadığı durumlar (custom panel,
 * accordion genişletmesi, seçim durumu temizleme) içindir.
 */

import { useEffect, useRef, useCallback } from "react";

// ─── Global Yığın ────────────────────────────────────────────────────────────

interface DismissEntry {
  id: number;
  callback: () => void;
  priority: number;
}

let _entryCounter = 0;
const _stack: DismissEntry[] = [];

function _handleEsc(e: KeyboardEvent) {
  if (e.key !== "Escape" && e.key !== "Esc") return;
  if (_stack.length === 0) return;

  // En yüksek öncelikli (sonradan eklenen) entry'yi çalıştır
  const sorted = [..._stack].sort((a, b) => b.priority - a.priority);
  const top = sorted[0];

  // Radix Dialog'un kendi ESC'sini işleyip işlemediğini kontrol et
  // Eğer defaultPrevented ise (Radix işledi), bizim handler çalışmaz
  if (e.defaultPrevented) return;

  top.callback();
  // ESC'yi diğer handler'lardan koru
  e.stopPropagation();
}

// Tek bir global listener — tüm entries bu listener üzerinden işlenir
let _listenerAttached = false;
function _ensureListener() {
  if (_listenerAttached) return;
  window.addEventListener("keydown", _handleEsc, true); // capture önce
  _listenerAttached = true;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface DismissStackReturn {
  register: (callback: () => void, priority?: number) => number;
  unregister: (id: number) => void;
}

export function useDismissStack(): DismissStackReturn {
  _ensureListener();

  const register = useCallback((callback: () => void, priority = 0): number => {
    const id = ++_entryCounter;
    _stack.push({ id, callback, priority });
    return id;
  }, []);

  const unregister = useCallback((id: number) => {
    const idx = _stack.findIndex((e) => e.id === id);
    if (idx !== -1) _stack.splice(idx, 1);
  }, []);

  return { register, unregister };
}

// ─── Kısayol Hook ────────────────────────────────────────────────────────────

/**
 * useDismissOnEsc — Belirli bir açık durum için ESC kapatma
 *
 * @param isOpen     — true iken ESC dinlenir
 * @param onDismiss  — ESC basıldığında çağrılır
 * @param priority   — Yüksek öncelik = ilk kapatılır (default: 0)
 */
export function useDismissOnEsc(
  isOpen: boolean,
  onDismiss: () => void,
  priority = 0
): void {
  const { register, unregister } = useDismissStack();
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!isOpen) return;
    const id = register(() => onDismissRef.current(), priority);
    return () => unregister(id);
  }, [isOpen, priority, register, unregister]);
}
