# 🛡️ PaymentRepository — FAZ 0: READ-ONLY MAPPING

**Tarih:** 2026-05-18
**Kapsam:** Payment domain mimari ayrım hazırlığı.
**Durum:** Mapping tamamlandı; kod yazılmadı; FAZ 1'e geçişe hazır.
**Davranış kuralı:** BYTE-IDENTICAL — payment lifecycle, single-active toggle, status transition, IBAN/swift normalize, exchange-rate snapshot, throw mesajları, console.error tag asimetrileri aynen.

---

## 0. SCOPE TANIMI — KESIN BOUNDARY

Payment "domain"i çok geniş yayılmış. Bu refactor'un net kapsamını **boundary tablosu** ile çiziyorum:

### 0.1 IN-SCOPE (bu refactor cycle)

| Dosya | Açıklama | Supabase call |
|---|---|:---:|
| `app/services/payment-account.service.ts` | payment_accounts CRUD + single-active toggle (anon client) | 6 (5 farklı pattern + 1 internal deactivateOthers) |
| `app/services/payment-method.service.ts` | payment_methods CRUD (anon client) | 4 |
| `app/(admin)/maki-admin/payment-accounts/page.tsx` | Admin payment accounts page caller | 0 (sadece service) |
| `app/(admin)/maki-admin/payment-methods/page.tsx` | Admin payment methods page caller | 0 (sadece service) |
| `app/(admin)/maki-admin/settings/odeme/page.tsx` | Settings odeme page caller | 0 (sadece service) |
| **TOPLAM CANLI supabase** | | **10** |

### 0.2 OUT-OF-SCOPE (gerekçeli — bu cycle değil)

| Dosya | Sebep | Sonraki cycle |
|---|---|---|
| `lib/payment-account.server.ts` (`getActivePaymentAccount`) | **Service-role client** (`getSupabaseAdmin()`) kullanır. Migration 034 sonrası anon RLS sıfır. `import "server-only"` guard — client bundle güvenlik sınırı. Bu farklı bir DB client; payment repository'ye karıştırmak boundary kafa karışıklığı yapar. Modul-level "server-only" zaten ayrılmış. | Service-role abstraction ayrı cycle (auth+storage hardening fazı). |
| `app/api/mail/payment-link/route.ts` (5 supabase) | Reservation tablosuna SELECT + UPDATE (payment_link_status, sent_at). Bu **reservation domain mutation'ı** — payment domain'in işi değil. `reservationRepository.findById` + `updateById` zaten var ama mail route'lar `.maybeSingle()` resolver kullanıyor (vs `findById` `.single()`). Byte-identical extraction için reservation repo'ya yeni metod gerek. | Reservation domain extension cycle. |
| `app/api/mail/payment-confirmed/route.ts` (5 supabase) | Aynı (payment_link_status="paid" reservation update). | Aynı. |
| `app/api/mail/bank-transfer-payment/route.ts` (5 supabase) | Aynı. Ayrıca `getActivePaymentAccount` (server-only) kullanır. | Aynı. |
| `lib/payment-link.helper.ts` (0 supabase) | Pure utility — status normalize, expiration, label. DB query YOK. | — (zaten temiz) |
| `lib/payment.helper.ts` (0 supabase) | Pure utility — payment preference normalize + display values. | — |
| `lib/payment-account.helper.ts` (0 supabase) | Pure utility — IBAN format + display. | — |
| `app/(admin)/maki-admin/reservations/[id]/_orchestrators/sendPaymentRequest.ts` (0 supabase) | `adminFetch` ile API route'a HTTP POST. Kendi içinde DB call YOK; mail route'tan dolaylı. | Reservation orchestrator extension cycle (zaten reservation refactor kapsamında). |
| `app/(admin)/maki-admin/reservations/[id]/_orchestrators/triggerPaymentConfirmation.ts` (0 supabase) | Aynı (HTTP fetch). | Aynı. |
| `app/(admin)/maki-admin/reservations/[id]/_components/PaymentCard.tsx` etc. (0 supabase) | UI components; service/orchestrator tüketir. DB yok. | — |
| `app/lib/mail/templates/*` (0 supabase) | Pure mail template render. | — |

### 0.3 Scope gerekçesi

- **Payment own tables** (`payment_methods`, `payment_accounts`) → payment repository (yeni).
- **Reservation-coupled payment fields** (`reservations.payment_link_status`, `paid_amount`, vb.) → **reservation repository'nin sahipliği** (zaten cycle 1'de kapsama altında; mail route'lar henüz delege olmamış ama bu **reservation refactor genişleme**).
- **Server-only service-role context** → ayrı bir module-level boundary (`*.server.ts` pattern).
- **Pure helpers** → zaten temiz, DB-agnostic.

Bu üç farklı concern'i tek refactor cycle'a sıkıştırmak boundary disiplinini bozar. Bu cycle **sadece payment own tables**'a odaklanır.

---

## 1. SERVICE ENVANTERİ

### 1.1 `payment-account.service.ts` (202 LOC, 6 export, 6 supabase call)

| Export | Imza | Pattern |
|---|---|---|
| `getPaymentAccounts` | `() => Promise<PaymentAccount[]>` | `.from("payment_accounts").select("*").order("is_active", desc).order("created_at", desc)` |
| `createPaymentAccount` | `(input) => Promise<{ ok, id?, error? }>` | `.insert(payload).select().single()` + post-insert `deactivateOthers(id)` if `is_active` |
| `updatePaymentAccount` | `(id, input) => Promise<{ ok, error? }>` | `.update(payload).eq("id", id)` + post-update `deactivateOthers(id)` if `is_active === true` |
| `deletePaymentAccount` | `(id) => Promise<{ ok, error? }>` | `.delete().eq("id", id)` |
| `setActivePaymentAccount` | `(id) => Promise<{ ok, error? }>` | `.update({ is_active: true }).eq("id", id)` + `deactivateOthers(id)` |
| `deactivateOthers` (internal) | `(keepId) => Promise<{ error? }>` | `.update({ is_active: false }).neq("id", keepId)` |

**Critical patterns:**
- **Single-active toggle:** Tek kayıt `is_active=true`. Yeni aktif kayıt sonrası `deactivateOthers(keepId)` ile diğerleri pasifleşir. Atomic değil (2 ayrı UPDATE) — race condition'da iki aktif kayıt olabilir; mevcut davranış aynen.
- **IBAN/swift normalize:** `cleanIban` (whitespace remove + uppercase), `swift.toUpperCase()`, `currency.toUpperCase()` — service-level.
- **Trim helper:** `(v ?? "").toString().trim()` — service-level.
- **Conditional fields:** Sadece tanımlı alanlar UPDATE payload'a girer (`if (input.X !== undefined) payload.X = ...`).
- **Structured logging:** RLS silent-fail detection (`!data || data.length === 0` → console.warn with hint).
- **Return envelope:** `{ ok: boolean, error?: string, id?: string }` — Result-style.

**Console tag'ler (5 farklı):**
- `[payment_account.list] FAILED` / `OK` / `EMPTY`
- `[payment_account.create] FAILED`
- `[payment_account.update] FAILED`
- `[payment_account.delete] FAILED`
- `[payment_account.setActive] FAILED`
- `[payment_account.deactivateOthers] FAILED`

### 1.2 `payment-method.service.ts` (61 LOC, 4 export, 4 supabase call)

| Export | Imza | Pattern |
|---|---|---|
| `getPaymentMethods` | `() => Promise<PaymentMethodRow[]>` | `.select("*").order("created_at", desc)` |
| `createPaymentMethod` | `(payload) => Promise<void>` | `.insert(payload)` |
| `updatePaymentMethod` | `(id, payload) => Promise<void>` | `.update(payload).eq("id", id)` |
| `deletePaymentMethod` | `(id) => Promise<void>` | `.delete().eq("id", id)` |

**Critical patterns:**
- **Throw-style error handling:** `if (error) throw error` — Result envelope YOK (payment-account ile asimetri).
- **No console.error tag** — payment-account ile asimetri.
- **Typed payload:** `Partial<PaymentMethodRow>` + minimum `{ name }`.

**Tag asimetrisi:** payment-account `[payment_account.*]` snake-style + Result envelope; payment-method tag YOK + throw-style. **Bu asimetri AYNEN korunur (byte-identical disiplini).**

---

## 2. SUPABASE CALL-SITE ENVANTERİ

| # | Konum | Tablo | Pattern |
|---:|---|---|---|
| 1 | `payment-account.service.ts > getPaymentAccounts` | `payment_accounts` | `.select("*").order("is_active", desc).order("created_at", desc)` |
| 2 | `payment-account.service.ts > createPaymentAccount` | `payment_accounts` | `.insert(payload).select().single()` |
| 3 | `payment-account.service.ts > updatePaymentAccount` | `payment_accounts` | `.update(payload).eq("id", id)` |
| 4 | `payment-account.service.ts > deletePaymentAccount` | `payment_accounts` | `.delete().eq("id", id)` |
| 5 | `payment-account.service.ts > setActivePaymentAccount` | `payment_accounts` | `.update({ is_active: true }).eq("id", id)` |
| 6 | `payment-account.service.ts > deactivateOthers` (internal) | `payment_accounts` | `.update({ is_active: false }).neq("id", keepId)` |
| 7 | `payment-method.service.ts > getPaymentMethods` | `payment_methods` | `.select("*").order("created_at", desc)` |
| 8 | `payment-method.service.ts > createPaymentMethod` | `payment_methods` | `.insert(payload)` |
| 9 | `payment-method.service.ts > updatePaymentMethod` | `payment_methods` | `.update(payload).eq("id", id)` |
| 10 | `payment-method.service.ts > deletePaymentMethod` | `payment_methods` | `.delete().eq("id", id)` |

**Toplam: 10 canlı doğrudan supabase çağrısı.**

---

## 3. AGGREGATE BOUNDARY KARARI

Payment domain'in DB sahipliği:

- ✅ `payment_methods` (own table)
- ✅ `payment_accounts` (own table)

**Diğer tablolara (`reservations.*`, `villa.*`, vb.) payment domain DOKUNMAZ.** Reservations tablosundaki payment_link*, paid_amount, payment_method_id, payment_preference alanları **reservation domain'in sahipliği** — bu mutation'ları reservation repository yapar.

---

## 4. REPOSITORY BOUNDARY TASARIMI

### 4.1 Lokasyon

```
lib/db/payment.repository.ts
```

Reservation + Manual reservation pattern'iyle paralel.

### 4.2 Public API (10 metod)

```ts
export const paymentRepository = {
  // —————————— PAYMENT METHODS ——————————
  findPaymentMethods()
    → .from("payment_methods").select("*").order("created_at", desc)

  insertPaymentMethod(payload)
    → .from("payment_methods").insert(payload)

  updatePaymentMethodById(id, payload)
    → .from("payment_methods").update(payload).eq("id", id)

  deletePaymentMethodById(id)
    → .from("payment_methods").delete().eq("id", id)

  // —————————— PAYMENT ACCOUNTS ——————————
  findPaymentAccounts()
    → .from("payment_accounts").select("*")
        .order("is_active", desc)
        .order("created_at", desc)

  insertPaymentAccount(payload)
    → .from("payment_accounts").insert(payload).select().single()

  updatePaymentAccountById(id, payload)
    → .from("payment_accounts").update(payload).eq("id", id)

  deletePaymentAccountById(id)
    → .from("payment_accounts").delete().eq("id", id)

  // —————————— PAYMENT ACCOUNTS — SINGLE-ACTIVE TOGGLE ——————————
  setPaymentAccountActive(id)
    → .from("payment_accounts").update({ is_active: true }).eq("id", id)

  deactivateOtherPaymentAccounts(keepId)
    → .from("payment_accounts").update({ is_active: false }).neq("id", keepId)
};
```

### 4.3 Boundary tablosu (kim ne yapar)

| Concern | Service | Repository |
|---|:---:|:---:|
| Input trim (`trim(v)`) + cleanIban + uppercase | ✅ | ❌ |
| Result envelope (`{ ok, error?, id? }`) | ✅ | ❌ |
| Throw-style (payment-method asimetri) | ✅ | ❌ |
| Console.error tag asimetrisi (account=tagged, method=untagged) | ✅ | ❌ |
| RLS silent-fail detection (warn + hint) | ✅ | ❌ |
| Single-active toggle orchestration (post-insert deactivateOthers) | ✅ orchestration | ❌ atomicity yok; service iki adımı yönetir |
| Conditional payload build (`if (input.X !== undefined) ...`) | ✅ | ❌ |
| `is_active: true` post-insert/update branch | ✅ | ❌ |
| `.eq("id", id)` predicate | ❌ | ✅ |
| `.neq("id", keepId)` predicate | ❌ | ✅ |
| `.order("is_active", desc).order("created_at", desc)` chain | ❌ | ✅ |
| `.insert(payload).select().single()` chain | ❌ | ✅ |
| Supabase client tüketimi | ❌ | ✅ TEK TÜKETICI |

---

## 5. AST CONTRACT / TEST IMPACT

**Mevcut testler:** `tests/unit/` altında payment-spesifik test YOK. Bu refactor için yeni AST contract testi gerekmez (orchestrator complexity düşük; 10 basit CRUD).

Yeni test ihtiyacı:
- `tests/unit/payment-service/` (opsiyonel) — single-active toggle davranışı freeze (post-insert deactivateOthers çağrılır iff `is_active === true`).

---

## 6. RİSK ANALİZİ

| Risk | Olasılık | Etki | Mitigasyon |
|---|:---:|:---:|---|
| Single-active toggle race condition | 🟢 DÜŞÜK | 🟡 ORTA | Orijinal davranış aynen (atomic değil) — değişiklik YOK. |
| IBAN/swift uppercase normalize drift | 🟢 DÜŞÜK | 🟠 ORTA | Service-level; repository payload'a müdahil olmaz. |
| Trim helper drift | 🟢 DÜŞÜK | 🟢 DÜŞÜK | Service-level. |
| Result envelope vs throw asimetrisi | 🟢 DÜŞÜK | 🟢 DÜŞÜK | Service-level; aynen. |
| Console.error tag asimetrisi (account=tagged / method=untagged) | 🟢 DÜŞÜK | 🟢 DÜŞÜK | Service-level; aynen. |
| `is_active` post-insert deactivateOthers conditional | 🟡 ORTA | 🟠 ORTA | Service-level orchestration; AST contract opsiyonel. |
| `.neq("id", keepId)` predicate drift | 🟢 DÜŞÜK | 🟠 ORTA | Repository içinde aynen. |
| Caller migration (3 admin pages) | 🟢 DÜŞÜK | 🟢 DÜŞÜK | Caller'lar service'ten tüketmeye devam eder; sadece service iç implementation değişir. Caller migration GEREKMİYOR. |
| Service-role boundary kayması (server.ts) | 🟢 DÜŞÜK | 🔴 KRİTİK (güvenlik) | Out-of-scope. Bu refactor `payment-account.server.ts`'e DOKUNMAZ. |
| Mail route reservation coupling kayması | 🟢 DÜŞÜK | 🟠 ORTA | Out-of-scope. Mail route'lar reservation domain'in genişlemesi. |

---

## 7. EXTRACTION PLANI

### FAZ 1 — READ (lowest risk)
**Repository metodları:**
- `findPaymentMethods()`
- `findPaymentAccounts()`

**Service delegation:**
- `getPaymentMethods` → `repository.findPaymentMethods`
- `getPaymentAccounts` → `repository.findPaymentAccounts`

**Korunan:** Structured logging (RLS silent-fail warn), console tag'ler, Result envelope (account) / direct return (method).

### FAZ 2 — STATUS/CONFLICT READS
**Bu domain'de "conflict" semantic'i YOK** (overlap check, status transition gating gibi). FAZ 2 boş geçilir veya FAZ 3'e birleştirilir.

> **Karar:** FAZ 2 + FAZ 3 birleştirilir → tek "WRITE-side" fazı (UPDATE+DELETE+SET-ACTIVE).

### FAZ 3 — UPDATE/DELETE + SET-ACTIVE
**Repository metodları:**
- `updatePaymentMethodById(id, payload)`
- `deletePaymentMethodById(id)`
- `updatePaymentAccountById(id, payload)`
- `deletePaymentAccountById(id)`
- `setPaymentAccountActive(id)`
- `deactivateOtherPaymentAccounts(keepId)` ← internal helper repository'ye

**Service delegation:**
- `updatePaymentMethod` → repo.updateById
- `deletePaymentMethod` → repo.deleteById
- `updatePaymentAccount` → repo.updateById + (conditional) repo.deactivateOtherPaymentAccounts
- `deletePaymentAccount` → repo.deleteById
- `setActivePaymentAccount` → repo.setActive + repo.deactivateOtherPaymentAccounts
- Internal `deactivateOthers` → repo.deactivateOtherPaymentAccounts (helper signature service'te kalır veya kaldırılır)

**Korunan:** Single-active orchestration (post-update conditional), throw-style (method) vs Result envelope (account), tag'ler.

### FAZ 4 — INSERT/create
**Repository metodları:**
- `insertPaymentMethod(payload)`
- `insertPaymentAccount(payload)` ← `.select().single()` chain dahil (return id)

**Service delegation:**
- `createPaymentMethod` → repo.insertPaymentMethod
- `createPaymentAccount` → repo.insertPaymentAccount + (conditional) repo.deactivateOtherPaymentAccounts

**Korunan:** Post-insert deactivateOthers branch, returned `id` semantic, tag'ler.

### FAZ 5 — WEBHOOK/CALLBACK
**Bu refactor cycle'da webhook/callback YOK.** Payment domain şu an sadece admin CRUD; webhook entegrasyonu (iyzico, Stripe, callback) yoktur. FAZ 5 **boş geçilir**.

> **Karar:** FAZ 5 boş; sonraki cycle'da gerçek payment provider entegrasyonu yapılırsa o zaman ele alınır.

### FAZ 6 — Final
- tsc full project
- eslint
- 10 → 0 supabase doğrulama
- LOC raporu
- Final rapor

---

## 8. NIHAİ KARARLAR

1. ✅ Repository path: **`lib/db/payment.repository.ts`**.
2. ✅ Public API: **10 metod** (4 payment_methods + 6 payment_accounts).
3. ✅ Return shape: **Supabase native `{ data, error }`**; service Result envelope'a (account) veya throw'a (method) çevirir.
4. ✅ Tag asimetrisi (account=tagged / method=untagged) **aynen** korunur.
5. ✅ Result envelope vs throw-style asimetrisi **aynen** korunur.
6. ✅ IBAN/swift/currency normalize service'te kalır.
7. ✅ Single-active toggle orchestration service'te kalır (atomicity DEĞIŞTİRİLMEZ).
8. ✅ `deactivateOthers` internal helper'ı repository'ye taşınır (`deactivateOtherPaymentAccounts`).
9. ✅ Caller migration GEREK YOK (3 admin page service'ten tüketmeye devam eder).
10. ✅ Extraction sırası: **READ → UPDATE/DELETE/SET-ACTIVE → INSERT**.
11. ✅ FAZ 2 (conflict reads) + FAZ 5 (webhook/callback) BOŞ — bu domain'de yok.
12. ❌ `lib/payment-account.server.ts` (service-role) DOKUNULMAZ — out-of-scope.
13. ❌ Mail API route'ları (3 dosya) DOKUNULMAZ — reservation domain'in işi, out-of-scope.
14. ❌ Reservation field mutations (payment_link*, paid_amount) DOKUNULMAZ — reservation repo cycle.
15. ❌ Generic abstraction yok.

---

## 9. KARŞILAŞTIRMA — DOMAIN KOMPLEKSİTESİ

| Kriter | Reservation | Manual Reservation | **Payment** |
|---|---|---|---|
| Tablo sayısı | 1 own + 2 cross-table read | 1 own + 1 cross-table | **2 own** |
| Public API export (post-refactor) | 6 | 6 | **8** (4+4 mevcut) |
| Pre-refactor supabase call-site | 11 (service) + 1 (component) | 7 (service) + 4 (component/page) | **10 (sadece service)** |
| Overlap/conflict semantic | ✅ EXCLUDE constraint + half-open | ✅ aynı + self-exclude | ❌ YOK |
| Status transition guard | ✅ assertCanConfirm | ❌ | ❌ (sadece `is_active` toggle) |
| SQLSTATE handling | ✅ 23P01 | ✅ 23P01 | ❌ |
| AST contract testi | ✅ 3 dosya | ❌ (kapsanmadı) | ❌ (kompleksite düşük) |
| Component-direct bypass | ⚠️ ReservationForm 1 nokta | ⚠️ 4 nokta | ✅ 0 nokta (zaten temiz) |
| Caller migration ihtiyacı | ❌ 0 | ✅ 3 caller | ❌ 0 |
| Server-role context | ❌ | ❌ | ⚠️ var (out-of-scope) |
| Mail coupling | ✅ dispatch helper | ❌ | ⚠️ mail route 3 dosya (out-of-scope) |
| **Refactor kompleksitesi** | yüksek | orta | **DÜŞÜK** (CRUD-only) |

Payment domain en sade — sadece CRUD; **availability core kompleksitesi yok**. Bu cycle'ın LOC-cost'u önceki ikiden düşük.

---

**FAZ 0 sonu. Pattern oturmuş; doğrudan FAZ 1'e geçiyorum.**
