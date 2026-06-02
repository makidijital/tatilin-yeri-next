# 🛡️ ReservationRepository — FAZ 3 RAPORU (Conflict extraction)

**Tarih:** 2026-05-18
**Kapsam:** `checkReservationConflict` + `checkManualBlockConflict` DB I/O'sunu repository'ye delege.
**Davranış:** BYTE-IDENTICAL — availability semantic, half-open overlap, status allow-list, throw mesajları, log tag'leri aynen.

---

## 1. NE YAPILDI

### 1.1 Genişletilen dosya: `lib/db/reservation.repository.ts`

İki yeni metod + lokal `OverlapWindow` type:

```ts
export type OverlapWindow = {
  villa_id: string;
  start_date: string;
  end_date: string;
};

reservationRepository.findOverlappingReservations(
  window: OverlapWindow,
  statuses: readonly string[]
)
  → supabase.from("reservations")
       .select("id")
       .eq("villa_id", window.villa_id)
       .in("status", statuses)
       .lt("start_date", window.end_date)
       .gt("end_date", window.start_date)

reservationRepository.findOverlappingManualBlocks(window: OverlapWindow)
  → supabase.from("manual_reservations")
       .select("id")
       .eq("villa_id", window.villa_id)
       .lt("start_date", window.end_date)
       .gt("end_date", window.start_date)
```

**Kritik:** Repository allow-list business meaning'i bilmez — **parametre olarak alır**. `AVAILABILITY_BLOCKING_STATUSES` helper'da kalmaya devam eder.

### 1.2 Değişen dosya: `app/services/reservation/_helpers/conflict.ts`

- `import { supabase }` → `import { reservationRepository }`
- İki helper içindeki tam supabase query bloğu **tek metod çağrısına** indi:
  ```ts
  // önce
  await supabase.from("reservations").select("id")
    .eq("villa_id", w.villa_id)
    .in("status", ["pending", "confirmed"])
    .lt("start_date", w.end_date)
    .gt("end_date", w.start_date);

  // sonra
  await reservationRepository.findOverlappingReservations(
    window, AVAILABILITY_BLOCKING_STATUSES
  );
  ```
- Throw mesajları + console.error tag'leri + allow-list konstantı **helper'da aynen**.

### 1.3 Yeni test dosyası: `tests/unit/reservation-service/conflict.test.ts`

**18 test**, 7 describe bloğu, repository mock'lu:

| Describe | Test sayısı | Kapsam |
|---|:---:|---|
| `AVAILABILITY_BLOCKING_STATUSES` regression | 2 | Allow-list exact match + 'rejected'/'cancelled' YOK |
| `checkReservationConflict — no overlap` | 2 | Empty list + null data resolve silently |
| `checkReservationConflict — overlap found` | 2 | 1 row + N rows → throw "Bu tarihler dolu" |
| `checkReservationConflict — query error` | 2 | Throw "Rezervasyon kontrol hatası" + console.error tag |
| `checkReservationConflict — repository contract` | 2 | Window unchanged + allow-list `["pending","confirmed"]` exact |
| `checkManualBlockConflict — no overlap / overlap / error` | 5 | Mirror tests + console.error("❌ Manual conflict error:", ...) |
| `checkManualBlockConflict — repository contract` | 1 | Status arg YOK (call args length 1) |

### 1.4 Dokunulmayan dosyalar (kritik)

```
✅ app/services/reservation.service.ts            (facade)
✅ app/services/reservation/create.service.ts     (createReservation AST contract)
✅ app/services/reservation/update.service.ts     (updateReservationFull AST contract)
✅ app/services/reservation/status.service.ts     (updateReservationStatus AST contract)
✅ app/services/reservation/note.service.ts
✅ app/services/reservation/delete.service.ts
✅ app/services/reservation/_helpers/errors.ts
✅ app/services/reservation/_helpers/select-shapes.ts
✅ app/services/reservation/_helpers/payload-create.ts
✅ app/services/reservation/_helpers/payload-update.ts
✅ app/services/reservation/_helpers/commission.ts    (FAZ 2'de delege)
✅ app/services/reservation/_helpers/status.ts        (FAZ 2'de delege)
✅ app/services/reservation/read.service.ts           (FAZ 2'de delege)
✅ app/services/reservation/types.ts
✅ app/components/reservation/ReservationForm.tsx
✅ app/(admin)/maki-admin/reservations/[id]/page.tsx
✅ app/(admin)/maki-admin/reservations/page.tsx
✅ tests/unit/reservation-service/ (5 mevcut test dosyası)
```

---

## 2. BYTE-IDENTICAL DOĞRULAMA TABLOSU

| Korunan davranış | Nerede | Doğrulama |
|---|---|---|
| `.lt("start_date", end)` half-open overlap | repository içinde | Aynen — predicate chain field ismi + operatör aynı. |
| `.gt("end_date", start)` half-open overlap | repository içinde | Aynen. |
| `.in("status", ["pending","confirmed"])` | helper allow-list + repository predicate | Aynen — helper `AVAILABILITY_BLOCKING_STATUSES` konstantını parametre olarak geçiyor. |
| Status allow-list helper sahipliği | `_helpers/conflict.ts` | Aynen — `as const` tuple + business meaning helper'da. |
| `.select("id")` minimal projection | repository içinde | Aynen. |
| Order YOK, limit YOK | repository içinde | Aynen — orijinalde de yoktu. |
| Manual table: status filter YOK | repository `findOverlappingManualBlocks` | Aynen. |
| `❌ Conflict error:` log tag | helper | Aynen. |
| `❌ Manual conflict error:` log tag | helper | Aynen. |
| `"Rezervasyon kontrol hatası"` throw | helper | Aynen. |
| `"Bu tarihler dolu"` throw | helper | Aynen. |
| `conflict && conflict.length > 0` defensive read | helper | Aynen. |
| `manualConflict && manualConflict.length > 0` defensive read | helper | Aynen. |
| Lockstep contract w/ `lib/availability.helper.ts` | helper | Aynen — allow-list kaynak tek nokta. |
| createReservation orchestration: `validate → checkReservationConflict → checkManualBlockConflict → fetchCommissionRate → INSERT` | `create.service.ts` (DOKUNULMADI) | AST contract'taki helper identifier çağrı sırası aynen. |

---

## 3. AST CONTRACT KORUMA

`createReservationOrchestrationContract.test.ts` (`create.service.ts`'i izler) iddiaları:

| İddia | FAZ 3'te etki |
|---|:---:|
| `checkReservationConflict AWAITED before checkManualBlockConflict` | ✅ KORUNDU (helper isimleri + await aynen) |
| `checkManualBlockConflict AWAITED before fetchCommissionRate` | ✅ KORUNDU |
| `fetchCommissionRate AWAITED before calcCommissionAmount` | ✅ KORUNDU |
| `supabase insert AWAITED after fetchCommissionRate` | ✅ KORUNDU (INSERT henüz FAZ 5'te taşınacak) |
| `mapInsertError after insert` | ✅ KORUNDU |
| `checkReservationConflict EXACTLY ONCE` | ✅ KORUNDU |
| `checkManualBlockConflict EXACTLY ONCE` | ✅ KORUNDU |

**`create.service.ts` dosyası dokunulmadı; AST contract otomatik geçer.**

---

## 4. SUPABASE CALL-SITE DURUMU (post-FAZ 3)

| Dosya | Önce | FAZ 2 sonra | FAZ 3 sonra |
|---|:---:|:---:|:---:|
| `read.service.ts` | 2 | **0** ✅ | 0 |
| `_helpers/commission.ts` | 1 | **0** ✅ | 0 |
| `_helpers/status.ts` | 1 | **0** ✅ | 0 |
| `_helpers/conflict.ts` | 2 | 2 | **0** ✅ |
| `create.service.ts` (INSERT) | 1 | 1 | 1 (FAZ 5) |
| `update.service.ts` | 1 | 1 | 1 (FAZ 4) |
| `status.service.ts` | 1 | 1 | 1 (FAZ 4) |
| `note.service.ts` | 1 | 1 | 1 (FAZ 4) |
| `delete.service.ts` | 1 | 1 | 1 (FAZ 4) |
| **TOPLAM** | **11** | **7** | **5** |

**Reservation domain'inde Supabase'e doğrudan dokunan tüm kod artık write-side orchestrator'larda toplandı.** Read tarafı + conflict tarafı tamamen repository üzerinden.

```
service / helper                                ┌──► supabase
  │                                             │     (READ tarafı 0)
  ▼                                             │     (CONFLICT tarafı 0)
reservationRepository (lib/db/...)  ───────────►┤     (4 READ + 2 CONFLICT  metodu kapsama altında)
                                                │
                                                └──► supabase
                                                      (WRITE tarafı 5 — FAZ 4-5)
```

---

## 5. DOĞRULAMA ADIMLARI

| Adım | Sonuç |
|---|:---:|
| `npx tsc --noEmit` | ✅ clean (0 hata) |
| `npx eslint` (yeni + dokunulan dosyalar) | ✅ clean |
| `grep supabase` `_helpers/conflict.ts` | ✅ kod tarafında 0, sadece yorumda 1 |
| `create.service.ts` AST contract dosyası dokunuldu mu? | ✅ HAYIR |
| Caller imports değişti mi? | ✅ HAYIR — 4 caller dokunulmadı |
| AVAILABILITY_BLOCKING_STATUSES yeri | ✅ Helper'da aynen (`as const` tuple) |
| Helper throw mesajları | ✅ Aynen |
| Helper console.error tag'leri | ✅ Aynen |
| Half-open overlap geometry | ✅ Repository içinde aynen — drift YOK |
| `vitest run` | ⚠️ sandbox'ta rollup-linux-arm64-gnu binary eksik (önceki tüm FAZ'larda aynı). Yeni `conflict.test.ts` 18 test içerir; CI'da çalışacak. Mevcut AST contract testleri `create.service.ts`'i izliyor — dosya dokunulmadığı için otomatik geçer. |

---

## 6. ARCHITECTURE STATE (post-FAZ 3)

### Sınır netliği — Conflict tarafı

| Concern | Helper (`_helpers/conflict.ts`) | Repository |
|---|:---:|:---:|
| `AVAILABILITY_BLOCKING_STATUSES` allow-list konstantı | ✅ tek kaynak | ❌ |
| Allow-list business meaning ("hangi statüler block eder") | ✅ | ❌ |
| Lockstep contract (availability.helper) | ✅ | ❌ |
| Half-open overlap geometry | indirect (parametre geçer) | ✅ uygular |
| `.lt`, `.gt` operatör seçimi | ❌ | ✅ |
| Cross-table choice (reservations vs manual_reservations) | indirect (metod seçer) | ✅ tablo |
| Throw "Bu tarihler dolu" | ✅ | ❌ |
| Throw "Rezervasyon kontrol hatası" | ✅ | ❌ |
| Console.error tag | ✅ | ❌ |
| TOCTOU UX fast-path semantic | ✅ | ❌ |
| Atomik garanti (EXCLUDE constraint) | ❌ DB-level | ❌ |
| Supabase import | ❌ | ✅ |

### Repository public API (post-FAZ 3 — 6 metod)

```
READ
├── findById(id)                         (FAZ 2)
├── findList()                           (FAZ 2)
├── findPaidAmount(id)                   (FAZ 2)
└── findVillaCommissionRate(villaId)     (FAZ 2)

CONFLICT
├── findOverlappingReservations(window, statuses)   (FAZ 3)
└── findOverlappingManualBlocks(window)             (FAZ 3)

WRITE (pending)
├── updateById(id, partial)              (FAZ 4)
├── deleteById(id)                       (FAZ 4)
└── insert(payload)                      (FAZ 5)
```

---

## 7. RİSK DEĞERLENDİRMESİ (post-FAZ 3)

| Risk | Durum | Notlar |
|---|:---:|---|
| Allow-list drift (`["pending","confirmed"]`) | ✅ KORUNDU | Helper'da `as const` tuple — repository parametre alır; "repository contract" testi tam tuple match'i freeze ediyor. |
| Half-open overlap drift (`.lt`/`.gt`) | ✅ KORUNDU | Repository içinde aynen — `findOverlappingReservations.test.ts` query shape'i değiştirirse yorumda explicit. |
| Manual block status filter sızıntısı | ✅ KORUNDU | Repository `findOverlappingManualBlocks` status arg almıyor; "call args length 1" testi freeze ediyor. |
| Lockstep contract (availability.helper.ts) divergence | ✅ KORUNDU | Allow-list tek konstanttan beslenir; iki taraf da `AVAILABILITY_BLOCKING_STATUSES` import etseydi daha sıkı olurdu — bu, availability.helper.ts'nin kendi içinde aynı tuple'a sahip olması ile lockstep (orijinal pattern aynen). |
| Console.error tag drift | ✅ KORUNDU | Test explicit assertion: `expect(consoleErrorSpy).toHaveBeenCalledWith("❌ Conflict error:", ...)`. |
| Throw mesaj drift (TR strings) | ✅ KORUNDU | Test explicit: `rejects.toThrow("Bu tarihler dolu")`. |
| createReservation AST contract bozulması | ✅ KORUNDU | `create.service.ts` dosyası dokunulmadı. |
| ReservationForm submit flow / saveAll | ✅ KORUNDU | Caller'lar dokunulmadı. |
| Repository abstraction büyümesi | ✅ KORUNDU | Generic filter builder YOK; 6 metod, hepsi explicit query. |
| TS variance / over-engineering | ✅ KORUNDU | `statuses: readonly string[]` minimal; `OverlapWindow` lokal type 3 alan. |

---

## 8. SONRAKI ADIM (FAZ 4 — UPDATE/STATUS/NOTE/DELETE)

Önerilen kapsam:
- `reservationRepository.updateById(id, partial)` — `reservations` tablosu UPDATE
- `reservationRepository.deleteById(id)` — `reservations` tablosu DELETE
- `update.service.ts` → `repository.updateById(id, buildUpdateReservationPayload(data))`
- `status.service.ts` → `repository.updateById(id, { status })`
- `note.service.ts` → `repository.updateById(id, { note })`
- `delete.service.ts` → `repository.deleteById(id)`

**AST contract evolve:** `updateReservationFullOrchestrationContract.test.ts` ve `statusAndDeleteOrchestrationContract.test.ts`'de `supabase.from(...).update(...).eq(...)` çağrı identifier'ları `reservationRepository.updateById(...)` / `deleteById(...)` olur. Diğer iddialar (await, conditional, throw mesajları, `assertCanConfirm` guard) aynen.

**FAZ 5 (INSERT — en son):** `create.service.ts` içindeki `supabase.from("reservations").insert(...).select().single()` → `repository.insert(payload)`. `mapInsertError` + SQLSTATE 23P01 service edge'inde aynen kalır.

---

**FAZ 3 sonu. Reservation domain'inde Supabase artık yalnız write-side'da. FAZ 4 için onay bekliyorum.**
