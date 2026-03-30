/**
 * Output Folder — adminStore.setOutputFolder ve resetOutputFolder testleri.
 *
 * Test kapsamı:
 *   setOutputFolder:
 *   1. başarı: doğru endpoint + body çağrılır, absolute_path döner
 *   2. backend 422 → null döner, store.error set edilir
 *   3. backend 401 → null döner, store.error set edilir
 *   4. başarı sonrası settings listesindeki output_dir kaydını günceller
 *   5. settings listesinde output_dir yokken listeyi değiştirmez
 *   6. X-Admin-Pin header doğru PIN ile gönderilir
 *   7. network hatası → null döner, store.error set edilir
 *
 *   resetOutputFolder:
 *   8. başarıda DELETE /api/settings/admin/output-folder çağrılır, default_path döner
 *   9. başarı sonrası output_dir kaydını settings listesinden kaldırır
 *   10. output_dir listede yokken hata vermeden çalışır
 *   11. backend hata döndürdüğünde null döner, store.error set edilir
 *   12. X-Admin-Pin header doğru PIN ile gönderilir
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { act } from "@testing-library/react";
import { useAdminStore } from "@/stores/adminStore";

// ─── fetch mock ──────────────────────────────────────────────────────────────

function mockFetch(responseData: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : status === 422 ? "Unprocessable Entity" : "Unauthorized",
    json: () => Promise.resolve(responseData),
  });
}

// ─── Yardımcı: store'u sıfırla ───────────────────────────────────────────────

function resetStore() {
  useAdminStore.setState({
    settings: [],
    loading: false,
    error: null,
  });
}

// ─── localStorage mock ───────────────────────────────────────────────────────

beforeEach(() => {
  resetStore();
  vi.restoreAllMocks();
  // Admin PIN sabitle
  vi.spyOn(Storage.prototype, "getItem").mockImplementation((key) => {
    if (key === "cm-admin-pin") return "1234";
    return null;
  });
});

// ─── Testler ─────────────────────────────────────────────────────────────────

describe("adminStore.setOutputFolder", () => {
  it("başarıda doğru endpoint ve body ile POST yapar, absolute_path döner", async () => {
    const fetchMock = mockFetch({
      path: "/home/user/videos",
      absolute_path: "/home/user/videos",
      exists: true,
      message: "Output klasörü ayarlandı: /home/user/videos",
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await act(async () => {
      return useAdminStore.getState().setOutputFolder("/home/user/videos");
    });

    expect(result).toBe("/home/user/videos");

    // fetch tam olarak bir kez çağrılmalı
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    // Doğru endpoint
    expect(url).toBe("/api/settings/admin/output-folder");
    // POST metodu
    expect(init.method).toBe("POST");
    // Body doğru JSON
    expect(JSON.parse(init.body as string)).toEqual({ path: "/home/user/videos" });
    // Admin PIN header
    expect(init.headers["X-Admin-Pin"]).toBe("1234");
  });

  it("backend 422 döndürdüğünde null döner ve store.error set edilir", async () => {
    const fetchMock = mockFetch(
      { detail: "Geçersiz yol veya yazma izni yok." },
      422
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await act(async () => {
      return useAdminStore.getState().setOutputFolder("/invalid/path");
    });

    expect(result).toBeNull();
    expect(useAdminStore.getState().error).toBe("Geçersiz yol veya yazma izni yok.");
  });

  it("backend 401 döndürdüğünde null döner ve store.error set edilir", async () => {
    const fetchMock = mockFetch(
      { detail: "Geçersiz veya eksik admin PIN'i." },
      401
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await act(async () => {
      return useAdminStore.getState().setOutputFolder("/some/path");
    });

    expect(result).toBeNull();
    expect(useAdminStore.getState().error).toBeTruthy();
  });

  it("başarı sonrası settings listesindeki output_dir kaydını günceller", async () => {
    // Store'a mevcut output_dir kaydı ekle
    useAdminStore.setState({
      settings: [
        {
          id: 7,
          scope: "admin",
          scope_id: "",
          key: "output_dir",
          value: "/old/path",
          locked: false,
          description: null,
          created_at: "2026-01-01T00:00:00",
          updated_at: "2026-01-01T00:00:00",
        },
        {
          id: 8,
          scope: "admin",
          scope_id: "",
          key: "max_concurrent_jobs",
          value: 2,
          locked: true,
          description: null,
          created_at: "2026-01-01T00:00:00",
          updated_at: "2026-01-01T00:00:00",
        },
      ],
    });

    const fetchMock = mockFetch({
      path: "~/videos",
      absolute_path: "/home/user/videos",
      exists: true,
      message: "OK",
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      await useAdminStore.getState().setOutputFolder("~/videos");
    });

    const settings = useAdminStore.getState().settings;
    const outputRecord = settings.find((r) => r.key === "output_dir");
    // output_dir absolute_path ile güncellendi
    expect(outputRecord?.value).toBe("/home/user/videos");
    // Diğer kayıtlar etkilenmedi
    const jobsRecord = settings.find((r) => r.key === "max_concurrent_jobs");
    expect(jobsRecord?.value).toBe(2);
  });

  it("settings listesinde output_dir kaydı yoksa listeyi değiştirmez", async () => {
    useAdminStore.setState({
      settings: [
        {
          id: 5,
          scope: "admin",
          scope_id: "",
          key: "video_format",
          value: "long",
          locked: false,
          description: null,
          created_at: "2026-01-01T00:00:00",
          updated_at: "2026-01-01T00:00:00",
        },
      ],
    });

    const fetchMock = mockFetch({
      path: "/new/output",
      absolute_path: "/new/output",
      exists: true,
      message: "OK",
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      await useAdminStore.getState().setOutputFolder("/new/output");
    });

    const settings = useAdminStore.getState().settings;
    // Listedeki mevcut kayıt değişmedi
    expect(settings).toHaveLength(1);
    expect(settings[0].key).toBe("video_format");
  });

  it("X-Admin-Pin header doğru PIN ile gönderilir", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation((key) => {
      if (key === "cm-admin-pin") return "9999";
      return null;
    });

    const fetchMock = mockFetch({
      path: "/p",
      absolute_path: "/p",
      exists: true,
      message: "OK",
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      await useAdminStore.getState().setOutputFolder("/p");
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["X-Admin-Pin"]).toBe("9999");
  });

  it("network hatası (fetch throw) durumunda null döner ve store.error set edilir", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await act(async () => {
      return useAdminStore.getState().setOutputFolder("/path");
    });

    expect(result).toBeNull();
    expect(useAdminStore.getState().error).toBe("Network error");
  });
});

// ─── resetOutputFolder testleri ──────────────────────────────────────────────

describe("adminStore.resetOutputFolder", () => {
  it("başarıda DELETE endpoint çağrılır ve default_path döner", async () => {
    const fetchMock = mockFetch({
      default_path: "/app/output",
      message: "Output klasörü varsayılana sıfırlandı: /app/output",
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await act(async () => {
      return useAdminStore.getState().resetOutputFolder();
    });

    expect(result).toBe("/app/output");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/settings/admin/output-folder");
    expect(init.method).toBe("DELETE");
    expect(init.headers["X-Admin-Pin"]).toBe("1234");
  });

  it("başarı sonrası output_dir kaydını settings listesinden kaldırır", async () => {
    useAdminStore.setState({
      settings: [
        {
          id: 7,
          scope: "admin",
          scope_id: "",
          key: "output_dir",
          value: "/custom/path",
          locked: false,
          description: null,
          created_at: "2026-01-01T00:00:00",
          updated_at: "2026-01-01T00:00:00",
        },
        {
          id: 8,
          scope: "admin",
          scope_id: "",
          key: "language",
          value: "tr",
          locked: false,
          description: null,
          created_at: "2026-01-01T00:00:00",
          updated_at: "2026-01-01T00:00:00",
        },
      ],
    });

    const fetchMock = mockFetch({
      default_path: "/app/output",
      message: "Sıfırlandı",
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      await useAdminStore.getState().resetOutputFolder();
    });

    const settings = useAdminStore.getState().settings;
    // output_dir kaydı kaldırıldı
    expect(settings.find((r) => r.key === "output_dir")).toBeUndefined();
    // Diğer kayıtlar kaldı
    expect(settings).toHaveLength(1);
    expect(settings[0].key).toBe("language");
  });

  it("settings listesinde output_dir yokken hata vermez, liste değişmez", async () => {
    useAdminStore.setState({
      settings: [
        {
          id: 3,
          scope: "admin",
          scope_id: "",
          key: "video_fps",
          value: 30,
          locked: false,
          description: null,
          created_at: "2026-01-01T00:00:00",
          updated_at: "2026-01-01T00:00:00",
        },
      ],
    });

    const fetchMock = mockFetch({
      default_path: "/app/output",
      message: "Zaten varsayılan",
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await act(async () => {
      return useAdminStore.getState().resetOutputFolder();
    });

    expect(result).toBe("/app/output");
    // Liste değişmedi
    expect(useAdminStore.getState().settings).toHaveLength(1);
  });

  it("backend hata döndürdüğünde null döner ve store.error set edilir", async () => {
    const fetchMock = mockFetch({ detail: "Yetkisiz" }, 401);
    vi.stubGlobal("fetch", fetchMock);

    const result = await act(async () => {
      return useAdminStore.getState().resetOutputFolder();
    });

    expect(result).toBeNull();
    expect(useAdminStore.getState().error).toBeTruthy();
  });

  it("network hatası (fetch throw) durumunda null döner ve store.error set edilir", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Connection refused"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await act(async () => {
      return useAdminStore.getState().resetOutputFolder();
    });

    expect(result).toBeNull();
    expect(useAdminStore.getState().error).toBe("Connection refused");
  });

  it("X-Admin-Pin header doğru PIN ile gönderilir", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation((key) => {
      if (key === "cm-admin-pin") return "5678";
      return null;
    });

    const fetchMock = mockFetch({
      default_path: "/app/output",
      message: "OK",
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      await useAdminStore.getState().resetOutputFolder();
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["X-Admin-Pin"]).toBe("5678");
  });
});
