/**
 * useScopedKeyboardNavigation — Kapsamlı Klavye Navigasyon Hook'u
 *
 * useKeyboardNavigation'ın yerini alan, production-grade implementasyonu.
 *
 * ─── Mimari Fark ───────────────────────────────────────────────────────────
 * Eski hook: window'a tek bir listener bağlar, "disabled" bayrağıyla pasif olur.
 * Yeni hook: keyboardStore üzerindeki scope stack'i kullanır. Aynı anda birden
 *            fazla scope mount olsa bile yalnızca en üstteki (aktif) scope
 *            tuşları işler. Overlay açıldığında altındaki scope otomatik pasif.
 *
 * ─── Güvenlik Koşulları ────────────────────────────────────────────────────
 * Aşağıdaki durumlarda hiçbir tuş işlenmez:
 *   - scope aktif değilse (başka scope üstte)
 *   - event.defaultPrevented true ise
 *   - isComposing true ise (IME kompozisyon)
 *   - metaKey / ctrlKey / altKey basılıysa
 *   - hedef element: input, textarea, select, contenteditable
 *   - hedef role: textbox, combobox, listbox, spinbutton
 *
 * ─── Desteklenen Tuşlar ────────────────────────────────────────────────────
 *   ArrowDown / j  → sonraki eleman
 *   ArrowUp   / k  → önceki eleman
 *   Home           → ilk eleman
 *   End            → son eleman
 *   Enter          → onEnter tetikle
 *   Space          → onSpace tetikle
 *   ArrowRight     → onArrowRight tetikle (accordion aç)
 *   ArrowLeft      → onArrowLeft tetikle (accordion kapat)
 *   Escape         → onEscape tetikle
 *
 * ─── Roving Tabindex ──────────────────────────────────────────────────────
 * Gerçek DOM focus (roving tabindex) için useRovingTabindex hook'unu kullan.
 * Bu hook yalnızca logic layer'ı sağlar; görsel highlight sayfada yapılır.
 *
 * ─── Bellek Sızıntısı ─────────────────────────────────────────────────────
 * - useEffect cleanup ile listener her zaman kaldırılır.
 * - keyboardStore push/pop her zaman bir çift olarak çalışır.
 * - Tüm callback'ler ref'e alınır → stale closure yok.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useKeyboardStore } from "@/stores/keyboardStore";

// Her hook instance'ı benzersiz bir ID alır
let _scopeIdCounter = 0;
function nextScopeId(): string {
  return `kbnav-${++_scopeIdCounter}`;
}

// ─── Tip Tanımları ──────────────────────────────────────────────────────────

export interface ScopedKeyboardNavigationOptions {
  /** Listede kaç eleman var. Değişince odak sıfırlanır. */
  itemCount: number;
  /**
   * true → scope'u kayıtlı tut ama olayları işleme.
   * Dialog/sheet açıkken true yapın — scope stack'i manuel yönetirseniz
   * bunu kullanmak yerine scope'u hiç mount etmeyin.
   */
  disabled?: boolean;
  /** Loop: son elemandan sonra ilk elemana geç */
  loop?: boolean;
  /** j/k vim tarzı navigasyon aktif mi */
  vimKeys?: boolean;
  /** Home/End tuşları aktif mi */
  homeEnd?: boolean;
  /** Space tuşunun liste öğesi üzerinde tetikleyeceği callback */
  onSpace?: (idx: number) => void;
  /** Enter tuşunun liste öğesi üzerinde tetikleyeceği callback */
  onEnter?: (idx: number) => void;
  /** ESC tuşu callback — her zaman çağrılır, idx gerekmez */
  onEscape?: () => void;
  /** ArrowRight callback — accordion aç */
  onArrowRight?: (idx: number) => void;
  /** ArrowLeft callback — accordion kapat */
  onArrowLeft?: (idx: number) => void;
  /**
   * Klavye navigasyonu gerçekleştiğinde çağrılır (ArrowUp/Down/Home/End/j/k).
   * useRovingTabindex().notifyKeyboard ile bağlayarak gerçek DOM focus() sağlayın.
   */
  onKeyboardMove?: () => void;
  /** Scroll-into-view için liste container ref'i */
  scrollRef?: React.RefObject<HTMLElement | null>;
}

export interface ScopedKeyboardNavigationReturn {
  focusedIdx: number;
  /** Fare hover senkronizasyonu için dışarıdan set edilebilir */
  setFocusedIdx: (idx: number) => void;
  /** Bu scope'un benzersiz ID'si — aria-activedescendant için kullanılabilir */
  scopeId: string;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useScopedKeyboardNavigation(
  opts: ScopedKeyboardNavigationOptions
): ScopedKeyboardNavigationReturn {
  const {
    itemCount,
    disabled = false,
    loop = false,
    vimKeys = false,
    homeEnd = true,
    onSpace,
    onEnter,
    onEscape,
    onArrowRight,
    onArrowLeft,
    onKeyboardMove,
    scrollRef,
  } = opts;

  // Sabit scope ID — mount sırasında atanır, değişmez
  const scopeIdRef = useRef<string>(nextScopeId());
  const scopeId = scopeIdRef.current;

  const [focusedIdx, setFocusedIdx] = useState<number>(-1);

  // Mutable refs — stale closure olmadan her render değerini taşır
  const itemCountRef        = useRef(itemCount);
  const focusedIdxRef       = useRef(focusedIdx);
  const disabledRef         = useRef(disabled);
  const loopRef             = useRef(loop);
  const vimKeysRef          = useRef(vimKeys);
  const homeEndRef          = useRef(homeEnd);
  const onSpaceRef          = useRef(onSpace);
  const onEnterRef          = useRef(onEnter);
  const onEscapeRef         = useRef(onEscape);
  const onArrowRightRef     = useRef(onArrowRight);
  const onArrowLeftRef      = useRef(onArrowLeft);
  const onKeyboardMoveRef   = useRef(onKeyboardMove);

  itemCountRef.current        = itemCount;
  focusedIdxRef.current       = focusedIdx;
  disabledRef.current         = disabled;
  loopRef.current             = loop;
  vimKeysRef.current          = vimKeys;
  homeEndRef.current          = homeEnd;
  onSpaceRef.current          = onSpace;
  onEnterRef.current          = onEnter;
  onEscapeRef.current         = onEscape;
  onArrowRightRef.current     = onArrowRight;
  onArrowLeftRef.current      = onArrowLeft;
  onKeyboardMoveRef.current   = onKeyboardMove;

  // Scope kayıt / çıkış
  const { push, pop, isActive } = useKeyboardStore();

  useEffect(() => {
    if (disabled) return;
    push(scopeId);
    return () => pop(scopeId);
  }, [disabled, scopeId, push, pop]);

  // itemCount değişince odağı sıfırla
  useEffect(() => {
    setFocusedIdx(-1);
  }, [itemCount]);

  // Scroll-into-view
  useEffect(() => {
    if (focusedIdx < 0 || !scrollRef?.current) return;
    const rows = scrollRef.current.querySelectorAll("[data-nav-row]");
    const row = rows[focusedIdx] as HTMLElement | undefined;
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedIdx, scrollRef]);

  // Navigation helpers — ref üzerinden erişir
  const moveNext = useCallback(() => {
    const count = itemCountRef.current;
    if (count === 0) return;
    setFocusedIdx((prev) => {
      if (prev >= count - 1) return loopRef.current ? 0 : count - 1;
      return prev + 1;
    });
  }, []);

  const movePrev = useCallback(() => {
    const count = itemCountRef.current;
    if (count === 0) return;
    setFocusedIdx((prev) => {
      if (prev <= 0) return loopRef.current ? count - 1 : 0;
      return prev - 1;
    });
  }, []);

  // Ana event handler — sabit referans, bağımlılık yok
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // ── Güvenlik Koşulları ──────────────────────────────────────────────

      // Bu scope aktif değilse geç
      if (!isActive(scopeIdRef.current)) return;

      // Hook devre dışı
      if (disabledRef.current) return;

      // Tarayıcı/başka handler zaten işledi
      if (e.defaultPrevented) return;

      // IME kompozisyon (Japonca, Çince vb. input)
      if (e.isComposing) return;

      // Modifier tuşlarla birlikte basılmışsa geç (kısayol çakışması önlemi)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Metin girişi alanları — yalnızca gerçek HTMLElement'lerde kontrol et
      // instanceof HTMLElement: Window, Document veya null hedefleri güvenle dışlar
      const target = e.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toUpperCase();
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (
          target.isContentEditable ||
          target.getAttribute("contenteditable") === "true" ||
          target.contentEditable === "true"
        )
          return;

        // ARIA metin girişi rolleri
        const role = target.getAttribute("role");
        if (
          role === "textbox" ||
          role === "combobox" ||
          role === "spinbutton" ||
          role === "searchbox"
        )
          return;
      }

      // ── Tuş İşleme ─────────────────────────────────────────────────────

      const idx   = focusedIdxRef.current;
      const count = itemCountRef.current;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          onKeyboardMoveRef.current?.();
          moveNext();
          break;

        case "ArrowUp":
          e.preventDefault();
          onKeyboardMoveRef.current?.();
          movePrev();
          break;

        case "j":
          if (vimKeysRef.current) {
            e.preventDefault();
            onKeyboardMoveRef.current?.();
            moveNext();
          }
          break;

        case "k":
          if (vimKeysRef.current) {
            e.preventDefault();
            onKeyboardMoveRef.current?.();
            movePrev();
          }
          break;

        case "Home":
          if (homeEndRef.current && count > 0) {
            e.preventDefault();
            onKeyboardMoveRef.current?.();
            setFocusedIdx(0);
          }
          break;

        case "End":
          if (homeEndRef.current && count > 0) {
            e.preventDefault();
            onKeyboardMoveRef.current?.();
            setFocusedIdx(count - 1);
          }
          break;

        case " ":
        case "Spacebar": // IE/Edge eski tarayıcı değeri
          if (idx >= 0 && idx < count) {
            e.preventDefault();
            onSpaceRef.current?.(idx);
          }
          break;

        case "Enter":
          if (idx >= 0 && idx < count) {
            e.preventDefault();
            onEnterRef.current?.(idx);
          }
          break;

        case "ArrowRight":
          if (idx >= 0 && idx < count) {
            e.preventDefault();
            onArrowRightRef.current?.(idx);
          }
          break;

        case "ArrowLeft":
          if (idx >= 0 && idx < count) {
            e.preventDefault();
            onArrowLeftRef.current?.(idx);
          }
          break;

        case "Escape":
          // ESC'nin preventDefault'ı gerekmez — zaten overlay kapatır
          onEscapeRef.current?.();
          break;
      }
    },
    [isActive, moveNext, movePrev]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { focusedIdx, setFocusedIdx, scopeId };
}
