# 🛡️ Reservation Mail/Payment Extension — FAZ 0 MAPPING

**Tarih:** 2026-05-18
**Kapsam:** 3 mail API route'unun reservation tablo mutation'larının repository ayrımı hazırlığı.
**Durum:** Mapping tamamlandı; kod yazılmadı.
**Davranış kuralı:** BYTE-IDENTICAL — `.maybeSingle()` resolver, embed shape, HTTP status code matrix, JSON response shape, duplicate protection, mail-then-DB sequence, structured logging tag'leri AYNEN.

---

## 0. SCOPE

### 0.1 IN-SCOPE (bu cycle)

| Dosya | LOC | Supabase call | Tablo |
|---|---:|:---:|---|
| `app/api/mail/payment-link/route.ts` | 275 | 2 (1 READ + 1 UPDATE) | reservations |
| `app/api/mail/payment-confirmed/route.ts` | 265 | 2 (1 READ + 1 UPDATE) | reservations |
| `app/api/mail/bank-transfer-payment/route.ts` | 311 | 2 (1 READ + 1 UPDATE) | reservations |
| **TOPLAM** | **851** | **6** | |

### 0.2 OUT-OF-SCOPE (bilinçli)

- `lib/payment-account.server.ts` (`getActivePaymentAccount` server-only service-role) — auth/storage hardening cycle.
- `paid_amount` mutation'ları (admin reservations/[id]/page > saveAll) — zaten reservation repo `updateById` ile kapsama altında; payment confirmation flow'una doğrudan etki etmez.
- `payment_method_id`, `payment_preference` mutation'ları — reservation create/update flow'larında (zaten reservation repo'da).
- Mail template render katmanı (`lib/mail/templates/Payment*.ts`) — pure render; DB yok.
- `sendMail` core (`app/lib/mail/send`) — mail provider abstraction; DB yok.
- `applyRateLimit`, `authorizeAdminCaller`, `getMailConfig` — auth/config helpers.

---

## 1. ROUTE-BY-ROUTE FLOW MAPPING

### 1.1 `app/api/mail/payment-link/route.ts`

```
HTTP POST /api/mail/payment-link
Body: { reservationId: string }
Auth: Bearer admin

FLOW:
1. applyRateLimit(req, "mail")              [5 req/dakika/IP]
2. console.log "[mail.payment_link] POST"
3. authorizeAdminCaller(req)
   ↳ 401/403 → JSON { ok: false, error }
4. body.reservationId trim + validate
   ↳ 400 → JSON { ok: false, error: "reservationId zorunlu" }
5. SELECT reservations WHERE id = reservationId .maybeSingle()
   Embed: villa:villa_id ( title )
   Columns: id, reservation_no, name, email, start_date, end_date,
            total_price, total_price_try, prepayment_amount,
            paid_amount, payment_preference, payment_link,
            damage_deposit
   ↳ error || !rRaw → 404 { ok: false, error: "Rezervasyon bulunamadı" }
6. r.payment_link.trim() validation
   ↳ boş → 422 { ok: false, error: "Ödeme linki boş — önce link kaydet" }
7. r.email.trim() validation
   ↳ boş → 422 { ok: false, error: "Müşteri e-posta adresi yok" }
8. getMailConfig() → brand
9. getPaymentDisplayValues(...) (pure helper)
10. renderPaymentLinkEmail({...}) → { subject, html }
11. await sendMail({ to, subject, html, mailType: "payment_link", reservationId })
   ↳ !result.ok → 502 { ok: false, error: result.error || "Gönderilemedi" }
12. sentAt = new Date().toISOString()
13. UPDATE reservations SET {
        payment_link_status: "sent",
        payment_link_sent_at: sentAt
    } WHERE id = r.id
   ↳ updateErr → 200 { ok: true, warning: "Mail gönderildi ancak status güncellenemedi", id, recipient, sentAt }
14. 200 { ok: true, id, recipient, sentAt, payment_link_status: "sent" }
```

### 1.2 `app/api/mail/payment-confirmed/route.ts`

```
HTTP POST /api/mail/payment-confirmed
Body: { reservationId: string }
Auth: Bearer admin

FLOW:
1. applyRateLimit(req, "mail")
2. console.log "[mail.payment_confirmed] POST"
3. authorizeAdminCaller(req)
4. body.reservationId validation
5. SELECT reservations WHERE id = reservationId .maybeSingle()
   Embed: villa:villa_id ( title )
   Columns: id, name, email, start_date, end_date,
            total_price, total_price_try, prepayment_amount,
            paid_amount, payment_preference,
            payment_link_status,     ← payment-link route'unda YOK
            damage_deposit
   ⚠️ reservation_no + payment_link select EDİLMEZ
   ↳ 404 → { ok: false, error: "Rezervasyon bulunamadı" }
6. paid = Number(r.paid_amount) || 0
   ↳ paid <= 0 → 422 { ok: false, error: "Önce alınan tutarı kaydet (paid_amount > 0)" }
7. currentStatus = normalizePaymentLinkStatus(r.payment_link_status)
   ↳ currentStatus === "paid" → 422 { ok: false, error: "Ödeme zaten onaylanmış" }
       ⚠️ DUPLICATE PROTECTION — idempotency manual guard
8. r.email validation
   ↳ 422 → "Müşteri e-posta adresi yok"
9. getMailConfig() → brand
10. getPaymentDisplayValues(...)
11. renderPaymentConfirmedEmail({...})
12. await sendMail({ mailType: "payment_confirmed", ... })
   ↳ !result.ok → 502
13. UPDATE reservations SET {
        payment_link_status: "paid"
    } WHERE id = r.id
   ⚠️ payment_link_sent_at YOK (sadece status mutate edilir)
   ↳ updateErr → 200 { ok: true, warning: ..., id, recipient }
       ⚠️ sentAt response'ta YOK
14. 200 { ok: true, id, recipient, payment_link_status: "paid" }
```

### 1.3 `app/api/mail/bank-transfer-payment/route.ts`

```
HTTP POST /api/mail/bank-transfer-payment
Body: { reservationId: string }
Auth: Bearer admin

FLOW:
1. applyRateLimit(req, "mail")
2. console.log "[mail.bank_transfer_payment] POST"
3. authorizeAdminCaller(req)
4. body.reservationId validation
5. SELECT reservations WHERE id = reservationId .maybeSingle()
   Embed: villa:villa_id ( title )
   Columns: id, reservation_no, name, email, start_date, end_date,
            total_price, total_price_try, prepayment_amount,
            paid_amount, payment_preference,
            damage_deposit
   ⚠️ payment_link / payment_link_status SELECT EDİLMEZ
6. r.email validation
   ↳ 422
7. getActivePaymentAccount() (server-only service-role)
   accountDisplay = paymentAccountDisplay(account)
   ↳ !accountDisplay → 422 "Aktif firma hesabı bulunamadı"
8. getMailConfig() → brand
9. getPaymentDisplayValues(...)
10. renderBankTransferPaymentEmail({...})
   ⚠️ referenceCode = buildReferenceCode(reservation_no, id)
       (DB reservation_no öncelikli; fallback: id'nin son 8 char)
11. await sendMail({ mailType: "bank_transfer_payment", ... })
   ↳ 502
12. sentAt = new Date().toISOString()
13. UPDATE reservations SET {
        payment_link_status: "sent",
        payment_link_sent_at: sentAt
    } WHERE id = r.id
   ⚠️ payment-link ile AYNI UPDATE shape
14. 200 { ok: true, id, recipient, sentAt, payment_link_status: "sent" }
```

---

## 2. SUPABASE CALL-SITE ENVANTERİ

### 2.1 READ pattern'leri (3 farklı SELECT shape)

| Route | SELECT shape | Resolver |
|---|---|---|
| payment-link | id, reservation_no, name, email, start_date, end_date, total_price, total_price_try, prepayment_amount, paid_amount, payment_preference, **payment_link**, damage_deposit, villa:villa_id(title) | `.maybeSingle()` |
| payment-confirmed | id, name, email, start_date, end_date, total_price, total_price_try, prepayment_amount, paid_amount, payment_preference, **payment_link_status**, damage_deposit, villa:villa_id(title) | `.maybeSingle()` |
| bank-transfer | id, reservation_no, name, email, start_date, end_date, total_price, total_price_try, prepayment_amount, paid_amount, payment_preference, damage_deposit, villa:villa_id(title) | `.maybeSingle()` |

**Common alanlar (3 route da):** id, name, email, start_date, end_date, total_price, total_price_try, prepayment_amount, paid_amount, payment_preference, damage_deposit, villa:villa_id(title).

**Varyasyonlar:**
- `reservation_no`: payment-link + bank-transfer (sadece confirmed-mail YOK)
- `payment_link`: sadece payment-link
- `payment_link_status`: sadece payment-confirmed

### 2.2 UPDATE pattern'leri (2 farklı shape)

| Route | UPDATE shape | Predicate |
|---|---|---|
| payment-link | `{ payment_link_status: "sent", payment_link_sent_at: sentAt }` | `.eq("id", r.id)` |
| bank-transfer | `{ payment_link_status: "sent", payment_link_sent_at: sentAt }` | `.eq("id", r.id)` |
| payment-confirmed | `{ payment_link_status: "paid" }` (sent_at YOK) | `.eq("id", r.id)` |

**payment-link + bank-transfer UPDATE shape IDENTICAL.** payment-confirmed `sent_at` koymuyor.

### 2.3 Mevcut reservation repo metodları

`lib/db/reservation.repository.ts` şu an:
- `findById(id)` — `.single()` resolver + `SELECT_RESERVATION_DETAIL` (geniş embed)
- `findList()`, `findPaidAmount`, `findVillaCommissionRate`, `findOverlapping*`, `insert`, `updateById`, `deleteById`

**Eksik:** `.maybeSingle()` resolver + mail-spesifik SELECT shape.

---

## 3. CRITICAL SEMANTIC'LER (BYTE-IDENTICAL DONDURULMALI)

### 3.1 `.single()` vs `.maybeSingle()`

| Resolver | Missing row davranışı | Mevcut repo'da | Mail route'larda |
|---|---|:---:|:---:|
| `.single()` | error.code "PGRST116" döner; data: null | ✅ `findById` | ❌ |
| `.maybeSingle()` | data: null, error: null | ❌ | ✅ 3 route |

**Risk:** Mail route'lar `.maybeSingle()` kullanıyor; `if (fetchErr || !rRaw)` ile null kontrol ediyor. Eğer `findById`'yi reuse edersek error semantic değişir (PGRST116 → fetchErr branch'i yakalar; mevcut davranış `!rRaw` branch'i de yakalıyor → 404 dönüyor). Aynı sonuç ama **branch sırası farkı**.

**Karar:** Mevcut `findById` REUSE EDİLMEZ. Yeni `.maybeSingle()` resolver metodları.

### 3.2 Duplicate protection (idempotency)

| Route | Duplicate guard |
|---|---|
| payment-link | ❌ YOK — multiple "sent" override edilebilir |
| bank-transfer | ❌ YOK — aynı |
| payment-confirmed | ✅ VAR — `currentStatus === "paid"` → 422 "Ödeme zaten onaylanmış" |

**`normalizePaymentLinkStatus`** helper'ı service-edge'de pure — byte-identical kalır.

### 3.3 Mail-then-DB sequence + graceful degradation

```
sendMail → success → UPDATE reservations
                       ├── success → 200 normal
                       └── error   → 200 + warning (mail gitti, DB sapma)
```

**Hiçbir route'ta transaction YOK.** Mail başarılı ama DB update fail durumunda:
- HTTP 200 dönüyor (mail kullanıcıya gitmiş)
- `warning` field ile graceful degradation
- Caller bunu görür ve log/notify edebilir

**Bu davranış BYTE-IDENTICAL korunmalı.** Transaction abstraction YAPILMAZ.

### 3.4 Fire-forget davranışları

Mail dispatch hepsi `await sendMail(...)` — fire-forget YOK. Sequence:
- `sendMail` await'lı
- `UPDATE` await'lı

Bu refactor'da fire-forget eklenmez; mevcut davranış aynen.

### 3.5 Exchange-rate snapshot semantics

- Reservation row'dan `total_price_try`, `total_price`, `prepayment_amount`, `paid_amount`, `payment_preference` ham okunuyor.
- `getPaymentDisplayValues(...)` pure helper display values üretiyor.
- **Canlı kur fetch YOK; reservation snapshot'ı aynen kullanılıyor.**
- Mail template snapshot değerlerle render ediliyor.

Repository sadece SELECT yapar; helper service-edge'de.

### 3.6 Reference code (bank-transfer)

```
buildReferenceCode(reservation_no, id):
  - reservation_no varsa → onu kullan (REZ-2026-NNNN)
  - boşsa → id'nin son 8 alfanumerik karakter → "R-XXXXXXXX"
  - id de boşsa → "R-REZERVASYON"
```

Pure helper; route-spesifik. Repo'ya taşınmaz.

### 3.7 Webhook/idempotency riskleri

**Bu refactor'da webhook YOK.** Tüm 3 route admin tarafından `adminFetch` ile çağrılır (HTTP POST, Bearer auth). Provider callback YOK.

Idempotency:
- payment-confirmed: manual guard (`payment_link_status === "paid"` → 422)
- diğer ikisi: idempotency yok (re-send re-update yapar)

**Bu davranış BYTE-IDENTICAL korunmalı.** Provider webhook entegrasyonu gelecek cycle.

---

## 4. HTTP STATUS CODE MATRIX

| Kod | Trigger | Sıklık |
|---:|---|:---:|
| 200 (full) | sendMail OK + UPDATE OK | normal path |
| 200 (warning) | sendMail OK + UPDATE error | graceful degradation |
| 400 | reservationId boş | bad request |
| 401/403 | authorizeAdminCaller fail | auth |
| 404 | reservation fetchErr veya not found | missing |
| 422 (link) | payment_link boş (payment-link) | precondition |
| 422 (paid) | paid_amount <= 0 (payment-confirmed) | precondition |
| 422 (already) | payment_link_status === "paid" (payment-confirmed) | duplicate |
| 422 (email) | r.email boş (3 route) | precondition |
| 422 (account) | getActivePaymentAccount null (bank-transfer) | precondition |
| 500 | catch-all exception | error |
| 502 | sendMail fail | upstream |

**TÜM HTTP STATUS CODE'LARI BYTE-IDENTICAL KALMALI.**

---

## 5. JSON RESPONSE SHAPE MATRIX

### 5.1 Success (3 route, varyasyonlu)

```
payment-link 200:
  { ok: true, id: <mailId>, recipient: <email>, sentAt: <iso>, payment_link_status: "sent" }

bank-transfer 200:
  { ok: true, id: <mailId>, recipient: <email>, sentAt: <iso>, payment_link_status: "sent" }

payment-confirmed 200:
  { ok: true, id: <mailId>, recipient: <email>, payment_link_status: "paid" }
  ⚠️ sentAt YOK (sadece status mutate edildi)
```

### 5.2 Warning (mail OK + DB fail)

```
payment-link / bank-transfer 200+warning:
  { ok: true, warning: "...", id, recipient, sentAt }

payment-confirmed 200+warning:
  { ok: true, warning: "...", id, recipient }
  ⚠️ sentAt YOK
```

### 5.3 Error

```
{ ok: false, error: <string> }   tüm error code'lar için
```

**JSON SHAPE BYTE-IDENTICAL KALMALI.**

---

## 6. CONSOLE.LOG/INFO/WARN/ERROR TAG ENVANTERİ

### 6.1 payment-link route (11 tag)

```
[mail.payment_link] POST                       console.log
[mail.payment_link.auth] UNAUTHORIZED          console.error (401/403)
[mail.payment_link.auth] ADMIN_VERIFIED        console.info
[mail.payment_link] BAD_REQUEST                console.error (400)
[mail.payment_link] NOT_FOUND                  console.error (404)
[mail.payment_link] MISSING_LINK               console.error (422)
[mail.payment_link] MISSING_EMAIL              console.error (422)
[mail.payment_link] SEND_FAILED                console.error (502)
[mail.payment_link] STATUS_UPDATE_FAILED       console.error (200+warn)
[mail.payment_link] SENT                       console.info (200)
[mail.payment_link] EXCEPTION                  console.error (500)
```

### 6.2 payment-confirmed route (12 tag)

```
[mail.payment_confirmed] POST
[mail.payment_confirmed.auth] UNAUTHORIZED
[mail.payment_confirmed.auth] ADMIN_VERIFIED
[mail.payment_confirmed] BAD_REQUEST
[mail.payment_confirmed] NOT_FOUND
[mail.payment_confirmed] NO_PAID_AMOUNT        ← unique
[mail.payment_confirmed] ALREADY_PAID          ← unique (duplicate protection)
[mail.payment_confirmed] MISSING_EMAIL
[mail.payment_confirmed] SEND_FAILED
[mail.payment_confirmed] STATUS_UPDATE_FAILED
[mail.payment_confirmed] CONFIRMED             ← unique (vs SENT)
[mail.payment_confirmed] EXCEPTION
```

### 6.3 bank-transfer route (12 tag)

```
[mail.bank_transfer_payment] POST
[mail.bank_transfer_payment.auth] UNAUTHORIZED
[mail.bank_transfer_payment.auth] ADMIN_VERIFIED
[mail.bank_transfer_payment] BAD_REQUEST
[mail.bank_transfer_payment] NOT_FOUND
[mail.bank_transfer_payment] MISSING_EMAIL
[mail.bank_transfer_payment] NO_ACTIVE_ACCOUNT ← unique
[mail.bank_transfer_payment] SEND_FAILED
[mail.bank_transfer_payment] STATUS_UPDATE_FAILED
[mail.bank_transfer_payment] SENT
[mail.bank_transfer_payment] EXCEPTION
```

**Toplam: 35 unique tag.** Hepsi route-edge'de kalır.

---

## 7. TR ERROR MESAJLARI

| Mesaj | Route(s) |
|---|---|
| `"reservationId zorunlu"` | 3 route (400) |
| `"Rezervasyon bulunamadı"` | 3 route (404) |
| `"Ödeme linki boş — önce link kaydet"` | payment-link (422) |
| `"Müşteri e-posta adresi yok"` | 3 route (422) |
| `"Önce alınan tutarı kaydet (paid_amount > 0)"` | payment-confirmed (422) |
| `"Ödeme zaten onaylanmış"` | payment-confirmed (422) |
| `"Aktif firma hesabı bulunamadı — Firma Hesap Bilgileri'nden bir hesabı aktif yap"` | bank-transfer (422) |
| `"Gönderilemedi"` (fallback) | 3 route (502) |
| `"Mail gönderildi ancak status güncellenemedi"` (warning) | 3 route (200) |
| `"Bilinmeyen hata"` (catch fallback) | 3 route (500) |

**Tüm mesajlar BYTE-IDENTICAL kalır.**

---

## 8. REPOSITORY BOUNDARY KARARI

### 8.1 Reservation repo genişlemesi (3 yeni metod)

```ts
// .maybeSingle() + mail-spesifik SELECT shapes

reservationRepository.findByIdForPaymentLinkMail(id: string)
  → .from("reservations")
       .select("id, reservation_no, name, email, start_date, end_date,
                total_price, total_price_try, prepayment_amount,
                paid_amount, payment_preference, payment_link,
                damage_deposit, villa:villa_id ( title )")
       .eq("id", id)
       .maybeSingle()

reservationRepository.findByIdForPaymentConfirmedMail(id: string)
  → .from("reservations")
       .select("id, name, email, start_date, end_date,
                total_price, total_price_try, prepayment_amount,
                paid_amount, payment_preference, payment_link_status,
                damage_deposit, villa:villa_id ( title )")
       .eq("id", id)
       .maybeSingle()

reservationRepository.findByIdForBankTransferMail(id: string)
  → .from("reservations")
       .select("id, reservation_no, name, email, start_date, end_date,
                total_price, total_price_try, prepayment_amount,
                paid_amount, payment_preference, damage_deposit,
                villa:villa_id ( title )")
       .eq("id", id)
       .maybeSingle()
```

**3 farklı SELECT shape — exact extraction (kullanıcı kuralı: "no cleanup rewrite").**

### 8.2 UPDATE — mevcut `updateById` REUSE

```ts
// Route'lar mevcut reservationRepository.updateById ile delegate ediyor:

// payment-link + bank-transfer
await reservationRepository.updateById(r.id, {
  payment_link_status: "sent",
  payment_link_sent_at: sentAt,
});

// payment-confirmed
await reservationRepository.updateById(r.id, {
  payment_link_status: "paid",
});
```

**Yeni UPDATE metod YOK — generic `updateById` byte-identical kullanılır.**

### 8.3 Boundary tablosu

| Concern | Route | Reservation Repo |
|---|:---:|:---:|
| Rate limit | ✅ | ❌ |
| Admin auth | ✅ | ❌ |
| Body parse + validation | ✅ | ❌ |
| `.maybeSingle()` resolver + SELECT shape | indirect (metod seçer) | ✅ uygular |
| Embed (`villa:villa_id ( title )`) | ❌ | ✅ |
| Business preconditions (link boş, paid<=0, already paid, no email, no account) | ✅ | ❌ |
| `normalizePaymentLinkStatus` helper | ✅ (pure helper) | ❌ |
| Active account fetch (server-only service-role) | ✅ (separate module) | ❌ |
| Mail template render | ✅ | ❌ |
| sendMail orchestration | ✅ | ❌ |
| Mail success → UPDATE sequence | ✅ | ❌ |
| Mail success + UPDATE fail graceful degradation | ✅ | ❌ |
| Console.log/info/warn/error tag emission (35 tag) | ✅ | ❌ |
| HTTP status code + JSON response shape | ✅ | ❌ |
| Duplicate protection (manual idempotency guard) | ✅ | ❌ |
| Reference code build (bank-transfer) | ✅ | ❌ |
| Supabase client tüketimi | ❌ | ✅ TEK TÜKETICI |

---

## 9. RİSK ANALİZİ

| Risk | Olasılık | Etki | Mitigasyon |
|---|:---:|:---:|---|
| `.maybeSingle()` semantic drift | 🟢 DÜŞÜK | 🟠 KRİTİK (404 sapması) | Yeni 3 metod `.maybeSingle()` kullanır; mevcut `findById` `.single()` REUSE EDİLMEZ |
| SELECT shape drift (kolon farkları) | 🟢 DÜŞÜK | 🟠 ORTA (caller `r.X` okuma) | 3 ayrı metod; route-spesifik exact projection |
| Embed `villa:villa_id ( title )` drift | 🟢 DÜŞÜK | 🟠 ORTA | Repo içinde aynen |
| Duplicate protection kaybı (payment-confirmed) | 🟢 DÜŞÜK | 🔴 KRİTİK (financial) | Route-edge'de aynen; repo dokunmaz |
| Mail-then-DB sequence değişimi | 🟢 DÜŞÜK | 🔴 KRİTİK | Route-edge'de aynen; transaction YAPILMAZ |
| Graceful degradation (200+warning) | 🟢 DÜŞÜK | 🟠 ORTA | JSON shape byte-identical |
| HTTP status code matrix | 🟢 DÜŞÜK | 🔴 KRİTİK | Route-edge; aynen |
| TR error mesajları | 🟢 DÜŞÜK | 🟠 ORTA | Route-edge'de aynen |
| 35 console tag | 🟢 DÜŞÜK | 🟢 DÜŞÜK | Route-edge'de aynen |
| `getActivePaymentAccount` server-only context | 🟢 DÜŞÜK | 🔴 KRİTİK (güvenlik) | DOKUNULMAZ (out-of-scope) |
| `normalizePaymentLinkStatus` helper drift | 🟢 DÜŞÜK | 🟠 ORTA | Pure helper; route-edge |
| `getPaymentDisplayValues` exchange-rate snapshot | 🟢 DÜŞÜK | 🟠 ORTA | Pure helper; aynen |
| `buildReferenceCode` bank-transfer | 🟢 DÜŞÜK | 🟢 DÜŞÜK | Route-spesifik helper; aynen |
| TS variance (ReservationRow type local definitions) | 🟡 ORTA | 🟢 DÜŞÜK | Route'larda local type aynen; repo return shape ham geçer; route cast yapar |
| Caller migration | — | — | Mail route'ları HTTP endpoint olarak çağrılır; HTTP caller'ları (orchestrators) etkilenmez |

---

## 10. EXTRACTION PLANI

### FAZ 1 — READ extraction
Reservation repo'ya 3 yeni metod:
- `findByIdForPaymentLinkMail(id)`
- `findByIdForPaymentConfirmedMail(id)`
- `findByIdForBankTransferMail(id)`

3 route'ta SELECT chain'i `reservationRepository.*` çağrısına çevir.
Route iç davranışı (404 branch, TR mesajları, tag) aynen.

### FAZ 2 — Payment link mutation extraction
2 route'taki UPDATE (`payment_link_status: "sent"` + `payment_link_sent_at`) `reservationRepository.updateById(id, payload)`'a delegate.
- payment-link
- bank-transfer

Yeni repo metod GEREK YOK — mevcut `updateById` reuse.

### FAZ 3 — Payment confirmation update extraction
payment-confirmed UPDATE (`payment_link_status: "paid"`) `reservationRepository.updateById` ile delegate. Duplicate protection + paid_amount precondition route-edge'de aynen.

### FAZ 4 — Route delegation cleanup
3 route'tan `import { supabase }` kaldırılır. Repo import eklenir. Diğer hiçbir şey değişmez.

### FAZ 5 — Final verification
- tsc + eslint
- 3 route → 0 doğrudan supabase doğrulama
- Codebase genelinde kalan supabase call-site audit (yeni güncel listeleme)
- Final rapor

---

## 11. NIHAİ KARARLAR

1. ✅ Repository genişlemesi: **`lib/db/reservation.repository.ts`'e 3 yeni READ metodu**.
2. ✅ Yeni metodlar `.maybeSingle()` resolver kullanır (mevcut `findById` `.single()` REUSE EDİLMEZ).
3. ✅ 3 farklı SELECT shape — route-spesifik exact projection (no cleanup rewrite).
4. ✅ UPDATE tarafı mevcut `updateById` REUSE EDİLİR (yeni write metod YOK).
5. ✅ Embed (`villa:villa_id ( title )`) repo içinde aynen.
6. ✅ Mail orchestration + business preconditions + duplicate protection + graceful degradation route-edge'de aynen.
7. ✅ HTTP status code matrix + JSON response shape + 35 console tag + TR mesajları BYTE-IDENTICAL.
8. ✅ Transaction/refactor/merge YAPILMAZ.
9. ✅ Atomicity (mail-then-DB; race window) DEĞIŞTİRİLMEZ.
10. ✅ Caller migration YOK (HTTP endpoint olarak çağrılır; orchestrator caller'lar etkilenmez).
11. ❌ Generic mail repository YAPILMAZ.
12. ❌ Transaction abstraction YAPILMAZ.
13. ❌ `lib/payment-account.server.ts` DOKUNULMAZ.
14. ❌ `normalizePaymentLinkStatus`, `getPaymentDisplayValues`, `buildReferenceCode` helper'ları DOKUNULMAZ.
15. ❌ `sendMail`, `getMailConfig`, `applyRateLimit`, `authorizeAdminCaller` DOKUNULMAZ.

---

**FAZ 0 sonu. Doğrudan FAZ 1'e geçiyorum.**
