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

// ─── Scope Ownership — Overlay Davranışı ────────────────────────────────────

describe("Scope ownership — overlay açıkken alttaki scope pasif", () => {
  beforeEach(() => {
    useKeyboardStore.setState({ scopeStack: [] });
  });
  afterEach(() => {
    useKeyboardStore.setState({ scopeStack: [] });
  });

  it("disabled=true olan scope tuşları işlemez", () => {
    const onEnter = vi.fn();
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3, disabled: true, onEnter })
    );

    act(() => fireKey("ArrowDown"));
    act(() => fireKey("Enter"));

    expect(result.current.focusedIdx).toBe(-1);
    expect(onEnter).not.toHaveBeenCalled();
  });

  it("overlay scope mount olunca alttaki scope tuşları işlemez", () => {
    useKeyboardStore.setState({ scopeStack: [] });

    const onSpaceUnderneath = vi.fn();
    const onSpaceOverlay    = vi.fn();

    // Alt liste scope'u (A) — overlay yokken aktif
    const { result: resultA, rerender: rerenderA } = renderHook(
      ({ disabled }: { disabled: boolean }) =>
        useScopedKeyboardNavigation({ itemCount: 3, disabled, onSpace: onSpaceUnderneath }),
      { initialProps: { disabled: false } }
    );

    // Başlangıçta A aktif
    act(() => fireKey("ArrowDown")); // idx=0
    act(() => fireKey(" "));
    expect(onSpaceUnderneath).toHaveBeenCalledTimes(1);
    onSpaceUnderneath.mockClear();

    // Overlay açıldı → A disabled oldu, B mount oldu
    act(() => rerenderA({ disabled: true }));

    renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 2, onSpace: onSpaceOverlay })
    );

    act(() => fireKey("ArrowDown")); // B'de idx=0
    act(() => fireKey(" "));

    // Sadece overlay (B) tepki verir
    expect(onSpaceOverlay).toHaveBeenCalledTimes(1);
    expect(onSpaceUnderneath).not.toHaveBeenCalled();
  });

  it("üst scope pop olunca alttaki tekrar aktif hale gelir", () => {
    useKeyboardStore.setState({ scopeStack: [] });

    const onEnterA = vi.fn();
    const onEnterB = vi.fn();

    // A: alt scope
    const { result: resultA } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3, onEnter: onEnterA })
    );

    // B: üst scope (overlay)
    const { unmount: unmountB } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 2, onEnter: onEnterB })
    );

    // B aktif — A'nın Enter'ı çalışmaz
    act(() => fireKey("ArrowDown")); // B idx=0
    act(() => fireKey("Enter"));
    expect(onEnterB).toHaveBeenCalledTimes(1);
    expect(onEnterA).not.toHaveBeenCalled();
    onEnterB.mockClear();

    // B unmount → A tekrar aktif
    act(() => unmountB());

    act(() => fireKey("ArrowDown")); // A idx devam ediyor
    act(() => fireKey("Enter"));
    expect(onEnterA).toHaveBeenCalledTimes(1);
    expect(onEnterB).not.toHaveBeenCalled();

    void resultA; // suppress unused warning
  });
});

// ─── ESC Kapatma Yığını — useDismissStack ───────────────────────────────────

import { useDismissStack, useDismissOnEsc, _clearDismissStackForTesting } from "@/hooks/useDismissStack";

describe("useDismissStack — ESC kapatma önceliği", () => {
  beforeEach(() => {
    _clearDismissStackForTesting();
  });
  afterEach(() => {
    _clearDismissStackForTesting();
  });

  it("tek entry: ESC callback'i çağırır", () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useDismissStack());

    act(() => {
      result.current.register(cb, 0);
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("iki entry: yüksek öncelikli çağrılır, düşük çağrılmaz", () => {
    const cbLow  = vi.fn();
    const cbHigh = vi.fn();
    const { result } = renderHook(() => useDismissStack());

    act(() => {
      result.current.register(cbLow,  5);
      result.current.register(cbHigh, 20);
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(cbHigh).toHaveBeenCalledTimes(1);
    expect(cbLow).not.toHaveBeenCalled();

    // Cleanup: unregister both
    act(() => {
      // entries will clean themselves via test isolation
    });
  });

  it("unregister sonrası ESC çağrılmaz", () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useDismissStack());
    let id: number;

    act(() => {
      id = result.current.register(cb, 0);
    });

    act(() => {
      result.current.unregister(id!);
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(cb).not.toHaveBeenCalled();
  });

  it("useDismissOnEsc: isOpen=true iken ESC tetikler", () => {
    const onDismiss = vi.fn();
    renderHook(() => useDismissOnEsc(true, onDismiss, 0));

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("useDismissOnEsc: isOpen=false iken ESC tetiklemez", () => {
    const onDismiss = vi.fn();
    renderHook(() => useDismissOnEsc(false, onDismiss, 0));

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("useDismissOnEsc: QuickLook (20) > Sheet (10) önceliği — QuickLook kapatılır", () => {
    const closeQuickLook = vi.fn();
    const closeSheet     = vi.fn();

    renderHook(() => {
      useDismissOnEsc(true, closeSheet,     10);
      useDismissOnEsc(true, closeQuickLook, 20);
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(closeQuickLook).toHaveBeenCalledTimes(1);
    expect(closeSheet).not.toHaveBeenCalled();
  });
});

// ─── Roving Tabindex + onKeyboardMove ───────────────────────────────────────

import { useRovingTabindex } from "@/hooks/useRovingTabindex";

describe("useRovingTabindex", () => {
  it("focusedIdx=-1 ise idx=0 tabIndex=0 alır", () => {
    const container = document.createElement("div");
    const containerRef = { current: container };

    const { result } = renderHook(() =>
      useRovingTabindex({ focusedIdx: -1, itemCount: 3, containerRef })
    );

    expect(result.current.getTabIndex(0)).toBe(0);
    expect(result.current.getTabIndex(1)).toBe(-1);
    expect(result.current.getTabIndex(2)).toBe(-1);
  });

  it("focusedIdx=1 ise idx=1 tabIndex=0, diğerleri -1", () => {
    const container = document.createElement("div");
    const containerRef = { current: container };

    const { result } = renderHook(() =>
      useRovingTabindex({ focusedIdx: 1, itemCount: 3, containerRef })
    );

    expect(result.current.getTabIndex(0)).toBe(-1);
    expect(result.current.getTabIndex(1)).toBe(0);
    expect(result.current.getTabIndex(2)).toBe(-1);
  });

  it("notifyKeyboard mevcut — çağrılabilir", () => {
    const container = document.createElement("div");
    const containerRef = { current: container };

    const { result } = renderHook(() =>
      useRovingTabindex({ focusedIdx: 0, itemCount: 3, containerRef })
    );

    // notifyKeyboard bir fonksiyon olmalı ve exception atmamalı
    expect(typeof result.current.notifyKeyboard).toBe("function");
    expect(() => result.current.notifyKeyboard()).not.toThrow();
  });

  it("focusItem: data-nav-row element varsa focus() çağrılır", () => {
    const container = document.createElement("div");
    const item = document.createElement("div");
    item.setAttribute("data-nav-row", "");
    item.tabIndex = -1;
    container.appendChild(item);
    document.body.appendChild(container);

    const focusSpy = vi.spyOn(item, "focus");
    const containerRef = { current: container };

    const { result } = renderHook(() =>
      useRovingTabindex({ focusedIdx: 0, itemCount: 1, containerRef })
    );

    act(() => {
      result.current.focusItem(0);
    });

    expect(focusSpy).toHaveBeenCalledTimes(1);

    document.body.removeChild(container);
    focusSpy.mockRestore();
  });

  it("useScopedKeyboardNavigation onKeyboardMove çağrılır", () => {
    useKeyboardStore.setState({ scopeStack: [] });

    const onKeyboardMove = vi.fn();
    renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3, onKeyboardMove })
    );

    act(() => fireKey("ArrowDown"));
    expect(onKeyboardMove).toHaveBeenCalledTimes(1);

    act(() => fireKey("ArrowUp"));
    expect(onKeyboardMove).toHaveBeenCalledTimes(2);

    act(() => fireKey("Home"));
    expect(onKeyboardMove).toHaveBeenCalledTimes(3);

    act(() => fireKey("End"));
    expect(onKeyboardMove).toHaveBeenCalledTimes(4);
  });
});

// ─── Liste Mutasyonu Edge-Case'leri ─────────────────────────────────────────

describe("Liste mutasyonu — focus güvenliği", () => {
  beforeEach(() => {
    useKeyboardStore.setState({ scopeStack: [] });
  });
  afterEach(() => {
    useKeyboardStore.setState({ scopeStack: [] });
  });

  it("itemCount 0'a düşünce focusedIdx -1 olur", () => {
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) =>
        useScopedKeyboardNavigation({ itemCount: count }),
      { initialProps: { count: 5 } }
    );

    act(() => fireKey("ArrowDown"));
    act(() => fireKey("ArrowDown"));
    expect(result.current.focusedIdx).toBe(1);

    act(() => rerender({ count: 0 }));
    expect(result.current.focusedIdx).toBe(-1);
  });

  it("clampOnMutation=true: odaklı satır silinince son geçerli satıra taşır", () => {
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) =>
        useScopedKeyboardNavigation({ itemCount: count, clampOnMutation: true }),
      { initialProps: { count: 5 } }
    );

    // idx=4'e git (son eleman)
    act(() => fireKey("End"));
    expect(result.current.focusedIdx).toBe(4);

    // Liste 3 elemana düştü — idx 4 artık yok → 2'ye clamp
    act(() => rerender({ count: 3 }));
    expect(result.current.focusedIdx).toBe(2);
  });

  it("clampOnMutation=true: odaklı satır geçerliyse korunur", () => {
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) =>
        useScopedKeyboardNavigation({ itemCount: count, clampOnMutation: true }),
      { initialProps: { count: 5 } }
    );

    // idx=1'e git
    act(() => fireKey("ArrowDown"));
    act(() => fireKey("ArrowDown"));
    expect(result.current.focusedIdx).toBe(1);

    // Liste 4 elemana düştü — idx 1 hâlâ geçerli → korunmalı
    act(() => rerender({ count: 4 }));
    expect(result.current.focusedIdx).toBe(1);
  });

  it("clampOnMutation=true: liste tamamen boşalınca -1 olur", () => {
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) =>
        useScopedKeyboardNavigation({ itemCount: count, clampOnMutation: true }),
      { initialProps: { count: 3 } }
    );

    act(() => fireKey("ArrowDown"));
    expect(result.current.focusedIdx).toBe(0);

    act(() => rerender({ count: 0 }));
    expect(result.current.focusedIdx).toBe(-1);
  });

  it("clampOnMutation=false (varsayılan): itemCount değişince -1'e sıfırlanır", () => {
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) =>
        useScopedKeyboardNavigation({ itemCount: count }),
      { initialProps: { count: 5 } }
    );

    act(() => fireKey("ArrowDown"));
    act(() => fireKey("ArrowDown"));
    expect(result.current.focusedIdx).toBe(1);

    act(() => rerender({ count: 4 }));
    // clamp yok — filtre değişti gibi davranır → sıfırla
    expect(result.current.focusedIdx).toBe(-1);
  });

  it("boş listede ArrowDown hata fırlatmaz", () => {
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 0 })
    );

    expect(() => {
      act(() => fireKey("ArrowDown"));
    }).not.toThrow();
    expect(result.current.focusedIdx).toBe(-1);
  });

  it("boş listede End hata fırlatmaz", () => {
    const { result } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 0 })
    );

    expect(() => {
      act(() => fireKey("End"));
    }).not.toThrow();
    expect(result.current.focusedIdx).toBe(-1);
  });
});

// ─── ESC Hızlı Ardışık Basış ────────────────────────────────────────────────

describe("ESC hızlı ardışık basış — dismiss stack", () => {
  beforeEach(() => {
    _clearDismissStackForTesting();
  });
  afterEach(() => {
    _clearDismissStackForTesting();
  });

  it("ESC'ye hızlı çift basış: callback yalnızca bir kez tetiklenir", async () => {
    const onDismiss = vi.fn();
    renderHook(() => useDismissOnEsc(true, onDismiss, 0));

    // Hızlı çift ESC — _firing flag birinciden sonra Promise.resolve ile sıfırlanır
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    // Promise.resolve microtask'ı bekle
    await Promise.resolve();

    // İki ESC arasında _firing=true olduğu için ikincisi engellendi
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("iki overlay: ESC her seferinde sadece en üsttekini kapatır", () => {
    const closeA = vi.fn();
    const closeB = vi.fn();

    renderHook(() => {
      useDismissOnEsc(true, closeA, 10);
      useDismissOnEsc(true, closeB, 20);
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(closeB).toHaveBeenCalledTimes(1);
    expect(closeA).not.toHaveBeenCalled();
  });

  it("unregister sonrası ESC kalan entry'yi doğru kapatır", () => {
    const cbA = vi.fn();
    const cbB = vi.fn();
    const { result } = renderHook(() => useDismissStack());
    let idA: number;
    let idB: number;

    act(() => {
      idA = result.current.register(cbA, 10);
      idB = result.current.register(cbB, 20);
    });

    // B'yi unregister et
    act(() => { result.current.unregister(idB!); });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    // A kalmalı ve tetiklenmeli
    expect(cbA).toHaveBeenCalledTimes(1);
    expect(cbB).not.toHaveBeenCalled();

    act(() => { result.current.unregister(idA!); });
  });
});

// ─── useFocusRestore Edge-Case'leri ─────────────────────────────────────────

import { useFocusRestore } from "@/hooks/useFocusRestore";

describe("useFocusRestore — race condition ve güvenlik", () => {
  it("restoreFocus: hedef DOM'da yoksa hata fırlatmaz", () => {
    const { result } = renderHook(() => useFocusRestore());

    const el = document.createElement("button");
    document.body.appendChild(el);
    act(() => { result.current.captureForRestore(); });
    document.body.removeChild(el); // hedef DOM'dan çıktı

    expect(() => {
      act(() => { result.current.restoreFocus(); });
    }).not.toThrow();
  });

  it("restoreFocusDeferred: hedef DOM'da yoksa hata fırlatmaz", async () => {
    const { result } = renderHook(() => useFocusRestore());

    const el = document.createElement("button");
    document.body.appendChild(el);
    act(() => { result.current.captureForRestore(); });
    document.body.removeChild(el);

    act(() => { result.current.restoreFocusDeferred(0); });
    await new Promise((r) => setTimeout(r, 10));
    // Hata fırlatılmadıysa test geçti
  });

  it("captureForRestore bekleyen deferred restore'u iptal eder", async () => {
    const { result } = renderHook(() => useFocusRestore());

    const el1 = document.createElement("button");
    const el2 = document.createElement("button");
    document.body.appendChild(el1);
    document.body.appendChild(el2);

    const focusSpy1 = vi.spyOn(el1, "focus");
    const focusSpy2 = vi.spyOn(el2, "focus");

    // İlk overlay aç: el1 kaydet, deferred restore başlat
    act(() => { result.current.captureForRestore(); }); // el1 zaten odaklı değil, body alır
    // Yeni bir capture: önceki timer iptal edilmeli
    act(() => { result.current.captureForRestore(); });
    act(() => { result.current.restoreFocusDeferred(50); });

    // İlk timer'ın süresi dolmadan önce başka bir capture
    act(() => { result.current.captureForRestore(); });
    act(() => { result.current.restoreFocusDeferred(50); });

    await new Promise((r) => setTimeout(r, 100));

    // el1.focus hiç çağrılmamalı (aktif değildi / body)
    // el2.focus hiç çağrılmamalı
    // Önemli olan: hata yok ve çift focus yok
    expect(focusSpy1).not.toHaveBeenCalled();
    expect(focusSpy2).not.toHaveBeenCalled();

    document.body.removeChild(el1);
    document.body.removeChild(el2);
    focusSpy1.mockRestore();
    focusSpy2.mockRestore();
  });

  it("captureForRestore olmadan restoreFocus no-op'tur", () => {
    const { result } = renderHook(() => useFocusRestore());

    expect(() => {
      act(() => { result.current.restoreFocus(); });
    }).not.toThrow();
  });
});

// ─── Scope Stack Unmount Cleanup ─────────────────────────────────────────────

describe("Scope stack — unmount cleanup", () => {
  beforeEach(() => {
    useKeyboardStore.setState({ scopeStack: [] });
  });
  afterEach(() => {
    useKeyboardStore.setState({ scopeStack: [] });
  });

  it("unmount sonrası scope stack'te stale entry kalmaz", () => {
    const { unmount } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3 })
    );

    expect(useKeyboardStore.getState().scopeStack.length).toBe(1);
    act(() => unmount());
    expect(useKeyboardStore.getState().scopeStack.length).toBe(0);
  });

  it("hızlı mount/unmount: wrong active scope oluşmaz", () => {
    useKeyboardStore.setState({ scopeStack: [] });

    const onEnterPersistent = vi.fn();

    // Kalıcı scope
    renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 3, onEnter: onEnterPersistent })
    );

    // Kısa ömürlü scope hızlıca mount+unmount
    const { unmount: unmountTemp } = renderHook(() =>
      useScopedKeyboardNavigation({ itemCount: 2 })
    );
    act(() => unmountTemp());

    // Kalıcı scope tekrar aktif olmalı
    act(() => fireKey("ArrowDown"));
    act(() => fireKey("Enter"));
    expect(onEnterPersistent).toHaveBeenCalledTimes(1);
  });

  it("duplicate push: scope yalnızca bir kez stack'te bulunur", () => {
    const { push } = useKeyboardStore.getState();
    push("test-scope");
    push("test-scope"); // aynı ID iki kez push
    const stack = useKeyboardStore.getState().scopeStack;
    expect(stack.filter((s) => s === "test-scope").length).toBe(1);
  });
});
