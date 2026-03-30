/**
 * useKeyboardNavigation / useScopedKeyboardNavigation — Birim Testleri
 *
 * Test kapsamı:
 *   1. ArrowDown / ArrowUp → indeks değişimi
 *   2. Home / End → sınır atlama
 *   3. Loop=true → son elemandan sonra ilk elemana
 *   4. input içindeyken liste navigasyonu tetiklenmez
 *   5. Space → onSpace callback tetiklenir
 *   6. Enter → onEnter callback tetiklenir
 *   7. ESC → onEscape callback tetiklenir
 *   8. disabled=true → hiçbir tuş işlenmez
 *   9. modifier tuşlar (Meta/Ctrl/Alt) → geçilir
 *   10. isComposing=true → geçilir
 *   11. ArrowRight → onArrowRight callback
 *   12. ArrowLeft → onArrowLeft callback
 *   13. Scope stack: iki scope aynı anda mount → sadece üstteki işler
 *   14. Scope deactivate edince altındaki scope aktif olur
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScopedKeyboardNavigation } from "@/hooks/useScopedKeyboardNavigation";
import { useKeyboardStore } from "@/stores/keyboardStore";

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function fireKey(key: string, extra: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...extra,
  });
  window.dispatchEvent(event);
  return event;
}

// ─── Testler ─────────────────────────────────────────────────────────────────

describe("useScopedKeyboardNavigation", () => {
  beforeEach(() => {
    // Zustand store'u her test öncesi temizle
    useKeyboardStore.setState({ scopeStack: [] });
  });

  afterEach(() => {
    useKeyboardStore.setState({ scopeStack: [] });
  });

  it("ArrowDown ile indeksi artırır", () => {
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 5 })
    );

    act(() => fireKey("ArrowDown"));
    expect(result.current.focusedIdx).toBe(0);

    act(() => fireKey("ArrowDown"));
    expect(result.current.focusedIdx).toBe(1);
  });

  it("ArrowUp ile indeksi azaltır", () => {
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 5 })
    );

    // Önce 2'ye çık
    act(() => fireKey("ArrowDown"));
    act(() => fireKey("ArrowDown"));
    act(() => fireKey("ArrowDown"));
    expect(result.current.focusedIdx).toBe(2);

    act(() => fireKey("ArrowUp"));
    expect(result.current.focusedIdx).toBe(1);
  });

  it("ArrowDown sınırda kalır (loop=false)", () => {
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3, loop: false })
    );

    act(() => fireKey("ArrowDown"));
    act(() => fireKey("ArrowDown"));
    act(() => fireKey("ArrowDown"));
    act(() => fireKey("ArrowDown")); // sınır aşımı denemesi
    expect(result.current.focusedIdx).toBe(2); // max index = itemCount - 1
  });

  it("ArrowUp sınırda kalır (loop=false)", () => {
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3, loop: false })
    );

    act(() => fireKey("ArrowDown"));
    act(() => fireKey("ArrowUp"));
    act(() => fireKey("ArrowUp")); // sınır aşımı denemesi
    expect(result.current.focusedIdx).toBe(0);
  });

  it("loop=true: son elemandan ilk elemana geçer", () => {
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3, loop: true })
    );

    // Son elemana git
    act(() => fireKey("ArrowDown"));
    act(() => fireKey("ArrowDown"));
    act(() => fireKey("ArrowDown"));
    expect(result.current.focusedIdx).toBe(2);

    // Loop: 2'den 0'a geçmeli
    act(() => fireKey("ArrowDown"));
    expect(result.current.focusedIdx).toBe(0);
  });

  it("loop=true: ilk elemandan son elemana geçer", () => {
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3, loop: true })
    );

    // İndeks -1'den ArrowUp ile loop → son eleman
    act(() => fireKey("ArrowDown")); // 0
    act(() => fireKey("ArrowUp"));   // loop: 0'dan 2'ye
    expect(result.current.focusedIdx).toBe(2);
  });

  it("Home tuşu ilk elemana gider", () => {
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 5, homeEnd: true })
    );

    act(() => fireKey("ArrowDown"));
    act(() => fireKey("ArrowDown"));
    act(() => fireKey("ArrowDown"));
    expect(result.current.focusedIdx).toBe(2);

    act(() => fireKey("Home"));
    expect(result.current.focusedIdx).toBe(0);
  });

  it("End tuşu son elemana gider", () => {
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 5, homeEnd: true })
    );

    act(() => fireKey("End"));
    expect(result.current.focusedIdx).toBe(4);
  });

  it("Space → onSpace callback tetiklenir", () => {
    const onSpace = vi.fn();
    renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3, onSpace })
    );

    act(() => fireKey("ArrowDown")); // idx=0
    act(() => fireKey(" "));
    expect(onSpace).toHaveBeenCalledWith(0);
  });

  it("Enter → onEnter callback tetiklenir", () => {
    const onEnter = vi.fn();
    renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3, onEnter })
    );

    act(() => fireKey("ArrowDown")); // idx=0
    act(() => fireKey("Enter"));
    expect(onEnter).toHaveBeenCalledWith(0);
  });

  it("Escape → onEscape callback tetiklenir", () => {
    const onEscape = vi.fn();
    renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3, onEscape })
    );

    act(() => fireKey("Escape"));
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("disabled=true → hiçbir tuş işlenmez", () => {
    const onEnter = vi.fn();
    const onEscape = vi.fn();
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 5, disabled: true, onEnter, onEscape })
    );

    act(() => fireKey("ArrowDown"));
    expect(result.current.focusedIdx).toBe(-1);

    act(() => fireKey("Enter"));
    expect(onEnter).not.toHaveBeenCalled();

    act(() => fireKey("Escape"));
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("MetaKey ile basılan tuş işlenmez", () => {
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3 })
    );

    act(() => fireKey("ArrowDown", { metaKey: true }));
    expect(result.current.focusedIdx).toBe(-1);
  });

  it("CtrlKey ile basılan tuş işlenmez", () => {
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3 })
    );

    act(() => fireKey("ArrowDown", { ctrlKey: true }));
    expect(result.current.focusedIdx).toBe(-1);
  });

  it("isComposing=true iken tuş işlenmez", () => {
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3 })
    );

    act(() => fireKey("ArrowDown", { isComposing: true }));
    expect(result.current.focusedIdx).toBe(-1);
  });

  it("INPUT hedef iken navigasyon tetiklenmez", () => {
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3 })
    );

    const input = document.createElement("input");
    document.body.appendChild(input);

    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "target", { value: input });
    act(() => window.dispatchEvent(event));

    expect(result.current.focusedIdx).toBe(-1);
    document.body.removeChild(input);
  });

  it("ArrowRight → onArrowRight callback tetiklenir", () => {
    const onArrowRight = vi.fn();
    renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3, onArrowRight })
    );

    act(() => fireKey("ArrowDown")); // idx=0
    act(() => fireKey("ArrowRight"));
    expect(onArrowRight).toHaveBeenCalledWith(0);
  });

  it("ArrowLeft → onArrowLeft callback tetiklenir", () => {
    const onArrowLeft = vi.fn();
    renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3, onArrowLeft })
    );

    act(() => fireKey("ArrowDown")); // idx=0
    act(() => fireKey("ArrowLeft"));
    expect(onArrowLeft).toHaveBeenCalledWith(0);
  });

  it("itemCount değişince focusedIdx sıfırlanır", () => {
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) =>
        useScopedKeyboardNavigation({ itemCount: count }),
      { initialProps: { count: 5 } }
    );

    act(() => fireKey("ArrowDown"));
    act(() => fireKey("ArrowDown"));
    expect(result.current.focusedIdx).toBe(1);

    act(() => rerender({ count: 3 }));
    expect(result.current.focusedIdx).toBe(-1);
  });
});

// ─── Scope Stack Testleri ────────────────────────────────────────────────────

describe("keyboardStore scope stack", () => {
  beforeEach(() => {
    useKeyboardStore.setState({ scopeStack: [] });
  });

  afterEach(() => {
    useKeyboardStore.setState({ scopeStack: [] });
  });

  it("push ile scope aktif olur", () => {
    const { push, isActive } = useKeyboardStore.getState();
    push("scope-A");
    expect(isActive("scope-A")).toBe(true);
  });

  it("iki scope: sonraki aktif, önceki pasif", () => {
    const { push, isActive } = useKeyboardStore.getState();
    push("scope-A");
    push("scope-B");
    expect(isActive("scope-B")).toBe(true);
    expect(isActive("scope-A")).toBe(false);
  });

  it("pop ile scope kaldırılır ve önceki aktif olur", () => {
    const { push, pop, isActive } = useKeyboardStore.getState();
    push("scope-A");
    push("scope-B");
    pop("scope-B");
    expect(isActive("scope-A")).toBe(true);
  });

  it("iki scope mount: üstteki navigasyon işler, alttaki işlemez", () => {
    useKeyboardStore.setState({ scopeStack: [] });

    const onEnterA = vi.fn();
    const onEnterB = vi.fn();

    const { unmount: unmountA } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3, onEnter: onEnterA })
    );
    renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3, onEnter: onEnterB })
    );

    act(() => fireKey("ArrowDown"));
    act(() => fireKey("Enter"));

    // Sadece B (üstteki) tetiklenmelidir
    expect(onEnterB).toHaveBeenCalledTimes(1);
    expect(onEnterA).not.toHaveBeenCalled();

    unmountA();
  });
});

// ─── Guard Koşulları — Interactive Hedef ────────────────────────────────────

describe("Guard koşulları — interactive hedef", () => {
  beforeEach(() => {
    useKeyboardStore.setState({ scopeStack: [] });
  });
  afterEach(() => {
    useKeyboardStore.setState({ scopeStack: [] });
  });

  it("contenteditable içinde ArrowDown navigasyonu çalışmaz", () => {
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3 })
    );

    const el = document.createElement("div");
    el.contentEditable = "true";
    document.body.appendChild(el);

    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "target", { value: el });
      window.dispatchEvent(event);
    });

    expect(result.current.focusedIdx).toBe(-1);
    document.body.removeChild(el);
  });

  it("role='textbox' içinde ArrowDown çalışmaz", () => {
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3 })
    );

    const el = document.createElement("div");
    el.setAttribute("role", "textbox");
    document.body.appendChild(el);

    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "target", { value: el });
      window.dispatchEvent(event);
    });

    expect(result.current.focusedIdx).toBe(-1);
    document.body.removeChild(el);
  });

  it("role='combobox' içinde ArrowDown çalışmaz", () => {
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3 })
    );

    const el = document.createElement("div");
    el.setAttribute("role", "combobox");
    document.body.appendChild(el);

    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "target", { value: el });
      window.dispatchEvent(event);
    });

    expect(result.current.focusedIdx).toBe(-1);
    document.body.removeChild(el);
  });

  it("window target ile navigation çalışır", () => {
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3 })
    );

    act(() => fireKey("ArrowDown"));
    expect(result.current.focusedIdx).toBe(0);
  });

  it("altKey ile ArrowDown çalışmaz", () => {
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3 })
    );

    act(() => fireKey("ArrowDown", { altKey: true }));
    expect(result.current.focusedIdx).toBe(-1);
  });

  it("isComposing=true iken ArrowDown çalışmaz", () => {
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3 })
    );

    act(() => fireKey("ArrowDown", { isComposing: true }));
    expect(result.current.focusedIdx).toBe(-1);
  });
});

// ─── Quick Look Space Davranış Simülasyonu ───────────────────────────────────

describe("Quick Look Space toggle davranışı", () => {
  it("Space basıldığında capture listener modal kapatır", () => {
    // Bu test, JobQuickLook'un blockSpaceOnButtons mantığını simüle eder:
    // capture:true listener Space'i yakalamalı ve onClose'u çağırmalıdır.
    const onClose = vi.fn();
    let isOpen = true;

    function blockSpaceOnButtons(e: KeyboardEvent) {
      if (!isOpen) return;
      if (e.key !== " " && e.key !== "Spacebar") return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "BUTTON" ||
        target.tagName === "A" ||
        (target as HTMLElement & { role?: string }).role === "button"
      ) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }

    window.addEventListener("keydown", blockSpaceOnButtons, true);

    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();

    act(() => {
      const evt = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
      Object.defineProperty(evt, "target", { value: button });
      window.dispatchEvent(evt);
    });

    expect(onClose).toHaveBeenCalledTimes(1);

    window.removeEventListener("keydown", blockSpaceOnButtons, true);
    document.body.removeChild(button);
  });

  it("Space bir input içindeyken modal kapatılmaz", () => {
    const onClose = vi.fn();
    let isOpen = true;

    function blockSpaceOnButtons(e: KeyboardEvent) {
      if (!isOpen) return;
      if (e.key !== " " && e.key !== "Spacebar") return;
      const target = e.target as HTMLElement;
      const tag = target.tagName.toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      if (
        target.tagName === "BUTTON" ||
        target.tagName === "A"
      ) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }

    window.addEventListener("keydown", blockSpaceOnButtons, true);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    act(() => {
      const evt = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
      Object.defineProperty(evt, "target", { value: input });
      window.dispatchEvent(evt);
    });

    expect(onClose).not.toHaveBeenCalled();

    window.removeEventListener("keydown", blockSpaceOnButtons, true);
    document.body.removeChild(input);
    isOpen = false;
  });
});
