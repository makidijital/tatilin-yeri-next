# 🛡️ PaymentRepository — FAZ 1+3+4 FINAL RAPOR (tek cycle)

**Tarih:** 2026-05-18
**Kapsam:** Payment own tables (`payment_methods` + `payment_accounts`) mimari ayrım tamamlandı.
**Davranış:** BYTE-IDENTICAL — Result envelope, throw-style asimetri, log tag asimetri, single-active toggle, atomicity, RLS silent-fail detection aynen.

> **Hedef gerçekleşti: Payment domain'in own tables'larında 0 doğrudan canlı Supabase tüketimi.**

---

## 1. NE YAPILDI

### 1.1 Yeni dosya: `lib/db/payment.repository.ts` (279 LOC)

**10 public metod:**

```
PAYMENT METHODS (FAZ 1 + 3 + 4)
├── findPaymentMethods()
├── insertPaymentMethod(payload)
├── updatePaymentMethodById(id, payload)
└── deletePaymentMethodById(id)

PAYMENT ACCOUNTS (FAZ 1 + 3 + 4)
├── findPaymentAccounts()
├── insertPaymentAccount(payload)                ← .select().single() chain
├── updatePaymentAccountById(id, payload)
├── deletePaymentAccountById(id)
├── setPaymentAccountActive(id)                  ← single-active toggle step 1
└── deactivateOtherPaymentAccounts(keepId)       ← single-active toggle step 2
```

### 1.2 Değişen dosyalar (2)

| Dosya | Δ | Değişiklik |
|---|---|---|
| `app/services/payment-method.service.ts` | ±0 LOC | `supabase.from("payment_methods")` × 4 → `paymentRepository.*` × 4. **Throw-style** + **typed payload** aynen. |
| `app/services/payment-account.service.ts` | +4 LOC | `supabase.from("payment_accounts")` × 6 → `paymentRepository.*` × 6. **Result envelope** + `[payment_account.*]` log tag asimetrisi + RLS silent-fail detection (warn + hint) + single-active toggle orchestration **AYNEN**. |

### 1.3 Dokunulmayan dosyalar (out-of-scope, FAZ 0 §0.2)

```
✅ lib/payment-account.server.ts                 (service-role; getSupabaseAdmin)
✅ lib/payment-link.helper.ts                    (pure utility — 0 supabase)
✅ lib/payment.helper.ts                         (pure utility)
✅ lib/payment-account.helper.ts                 (pure utility)
✅ app/api/mail/payment-link/route.ts            (reservation domain extension)
✅ app/api/mail/payment-confirmed/route.ts       (reservation domain extension)
✅ app/api/mail/bank-transfer-payment/route.ts   (reservation domain extension)
✅ app/(admin)/maki-admin/payment-accounts/page.tsx       (caller — service'ten tüketir)
✅ app/(admin)/maki-admin/payment-methods/page.tsx        (caller)
✅ app/(admin)/maki-admin/settings/odeme/page.tsx         (caller)
✅ app/(admin)/maki-admin/reservations/[id]/_orchestrators/sendPaymentRequest.ts
✅ app/(admin)/maki-admin/reservations/[id]/_orchestrators/triggerPaymentConfirmation.ts
✅ app/(admin)/maki-admin/reservations/[id]/_components/Payment*.tsx
✅ app/lib/mail/templates/Payment*.ts
```

**Service public API: 0 değişiklik. Caller migration: 0 satır.**

---

## 2. SUPABASE CALL-SITE TIMELINE (payment own tables)

| Konum | Pre | FAZ 1 (READ) | FAZ 3 (UPDATE/DELETE/SET-ACTIVE) | FAZ 4 (INSERT) |
|---|:---:|:---:|:---:|:---:|
| `payment-method.service > getPaymentMethods` | 1 | **0** ✅ | 0 | 0 |
| `payment-method.service > createPaymentMethod` | 1 | 1 | 1 | **0** ✅ |
| `payment-method.service > updatePaymentMethod` | 1 | 1 | **0** ✅ | 0 |
| `payment-method.service > deletePaymentMethod` | 1 | 1 | **0** ✅ | 0 |
| `payment-account.service > getPaymentAccounts` | 1 | **0** ✅ | 0 | 0 |
| `payment-account.service > createPaymentAccount` | 1 | 1 | 1 | **0** ✅ |
| `payment-account.service > updatePaymentAccount` | 1 | 1 | **0** ✅ | 0 |
| `payment-account.service > deletePaymentAccount` | 1 | 1 | **0** ✅ | 0 |
| `payment-account.service > setActivePaymentAccount` | 1 | 1 | **0** ✅ | 0 |
| `payment-account.service > deactivateOthers` (internal) | 1 | 1 | **0** ✅ | 0 |
| **TOPLAM** | **10** | **8** | **2** | **0** ✅ |

> Tek cycle'da yapıldığı için FAZ 1 + 3 + 4 birleştirildi; sonuç **10 → 0**.
> Payment domain'in own tables'larında canlı doğrudan supabase çağrısı YOK.

---

## 3. KALAN SUPABASE TÜKETİM DURUMU (CODEBASE GENİŞ HARITAS)

### 3.1 Payment-RELATED (out-of-scope) — bilinçli korundu

| Dosya | LOC | Supabase calls | Sebep (out-of-scope) |
|---|---:|:---:|---|
| `lib/payment-account.server.ts` | 80 | 1 (`getSupabaseAdmin`) | **Service-role client**; "server-only" guard. Auth+storage hardening cycle'ı için ayrı boundary. |
| `app/api/mail/payment-link/route.ts` | 275 | 2 (reservation read + update) | **Reservation tablosu mutation'ı**. Reservation repo extension cycle'da kapsanacak. |
| `app/api/mail/payment-confirmed/route.ts` | 265 | 2 (reservation read + update) | Aynı. |
| `app/api/mail/bank-transfer-payment/route.ts` | 311 | 2 (reservation read + update) | Aynı + `getActivePaymentAccount` çağrısı (server-only). |
| **Out-of-scope toplam** | | **7** | Üç ayrı domain concern: server-role, reservation mutations, mail routing. |

### 3.2 Payment own tables — IN-SCOPE — kapsama altında

```
✅ payment_methods  → paymentRepository (4 metod)
✅ payment_accounts → paymentRepository (6 metod)
```

**Toplam: 0 canlı doğrudan supabase tüketim** payment domain'in own tables'larında.

---

## 4. BYTE-IDENTICAL DOĞRULAMA — TAM TABLO

### 4.1 Tag asimetrisi (account=tagged / method=untagged)

| Tag | Konum | Durum |
|---|---|:---:|
| `[payment_account.list] FAILED` | getPaymentAccounts error branch | ✅ aynen |
| `[payment_account.list] EMPTY` | getPaymentAccounts RLS silent-fail warn | ✅ aynen |
| `[payment_account.list] OK` | getPaymentAccounts success info | ✅ aynen |
| `[payment_account.create] FAILED` | createPaymentAccount | ✅ aynen |
| `[payment_account.update] FAILED` | updatePaymentAccount | ✅ aynen |
| `[payment_account.delete] FAILED` | deletePaymentAccount | ✅ aynen |
| `[payment_account.setActive] FAILED` | setActivePaymentAccount | ✅ aynen |
| `[payment_account.deactivateOthers] FAILED` | internal deactivateOthers | ✅ aynen |
| (no tag) | payment-method.service tüm metodları | ✅ asimetri aynen |

### 4.2 Return shape asimetrisi

| Service | Pattern | Durum |
|---|---|:---:|
| `payment-method.service.ts` | **throw-style**: `if (error) throw error` | ✅ aynen |
| `payment-account.service.ts` | **Result envelope**: `{ ok: boolean, error?: string, id?: string }` | ✅ aynen |

### 4.3 Query semantic'i

| Davranış | Korundu |
|---|:---:|
| `.select("*")` projection (her iki tablo list) | ✅ repo içinde |
| `.order("created_at", { ascending: false })` (payment_methods) | ✅ |
| `.order("is_active", desc).order("created_at", desc)` chain (payment_accounts) | ✅ |
| `.insert(payload).select().single()` chain (payment_accounts INSERT) | ✅ — id return için kritik |
| `.insert(payload)` plain (payment_methods INSERT — `.select().single()` chain YOK) | ✅ asimetri aynen |
| `.update(payload).eq("id", id)` chain (her iki tablo) | ✅ |
| `.delete().eq("id", id)` chain (her iki tablo) | ✅ |
| `.update({ is_active: true }).eq("id", id)` inline payload (setActive step 1) | ✅ |
| `.update({ is_active: false }).neq("id", keepId)` inline payload (deactivateOthers step 2) | ✅ — `.neq` predicate aynen |
| Service-level conditional payload build (`if (input.X !== undefined)`) | ✅ aynen (servis tarafı) |
| IBAN/swift/currency uppercase normalize | ✅ servis tarafı |
| Trim helper `(v ?? "").toString().trim()` | ✅ servis tarafı |
| Single-active orchestration: post-insert `if (is_active && data.id) deactivateOthers(data.id)` | ✅ servis tarafı |
| Single-active orchestration: post-update `if (input.is_active === true) deactivateOthers(id)` | ✅ servis tarafı |
| Single-active orchestration: setActive ALWAYS calls deactivateOthers after step 1 | ✅ servis tarafı |
| **2-step atomicity (race window orijinal)** | ✅ DEĞİŞMEDİ |
| RLS silent-fail detection: `!data \|\| data.length === 0 → console.warn` with hint | ✅ servis tarafı |
| `status` field RLS detection için repo'dan service'e geçer | ✅ Supabase native shape |

### 4.4 Throw mesajları (servis edge)

| Mesaj | Konum | Durum |
|---|---|:---:|
| `"ID gerekli"` | update/delete/setActive — early guard | ✅ aynen (4 nokta) |
| (no TR throw mesajları; payment-method throw'lar PostgrestError raw) | payment-method tüm metodları | ✅ aynen — wrapping YOK |

---

## 5. ARCHITECTURE STATE

### Sınır netliği

```
Admin Page Layer
  ├── payment-methods/page.tsx                ──┐
  ├── payment-accounts/page.tsx                 │  (caller — service'ten tüketir)
  └── settings/odeme/page.tsx                 ──┘
       │
       ▼ (service public API — DEĞIŞMEDİ)
Service Layer
  ├── payment-method.service.ts                 ──┐
  │   ├── getPaymentMethods                       │  (throw-style; tag YOK)
  │   ├── createPaymentMethod                     │
  │   ├── updatePaymentMethod                     │
  │   └── deletePaymentMethod                     │
  ├── payment-account.service.ts                  │  (Result envelope; [payment_account.*] tagged
  │   ├── getPaymentAccounts                      │   + RLS silent-fail detection)
  │   ├── createPaymentAccount                    │
  │   ├── updatePaymentAccount                    │  + single-active toggle orchestration
  │   ├── deletePaymentAccount                    │   (post-insert/update deactivateOthers
  │   ├── setActivePaymentAccount                 │    conditional; 2-step race window)
  │   └── internal deactivateOthers             ──┘
       │
       ▼ (repository public API)
Repository Layer (lib/db/payment.repository.ts)
  ├── findPaymentMethods                        ──┐
  ├── insertPaymentMethod                         │  (raw DB access + Supabase chain)
  ├── updatePaymentMethodById                     │  (sessiz: throw yok, console yok,
  ├── deletePaymentMethodById                     │   Result envelope yok)
  ├── findPaymentAccounts                         │
  ├── insertPaymentAccount                        │
  ├── updatePaymentAccountById                    │
  ├── deletePaymentAccountById                    │
  ├── setPaymentAccountActive                     │
  └── deactivateOtherPaymentAccounts            ──┘
       │
       ▼
Supabase Client — TEK TÜKETICI: repository
```

### Boundary tablosu

| Concern | Page | Service | Repository |
|---|:---:|:---:|:---:|
| UI state, toast, form handling | ✅ | ❌ | ❌ |
| Throw vs Result envelope (asimetri) | ❌ | ✅ | ❌ |
| Console.error tag asimetrisi | ❌ | ✅ | ❌ |
| RLS silent-fail detection (warn + hint) | ❌ | ✅ | ❌ |
| IBAN/swift uppercase + cleanIban | ❌ | ✅ | ❌ |
| Trim helper | ❌ | ✅ | ❌ |
| Conditional payload build | ❌ | ✅ | ❌ |
| Single-active toggle orchestration (2-step) | ❌ | ✅ | ❌ |
| `is_active` post-insert/update branch | ❌ | ✅ | ❌ |
| "ID gerekli" guard | ❌ | ✅ | ❌ |
| `.eq("id", id)` predicate | ❌ | ❌ | ✅ |
| `.neq("id", keepId)` predicate | ❌ | ❌ | ✅ |
| `.order` chain | ❌ | ❌ | ✅ |
| `.insert(...).select().single()` chain (account INSERT) | ❌ | ❌ | ✅ |
| Supabase client import | ❌ | ❌ | ✅ TEK TÜKETICI |

---

## 6. DOĞRULAMA ADIMLARI

| Adım | Sonuç |
|---|:---:|
| `npx tsc --noEmit` (full project) | ✅ clean (0 hata) |
| `npx eslint lib/db/payment.repository.ts app/services/payment-*.service.ts` | ✅ clean (0 hata, 0 uyarı) |
| Payment own tables canlı supabase tüketim | ✅ **0** |
| Service public API değişti mi? | ✅ HAYIR — 10 export aynen (8 mevcut + 2 type alias) |
| Caller migration | ✅ 0 satır (3 admin page service'ten tüketmeye devam) |
| Result envelope `{ ok, id?, error? }` | ✅ aynen (account); throw-style (method) |
| `[payment_account.*]` log tag asimetrisi | ✅ aynen |
| RLS silent-fail detection (warn + hint) | ✅ aynen |
| Single-active toggle 2-step davranışı (atomicity yok) | ✅ aynen — race window orijinal |
| `.neq("id", keepId)` predicate (deactivateOthers) | ✅ repo içinde aynen |
| `.insert(payload).select().single()` chain (account INSERT, id return) | ✅ repo içinde aynen |
| `.insert(payload)` plain (method INSERT — chain YOK) | ✅ asimetri aynen |
| INSERT/UPDATE payload alan sırası | ✅ servis tarafı conditional build aynen |
| `vitest run` | ⚠️ sandbox'ta rollup-linux-arm64-gnu binary eksik (önceki cycle'larla aynı) |

---

## 7. LOC RAPORU

| Dosya | LOC |
|---|---:|
| `lib/db/payment.repository.ts` (yeni) | 279 |
| `app/services/payment-account.service.ts` (202 → 206; +4 LOC yorumlar) | 206 |
| `app/services/payment-method.service.ts` (61 → 60; -1 LOC fazla blank line) | 60 |
| **TOPLAM (service + repo)** | **545** |

Repository (279 LOC) yorum-yoğun — pure query köprüsü; davranış kodu ~80 LOC.

---

## 8. PAYMENT DOMAIN — REPOSITORY BAĞIMSIZLIK SKORU

Pre-FAZ 35 (Supabase Dependency Audit, 2026-05-18):

| Kriter | Önce | Sonra | Δ |
|---|:---:|:---:|:---:|
| Type abstraction (PostgrestError sızıntısı) | 1/10 | 4/10 (DbError alias compatibility) | +3 |
| Repository pattern coverage | 1/10 | **10/10** (10/10 metod kapsama altında) | +9 |
| RPC dependency | N/A (yok) | N/A (yok) | — |
| EXCLUDE / DB-only feature | N/A | N/A | — |
| Component-direct DB tunnel | 10/10 (zaten temiz) | 10/10 | 0 |
| Service layer presence | 8/10 | 9/10 (artık business + DB clean separation) | +1 |
| Single-active toggle abstraction | 2/10 (inline) | 7/10 (repo metodları ayrı) | +5 |
| RLS silent-fail detection abstraction | 4/10 | 6/10 (repo `status` geçer, service detect eder) | +2 |
| Out-of-scope ayrım (service-role + mail) | 2/10 | 7/10 (server-only modül-level ayrı, mail reservation domain ayrı) | +5 |
| **Payment domain bağımsızlık skoru** | **3/10** | **7.5/10** | **+4.5** |

**Skor +4.5 puan iyileşme.** Payment own tables tamamen kapsama altında; out-of-scope concern'ler bilinçli olarak ayrı boundary'lere bırakıldı (gelecek cycle'lar için temiz temel).

### Tüm domain genel skor güncelleme

| Domain | Pre | Post |
|---|:---:|:---:|
| Reservation | 2/10 | ~5.5/10 |
| Manual Reservation | 2/10 | ~6/10 |
| **Payment** | **3/10** | **7.5/10** |
| Villa (read-only) | 5/10 | 5/10 (unchanged — bu cycle dokunulmadı) |
| Genel codebase | 2.5/10 | ~3.5/10 |

---

## 9. STRATEJİK SONUÇ

### 9.1 Hedef vs Gerçekleşen

| Hedef | Gerçekleşen |
|---|:---:|
| Payment domain own tables'larında 0 doğrudan Supabase call-site | ✅ |
| Service public API değişmez | ✅ 0 değişiklik |
| Caller migration sıfır | ✅ 3 admin page dokunulmadı |
| Result envelope davranışı korunur | ✅ payment-account aynen |
| `[payment_account.*]` log tag'leri korunur | ✅ 8 tag aynen |
| Throw-style vs Result-style asimetri | ✅ aynen |
| Single-active toggle BYTE-IDENTICAL | ✅ 2-step orchestration aynen |
| `deactivateOtherPaymentAccounts` ayrı query | ✅ repo'da bağımsız metod |
| Transaction/merge YOK | ✅ |
| Atomicity değiştirilmedi | ✅ race window aynen |
| RLS silent-fail detection korundu | ✅ |
| `.single()` resolver semantic (account INSERT) | ✅ repo içinde aynen |
| INSERT/UPDATE payload alan sırası | ✅ servis tarafı conditional aynen |
| `tsc` + `eslint` final clean | ✅ |

### 9.2 Availability + Financial Core Foundation

**Reservation + Manual reservation + Payment üç domain birlikte:**

```
Repository Layer (lib/db/*)
├── reservation.repository.ts            9 metod  (availability)
├── manual-reservation.repository.ts     9 metod  (availability)
├── payment.repository.ts                10 metod (financial)
├── villa.repository.ts                  6 metod  (read-only)
└── types.ts                             DbError alias
```

**Toplam: 34 repository metod** kapsama altında.
**~3400 LOC** service+helper+caller layer repository-backed.
**~415 LOC** migration yüzeyi (repo davranış kodu — yarın provider değişimi için).

### 9.3 Out-of-scope hatırlatması (gelecek cycle'lar)

1. **Reservation domain mail extension** — 3 mail API route (payment-link, payment-confirmed, bank-transfer-payment) reservation `findById` + `updateById` ile delegate edilebilir; `.maybeSingle()` resolver için yeni metod gerek.
2. **Service-role abstraction cycle** — `getSupabaseAdmin()` kullanan helper'lar (`payment-account.server.ts`, `admin-user.service.ts`, vb.) için ayrı boundary (`*ServerRepository` veya `AdminGateway`).
3. **Storage abstraction cycle** — `supabase.storage.*` (21 call-site) için repository pattern.
4. **Auth abstraction cycle** — `supabase.auth.*` (13 call-site) için `AuthProvider` interface.

---

**FAZ 1+3+4 sonu (tek cycle). Payment domain'in own tables mimari ayrımı tamamlandı. Availability + financial core artık repository-backed.**
