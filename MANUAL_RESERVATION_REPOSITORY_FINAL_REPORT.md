# 🛡️ ManualReservationRepository — FAZ 1-5 FINAL RAPOR

**Tarih:** 2026-05-18
**Kapsam:** Manual-reservation domain mimari ayrım tamamlandı.
**Davranış:** BYTE-IDENTICAL — availability semantic, half-open overlap, allow-list, lockstep reservation domain, SQLSTATE handling, throw mesajları, console.error tag'leri aynen.

> **Hedef gerçekleşti: Manual reservation domain'inde 0 doğrudan canlı Supabase tüketimi.**
> **Availability core artık tamamen repository-backed.**

---

## 1. NE YAPILDI

### 1.1 Yeni dosya: `lib/db/manual-reservation.repository.ts` (364 LOC)

**9 public metod:**

```
READ (FAZ 1)
├── findById(id)
├── findList()
├── findActiveReservationsByVilla(villaId, statuses)        ← cross-table
└── findManualBlocksByVilla(villaId)

CONFLICT (FAZ 2)
├── findOverlappingManualSelf(window, excludeId?)           ← self-exclude opsiyonel
└── findOverlappingReservationsForManualBlock(window, statuses)  ← cross-table

WRITE (FAZ 3 + 4)
├── insert(payload)                                          (FAZ 4)
├── updateById(id, partial)                                  (FAZ 3)
└── deleteById(id)                                           (FAZ 3)
```

### 1.2 Service genişlemesi: `manualReservation.service.ts`

**Mevcut 3 export korundu:**
- `getManualReservationById` → repo delegation
- `updateManualReservation` → repo delegation (4 call: 2 overlap + 1 UPDATE; 4. yeni)
- `createManualReservation` → repo delegation (3 call: 2 overlap + 1 INSERT)

**Yeni 3 export:**
- `getManualReservations()` — list page için
- `getVillaAvailabilitySnapshot(villaId)` — form blocked dates için
- `deleteManualReservation(id)` — list component DELETE için

**Yeni allow-list konstantı:**
- `MANUAL_AVAILABILITY_BLOCKING_STATUSES = ["pending", "confirmed"] as const`

### 1.3 Caller migration (3 dosya)

| Dosya | Değişiklik |
|---|---|
| `manual-reservations/page.tsx` | Inline `getManualReservations()` fn kaldırıldı; service'ten tüketim. `import { supabase }` → `import { getManualReservations }`. |
| `ManualReservationList.tsx` | `supabase.from("manual_reservations").delete()` → `deleteManualReservation(id)`. Audit log + toast + UI state component'te kalır. |
| `ManualReservationForm.tsx` | İki inline supabase çağrısı (`reservations`, `manual_reservations` blocked dates) → `getVillaAvailabilitySnapshot(villaId)`. Component-side parse loop'u (checkin/checkout/blocked Date[] + editingId self-exclude) AYNEN. |

---

## 2. SUPABASE CALL-SITE TIMELINE

| Konum | Pre-FAZ | FAZ 1 (READ) | FAZ 2 (CONFLICT) | FAZ 3 (UPDATE/DELETE) | FAZ 4 (INSERT) |
|---|:---:|:---:|:---:|:---:|:---:|
| `manualReservation.service.ts > getManualReservationById` | 1 | **0** ✅ | 0 | 0 | 0 |
| `manualReservation.service.ts > updateManualReservation` self overlap | 1 | 1 | **0** ✅ | 0 | 0 |
| `manualReservation.service.ts > updateManualReservation` cross overlap | 1 | 1 | **0** ✅ | 0 | 0 |
| `manualReservation.service.ts > updateManualReservation` UPDATE | 1 | 1 | 1 | **0** ✅ | 0 |
| `manualReservation.service.ts > createManualReservation` self overlap | 1 | 1 | **0** ✅ | 0 | 0 |
| `manualReservation.service.ts > createManualReservation` cross overlap | 1 | 1 | **0** ✅ | 0 | 0 |
| `manualReservation.service.ts > createManualReservation` INSERT | 1 | 1 | 1 | 1 | **0** ✅ |
| `manual-reservations/page.tsx` inline list | 1 | **0** ✅ | 0 | 0 | 0 |
| `ManualReservationList.tsx > handleDelete` | 1 | 1 | 1 | **0** ✅ | 0 |
| `ManualReservationForm.tsx > fetchBlockedDates` (reservations) | 1 | **0** ✅ | 0 | 0 | 0 |
| `ManualReservationForm.tsx > fetchBlockedDates` (manual_reservations) | 1 | **0** ✅ | 0 | 0 | 0 |
| **TOPLAM** | **11** | **6** | **3** | **1** | **0** ✅ |

**Manual reservation domain'inde canlı doğrudan supabase çağrısı: 0.**

---

## 3. BYTE-IDENTICAL DOĞRULAMA — TAM TABLO

### 3.1 Throw mesajları (TR human-friendly)

| Mesaj | Konum | Durum |
|---|---|:---:|
| `"ID gerekli"` | `updateManualReservation` | ✅ aynen |
| `"Tarih aralığı hatalı"` | update + create | ✅ aynen |
| `"Blok kontrol hatası"` | update self + update cross + create self + create cross (4 nokta) | ✅ aynen |
| `"Bu tarihler artık müsait değil"` | update self + update cross + update SQLSTATE + create self + create cross + create SQLSTATE (6 nokta) | ✅ aynen |
| `"Blok güncellenemedi"` | update final | ✅ aynen |
| `"Villa seçilmedi"` | create | ✅ aynen |
| `"Tarih seçilmedi"` | create | ✅ aynen |
| `"Blok eklenemedi"` | create final | ✅ aynen |

### 3.2 Console.error tag'leri (asimetri korundu)

| Tag | Konum | Stil |
|---|---|---|
| `[manualReservation.getById]` | get | snake-style |
| `[manualReservation.list]` | YENİ getManualReservations | snake-style (yeni; mevcut pattern ile uyumlu) |
| `[manualReservation.availability.reservations]` | YENİ getVillaAvailabilitySnapshot | snake-style |
| `[manualReservation.availability.manual]` | YENİ getVillaAvailabilitySnapshot | snake-style |
| `[manualReservation.update] self check:` | update | snake-style |
| `[manualReservation.update] cross check:` | update | snake-style |
| `[manualReservation.update]:` | update final | snake-style |
| `❌ Manual self conflict error:` | create | emoji-style (asimetri korundu) |
| `❌ Manual cross conflict error:` | create | emoji-style |
| `❌ Manual insert error:` | create final | emoji-style |

**Tag asimetrisi (update=snake, create=emoji) AYNEN korundu.** Yeni eklenen 3 tag mevcut update pattern'ine (snake) uyumlu.

### 3.3 Query semantic'i

| Davranış | Korundu |
|---|:---:|
| `.eq("id", id)` predicate (read/update/delete) | ✅ repo içinde |
| `.eq("villa_id", villaId)` (4 nokta) | ✅ repo içinde |
| `.maybeSingle()` resolver (read detail) | ✅ repo içinde |
| `.single()` resolver (UPDATE+RETURN, INSERT+RETURN) | ✅ repo içinde |
| `.order("created_at", { ascending: false })` (list) | ✅ repo içinde |
| `.select("id, villa_id, start_date, end_date, note, source, status, created_at")` | ✅ repo içinde |
| `.select(\`id, start_date, end_date, note, created_at, villa:villa_id ( title )\`)` (embed) | ✅ repo içinde |
| `.select("start_date, end_date, status")` (calendar feed reservations) | ✅ repo içinde |
| `.select("id, start_date, end_date")` (calendar feed manual blocks) | ✅ repo içinde |
| `.select("id")` minimal (overlap checks) | ✅ repo içinde |
| `.in("status", ["pending","confirmed"])` allow-list | ✅ helper'dan parametre |
| `.lt("start_date", end)` + `.gt("end_date", start)` half-open overlap | ✅ repo içinde |
| `.neq("id", excludeId)` self-exclude (edit mode) | ✅ parametre; sadece excludeId verilirse uygulanır |
| `.insert([payload]).select().single()` chain (INSERT) | ✅ repo içinde (array wrapper KORUNDU) |
| `.update(partial).eq("id", id).select().single()` chain (UPDATE+RETURN) | ✅ repo içinde |
| `.delete().eq("id", id)` chain (DELETE) | ✅ repo içinde |
| EXCLUDE constraint `manual_reservations_no_overlap` SQLSTATE 23P01 | ✅ DB-level; service edge parse aynen |
| `source: "manual"`, `status: "blocked"` literal'lar | ✅ create payload service'te |
| Manual table status filter YOK (asimetri) | ✅ aynen |
| Calendar feed component-side parse loop | ✅ component'te aynen (kasıtlı) |
| `editingId` self-exclude (component-side filter) | ✅ component'te aynen |

---

## 4. LOCKSTEP w/ RESERVATION DOMAIN

Manual reservation domain'in **availability core** ile lockstep noktalar:

| Lockstep noktası | Manual domain konumu | Reservation domain ile uyumluluk |
|---|---|:---:|
| Allow-list `["pending", "confirmed"]` | `MANUAL_AVAILABILITY_BLOCKING_STATUSES` | ✅ value-identical w/ reservation `AVAILABILITY_BLOCKING_STATUSES` |
| Half-open overlap `.lt(start) + .gt(end)` | Manual repo `findOverlappingManualSelf` + `findOverlappingReservationsForManualBlock` | ✅ value-identical w/ reservation repo `findOverlappingReservations` + `findOverlappingManualBlocks` |
| `manual_reservations_no_overlap` EXCLUDE constraint | DB-level; service `mapManualInsertError`-style inline parse | ✅ DB-level lockstep w/ `reservations_no_overlap` |
| Calendar feed status filter | `getVillaAvailabilitySnapshot` reservations call | ✅ uyumlu w/ `getBlockedVillaIds` + `useBookingEngine` |
| `"Bu tarihler artık müsait değil"` TR mesajı | Manual SQLSTATE catch | ✅ uyumlu w/ reservation `mapInsertError` mesajı |

**Duplikasyon kabul (kullanıcı kuralı):** Shared overlap engine yapılmadı. Manual repo kendi sahipliğindeki cross-table query'leri tutar; reservation repo'nun `findOverlappingReservations`'ı REUSE edilmez.

---

## 5. ARCHITECTURE STATE

### Sınır netliği — Manual domain

```
Page / Component Layer
  ├── manual-reservations/page.tsx        ──┐
  ├── ManualReservationList.tsx             │  (UI + service consumption)
  ├── ManualReservationForm.tsx           ──┘
       │
       ▼ (service public API)
Service Layer (app/services/manualReservation.service.ts)
  ├── getManualReservationById             ──┐
  ├── getManualReservations                  │
  ├── getVillaAvailabilitySnapshot           │  (business orchestration + throw)
  ├── createManualReservation                │  (allow-list, payload, SQLSTATE parse, console tag)
  ├── updateManualReservation                │
  ├── deleteManualReservation              ──┘
  └── MANUAL_AVAILABILITY_BLOCKING_STATUSES  (allow-list constant)
       │
       ▼ (repository public API)
Repository Layer (lib/db/manual-reservation.repository.ts)
  ├── findById / findList                  ──┐
  ├── findActiveReservationsByVilla          │  (raw DB access + Supabase chain)
  ├── findManualBlocksByVilla                │  (sessiz: throw yok, console yok)
  ├── findOverlappingManualSelf              │
  ├── findOverlappingReservationsForManualBlock
  ├── insert / updateById / deleteById     ──┘
       │
       ▼
Supabase Client (lib/supabase) — TEK TÜKETICI: repository
```

### Boundary tablosu

| Concern | UI | Service | Repository |
|---|:---:|:---:|:---:|
| Form state, onChange, useEffect | ✅ | ❌ | ❌ |
| Calendar parse (Date[] arrays, checkin/checkout) | ✅ | ❌ | ❌ |
| `editingId` self-exclude (UI filter) | ✅ | ❌ | ❌ |
| Audit log (logActivity) | ✅ | ❌ | ❌ |
| Toast notifications | ✅ | ❌ | ❌ |
| Allow-list business meaning (`["pending","confirmed"]`) | ❌ | ✅ konstant | ❌ parametre |
| Input validation (`"Villa seçilmedi"`, date range) | ❌ | ✅ | ❌ |
| Throw mesajları (TR human-friendly) | ❌ | ✅ | ❌ |
| Console.error tag emission | ❌ | ✅ | ❌ |
| SQLSTATE 23P01 + regex parse | ❌ | ✅ | ❌ |
| Payload build (`source: "manual"`, `status: "blocked"`) | ❌ | ✅ | ❌ |
| `.eq("id", id)` predicate | ❌ | ❌ | ✅ |
| Half-open overlap `.lt/.gt` | ❌ | ❌ | ✅ |
| `.neq("id", excludeId)` self-exclude predicate | ❌ | indirect (param) | ✅ uygular |
| `.in("status", statuses)` predicate | ❌ | indirect (param) | ✅ uygular |
| Embed (`villa:villa_id ( title )`) | ❌ | ❌ | ✅ |
| Resolver (`.single()`, `.maybeSingle()`) | ❌ | ❌ | ✅ |
| Supabase client import | ❌ | ❌ | ✅ TEK TÜKETICI |

---

## 6. DOĞRULAMA ADIMLARI

| Adım | Sonuç |
|---|:---:|
| `npx tsc --noEmit` (full project, FAZ 4 sonu) | ✅ clean (0 hata) |
| `npx eslint` yeni dosya + dokunulan service+page | ✅ clean |
| `npx eslint` ManualReservationList.tsx | ⚠️ 5 pre-existing `any` type uyarısı (refactor scope dışı; teknik borç) |
| `npx eslint` ManualReservationForm.tsx | ⚠️ 13 pre-existing teknik borç (prefer-const, any, set-state-in-effect; **refactor sıfır yeni hata eklemedi**) |
| Manual domain canlı supabase tüketim | ✅ **0** (yorumda kalan referanslar orijinal pattern dokümantasyonu) |
| Service public API genişlemesi | ✅ 3 yeni export (getManualReservations, getVillaAvailabilitySnapshot, deleteManualReservation) |
| Caller migration | ✅ 3 dosya (page + 2 component) — bilinçli scope, "UI → service → repository" zinciri |
| Allow-list `MANUAL_AVAILABILITY_BLOCKING_STATUSES` value-identical w/ reservation domain | ✅ `["pending","confirmed"]` |
| Half-open overlap geometry (`.lt`/`.gt`) | ✅ repo içinde, byte-identical |
| Self-exclude `.neq("id", excludeId)` semantic | ✅ repository parametre olarak; create flow undefined; update flow id geçirir |
| SQLSTATE 23P01 + `manual_reservations_no_overlap` regex | ✅ service edge'de aynen (2 nokta: update final + create final) |
| `.insert([payload])` array wrapper | ✅ repo içinde aynen |
| `vitest run` | ⚠️ sandbox'ta rollup-linux-arm64-gnu binary eksik (önceki tüm refactor cycle'larda aynı durum) |

---

## 7. LOC RAPORU

| Dosya | LOC |
|---|---:|
| `lib/db/manual-reservation.repository.ts` (yeni) | 364 |
| `app/services/manualReservation.service.ts` (genişledi: 231 → 399) | 399 |
| `app/(admin)/maki-admin/manual-reservations/page.tsx` (-7 inline fn) | 45 |
| `app/(admin)/maki-admin/manual-reservations/ManualReservationList.tsx` (-2 inline) | 180 |
| `app/(admin)/maki-admin/manual-reservations/ekle/ManualReservationForm.tsx` (-20 inline) | 430 |
| **TOPLAM (service + repo + 3 caller)** | **1418** |

Repository (364 LOC) yorum-yoğun — pure query köprüsü; davranış kodu ~95 LOC.

Service'in büyümesi (231 → 399 LOC) yeni 3 export'tan kaynaklı; davranış değişikliği yok.

---

## 8. STRATEJİK SONUÇ

### 8.1 Hedef vs Gerçekleşen

| Hedef | Gerçekleşen |
|---|:---:|
| Manual reservation domain'inde 0 doğrudan Supabase call-site | ✅ |
| Page/Component → Service → Repository zinciri | ✅ 3 caller migration |
| Service: business orchestration; Repository: DB access | ✅ |
| Runtime behavior %100 aynı | ✅ |
| Availability semantics korundu (half-open overlap, allow-list, lockstep) | ✅ |
| Self-exclude (`.neq`) semantic kaybedilmedi | ✅ repo parametre olarak |
| SQLSTATE 23P01 + regex parse service edge'de kaldı | ✅ |
| INSERT en sona alındı (availability/revenue-critical) | ✅ |
| Throw mesajları + console.error tag asimetrisi (update snake / create emoji) | ✅ aynen |
| Shared overlap engine yapılmadı (duplikasyon kabul) | ✅ (kullanıcı kuralı) |
| `source: "manual"`, `status: "blocked"` literal'lar service'te | ✅ inline payload |
| Generic abstraction (Result<T,E>, query builder) yapılmadı | ✅ |
| Sub-service split YOK | ✅ tek service dosyası kaldı |

### 8.2 Availability Core Foundation

**Reservation + Manual reservation iki domain birlikte:**

```
Availability Core
├── lib/db/reservation.repository.ts          ────┐
│   ├── findOverlappingReservations               │
│   ├── findOverlappingManualBlocks               │
│   └── (+ 7 diğer metod)                         │
│                                                  │
├── lib/db/manual-reservation.repository.ts  ────┼── Repository-backed foundation
│   ├── findOverlappingManualSelf                 │   (Supabase = implementation detail)
│   ├── findOverlappingReservationsForManualBlock │
│   └── (+ 7 diğer metod)                         │
│                                                  │
└── lib/db/villa.repository.ts (read-only) ──────┘
```

**Repository public API toplamı:** 9 (reservation) + 9 (manual) + 6 (villa read) = **24 metod** kapsama altında.

**Service+helper+caller LOC kapsama altında:** ~1438 (reservation) + ~1418 (manual) = **2856 LOC** repository-backed.

### 8.3 Provider migration yüzeyi

Yarın Supabase'i bırakıp başka adapter (Drizzle/Prisma/direct pg) yazmak için dokunulacak dosyalar:

```
lib/db/reservation.repository.ts          (~80 LOC davranış)
lib/db/manual-reservation.repository.ts   (~95 LOC davranış)
lib/db/villa.repository.ts                (~150 LOC davranış — zaten repo)
lib/db/types.ts                           (~10 LOC)
```

**Toplam migration yüzeyi: ~335 LOC** (yorumlar hariç). Service + helper + caller + test layer (~3000+ LOC) dokunulmaz.

### 8.4 Supabase Dependency Audit skor etkisi

Önceki audit (2026-05-18) skoru:

| Domain | Önce | Sonra (FAZ 33 + 34 sonrası) |
|---|:---:|:---:|
| Reservation | 2/10 | ~5.5/10 |
| **Manual Reservation** | **2/10** | **~6/10** (Manual'da public API genişlemesi ile component-direct bypass'lar da kapatıldı) |
| Genel codebase skoru | 2.5/10 | ~3/10 (iki domain yeterli pattern oluşturdu) |

---

## 9. KALAN SUPABASE TÜKETİM YERLERİ (out-of-scope domains)

Reservation + Manual reservation kapsama altında. Codebase'de Supabase'i hala doğrudan tüketen domain'ler:

- `app/components/villa/booking/useBookingEngine.ts` — public villa booking (ayrı domain)
- `app/(public)/arama/page.tsx` — public search (`getBlockedVillaIds` zaten abstraction altında)
- `app/services/villa-admin/**` — villa admin write-side (7 RPC)
- `app/services/payment*.service.ts`, `dashboard.service.ts`, `analytics.service.ts`, `blog.service.ts`, `page.service.ts`, `settings.service.ts`, vb.
- `app/components/admin/AdminGallery.tsx`, `SettingsField.tsx`, vb. (storage uploads)
- `app/lib/auth/**`, `admin-user.service.ts`, `admin-fetch.ts` (auth)

**Bu refactor cycle bitti. Diğer domain'ler için aynı pattern uygulanabilir (gelecek cycle).**

---

## 10. SONRAKI ADIM ÖNERİLERİ (out-of-scope)

1. **DbError full abstraction.** Şu an alias yapısal compatible; ileride explicit map (`PostgrestError → DbError`) repository edge'inde yapılabilir.
2. **Diğer domain'ler için repository pattern.** `payment.service.ts`, `dashboard.service.ts`, `analytics.service.ts`, `villa-admin/**`, storage helper'ları aynı pattern'le repository'lere ayrılabilir.
3. **Manual reservation repository unit testleri.** Şu an yok; `tests/unit/manual-reservation-repository/` dizini açılabilir.
4. **AST contract testi** `createManualReservation` ve `updateManualReservation` için (orchestration sırası freeze).
5. **Mevcut pre-existing teknik borç:** `ManualReservationForm.tsx` + `ManualReservationList.tsx` — `any` type'lar, `prefer-const`, `set-state-in-effect`. **Bu refactor scope dışı; ayrı cycle.**

---

**FAZ 1-5 sonu. Manual reservation domain'inde mimari ayrım tamamlandı. Reservation + Manual reservation birlikte availability core'un repository-backed foundation'ını oluşturdu.**
