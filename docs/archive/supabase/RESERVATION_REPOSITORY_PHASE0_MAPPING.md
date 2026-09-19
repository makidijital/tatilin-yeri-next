# 🛡️ ReservationRepository — FAZ 0: READ-ONLY MAPPING

**Tarih:** 2026-05-18
**Kapsam:** Reservation domain'de service ↔ DB access ayrım hazırlığı.
**Durum:** Mapping tamamlandı; kod yazılmadı; ileri faz onayı bekleniyor.
**Davranış kuralı:** BYTE-IDENTICAL — runtime semantic değişmez. Supabase, RPC, embed, SQLSTATE handling aynen.

---

## 0. SCOPE

İncelenen dosyalar (yalnızca okundu):

```
app/services/reservation.service.ts                   (facade — 64 LOC)
app/services/reservation/
  ├── types.ts                                        (8 type, ~245 LOC)
  ├── create.service.ts                               (orchestrator — 121 LOC)
  ├── update.service.ts                               (orchestrator — 75 LOC)
  ├── read.service.ts                                 (orchestrator — 57 LOC)
  ├── status.service.ts                               (orchestrator — 54 LOC)
  ├── note.service.ts                                 (orchestrator — 34 LOC)
  ├── delete.service.ts                               (orchestrator — 35 LOC)
  └── _helpers/
      ├── commission.ts                               (~75 LOC) ⚠️ DB CALL içerir
      ├── conflict.ts                                 (~101 LOC) ⚠️ DB CALL içerir
      ├── status.ts                                   (~57 LOC) ⚠️ DB CALL içerir
      ├── errors.ts                                   (~42 LOC) — pure
      ├── select-shapes.ts                            (~58 LOC) — pure constants
      ├── payload-create.ts                           (~147 LOC) — pure
      └── payload-update.ts                           (~139 LOC) — pure
```

Caller envanteri (zero migration kontratı altında):
- `app/components/reservation/ReservationForm.tsx` → `createReservation`
- `app/(admin)/maki-admin/reservations/[id]/page.tsx` → `getReservationById`, `updateReservationFull`, `deleteReservationById`
- `app/(admin)/maki-admin/reservations/page.tsx` → `updateReservationStatus`
- `app/components/reservation/_helpers/buildPublicReservationPayload.ts` → `ReservationCreateInput` (type-only)
- `tests/unit/reservation-service/*` → 7 test dosyası

Mevcut repository pattern referansı: `lib/db/villa.repository.ts` (read-only, 6 metod, `villaRepository` named object export).

---

## 1. SUPABASE CALL-SITE ENVANTERİ (reservation domain)

| Dosya | Çağrı | Tür | Pure DB I/O mu? | Repository concern mi? |
|---|---|---|:---:|:---:|
| `create.service.ts` L98 | `supabase.from("reservations").insert(...).select().single()` | INSERT | ✅ saf I/O | ✅ EVET |
| `update.service.ts` L63 | `supabase.from("reservations").update(payload).eq("id", id)` | UPDATE | ✅ saf I/O | ✅ EVET |
| `read.service.ts` L27 | `supabase.from("reservations").select(SELECT_DETAIL).eq("id", id).single()` | READ-1 | ✅ saf I/O | ✅ EVET |
| `read.service.ts` L45 | `supabase.from("reservations").select(SELECT_LIST).order(...)` | READ-N | ✅ saf I/O | ✅ EVET |
| `status.service.ts` L42 | `supabase.from("reservations").update({ status }).eq("id", id)` | UPDATE (partial) | ✅ saf I/O | ✅ EVET |
| `note.service.ts` L23 | `supabase.from("reservations").update({ note }).eq("id", id)` | UPDATE (partial) | ✅ saf I/O | ✅ EVET |
| `delete.service.ts` L23 | `supabase.from("reservations").delete().eq("id", id)` | DELETE | ✅ saf I/O | ✅ EVET |
| `_helpers/conflict.ts` L52 | `supabase.from("reservations").select("id").eq(villa_id).in(status,[...]).lt(...).gt(...)` | READ-N (overlap) | ✅ saf I/O | ✅ EVET |
| `_helpers/conflict.ts` L82 | `supabase.from("manual_reservations").select("id").eq(villa_id).lt(...).gt(...)` | READ-N (overlap) | ✅ saf I/O | ✅ EVET (cross-table) |
| `_helpers/commission.ts` L59 | `supabase.from("villa").select("commission_rate").eq(id).maybeSingle()` | READ-1 (villa) | ✅ saf I/O | ⚠️ KISMEN — villa tablosu (boundary kararı gerek) |
| `_helpers/status.ts` L39 | `supabase.from("reservations").select("paid_amount").eq(id).maybeSingle()` | READ-1 (paid_amount fallback) | ✅ saf I/O | ✅ EVET |

**Toplam:** 11 doğrudan Supabase call-site. **Hepsi pure DB I/O** — koşullu business decisions service/helper tarafında.

`pages/page.tsx`, `reservations/page.tsx` admin listesi vs. ayrı service dosyalarındadır; bu scope reservation domain'i ile sınırlı.

---

## 2. QUERY PATTERN TEKRAR ANALİZİ

### 2.1 Identifier-eq pattern (kompozitsiz tek-row ops) — 6 nokta

```
.from("reservations").{verb}({...}).eq("id", id)
```

Tekrar eden 6 nokta:
- `read.service.ts` (READ detail, `single()`)
- `update.service.ts` (UPDATE full)
- `status.service.ts` (UPDATE partial)
- `note.service.ts` (UPDATE partial)
- `delete.service.ts` (DELETE)
- `_helpers/status.ts` (READ paid_amount, `maybeSingle()`)

> Repository perspektifinden bu, **`reservationRepository.findById`, `updateById`, `deleteById`** üzerinden tek pattern'e dönüşür. Partial update'lerin (status / note) ayrı method olması byte-identical isteği için **gerekli değil**; tek `updateById(id, partial)` enough — orchestrator UPDATE payload'ını helper'dan alıp doğrudan repository'ye verir. Davranış aynen kalır.

### 2.2 Half-open overlap pattern — 2 nokta

```
.eq("villa_id", id).lt("start_date", end).gt("end_date", start)
```

- `_helpers/conflict.ts > checkReservationConflict` (+ `.in("status", AVAILABILITY_BLOCKING_STATUSES)`)
- `_helpers/conflict.ts > checkManualBlockConflict` (filter daha sade)

> İki tablo, aynı geometri. Repository tarafında **iki ayrı method** olarak yaşamalı (`findOverlappingReservations`, `findOverlappingManualBlocks`); status allow-list orchestration concern'ü ama burada **conflict semantic'i ile birleşik tek pattern** olduğu için repository içinde sabit kalır (lockstep contract availability.helper.ts ile).

### 2.3 SELECT shape constant'ları — `select-shapes.ts`

`SELECT_RESERVATION_DETAIL` + `SELECT_RESERVATION_LIST` byte-identical export. **Bu dosya repository'ye taşınmalı** — embed string'leri DB access concern'ü; orchestrator'a bilgi sızdırması gerekmez. Tests doğrudan helper'ı import etmiyor → güvenli taşıma.

### 2.4 EXCLUDE constraint'e bağlı INSERT — 1 nokta

```
.insert(payload).select().single()
+ catch SQLSTATE 23P01 / regex reservations_no_overlap → throw "Bu tarihler artık müsait değil"
```

`create.service.ts` (orchestrator) + `_helpers/errors.ts > mapInsertError`.

> **Repository sınırı kararı:** `mapInsertError` **service edge'inde kalır**. Repository sadece "INSERT yap, error olarak fırlat" rolü oynar; **domain-spesifik error mapping** (TR mesajları, SQLSTATE parse'ı) orchestrator-level policy'dir. Bu, gelecekteki DB provider değişikliğinde **SQLSTATE eşlemesinin tek noktada** kalmasını sağlar — repository ham error fırlatır, service human-friendly mesaja çevirir.

---

## 3. BUSINESS LOGIC vs DB ACCESS AYRIMI

Her dosya için **hangi kısım taşınmalı / hangi kısım kalır** kararı:

### 3.1 `create.service.ts`

| Adım | İçerik | Sınıflandırma |
|---|---|---|
| 1-4 | 4 throw validation (`villa_id`, dates, `name/phone`, date range) | 🟢 BUSINESS — kalır |
| 5 | `checkReservationConflict(...)` | 🟡 ORCHESTRATION — repository'ye delege |
| 6 | `checkManualBlockConflict(...)` | 🟡 ORCHESTRATION — repository'ye delege |
| 7 | `fetchCommissionRate(villa_id)` | 🟡 ORCHESTRATION — repository'ye delege |
| 8 | `calcCommissionAmount(total, rate)` | 🟢 BUSINESS — kalır (pure) |
| 9 | `buildCreateReservationPayload(...)` | 🟢 BUSINESS — kalır (pure helper) |
| 9 | `supabase.from("reservations").insert(...)` | 🔴 DB ACCESS — repository |
| 10 | `console.error + mapInsertError + throw error.message` | 🟢 BUSINESS — kalır (error policy) |
| 11 | `return inserted` | 🟢 ORCHESTRATION — kalır |

### 3.2 `update.service.ts`

| Adım | İçerik | Sınıflandırma |
|---|---|---|
| 1 | `throw "ID gerekli"` | 🟢 BUSINESS |
| 2 | Date range validation | 🟢 BUSINESS |
| 3 | `if confirmed: assertCanConfirm(id, paid_amount)` | 🟡 ORCHESTRATION (status helper içinde DB call var) |
| 4 | `buildUpdateReservationPayload(data)` | 🟢 BUSINESS (pure) |
| 5 | `supabase.from("reservations").update(payload).eq("id", id)` | 🔴 DB ACCESS — repository |
| 6 | `console.error + throw "Güncellenemedi"` | 🟢 BUSINESS (error policy) |
| 7 | `return true` | 🟢 ORCHESTRATION |

### 3.3 `read.service.ts`

| Adım | İçerik | Sınıflandırma |
|---|---|---|
| `getReservationById` | id guard + select detail + single + error mesajı | 🔴 DB ACCESS (id guard + error mesajı service'te kalır; query repository'ye) |
| `getReservations` | select list + order + error mesajı | 🔴 DB ACCESS |

`SELECT_RESERVATION_DETAIL` ve `SELECT_RESERVATION_LIST` constant'ları **repository'ye taşınır** — orchestrator embed string'ini görmemeli.

### 3.4 `status.service.ts`

| Adım | İçerik | Sınıflandırma |
|---|---|---|
| 1 | id guard | 🟢 BUSINESS |
| 2 | `if confirmed: assertCanConfirm(id, undefined)` | 🟡 ORCHESTRATION |
| 3 | `supabase.update({ status }).eq("id", id)` | 🔴 DB ACCESS |
| 4 | error policy | 🟢 BUSINESS |

### 3.5 `note.service.ts`

| Adım | İçerik | Sınıflandırma |
|---|---|---|
| 1 | id guard | 🟢 BUSINESS |
| 2 | `supabase.update({ note }).eq("id", id)` | 🔴 DB ACCESS |
| 3 | error policy | 🟢 BUSINESS |

### 3.6 `delete.service.ts`

| Adım | İçerik | Sınıflandırma |
|---|---|---|
| 1 | id guard | 🟢 BUSINESS |
| 2 | `supabase.delete().eq("id", id)` | 🔴 DB ACCESS |
| 3 | error policy | 🟢 BUSINESS |

### 3.7 `_helpers/conflict.ts`

| Helper | İçerik | Sınıflandırma |
|---|---|---|
| `AVAILABILITY_BLOCKING_STATUSES` | const tuple | 🟡 SHARED — lockstep `availability.helper.ts`. KALIR (helper export). Repository de oradan import eder. |
| `checkReservationConflict` | DB query + 2 throw (`Rezervasyon kontrol hatası`, `Bu tarihler dolu`) | 🔴 DB ACCESS + 🟢 BUSINESS — **karma** |
| `checkManualBlockConflict` | DB query + 2 throw | 🔴 DB ACCESS + 🟢 BUSINESS — **karma** |

> **Karar:** Repository sadece **query**'yi yapsın (`findOverlapping*` `Promise<{id: string}[]>` veya `Promise<boolean>` dönsün — preference orchestrator'da karar verilir). Throw'lar conflict helper'ında kalır; helper `repository.findOverlapping*()` çağırıp eski throw davranışını sürdürür. Bu, helper'ı **business policy** dosyası olarak ayık tutar.

### 3.8 `_helpers/commission.ts`

| Sembol | İçerik | Sınıflandırma |
|---|---|---|
| `DEFAULT_COMMISSION_RATE` | const | 🟢 BUSINESS |
| `safeCommissionRate` | pure normalize | 🟢 BUSINESS |
| `calcCommissionAmount` | pure formula | 🟢 BUSINESS |
| `fetchCommissionRate` | DB call + fail-open + log tag | 🔴 DB ACCESS + 🟢 BUSINESS (fail-open policy) — **karma** |

> **Karar:** `villa.commission_rate` DB call **repository'de** yaşar; ama bu **villa repository'sinin işi mi reservation repository'sinin işi mi?** İki seçenek:
> - **A) `villaRepository.findCommissionRate(id)`** ekle (mevcut `lib/db/villa.repository.ts`'ye). Saf semantic olarak doğru ama villa repository'sini mutasyona açar.
> - **B) `reservationRepository.findVillaCommissionRate(id)`** — reservation domain'i kendi DB call'ını kapsar. Cross-table read, ama "rezervasyon flow'unun ihtiyacı" olduğu için sahiplik reservation'da kalır.
>
> **Tavsiye: B.** Gerekçe: (1) villa repository scope'unu donduruyoruz (read-only, dokunulmaz); (2) ileride başka commission kaynağı (account-level rate vb.) eklenirse abstraction reservation tarafında genişler; (3) refactor blast radius minimize.

### 3.9 `_helpers/status.ts`

| Sembol | İçerik | Sınıflandırma |
|---|---|---|
| `assertCanConfirm(id, payloadPaid)` | `if undefined: DB fetch paid_amount` + canConfirmReservation + throw | 🔴 DB ACCESS + 🟢 BUSINESS — **karma** |

> **Karar:** DB fetch `repository.findPaidAmount(id)` olarak çıkar; `assertCanConfirm` helper'ı sadece "fetch + decide + throw" orchestration'ı yapar. Throw mesajları (RESERVATION_CONFIRM_GUARD_MESSAGE, "Doğrulama hatası") aynen kalır.

### 3.10 `_helpers/errors.ts`

`mapInsertError` — **pure**, DB call yok. **Repository'ye taşınmaz; service-edge'de kalır.** Bu kasıtlı: SQLSTATE → TR mesajı eşlemesi domain policy'sidir; repository ham `error` fırlatır, error policy üst katmanda çözülür.

### 3.11 `_helpers/payload-create.ts` + `payload-update.ts`

İkisi de **pure**, DB yok. **Service tarafında kalır.** Repository INSERT/UPDATE alır, payload yapımına müdahil olmaz.

### 3.12 `_helpers/select-shapes.ts`

Saf string constant. **Repository'ye taşınır** — embed bilgisi DB layer'ın işidir; orchestrator görmemeli.

---

## 4. EMBEDDED SELECT + SQLSTATE + AGGREGATE BOUNDARY

### 4.1 Embedded select'ler (PostgREST syntax lock-in)

```
villa:villa_id (title, cleaning_fee, cleaning_currency, cleaning_limit, custom_prepayment_rate)
payment_method:payment_method_id (id, name, type)
villa:villa_id (title)   -- listing
```

> Bu syntax repository'ye gömülür. Service shape olarak çağırır, embed'i bilmez. Migration zamanı geldiğinde sadece bu sabitler değişir.

### 4.2 SQLSTATE handling

- `23P01` (exclusion_violation) + regex `/reservations_no_overlap/i` → tek nokta: `_helpers/errors.ts`.
- Repository'nin **işi değil**; service tarafında kalır.

### 4.3 Reservation aggregate boundary

**Reservation aggregate'inin DB sahipliği:**
- ✅ `reservations` (own table)
- ✅ `manual_reservations` (cross-table conflict check — reservation flow'un ihtiyacı)
- 🟡 `villa.commission_rate` (cross-table read, ama yalnızca commission snapshot için)

Diğer tablolara (`villa.*` full, `payment_methods.*`, etc.) reservation domain dokunmuyor — bu üç tablo aggregate boundary'sini tanımlıyor.

### 4.4 Transaction-benzeri sequence (createReservation)

```
[validate] → [check reservations overlap] → [check manual_reservations overlap]
→ [fetch villa.commission_rate (fail-open)] → [INSERT reservations]
→ [DB-level EXCLUDE constraint atomic guarantee]
```

**Application-level transaction YOK.** Atomik garanti `reservations_no_overlap` EXCLUDE constraint'inde. Conflict pre-check'ler **UX fast-path** (TOCTOU race'i kabul edilmiş). Repository bu sırayı **enforce etmez** — orchestrator sırayı yönetir.

---

## 5. AST CONTRACT + TEST IMPACT MATRIX

Mevcut testler:
```
tests/unit/reservation-service/
├── createReservationOrchestrationContract.test.ts        ← AST contract
├── updateReservationFullOrchestrationContract.test.ts    ← AST contract
├── statusAndDeleteOrchestrationContract.test.ts          ← AST contract
├── commission.test.ts                                    ← helper unit
├── errors.test.ts                                        ← helper unit
├── payload-create.test.ts                                ← helper unit
└── payload-update.test.ts                                ← helper unit
```

**AST contract testleri orchestrator dosyalarındaki call sırasını kilitliyor.** Repository delegation ile bu call'lar **identifier düzeyinde değişiyor** (`supabase.from` → `reservationRepository.X`). Üç seçenek:

### Seçenek A — AST contract'ı genişlet
Mevcut `supabase.from` çağrılarını **`reservationRepository.X`** ile aynı sırada kabul edecek şekilde test'i evolve et. Sıra ve await semantic'i aynı kalır, sadece identifier değişir.
**Tercih:** Bu yol — testler "orchestration sırasını" koruyor, "supabase'i mi repository'yi mi çağırdığını" değil.

### Seçenek B — Eski testleri sil, yenilerini yaz
Risk: tarihsel kontratı kaybetmek.
**Reddet.**

### Seçenek C — Hem eski hem yeni
Çift bakım maliyeti, çakışan iddialar.
**Reddet.**

**Plan:** AST contract'lar her FAZ adımında **incrementally evolve edilecek**. Her FAZ'da etkilenen test bloğu güncellenir; geri kalan iddialar (await order, throw mesajları, conditional branch'ler) aynen kalır.

---

## 6. RISK ANALİZİ

| Risk | Olasılık | Etki | Mitigasyon |
|---|:---:|:---:|---|
| `createReservation` orchestration sırasının değişmesi | 🟡 ORTA | 🔴 KRİTİK (revenue) | INSERT extraction **en son FAZ**'a alındı. AST contract incremental update. |
| Console.error tag'leri kaybolur | 🟡 ORTA | 🟠 ORTA (Sentry/log diff) | Repository içinde **aynı tag**'i koruyarak emit edeceğiz. Tag tablosu §8'de. |
| Throw mesajları drift | 🟢 DÜŞÜK | 🔴 KRİTİK (UI strings) | Throw'lar orchestrator/helper'da kalır. Repository ham error fırlatır. Service mesaj eşlemesini sürdürür. |
| `SELECT_RESERVATION_DETAIL/LIST` whitespace drift | 🟡 ORTA | 🟢 DÜŞÜK | Constant'lar aynen kopyalanır (file move değil, dual-define olmaz — tek noktaya taşınır). |
| `assertCanConfirm` fallback semantic drift | 🟢 DÜŞÜK | 🟠 ORTA (server-side confirm guard) | Helper yapısı korunur; sadece DB fetch repository'ye delegate. |
| `fetchCommissionRate` fail-open semantic drift | 🟢 DÜŞÜK | 🟠 ORTA (commission accounting) | Fail-open helper içinde kalır; repository `error` döner, helper console.error + fallback. |
| `mapInsertError` SQLSTATE parse drift | 🟢 DÜŞÜK | 🔴 KRİTİK (EXCLUDE UX) | `_helpers/errors.ts` dokunulmaz. Repository ham error fırlatır. |
| `manual_reservations` cross-table boundary kaybı | 🟢 DÜŞÜK | 🟢 DÜŞÜK | Repository `findOverlappingManualBlocks` ile kapsama altında. |
| TS variance / generic over-engineering | 🟡 ORTA | 🟠 ORTA | Generic `Result<T>` veya `DbError<...>` YAPMA. Repository fonksiyonları `Promise<Row | null>`, `Promise<Row[]>`, `Promise<{ data; error }>` somut shape döner. |
| PostgrestError sızıntısı (façade'dan service'e) | 🟢 DÜŞÜK | 🟠 ORTA (uzun vade) | Şimdilik **error'u opaque return** ediyoruz (`PostgrestError | null`). Yeni `DbError` abstraction §7'de açıklandığı gibi MINIMAL. |
| Caller migration | — | — | ❌ YOK. Service public API dokunulmuyor. |

---

## 7. REPOSITORY BOUNDARY KARARI

### 7.1 Lokasyon

```
lib/db/reservation.repository.ts
```

Villa repository pattern'ine **paralel** — aynı path, aynı naming. Yeni klasör kurmuyoruz.

### 7.2 Public API (minimal kontrat)

Aşağıdaki **9 metod** yeterli (over-design YOK):

```ts
export const reservationRepository = {
  // —————————— READ ——————————
  findById(id: string): Promise<{ data; error }>;
  findList(): Promise<{ data; error }>;
  findPaidAmount(id: string): Promise<{ data; error }>;        // status guard fallback

  // —————————— CONFLICT ——————————
  findOverlappingReservations(window): Promise<{ data; error }>;
  findOverlappingManualBlocks(window): Promise<{ data; error }>;

  // —————————— COMMISSION ——————————
  findVillaCommissionRate(villaId: string): Promise<{ data; error }>;

  // —————————— WRITE ——————————
  insert(payload: Record<string, unknown>): Promise<{ data; error }>;
  updateById(id: string, partial: Record<string, unknown>): Promise<{ error }>;
  deleteById(id: string): Promise<{ error }>;
};
```

**Tasarım gerekçeleri:**

- **`{ data, error }` shape:** Şu an Supabase native return shape ile **byte-identical**. Bu, refactor'un en hafif yolu — orchestrator'da `error.code`, `error.message` erişimi mevcut pattern'le aynı kalır. **PostgrestError tipini opaque tutarız** — TS tarafında `error` `Pick<PostgrestError, "code"|"message"> | null` veya bir alias `DbError`. Bu **abstraction tohumu** ama generic değil.

- **`updateById` neden tek metod?** Partial UPDATE çeşitliliği (full payload / sadece status / sadece note) **payload shape farkı**, sorgu farkı değil. Tek metod yeterli; orchestrator'lar farklı payload geçer. Aynı end-state, daha az API yüzeyi.

- **`findOverlapping*` neden `{ data }[]` ve "id only"?** Mevcut helper `.select("id")` yapıyor; kalibresi aynı — `Promise<Array<{ id: string }>>` döner; "var mı yok mu" kararı helper tarafında.

- **SELECT constants** repository içine **private** olur (`const SELECT_RESERVATION_DETAIL = ...`). Module'den export edilmez (dış erişime gerek yok; tek tüketici read service idi, o da artık repository üzerinden okuyor).

- **`findVillaCommissionRate` neden reservation repository'de?** §3.8 kararı: villa repository scope'u donduruluyor; cross-table read reservation domain'in ihtiyacı; abstraction reservation tarafında genişlemeli.

### 7.3 Boundary tablosu (kim ne yapar)

| Concern | Service / Helper | Repository |
|---|:---:|:---:|
| Input validation (`throw "ID gerekli"` vb.) | ✅ | ❌ |
| Date range validation | ✅ | ❌ |
| Status transition guard (`assertCanConfirm`) | ✅ (helper) | sadece DB fetch ile destek |
| Conflict policy (status allow-list, throw mesajları) | ✅ | ❌ |
| Conflict query (overlap geometry) | ❌ | ✅ |
| Commission formula (`calcCommissionAmount`) | ✅ | ❌ |
| Commission DB fetch | ❌ | ✅ |
| Commission fallback (fail-open) | ✅ (helper) | ❌ |
| Payload build (INSERT/UPDATE) | ✅ | ❌ |
| SQLSTATE 23P01 → TR mesajı eşlemesi (`mapInsertError`) | ✅ | ❌ |
| Embed select string'leri | ❌ | ✅ |
| Console.error tag emission | ✅ (mevcut tag korunur) | ❌ (repository sessiz) |
| Throw human-friendly mesajlar | ✅ | ❌ |
| Supabase client tüketimi | ❌ | ✅ (TEK tüketici) |

> **Anahtar mimari karar:** **Console.error tag'leri service tarafında kalır.** Repository sessiz dönüş yapar (Supabase shape). Service `if (error) { console.error("❌ ...", error.message); throw ...; }` pattern'ini sürdürür. Bu, log diff'ini sıfırlar.

### 7.4 Error type — minimum DbError tohumu (faz 1 over-engineering değil)

```ts
// lib/db/types.ts (yeni, ~10 LOC)
export type DbError = {
  code?: string;
  message?: string;
};
```

Repository return tipi `{ data: T; error: DbError | null }`. PostgrestError yapısal olarak compatible (`code`, `message` properties). **TS yapısal eşleşme** sayesinde mevcut error.code / error.message erişimi byte-identical çalışır. Service'de `import type { PostgrestError }` ihtiyacı kalmıyor — abstraction tohumu burada başlıyor.

> **NOT:** Bu generic `Result<T,E>` değil. Sadece "PostgrestError'u repository sınırından dışarı sızdırmamak" için minimal bir alias. Tüm `PostgrestError` import'larını şimdi temizleme telaşı yapmayacağız — sadece reservation domain'i temizler, geri kalan domain'lere model olur.

---

## 8. LOG TAG ENVANTERİ (byte-identical korunacak)

| Konum | Tag | Mesaj formatı |
|---|---|---|
| `create.service.ts` | `❌ Create error:` | `console.error("❌ Create error:", error.message)` |
| `update.service.ts` | `❌ Update error:` | aynı |
| `read.service.ts` detail | `❌ Fetch error:` | aynı |
| `read.service.ts` list | `❌ List error:` | aynı |
| `status.service.ts` | `❌ Status error:` | aynı |
| `note.service.ts` | `❌ Note error:` | aynı |
| `delete.service.ts` | `❌ Delete error:` | aynı |
| `_helpers/conflict.ts` (res) | `❌ Conflict error:` | aynı |
| `_helpers/conflict.ts` (manual) | `❌ Manual conflict error:` | aynı |
| `_helpers/commission.ts` | `[reservation.commission.fetch] FAILED` | aynı (fail-open) |
| `_helpers/status.ts` | `[reservation.confirm-guard] FETCH_FAILED` | aynı |

Tüm tag'ler **aynı dosyada, aynı satır pattern'iyle** korunur. Repository taşıması sonrası bu tag'ler service/helper'da kalır; repository içinde **hiç console** yok.

---

## 9. INCREMENTAL EXTRACTION PLANI

> Sıra: **risk minimum → maksimum**. Her FAZ atomik bir PR.

### FAZ 1 — Repository contract design (kod yok)
- `lib/db/reservation.repository.ts` boş iskelet (henüz implementation yok).
- `lib/db/types.ts` — `DbError` type alias.
- Caller etkisi: SIFIR.

### FAZ 2 — READ extraction (en düşük risk)
**Taşınacak:**
- `read.service.ts` → `repository.findById`, `repository.findList`
- `_helpers/select-shapes.ts` constants → repository module'üne (private)
- `_helpers/status.ts` paid_amount fetch → `repository.findPaidAmount`
- `_helpers/commission.ts` commission_rate fetch → `repository.findVillaCommissionRate`

**Korunan:**
- Throw mesajları (`"Rezervasyon getirilemedi"`, `"Rezervasyonlar alınamadı"`, `"Doğrulama hatası"`, log tag `[reservation.commission.fetch] FAILED`).
- Fail-open semantic (commission fetch error → fallback rate).
- ID guard + single() davranışı.
- SELECT string'leri whitespace dahil aynı (yeni dosyada exact-string olarak).

**Test impact:**
- `commission.test.ts` — `fetchCommissionRate` artık `repository.findVillaCommissionRate`'i çağırıyor olur. Test mock'u repository'yi mock'lar; helper davranışı (fallback rate 20, log tag) aynen test edilir.
- Yeni: `tests/unit/reservation-repository/findById.test.ts`, `findList.test.ts`, vb. — Supabase client mock.

### FAZ 3 — Conflict extraction
**Taşınacak:**
- `_helpers/conflict.ts > checkReservationConflict` içindeki query → `repository.findOverlappingReservations`
- `_helpers/conflict.ts > checkManualBlockConflict` içindeki query → `repository.findOverlappingManualBlocks`

**Korunan:**
- AVAILABILITY_BLOCKING_STATUSES = ["pending", "confirmed"] (status allow-list helper'da kalır; repository parametre olarak alır).
- Half-open overlap geometry (`.lt(start)` + `.gt(end)`) — repository içinde aynen.
- Throw mesajları + console.error tag'leri helper'da.

**Test impact:**
- Yeni: `findOverlappingReservations.test.ts`, `findOverlappingManualBlocks.test.ts` (repository unit).
- Mevcut `createReservationOrchestrationContract.test.ts` — `checkReservationConflict / checkManualBlockConflict` call'ları aynen; AST contract DEĞIŞMEZ (helper-level çağrı korunduğu için).

### FAZ 4 — UPDATE / STATUS / NOTE / DELETE extraction
**Taşınacak:**
- `update.service.ts` UPDATE → `repository.updateById`
- `status.service.ts` UPDATE partial → `repository.updateById(id, { status })`
- `note.service.ts` UPDATE partial → `repository.updateById(id, { note })`
- `delete.service.ts` DELETE → `repository.deleteById`

**Korunan:**
- `assertCanConfirm` çağrı sırası aynen (status === "confirmed" guard).
- Throw mesajları + console.error tag'leri.
- `buildUpdateReservationPayload` pure helper olarak orchestrator tarafında.

**Test impact:**
- `updateReservationFullOrchestrationContract.test.ts` — `supabase.from("reservations").update(...).eq(...)` çağrısının yerini `reservationRepository.updateById(id, payload)` alır. AST contract iddialarından "supabase call sequence" bölümü `repository call sequence`'a evolve eder. Diğer iddialar (await, conditional, throw) aynen.
- `statusAndDeleteOrchestrationContract.test.ts` — aynı evolve.

### FAZ 5 — INSERT extraction (revenue-critical, en son)
**Taşınacak:**
- `create.service.ts` INSERT → `repository.insert(payload)`

**Korunan:**
- `buildCreateReservationPayload` pure helper.
- `mapInsertError` service-edge'de (SQLSTATE 23P01 parse + throw "Bu tarihler artık müsait değil").
- `console.error("❌ Create error:", error.message)` service'te.
- Final `throw new Error(error.message)` aynen.
- Inserted row return aynen (`.select().single()` semantic'i repository içinde, return shape orchestrator'a aynen ulaşır).

**Test impact:**
- `createReservationOrchestrationContract.test.ts` — INSERT call'ı `repository.insert(...)` olarak görünür. AST contract'a "repository.insert AWAITED" iddiası eklenir; "supabase.from().insert" iddiası kaldırılır.
- Mevcut `payload-create.test.ts` aynen geçer (helper pure, etkilenmez).
- Mevcut `errors.test.ts` aynen geçer (`mapInsertError` pure, etkilenmez).

### FAZ 6 — Test hardening + final doğrulama
- Yeni: `reservation-repository/` test dizini (9 unit, Supabase mock'lu).
- Yeni: `service-delegation.test.ts` — service'in repository'yi doğru method ve sırayla çağırdığını AST + spy mock ile doğrular.
- Mevcut tüm helper unit testleri geçmeli (commission, errors, payload-create, payload-update).
- Mevcut 3 AST contract testi evolve edilmiş haliyle yeşil.
- `tsc --noEmit` clean.
- `eslint` clean.
- LOC raporu (öncesi/sonrası).

---

## 10. CALLER MIGRATION GARANTİSİ

**Hedef:** Aşağıdaki 4 dosyada **tek satır değişmeyecek**:

```
app/components/reservation/ReservationForm.tsx
app/(admin)/maki-admin/reservations/[id]/page.tsx
app/(admin)/maki-admin/reservations/page.tsx
app/components/reservation/_helpers/buildPublicReservationPayload.ts
```

Sebep: Facade `app/services/reservation.service.ts` aynı export set'ini sunar; sub-service'lerin iç implementation'ı repository üzerinden çalışır. **Zero-migration kontratı 8 refactor boyunca uygulandı; bu fazda da uygulanır.**

---

## 11. NIHAİ KARARLAR (özet)

1. ✅ Repository path: **`lib/db/reservation.repository.ts`** (villa pattern'i parallel).
2. ✅ Public API: **9 metod** (`findById`, `findList`, `findPaidAmount`, `findOverlappingReservations`, `findOverlappingManualBlocks`, `findVillaCommissionRate`, `insert`, `updateById`, `deleteById`).
3. ✅ Return shape: **`{ data, error }`** (Supabase native; PostgrestError opaque).
4. ✅ `DbError` minimal type alias **`lib/db/types.ts`**; generic Result YOK.
5. ✅ `mapInsertError` **service edge'de kalır**; repository ham error fırlatır.
6. ✅ Console.error tag'leri + throw mesajları **service/helper'da kalır**; repository sessiz.
7. ✅ Cross-table commission read: **reservation repository** sahipliğinde (villa repository donmuş).
8. ✅ `manual_reservations` overlap query: **reservation repository** kapsama altında (aggregate boundary).
9. ✅ SELECT constants **repository içine private** taşınır; service görmeyecek.
10. ✅ Extraction sırası: **READ → CONFLICT → UPDATE/DELETE → INSERT** (revenue-critical en son).
11. ✅ AST contract testleri **incremental evolve** (her FAZ'da etkilenen satır güncellenir; geri kalan iddialar dokunulmaz).
12. ✅ Caller migration: **SIFIR** (4 caller dokunulmuyor).
13. ❌ Generic abstraction (Result<T,E>, builder pattern, query DSL) YAPILMAZ.
14. ❌ Realtime / subscription / cache layer YAPILMAZ.
15. ❌ DB provider değişimi BU REFACTOR'UN HEDEFI DEĞIL.

---

**FAZ 0 sonu. FAZ 1 (repository contract design) için onay bekleniyor.**
