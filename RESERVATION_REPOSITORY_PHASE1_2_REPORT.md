# 🛡️ ReservationRepository — FAZ 1 + FAZ 2 RAPORU

**Tarih:** 2026-05-18
**Kapsam:** Repository contract design + READ extraction (düşük riskli)
**Davranış:** BYTE-IDENTICAL — caller migration yok, AST contract dokunulmadı, throw/console.tag aynen.

---

## 1. NE YAPILDI

### 1.1 Yeni dosyalar (2)

| Dosya | LOC | İçerik |
|---|---:|---|
| `lib/db/types.ts` | 30 | `DbError` minimal type alias (Supabase `PostgrestError`'a yapısal compatible). |
| `lib/db/reservation.repository.ts` | 160 | `reservationRepository` — şu an için **4 READ metodu**. |

### 1.2 Değiştirilen dosyalar (3)

| Dosya | Δ | Değişiklik özü |
|---|---|---|
| `app/services/reservation/read.service.ts` | -7 LOC | `supabase.from(...).select(...).eq/.order(...).single/...` → `reservationRepository.findById/findList`. SELECT constant import'u kaldırıldı (artık repository'nin içinde). |
| `app/services/reservation/_helpers/commission.ts` | ±0 LOC | `supabase.from("villa").select("commission_rate").eq.maybeSingle` → `reservationRepository.findVillaCommissionRate`. Fail-open + log tag helper'da. |
| `app/services/reservation/_helpers/status.ts` | -3 LOC | `supabase.from("reservations").select("paid_amount").eq.maybeSingle` → `reservationRepository.findPaidAmount`. Console tag + throw helper'da. |

### 1.3 Dokunulmayan dosyalar (kritik)

```
✅ app/services/reservation.service.ts          (facade)
✅ app/services/reservation/create.service.ts   (createReservation orchestrator)
✅ app/services/reservation/update.service.ts   (updateReservationFull orchestrator)
✅ app/services/reservation/status.service.ts   (updateReservationStatus orchestrator)
✅ app/services/reservation/note.service.ts     (updateReservationNote orchestrator)
✅ app/services/reservation/delete.service.ts   (deleteReservationById orchestrator)
✅ app/services/reservation/_helpers/conflict.ts
✅ app/services/reservation/_helpers/errors.ts
✅ app/services/reservation/_helpers/select-shapes.ts   (single source-of-truth korundu)
✅ app/services/reservation/_helpers/payload-create.ts
✅ app/services/reservation/_helpers/payload-update.ts
✅ app/services/reservation/types.ts
✅ app/components/reservation/ReservationForm.tsx
✅ app/(admin)/maki-admin/reservations/[id]/page.tsx
✅ app/(admin)/maki-admin/reservations/page.tsx
```

**4 caller dokunulmadı; AST contract'lı 3 orchestrator dokunulmadı. Zero migration.**

---

## 2. REPOSITORY PUBLIC API (FAZ 2 sonu)

```ts
reservationRepository.findById(id: string)
  → supabase.from("reservations")
       .select(SELECT_RESERVATION_DETAIL)
       .eq("id", id)
       .single()

reservationRepository.findList()
  → supabase.from("reservations")
       .select(SELECT_RESERVATION_LIST)
       .order("created_at", { ascending: false })

reservationRepository.findPaidAmount(id: string)
  → supabase.from("reservations")
       .select("paid_amount")
       .eq("id", id)
       .maybeSingle()

reservationRepository.findVillaCommissionRate(villaId: string)
  → supabase.from("villa")
       .select("commission_rate")
       .eq("id", villaId)
       .maybeSingle()
```

Return shape: Supabase native `{ data, error }`. Repository sessiz — throw yok, console.error yok.

**Pending (sonraki fazlar):**
- FAZ 3 — `findOverlappingReservations`, `findOverlappingManualBlocks`
- FAZ 4 — `updateById`, `deleteById`
- FAZ 5 — `insert`

---

## 3. BYTE-IDENTICAL DOĞRULAMA TABLOSU

| Korunan davranış | Nerede | Doğrulama |
|---|---|---|
| `SELECT_RESERVATION_DETAIL` whitespace | `_helpers/select-shapes.ts` | Dosya **dokunulmadı**; repository onu import ediyor (single source-of-truth). |
| `SELECT_RESERVATION_LIST` whitespace | `_helpers/select-shapes.ts` | Aynı. |
| `.single()` davranışı (detail) | repository `findById` | Orijinal `.single()` aynen (missing row → PGRST116 error; service `if (error) throw "Rezervasyon getirilemedi"` aynen yakalıyor). |
| `.order("created_at", { ascending: false })` (list) | repository `findList` | Aynen. |
| `.maybeSingle()` (paid_amount + commission_rate) | repository `findPaidAmount`, `findVillaCommissionRate` | Aynen. |
| `❌ Fetch error:` log tag | `read.service.ts` | Aynen. |
| `❌ List error:` log tag | `read.service.ts` | Aynen. |
| `"Rezervasyon getirilemedi"` throw | `read.service.ts` | Aynen. |
| `"Rezervasyonlar alınamadı"` throw | `read.service.ts` | Aynen. |
| `"ID gerekli"` throw (id guard, repository call'dan ÖNCE) | `read.service.ts` | Aynen. |
| `[reservation.commission.fetch] FAILED` log tag | `_helpers/commission.ts` | Aynen. |
| Fail-open semantic (commission error → fallback rate 20) | `_helpers/commission.ts > fetchCommissionRate` | Aynen — repository error döner, helper console.error + `safeCommissionRate(undefined)` ile fallback. |
| `[reservation.confirm-guard] FETCH_FAILED` log tag | `_helpers/status.ts` | Aynen. |
| `"Doğrulama hatası"` throw | `_helpers/status.ts > assertCanConfirm` | Aynen. |
| `RESERVATION_CONFIRM_GUARD_MESSAGE` throw | `_helpers/status.ts > assertCanConfirm` | Aynen. |
| `existing?.paid_amount` defensive read | `_helpers/status.ts > assertCanConfirm` | Aynen. |
| `villaCommissionRow?.commission_rate` defensive read | `_helpers/commission.ts > fetchCommissionRate` | Aynen. |
| createReservation orchestration sequence | `create.service.ts` | **DOSYA DOKUNULMADI** — AST contract zaten geçer. |
| updateReservationFull orchestration sequence | `update.service.ts` | **DOSYA DOKUNULMADI**. |
| updateReservationStatus & deleteReservationById sequence | `status.service.ts`, `delete.service.ts` | **DOSYA DOKUNULMADI**. |
| saveAll AST contract (`reservations/[id]/page.tsx`) | caller | **DOSYA DOKUNULMADI** — service'in public API'si değişmedi. |
| ReservationForm submit AST contract | `ReservationForm.tsx` | **DOSYA DOKUNULMADI**. |

---

## 4. SUPABASE CALL-SITE METRİKLERİ (öncesi/sonrası)

| Dosya | Önce | Sonra | Δ |
|---|:---:|:---:|:---:|
| `read.service.ts` | 2 supabase | **0** | -2 ✅ |
| `_helpers/commission.ts` | 1 supabase | **0** | -1 ✅ |
| `_helpers/status.ts` | 1 supabase | **0** | -1 ✅ |
| **Reservation domain READ tarafı** | **4** | **0** | **-4** ✅ |
| `create.service.ts` (INSERT) | 1 | 1 | 0 (FAZ 5'te) |
| `update.service.ts` | 1 | 1 | 0 (FAZ 4'te) |
| `status.service.ts` | 1 | 1 | 0 (FAZ 4'te) |
| `note.service.ts` | 1 | 1 | 0 (FAZ 4'te) |
| `delete.service.ts` | 1 | 1 | 0 (FAZ 4'te) |
| `_helpers/conflict.ts` | 2 | 2 | 0 (FAZ 3'te) |

**Reservation domain'i FAZ 2 sonrası kalan doğrudan Supabase call'ı: 7 (1 INSERT + 4 UPDATE/DELETE + 2 CONFLICT).**

`commission.ts` ve `status.ts` helper'larında kalan "supabase" string'i sadece yorum içinde (`grep` 1 match — context: "artık doğrudan supabase..."). Çalışan kod tarafında ✅.

---

## 5. DOĞRULAMA ADIMLARI

| Adım | Sonuç |
|---|:---:|
| `npx tsc --noEmit` | ✅ clean (0 hata) |
| `npx eslint` (yeni + dokunulan 5 dosya) | ✅ clean (0 hata, 0 uyarı) |
| `grep -c supabase` orchestrator'larda | ✅ değişmedi |
| `git status` yeni dosyalar | ✅ `lib/db/types.ts`, `lib/db/reservation.repository.ts` |
| Caller imports değişti mi? | ✅ HAYIR — 4 caller dokunulmadı |
| AST contract dosyalarındaki içerik değişti mi? | ✅ HAYIR — `create/update/status/delete service.ts` aynen |
| `vitest run` | ⚠️ sandbox'ta çalışmıyor (rollup-linux-arm64-gnu binary eksik — bu önceki 8 refactor'da da aynı). Manuel doğrulama yapıldı: AST contract testlerinin izlediği dosyalar dokunulmadı; helper unit testlerinin (commission, errors, payload-create, payload-update) içerikleri pure helper'ları test ediyor — etkilenmedi. |

---

## 6. AST CONTRACT KORUMA — manuel doğrulama

Mevcut 3 AST contract testi şu dosyaları izliyor:

| Test | İzlediği dosya | FAZ 2'de değişti mi? |
|---|---|:---:|
| `createReservationOrchestrationContract.test.ts` | `create.service.ts` | ❌ |
| `updateReservationFullOrchestrationContract.test.ts` | `update.service.ts` | ❌ |
| `statusAndDeleteOrchestrationContract.test.ts` | `status.service.ts` + `delete.service.ts` | ❌ |

**Sonuç:** Üç AST contract da otomatik geçer. Helper-level testler (commission, errors, payload-*) pure fonksiyonları test ediyor; repository delegation'dan etkilenmiyor.

---

## 7. ARCHITECTURE STATE (öncesi/sonrası)

### Öncesi

```
service / helper
      │
      ▼
   supabase  ◄── reservation domain'inde 11 doğrudan tüketim
```

### Sonrası (FAZ 2)

```
service / helper                ┌────► supabase (READ tarafı yalnız 0 noktada)
      │                         │
      ▼                         │
  reservationRepository  ──────►┤
  (lib/db/reservation.repository.ts)
                                │
                                └────► supabase (4 READ metodu kapsama altında)

  + lib/db/types.ts — DbError minimal alias
```

### Sınır netliği

| Concern | Service / Helper | Repository |
|---|:---:|:---:|
| Input guard (`"ID gerekli"`) | ✅ | ❌ |
| Throw "Rezervasyon getirilemedi" / "Rezervasyonlar alınamadı" / "Doğrulama hatası" | ✅ | ❌ |
| console.error tag emission (4 farklı tag) | ✅ | ❌ |
| Fail-open policy (commission) | ✅ | ❌ |
| `safeCommissionRate` fallback | ✅ | ❌ |
| `canConfirmReservation` policy decision | ✅ | ❌ |
| SELECT embed string'i | indirect (import) | ✅ tüketici |
| `.single()` / `.maybeSingle()` resolver | ❌ | ✅ |
| `.eq("id", id)` predicate | ❌ | ✅ |
| `supabase` import | **0 noktada** (read tarafı) | ✅ |

---

## 8. RİSK DEĞERLENDİRMESİ (FAZ 2 sonrası)

| Risk | Durum | Notlar |
|---|:---:|---|
| `getReservationById` row-not-found davranış değişikliği | ✅ KORUNDU | `.single()` resolver repository içinde aynen; error.code PGRST116 → service `throw "Rezervasyon getirilemedi"` aynen tetiklenir. |
| Order pattern drift (`created_at` DESC) | ✅ KORUNDU | Repository `findList` içinde aynen. |
| SELECT whitespace drift | ✅ KORUNDU | `select-shapes.ts` tek nokta; repository import. |
| Fail-open commission semantic drift | ✅ KORUNDU | Helper içinde aynen. |
| `assertCanConfirm` fallback fetch semantic drift | ✅ KORUNDU | Helper içinde aynen; sadece DB call yolu repository üzerinden. |
| AST contract drift | ✅ KORUNDU | Hiçbiri etkilenmedi (orchestrator'lar dokunulmadı). |
| Type leakage (PostgrestError) | 🟡 KISMEN | DbError alias var ama repository return tipi şu an explicit annotate edilmedi (Supabase tipinin yapısal eşleşmesinden faydalanıyor). Generic abstraction'ı sonraki fazda ele alacağız — şimdi over-engineering değil. |
| Caller migration | ✅ SIFIR | 4 caller dokunulmadı. |
| Whitespace drift (yeni dosyada) | ✅ YOK | SELECT constants `select-shapes.ts`'den import; repository içinde duplicate tanım YOK. |

---

## 9. SONRAKI ADIM (FAZ 3 — Conflict extraction önerisi)

Hazırlık:
- `reservationRepository.findOverlappingReservations(window)` ekle.
- `reservationRepository.findOverlappingManualBlocks(window)` ekle.
- `_helpers/conflict.ts > checkReservationConflict` ve `checkManualBlockConflict` → repository çağırsın.
- AVAILABILITY_BLOCKING_STATUSES helper'da kalır; repository parametre olarak alır.
- Half-open overlap geometry (`.lt(start)` + `.gt(end)`) repository içinde aynen.
- Throw mesajları (`"Rezervasyon kontrol hatası"`, `"Bu tarihler dolu"`) + log tag'leri (`❌ Conflict error:`, `❌ Manual conflict error:`) helper tarafında kalır.

**Etki:** `createReservation` AST contract'ı korunur — `checkReservationConflict` ve `checkManualBlockConflict` çağrı identifier'ları aynen kalır (helper-level çağrı). Sadece helper'ın iç implementation'ı değişir.

---

**FAZ 2 sonu. Repository pattern reservation domain'inde READ tarafında oturdu. Conflict extraction (FAZ 3) için onay bekliyorum.**
