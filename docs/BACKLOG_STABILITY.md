# Stability Hardening Backlog

Post-Phase 10 cleanup items. Not blockers for Phase 11, but should be addressed
before the codebase scales further. Each item has a clear fix path.

**Oluşturulma:** 2026-03-31
**Öncelik:** Medium (Faz 11 tamamlandıktan sonra)

---

## BST-001 — Optimistic Toggle: Rollback Eksikliği

**Etkilenen yüzeyler:**
- `PromptManager` → `CategoryEditor.handleToggleEnabled`
- `PromptManager` → `HookEditor.handleToggleEnabled`
- `ModuleManager` → NewsSource `toggleEnabled`
- `ModuleManager` → CategoryMapping `toggleEnabled`
- `ModuleManager` → `handleToggleEnabled` (module aktif/pasif)

**Sorun:**
`setEnabled(next)` → optimistic UI güncelleme → `await onSave(...)` → hata durumunda
state geri alınmıyor. Kullanıcı başarısız toggle görsel olarak yanlış state'te kalır.

**Mevcut davranış:** Toggle tıklanır, UI anında değişir. Ağ hatası olursa toast çıkar
ama görsel state hâlâ yanlış değeri gösterir. Kullanıcı sayfayı yenilemeden fark edemez.

**Beklenen davranış:** Hata durumunda `setEnabled(original)` ile state geri alınmalı.

**Fix pattern:**
```typescript
async function handleToggleEnabled() {
  const next = !enabled;
  setEnabled(next);  // optimistic
  try {
    await onSave(entity, { enabled: next });
  } catch {
    setEnabled(!next);  // rollback on error
    addToast({ type: "error", title: "Değiştirilemedi", description: entity.name });
  }
}
```

**Test:** `promptManager.test.tsx` `CategoryEditor — optimistic toggle` — rollback
davranışı şu an belgelenmiş (no-rollback case), fix sonrası test güncellenmeli.

**Efor:** ~1 saat (5 yüzey × basit try/catch + rollback)

---

## BST-002 — Concurrent POST Same Key: Backend 500 Yerine 409

**Etkilenen endpoint:** `POST /api/settings` (ve potansiyel olarak categories, hooks)

**Sorun:**
Aynı `(scope, scope_id, key)` kombinasyonuna eş zamanlı iki POST geldiğinde backend
SQLite unique constraint ihlali nedeniyle `500 Internal Server Error` döndürüyor.
HTTP semantiği açısından `409 Conflict` olmalı.

**Test kanıtı:** `backend/tests/` — `concurrent POST same key` testi `errors=[500, 500]`
gösteriyor (frontend'in tek iş parçacıklı yapısı nedeniyle şu an üretilemez ama
API istemcileri veya otomasyon scriptleri tetikleyebilir).

**Beklenen davranış:** `409 Conflict` + `{"detail": "Bu anahtar zaten kayıtlı: {key}"}`.

**Fix path:**
```python
# backend/api/settings.py — POST /settings handler
from sqlalchemy.exc import IntegrityError
try:
    db.add(new_setting)
    db.commit()
except IntegrityError:
    db.rollback()
    raise HTTPException(status_code=409, detail=f"Bu anahtar zaten kayıtlı: {payload.key}")
```

**Efor:** ~30 dakika (tek handler, tek except)

---

## BST-003 — CategoryEditor.handleSave: Koşulsuz setSaved(true)

**Etkilenen bileşen:** `frontend/src/pages/admin/PromptManager.tsx` → `CategoryEditor`

**Sorun:**
`handleSave()` şu an `onSave` sonucunu kontrol etmiyor:
```typescript
async function handleSave() {
  setSaving(true);
  await onSave(cat, { ... });  // ← dönüş değeri yok sayılıyor
  setSaving(false);
  setSaved(true);  // ← hata olsa da çalışır
  setTimeout(() => setSaved(false), 2000);
}
```

`HookEditor.handleSave` da aynı sorunu taşıyor.

Karşılaştırma: `PromptEditor.handleSave` bu Faz'da düzeltildi —
`const ok = await onSave(...)` → `if (ok) { setSaved(true); }` pattern'ı kullanıyor.

**Beklenen davranış:** `onSave` başarısız olduğunda "Kaydedildi" göstergesi çıkmamalı.
(Backend toast zaten çıkıyor, ama inline "Kaydedildi" butonu hâlâ yeşile dönüyor.)

**Fix pattern:**
```typescript
// handleSaveCategory'nin boolean döndürmesi gerekiyor
async function handleSaveCategory(...): Promise<boolean> { ... }

// CategoryEditor.handleSave:
async function handleSave() {
  setSaving(true);
  await onSave(cat, { ... });
  // onSave boolean dönmüyorsa: try/catch ile handle et
  setSaving(false);
  setSaved(true);
}
// → dönüşüm: onSave Promise<void> → Promise<boolean>
//   (PromptEditor fix'indeki aynı pattern)
```

**Efor:** ~45 dakika (CategoryEditor + HookEditor + handleSaveCategory/handleSaveHook imzaları)

---

## Öncelik Sırası

| # | ID | Efor | Risk | Önerilen Faz |
|---|---|---|---|---|
| 1 | BST-003 | 45 dk | Düşük (UI feedback tutarsızlığı) | Faz 11 sonrası |
| 2 | BST-001 | 1 saat | Orta (görsel yanlış state) | Faz 11 sonrası |
| 3 | BST-002 | 30 dk | Düşük (şu an frontend'den tetiklenemez) | Faz 12 veya bağımsız hotfix |
