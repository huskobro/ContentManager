import "@testing-library/jest-dom";

// jsdom doesn't implement EventSource — provide a minimal stub
// so pages that use SSE (JobList, AdminJobs) can render without crashing.
if (typeof globalThis.EventSource === "undefined") {
  class EventSourceStub {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 2;
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSED = 2;
    readyState = 0;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    onopen: ((ev: Event) => void) | null = null;
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return true; }
    close() { this.readyState = 2; }
    constructor(public url: string) {}
  }
  Object.defineProperty(globalThis, "EventSource", {
    writable: true,
    value: EventSourceStub,
  });
}
