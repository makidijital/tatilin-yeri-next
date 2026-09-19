# 🛡️ ManualReservationRepository — FAZ 0: READ-ONLY MAPPING

**Tarih:** 2026-05-18
**Kapsam:** Manual-reservation domain mimari ayrım hazırlığı.
**Durum:** Mapping tamamlandı; kod yazılmadı; FAZ 1'e geçiş hazır.
**Davranış kuralı:** BYTE-IDENTICAL — availability semantic, half-open overlap, allow-list, lockstep ile reservation domain.

---

## 0. SCOPE TANIMI

**Manual-reservation domain** = aşağıdaki dosya kümesi:

```
app/services/manualReservation.service.ts                       (231 LOC, 3 export, 7 supabase call)
app/(admin)/maki-admin/manual-reservations/
  ├── page.tsx                                                  (1 supabase call — list fetch)
  ├── ManualReservationList.tsx                                 (1 supabase call — DELETE component-direct)
  ├── [id]/page.tsx                                             (caller — villa fetch villa-domain)
  └── ekle/
      ├── page.tsx                                              (caller — villa fetch villa-domain)
      └── ManualReservationForm.tsx                             (2 supabase call — blocked dates UI)
```

**Scope dışı** (başka domain'ler — bu refactor dokunmaz):
- `app/components/villa/booking/useBookingEngine.ts` — public villa booking; ayrı domain.
- `app/(public)/arama/page.tsx` — `getBlockedVillaIds` (lib/availability.helper) zaten abstraction altında.
- `[id]/page.tsx` + `ekle/page.tsx`'deki villa fetch'leri — villa repository konusu.
- `villa-admin/hard-delete.service.ts` referansı — sadece yorumda; etkilenmiyor.

---

## 1. SERVICE ENVANTERİ (`app/services/manualReservation.service.ts`)

### 1.1 Exports (3 fonksiyon)

| Export | Imza | Açıklama |
|---|---|---|
| `getManualReservationById` | `(id: string) => Promise<row \| null>` | Admin edit form hidrate; 7 alan select |
| `updateManualReservation` | `(id, partial) => Promise<row>` | Edit save; **self+cross overlap check** + UPDATE |
| `createManualReservation` | `(data) => Promise<row>` | INSERT; **self+cross overlap check** + INSERT |

**DELETE export YOK** — `ManualReservationList.tsx` doğrudan supabase çağırıyor (component-direct bypass). Bu refactor'da kapatılacak.

### 1.2 Supabase call-site'lar (service içinde, 7 nokta)

| # | Konum | Tür | Tablo | Pattern |
|---:|---|---|---|---|
| 1 | L19 — `getManualReservationById` | READ-1 | `manual_reservations` | `.select("id, villa_id, start_date, end_date, note, source, status, created_at").eq("id", id).maybeSingle()` |
| 2 | L62 — `updateManualReservation` self check | READ-N | `manual_reservations` | `.select("id").eq("villa_id").neq("id", id).lt("start_date", end).gt("end_date", start)` |
| 3 | L80 — `updateManualReservation` cross check | READ-N | `reservations` | `.select("id").eq("villa_id").in("status", ["pending","confirmed"]).lt().gt()` |
| 4 | L104 — `updateManualReservation` | UPDATE+RETURN | `manual_reservations` | `.update(payload).eq("id", id).select().single()` |
| 5 | L152 — `createManualReservation` self check | READ-N | `manual_reservations` | `.select("id").eq("villa_id").lt().gt()` (no .neq — create, not edit) |
| 6 | L177 — `createManualReservation` cross check | READ-N | `reservations` | aynı (2) ile |
| 7 | L208 — `createManualReservation` | INSERT+RETURN | `manual_reservations` | `.insert([payload]).select().single()` |

### 1.3 Critical patterns

**Half-open overlap (lockstep w/ reservation domain):**
```
.lt("start_date", window.end_date)
.gt("end_date", window.start_date)
```

**Status allow-list (cross-table check):**
```
.in("status", ["pending", "confirmed"])
```

**SELF-exclude (edit mode only):**
```
.neq("id", id)
```

**SQLSTATE 23P01 parse (concurrent race):**
```
(error as { code?: string }).code === "23P01"
  || /manual_reservations_no_overlap/i.test(error.message || "")
→ throw "Bu tarihler artık müsait değil"
```

### 1.4 Console.error tag'leri (5 farklı)

| Tag | Konum |
|---|---|
| `[manualReservation.getById]` | L27 (get) |
| `[manualReservation.update] self check:` | L70 (update self overlap) |
| `[manualReservation.update] cross check:` | L88 (update cross overlap) |
| `[manualReservation.update]:` | L111 (update final error) |
| `❌ Manual self conflict error:` | L160 (create self overlap) |
| `❌ Manual cross conflict error:` | L186 (create cross overlap) |
| `❌ Manual insert error:` | L214 (create insert) |

**Tag asimetrisi:** update flow `[manualReservation.*]` snake-style, create flow `❌ Manual ...` emoji-style. **Refactor scope dışı; korunacak (byte-identical disiplini).**

### 1.5 Throw mesajları (TR)

| Mesaj | Konum |
|---|---|
| `"ID gerekli"` | update L51 |
| `"Tarih aralığı hatalı"` | update L57, create L139 |
| `"Blok kontrol hatası"` | update self L72, update cross L89 |
| `"Bu tarihler artık müsait değil"` | update self L74, update cross L92, update SQLSTATE L117, create self L166, create cross L192, create SQLSTATE L220 |
| `"Blok güncellenemedi"` | update L119 |
| `"Villa seçilmedi"` | create L132 |
| `"Tarih seçilmedi"` | create L134 |
| `"Blok eklenemedi"` | create L222 |
| `"Bu tarihler dolu"` (reservation domain) | YOK — manual domain `"Bu tarihler artık müsait değil"` kullanır |

**Mesaj asimetrisi 2:** Create flow `"Bu tarihler artık müsait değil"` SQLSTATE branch'inde DE kullanılıyor; reservation domain (`mapInsertError`) `"Bu tarihler artık müsait değil"` aynı mesajı kullanıyor. **Tutarlı; korunacak.**

---

## 2. COMPONENT/PAGE LAYER SUPABASE CALL-SITE'LARI

### 2.1 `manual-reservations/page.tsx` (admin list)

```ts
async function getManualReservations() {
  const { data, error } = await supabase
    .from("manual_reservations")
    .select(`id, start_date, end_date, note, created_at, villa:villa_id ( title )`)
    .order("created_at", { ascending: false });
  ...
}
```

**Inline page-level fetch fn.** Service'te `getManualReservations` export'u YOK. Bu refactor'da:
- Service'e `getManualReservations()` export'u eklenecek (RSC server-action olarak çağrılacak)
- Page sadece service'ten tüketecek
- Embed `villa:villa_id (title)` repository içinde aynen

### 2.2 `ManualReservationList.tsx` (admin list component)

```ts
const handleDelete = async (id: string) => {
  ...
  const { error } = await supabase
    .from("manual_reservations")
    .delete()
    .eq("id", id);
  ...
};
```

**Component-direct DB tunnel.** Service'te `deleteManualReservation` export'u YOK. Bu refactor'da:
- Service'e `deleteManualReservation(id)` export'u eklenecek
- Component sadece service'ten tüketecek
- console.error + audit log component'te kalır

### 2.3 `ManualReservationForm.tsx` (form blocked-dates fetch)

```ts
const { data: reservations } = await supabase
  .from("reservations")
  .select("start_date, end_date, status")
  .eq("villa_id", selectedVilla)
  .in("status", ["pending", "confirmed"]);

const { data: manual } = await supabase
  .from("manual_reservations")
  .select("id, start_date, end_date")
  .eq("villa_id", selectedVilla);
```

**Component-direct DB tunnel.** Calendar coupling — `ReservationCalendar`'a blocked dates feed ediliyor. Service'te availability snapshot export'u YOK. Bu refactor'da:
- Service'e `getVillaAvailabilitySnapshot(villaId, opts?: { excludeManualId? })` export'u eklenecek
- Veya iki ayrı fn: `getActiveReservationsByVilla(villaId)` + `getManualBlocksByVilla(villaId)`
- Component sadece service'ten tüketecek
- **Editing self-exclude pattern:** Component'te `editingId` ile filter mevcut; bu **service'ten dönen ham veri üzerinde component yapar** (component-level filter, service ham verir) **VEYA** service-level filter (`opts.excludeManualId`). İki yol da byte-identical; tercih ikinci (daha temiz boundary).

**Lockstep contract:** Bu fetch'in status allow-list (`["pending", "confirmed"]`) + manual_reservations tüm row'lar = `lib/availability.helper.ts > getBlockedVillaIds` ile aynı semantic. Drift yasak.

---

## 3. CROSS-TABLE COUPLING — RESERVATION DOMAIN'I İLE LOCKSTEP

Manual domain `reservations` tablosuna **3 noktada** bakıyor:

| # | Konum | Predicate |
|---:|---|---|
| 1 | Service L80 — update cross-check | `.in("status", ["pending","confirmed"]).lt().gt()` |
| 2 | Service L177 — create cross-check | aynı |
| 3 | Form L120-124 — blocked dates fetch | `.in("status", ["pending","confirmed"])` (no overlap predicate; tüm villa rezervasyonları) |

Reservation repository'de bu pattern için zaten `findOverlappingReservations(window, statuses)` var (FAZ 3 — reservation extraction). **Manuel domain bunu reuse edebilir** — ama kullanıcının kuralı: **"Shared overlap engine YAPMA. Reservation domain ile duplicate logic olsa bile: şimdilik exact extraction yap."**

### 3.1 Karar: SHARED REUSE YAPILMAYACAK

**Manuel reservation repository kendi cross-table query'lerini barındıracak.** Reservation repository'sinin `findOverlappingReservations`'ı çağrılmayacak. Duplikasyon kabul edilir; ileride consolidation ayrı bir refactor cycle.

**Gerekçe:**
- Aggregate boundary netliği — manual repo "manual reservation flow'unun ihtiyacı" olan her şeyi kendi sahiplensin.
- Cross-table query'nin **kullanım context'i farklı**: reservation domain için "üçüncü taraf rezervasyon yaptırırken çakışma var mı"; manuel domain için "admin blok eklerken çakışan rezervasyon var mı" — semantik aynı ama policy/error mesajları farklı (`"Bu tarihler dolu"` vs `"Bu tarihler artık müsait değil"`).
- Şimdilik exact extraction; ileride genel `BlockedVillaService` veya `availability adapter` ayrı bir karar.

---

## 4. CALENDAR COUPLING (blocked dates flow)

`ManualReservationForm.tsx` → `ReservationCalendar.tsx` pipeline:

```
selectedVilla değişti
    │
    ▼
useEffect fetch
    │  reservations.in(pending,confirmed) + manual_reservations(all)
    │
    ▼
parse to Date[] (checkin/checkout/blocked/pending* arrays)
    │
    ▼
<ReservationCalendar
  blocked={...}
  checkin={...}
  checkout={...}
  pending*={...}
  ...
/>
```

**Lockstep noktalar:**
- Status allow-list `["pending", "confirmed"]` — reservation domain conflict helper + availability.helper.ts + booking engine ile **aynı tuple**.
- Manual blokların TAMAMI listelenir (status filter yok) — manual asimetrisi: reservation overlap için status allow-list var, manual için yok.
- `editingId` self-exclude — edit mode'da mevcut blok kendi takvimini bloklamasın diye.

**Kritik kural:** Bu flow'da görselleştirilen blocked dates ile service-side overlap check (`createManualReservation`, `updateManualReservation`) **lockstep**. Kullanıcı UI'da blocked görünen bir tarihi seçemez; ama yine de seçse bile service-side overlap throw eder; ama yine de race olursa DB-level EXCLUDE constraint atomic yakalar.

---

## 5. AGGREGATE BOUNDARY KARARI

**Manual reservation aggregate'inin DB sahipliği:**

- ✅ `manual_reservations` (own table)
- ✅ `reservations` (cross-table, status filter ile — manual flow'un cross-check ve calendar feed ihtiyacı için)

Diğer tablolara (`villa.*`, `payment_methods.*`, etc.) manual reservation domain dokunmuyor — bu iki tablo aggregate boundary'sini tanımlıyor.

---

## 6. REPOSITORY BOUNDARY TASARIMI

### 6.1 Lokasyon

```
lib/db/manual-reservation.repository.ts
```

`lib/db/reservation.repository.ts` pattern'iyle paralel.

### 6.2 Public API (minimal kontrat — 7 metod)

```ts
export const manualReservationRepository = {
  // —————————— READ ——————————
  findById(id: string)
    → .from("manual_reservations").select(SELECT_FIELDS).eq("id", id).maybeSingle()

  findList()
    → .from("manual_reservations").select(SELECT_LIST_WITH_VILLA).order("created_at", { ascending: false })

  findActiveReservationsByVilla(villaId: string, statuses: readonly string[])
    → .from("reservations").select("start_date, end_date, status").eq("villa_id", villaId).in("status", statuses)
    // ⚠️ Cross-table; manual aggregate'inin calendar feed ihtiyacı

  findManualBlocksByVilla(villaId: string)
    → .from("manual_reservations").select("id, start_date, end_date").eq("villa_id", villaId)

  // —————————— CONFLICT ——————————
  findOverlappingManualSelf(window, excludeId?: string)
    → .from("manual_reservations").select("id").eq("villa_id").{maybe .neq("id", excludeId)}.lt().gt()
    // ⚠️ excludeId verilirse self-exclude; verilmezse create flow

  findOverlappingReservationsForManualBlock(window, statuses: readonly string[])
    → .from("reservations").select("id").eq("villa_id").in("status", statuses).lt().gt()
    // ⚠️ Cross-table — manual flow'un kendi cross-check'i (reservation domain'in metodu reuse EDİLMEZ)

  // —————————— WRITE ——————————
  insert(payload: Record<string, unknown>)
    → .from("manual_reservations").insert([payload]).select().single()

  updateById(id: string, partial: Record<string, unknown>)
    → .from("manual_reservations").update(partial).eq("id", id).select().single()

  deleteById(id: string)
    → .from("manual_reservations").delete().eq("id", id)
};
```

**9 metod toplam.** Reservation repository'sine (9 metod) paralel ama kendi cross-table ihtiyaçları için ayrı.

### 6.3 Boundary tablosu (kim ne yapar)

| Concern | Service / Caller | Repository |
|---|:---:|:---:|
| Input validation (`"ID gerekli"`, `"Villa seçilmedi"`, `"Tarih seçilmedi"`, `"Tarih aralığı hatalı"`) | ✅ | ❌ |
| Status allow-list `["pending","confirmed"]` business meaning | ✅ (service inline / helper) | ❌ (parametre alır) |
| Cross-table cross-check policy | ✅ | ❌ (sadece query) |
| Self-exclude semantic (edit mode) | ✅ (service kararı, excludeId parametre) | ❌ |
| Throw `"Bu tarihler artık müsait değil"` / `"Blok kontrol hatası"` / `"Blok eklenemedi"` / `"Blok güncellenemedi"` | ✅ | ❌ |
| SQLSTATE 23P01 parse + `manual_reservations_no_overlap` regex | ✅ | ❌ |
| Console.error tag'leri (5 farklı) | ✅ | ❌ |
| Half-open overlap geometry (.lt/.gt) | indirect (parametre) | ✅ uygular |
| `.in("status", statuses)` predicate | indirect (parametre) | ✅ uygular |
| `.neq("id", excludeId)` self-exclude predicate | indirect (parametre) | ✅ uygular |
| Calendar feed parse (Date[] arrays, checkin/checkout/blocked) | ✅ (component) | ❌ |
| INSERT `source: "manual"`, `status: "blocked"` literal values | ✅ (payload helper veya inline) | ❌ |
| Supabase client tüketimi | ❌ | ✅ TEK TÜKETICI |

### 6.4 Service genişlemesi (yeni 3 export)

Mevcut 3 export + yeni 3 export = 6 toplam:

```
KORUNAN:
  getManualReservationById(id)
  updateManualReservation(id, partial)
  createManualReservation(data)

YENİ:
  getManualReservations()                         // page.tsx için
  deleteManualReservation(id)                     // ManualReservationList component için
  getVillaAvailabilitySnapshot(villaId, opts?)    // ManualReservationForm component için
```

Service genişlemesi caller migration gerektirir — page + 2 component'in inline supabase çağrılarını service'ten almasına çevrilir. **Bu bilinçli ve istenen değişiklik** (kullanıcı kuralı: "UI/page → service orchestration → repository boundary").

---

## 7. AST CONTRACT / TEST IMPACT MATRIX

Mevcut testler:

| Test | Etki |
|---|---|
| `tests/unit/reservation-service/*` | ❌ Etkilenmez (farklı domain) |
| `tests/unit/manual-reservation/` | ❌ YOK — bu refactor'da eklenecek |

**Manuel reservation domain'inde mevcut AST contract testi YOK.** Bu, refactor'un test stratejisini farklı kılar:
- Bu refactor'da yeni helper unit testler eklenecek (overlap check, payload build).
- Repository-mock'lu service delegation testleri eklenecek.
- AST contract testi açma kararı: orchestration sırası (validate → self-overlap → cross-overlap → INSERT/UPDATE) freeze edilmeli — INSERT FAZ'ında ekleyeceğim.

---

## 8. RİSK ANALİZİ

| Risk | Olasılık | Etki | Mitigasyon |
|---|:---:|:---:|---|
| Half-open overlap drift (`.lt`/`.gt`) | 🟢 DÜŞÜK | 🔴 KRİTİK | Repository içinde aynen; helper unit testle freeze |
| Status allow-list `["pending","confirmed"]` drift | 🟢 DÜŞÜK | 🔴 KRİTİK | Allow-list service tarafında, repository parametre |
| Self-exclude `.neq("id", id)` drift (edit mode) | 🟡 ORTA | 🟠 ORTA | excludeId parametre olarak repository'ye; explicit test |
| SQLSTATE 23P01 + `manual_reservations_no_overlap` regex drift | 🟢 DÜŞÜK | 🔴 KRİTİK | Service edge'de aynen (`mapManualInsertError` benzeri helper'a çıkarılabilir veya inline kalır) |
| `source: "manual"`, `status: "blocked"` literal drift | 🟢 DÜŞÜK | 🟠 ORTA | INSERT payload helper'a çıkarılır (`buildCreateManualPayload`); literal'lar tek noktada |
| Calendar feed lockstep (`useBookingEngine` + `availability.helper.ts`) | 🟢 DÜŞÜK | 🟠 ORTA | Bu refactor `useBookingEngine`'e dokunmuyor; ManualReservationForm fetch repository'ye taşınırken status allow-list + manual all-rows pattern aynen |
| `editingId` self-exclude semantic kaybı | 🟡 ORTA | 🟠 ORTA | `getVillaAvailabilitySnapshot(villaId, { excludeManualId })` opt'u olarak; repository `excludeId` parametre alır |
| Component-direct DELETE → service migration audit log etkisi | 🟡 ORTA | 🟠 ORTA | `ManualReservationList`'teki `logActivity` audit log component'te kalır; service sadece DB delete'i yapar |
| Console.error tag asimetrisi | 🟢 DÜŞÜK | 🟢 DÜŞÜK | 5 farklı tag; hepsi service tarafında aynen |
| Throw mesajı asimetrisi (`"Bu tarihler artık müsait değil"` 6 noktada) | 🟢 DÜŞÜK | 🟠 ORTA | Tüm noktalarda aynen korunacak; explicit test |
| TS variance / over-engineering | 🟢 DÜŞÜK | 🟢 DÜŞÜK | Reservation pattern'i ile aynı disiplin; 9 metod explicit |
| Caller migration breakage | 🟡 ORTA | 🟠 ORTA | page + 2 component değişecek; **bu bilinçli scope**. tsc + eslint zorunlu. |
| INSERT atomic guarantee (`manual_reservations_no_overlap` EXCLUDE) | 🟢 DÜŞÜK | 🔴 KRİTİK | DB-level — değişmez. Repository sadece `.insert(payload).select().single()` chain'i koruyacak. |

---

## 9. EXTRACTION PLANI

### FAZ 1 — READ (lowest risk)
**Repository metodları:**
- `findById(id)`
- `findList()` (with villa embed)
- `findActiveReservationsByVilla(villaId, statuses)`
- `findManualBlocksByVilla(villaId)`

**Service genişlemesi:**
- `getManualReservations()` export (page için)
- `getVillaAvailabilitySnapshot(villaId, opts?)` export (form için)
- Mevcut `getManualReservationById` → repository delegation

**Caller migration:**
- `manual-reservations/page.tsx` inline fn → service'ten tüket
- `ManualReservationForm.tsx` inline fetch → service'ten tüket

**Beklenen:** tsc + eslint clean. Davranış byte-identical.

### FAZ 2 — CONFLICT/OVERLAP
**Repository metodları:**
- `findOverlappingManualSelf(window, excludeId?)`
- `findOverlappingReservationsForManualBlock(window, statuses)`

**Service helper'a çıkarma (opsiyonel):**
- `_helpers/conflict.ts` — `checkManualSelfConflict`, `checkManualCrossConflict`
- Veya: inline service body'de — reservation pattern'i ile uyumlu olmak için **helper extraction tercih edilir**.

**Service delegation:**
- `updateManualReservation`: iki cross/self check repository'ye
- `createManualReservation`: iki cross/self check repository'ye

**Helper unit testler:** overlap geometry + status allow-list + self-exclude + throw mesajları (vitest mock).

### FAZ 3 — UPDATE/DELETE
**Repository metodları:**
- `updateById(id, partial)`
- `deleteById(id)`

**Service genişlemesi:**
- `deleteManualReservation(id)` export

**Caller migration:**
- `ManualReservationList.tsx > handleDelete` → service'ten tüket

**Service delegation:**
- `updateManualReservation`: final UPDATE repository'ye
- SQLSTATE 23P01 parse service edge'de aynen

### FAZ 4 — INSERT (revenue/availability-critical)
**Repository metodu:**
- `insert(payload)`

**Service helper'a çıkarma:**
- `_helpers/payload-create.ts` — `buildCreateManualPayload({ data })` (3 alan + `source: "manual"` + `status: "blocked"` literal'lar)
- `_helpers/errors.ts` — `mapManualInsertError(error)` (SQLSTATE 23P01 / regex)

**Service delegation:**
- `createManualReservation`: INSERT repository'ye
- SQLSTATE handling service edge'de

**AST contract:** `createManualReservationOrchestrationContract.test.ts` ile orchestration sırası freeze (validate → self overlap → cross overlap → INSERT → SQLSTATE catch).

### FAZ 5 — Final
- tsc full project
- eslint full project
- Reservation domain canlı supabase tüketimi: 0 doğrulama
- Manual reservation domain canlı supabase tüketimi: 0 doğrulama
- LOC raporu
- Manual-reservation final raporu

---

## 10. NIHAİ KARARLAR (özet)

1. ✅ Repository path: **`lib/db/manual-reservation.repository.ts`** (reservation pattern paralel).
2. ✅ Public API: **9 metod** (4 read + 2 conflict + 3 write).
3. ✅ Return shape: **`{ data, error }`** (Supabase native; `DbError` alias kullan).
4. ✅ `mapManualInsertError` helper'a çıkarılır (`_helpers/errors.ts`); repository SQLSTATE bilmez.
5. ✅ Cross-table reservation query'leri **manual repo kendi sahiplenir**; reservation repo reuse YAPILMAZ (kullanıcı kuralı).
6. ✅ Service genişlemesi: 3 yeni export (`getManualReservations`, `deleteManualReservation`, `getVillaAvailabilitySnapshot`).
7. ✅ Caller migration: page + 2 component (`page.tsx`, `ManualReservationList`, `ManualReservationForm`). **Bu refactor scope'unda.**
8. ✅ Self-exclude (`.neq`) repository parametre olarak alır (`excludeId?`).
9. ✅ Console.error tag asimetrisi + throw mesajı asimetrisi **aynen** korunur.
10. ✅ `source: "manual"`, `status: "blocked"` literal'lar payload helper'da single source.
11. ✅ Extraction sırası: **READ → CONFLICT → UPDATE/DELETE → INSERT** (revenue-critical en son).
12. ✅ Test stratejisi: yeni helper unit testler + repository-mock'lu service testler + AST contract (yalnız INSERT için, en son fazda).
13. ❌ Shared overlap engine YAPILMAZ.
14. ❌ Generic abstraction (Result<T,E>, query builder) YAPILMAZ.
15. ❌ `useBookingEngine.ts`, `arama/page.tsx`, villa fetch'leri scope DIŞI.

---

## 11. KARŞILAŞTIRMA: RESERVATION DOMAIN vs MANUAL-RESERVATION DOMAIN

| Kriter | Reservation domain | Manual domain |
|---|---|---|
| LOC (service) | 64 + 7 sub-service + 7 helper | 231 (tek dosya) |
| Public API export | 6 | 3 (→ 6 yeni eklenince) |
| Supabase call-site (pre-extraction) | 11 service + 1 component | 7 service + 4 component/page |
| Helper'a extraction yapılmış mı? | ✅ (commission, conflict, status, errors, payload-*, select-shapes) | ❌ (tek dosya, inline) |
| Domain split (sub-services) | ✅ (create/update/read/status/note/delete) | ❌ (tek dosya) |
| AST contract testi | ✅ (3 dosya) | ❌ (yok) |
| Cross-table read | ✅ (villa.commission_rate) | ✅ (reservations status check + calendar feed) |
| Component-direct bypass | ⚠️ ReservationForm 1 nokta | ⚠️ 4 nokta (list page, list component DELETE, form 2 SELECT) |
| Caller migration ihtiyacı | ❌ 0 | ✅ 3 caller dosyası (page + 2 component) |
| EXCLUDE constraint | `reservations_no_overlap` | `manual_reservations_no_overlap` |
| SQLSTATE handling | `mapInsertError` helper | inline (refactor'da helper'a çıkacak) |
| Domain split refactor öncesi yapılmalı mı? | (zaten yapılmış) | **Hayır — bu refactor scope dışı.** Service tek dosya kalır, yeni export'lar aynı dosyaya. |

> **Önemli karar:** Manual reservation service'i FAZ extraction sırasında **sub-service split YAPILMAYACAK** (`manualReservation/create.service.ts` vb. dosyalara bölünmüyor). Sebep: 6 export'luk tek dosya kabul edilebilir boyutta; split refactor cycle'ı genişletir. İleride domain genişlerse split yapılır.

---

**FAZ 0 sonu. FAZ 1 (READ extraction) için doğrudan başlayacağım.**
