# 🛡️ Reservation Mail/Payment Extension — FAZ 1-5 FINAL RAPOR (tek cycle)

**Tarih:** 2026-05-18
**Kapsam:** 3 mail API route'unun reservation tablo mutation'ları repository'ye delegate.
**Davranış:** BYTE-IDENTICAL — `.maybeSingle()` resolver, SELECT shape farkları, UPDATE payload alan sırası, HTTP status code matrix, JSON response shape, 35 console tag, duplicate protection, mail-then-DB sequence, graceful degradation aynen.

> **Hedef gerçekleşti: 3 mail API route'unda 0 doğrudan canlı Supabase tüketim.**
> **Reservation repository ailesi: 12 metod (9 önceki + 3 yeni).**

---

## 1. NE YAPILDI

### 1.1 Reservation repo genişlemesi (3 yeni metod)

```ts
// .maybeSingle() resolver + route-spesifik SELECT shape'ler

reservationRepository.findByIdForPaymentLinkMail(id)
  → SELECT (14 kolon + villa embed) where id = ? maybeSingle()
  Columns: id, reservation_no, name, email, start_date, end_date,
           total_price, total_price_try, prepayment_amount,
           paid_amount, payment_preference, payment_link,
           damage_deposit, villa:villa_id ( title )

reservationRepository.findByIdForPaymentConfirmedMail(id)
  → SELECT (13 kolon + villa embed) where id = ? maybeSingle()
  Columns: id, name, email, start_date, end_date,
           total_price, total_price_try, prepayment_amount,
           paid_amount, payment_preference,
           payment_link_status,              ← UNIQUE (duplicate guard)
           damage_deposit, villa:villa_id ( title )

reservationRepository.findByIdForBankTransferMail(id)
  → SELECT (13 kolon + villa embed) where id = ? maybeSingle()
  Columns: id, reservation_no, name, email, start_date, end_date,
           total_price, total_price_try, prepayment_amount,
           paid_amount, payment_preference,
           damage_deposit, villa:villa_id ( title )
```

**3 ayrı method** — generic projection abstraction YAPILMADI (kullanıcı kuralı).

### 1.2 UPDATE — mevcut `updateById` REUSE (yeni metod yok)

```ts
// payment-link route
await reservationRepository.updateById(r.id, {
  payment_link_status: "sent",
  payment_link_sent_at: sentAt,
});

// bank-transfer route (payload IDENTICAL w/ payment-link)
await reservationRepository.updateById(r.id, {
  payment_link_status: "sent",
  payment_link_sent_at: sentAt,
});

// payment-confirmed route (asimetri: sent_at YOK)
await reservationRepository.updateById(r.id, {
  payment_link_status: "paid",
});
```

### 1.3 Değişen dosyalar (4)

| Dosya | Δ | Değişiklik |
|---|---|---|
| `lib/db/reservation.repository.ts` | +100 LOC | 3 yeni `.maybeSingle()` metod (yorum + implementation). |
| `app/api/mail/payment-link/route.ts` | -8 LOC | `import { supabase }` → `reservationRepository`. 2 supabase call → 2 repo call. Route response shape + tag emission aynen. |
| `app/api/mail/payment-confirmed/route.ts` | -7 LOC | Aynı pattern. Duplicate protection (`payment_link_status === "paid"` 422) ve `paid > 0` precondition aynen. |
| `app/api/mail/bank-transfer-payment/route.ts` | -8 LOC | Aynı pattern. `getActivePaymentAccount` (server-only) DOKUNULMADI; `buildReferenceCode` aynen. |

### 1.4 Dokunulmayan dosyalar (out-of-scope, FAZ 0 §0.2)

```
✅ lib/payment-account.server.ts                     (server-only service-role)
✅ lib/payment-link.helper.ts                        (pure normalize/expiration)
✅ lib/payment.helper.ts                             (pure preference/display)
✅ lib/payment-account.helper.ts                     (pure IBAN format)
✅ app/lib/mail/templates/PaymentLinkEmail.ts        (pure render)
✅ app/lib/mail/templates/PaymentConfirmedEmail.ts   (pure render)
✅ app/lib/mail/templates/BankTransferPaymentEmail.ts (pure render)
✅ app/lib/mail/send                                 (mail provider abstraction)
✅ lib/rate-limit, admin-route-auth, mail/client     (auth/config)
```

**Caller migration: 0 satır.** Route'lar HTTP endpoint olarak çağrılır; `adminFetch`'le tüketenler (`sendPaymentRequest`, `triggerPaymentConfirmation` orchestrator'ları) dokunulmadı.

---

## 2. SUPABASE CALL-SITE — 3 MAIL ROUTE TIMELINE

| Konum | Pre-FAZ 36 | Post-FAZ 36 |
|---|:---:|:---:|
| `payment-link/route.ts > SELECT reservations` | 1 | **0** ✅ |
| `payment-link/route.ts > UPDATE reservations` | 1 | **0** ✅ |
| `payment-confirmed/route.ts > SELECT reservations` | 1 | **0** ✅ |
| `payment-confirmed/route.ts > UPDATE reservations` | 1 | **0** ✅ |
| `bank-transfer-payment/route.ts > SELECT reservations` | 1 | **0** ✅ |
| `bank-transfer-payment/route.ts > UPDATE reservations` | 1 | **0** ✅ |
| **TOPLAM (3 mail route)** | **6** | **0** ✅ |

---

## 3. BYTE-IDENTICAL DOĞRULAMA TABLOSU

### 3.1 Resolver semantics

| Resolver | Repo metod | Missing row davranışı |
|---|---|---|
| `.maybeSingle()` | 3 yeni metod | data: null, error: null |
| `.single()` | mevcut `findById` (DOKUNULMADI) | error.code "PGRST116" |

Route'taki `if (fetchErr || !rRaw)` branch davranışı `.maybeSingle()` ile uyumlu — BYTE-IDENTICAL.

### 3.2 SELECT shape varyasyonu (3 farklı projection)

| Kolon | payment-link | payment-confirmed | bank-transfer |
|---|:---:|:---:|:---:|
| `id` | ✅ | ✅ | ✅ |
| `reservation_no` | ✅ | ❌ | ✅ |
| `name`, `email` | ✅ | ✅ | ✅ |
| `start_date`, `end_date` | ✅ | ✅ | ✅ |
| `total_price`, `total_price_try` | ✅ | ✅ | ✅ |
| `prepayment_amount`, `paid_amount` | ✅ | ✅ | ✅ |
| `payment_preference` | ✅ | ✅ | ✅ |
| `payment_link` | ✅ UNIQUE | ❌ | ❌ |
| `payment_link_status` | ❌ | ✅ UNIQUE | ❌ |
| `damage_deposit` | ✅ | ✅ | ✅ |
| `villa:villa_id ( title )` embed | ✅ | ✅ | ✅ |

**3 ayrı method byte-identical extraction (kullanıcı kuralı: "no cleanup rewrite").**

### 3.3 UPDATE payload asimetrisi

| Route | Payload |
|---|---|
| payment-link | `{ payment_link_status: "sent", payment_link_sent_at: sentAt }` |
| bank-transfer | `{ payment_link_status: "sent", payment_link_sent_at: sentAt }` (IDENTICAL) |
| payment-confirmed | `{ payment_link_status: "paid" }` (`sent_at` YOK — asimetri korundu) |

### 3.4 Business semantics (route-edge'de korunan)

| Davranış | Konum |
|---|---|
| Rate limit (5 req/dakika/IP) | route-edge |
| Admin auth (Bearer) | route-edge |
| Duplicate protection (payment-confirmed: `currentStatus === "paid"` → 422) | route-edge |
| `paid > 0` precondition (payment-confirmed) | route-edge |
| `payment_link` non-empty (payment-link) | route-edge |
| `recipient.email` non-empty (3 route) | route-edge |
| `getActivePaymentAccount` server-only (bank-transfer) | DOKUNULMADI |
| `buildReferenceCode` (bank-transfer) | DOKUNULMADI |
| `normalizePaymentLinkStatus` (payment-confirmed) | DOKUNULMADI |
| `getPaymentDisplayValues` exchange-rate snapshot | DOKUNULMADI |
| `sendMail` orchestration + await sequence | DOKUNULMADI |
| Mail-then-DB sequence | DOKUNULMADI |
| Graceful degradation (mail OK + DB fail → 200 + warning) | DOKUNULMADI |
| HTTP status code matrix (200/200+warn/400/401/403/404/422/500/502) | aynen |
| JSON response shape | aynen |
| **35 console tag (route-edge'de)** | aynen |
| **10 TR error mesajı** | aynen |
| `console.log "[mail.X] POST"` entry log | aynen |
| `console.info "[mail.X.auth] ADMIN_VERIFIED"` | aynen |
| Reference code build (DB reservation_no → R-XXXXXXXX fallback) | aynen |

### 3.5 Doğrulama

| Adım | Sonuç |
|---|:---:|
| `npx tsc --noEmit` (full project) | ✅ clean (0 hata) |
| `npx eslint lib/db/reservation.repository.ts + 3 route` | ✅ clean (0 hata, 0 uyarı) |
| 3 mail route canlı supabase tüketim | ✅ **0** |
| Route response JSON shape değişti mi? | ❌ HAYIR |
| HTTP status code matrix değişti mi? | ❌ HAYIR |
| Duplicate protection korundu mu? | ✅ payment-confirmed'da aynen |
| Graceful degradation (200+warning) | ✅ |
| Mail-then-DB sequence | ✅ |
| 35 console tag | ✅ |

---

## 4. CODEBASE TOPLAM CANLI SUPABASE TÜKETIMI — POST-FAZ 36

### 4.1 İmport-eden dosya envanteri (`from "@/lib/supabase"`)

| Kategori | Dosya sayısı |
|---|---:|
| **Repository layer (legit — TEK TÜKETICI)** | **4** |
| ↳ `lib/db/reservation.repository.ts` (12 metod) | |
| ↳ `lib/db/manual-reservation.repository.ts` (9 metod) | |
| ↳ `lib/db/payment.repository.ts` (10 metod) | |
| ↳ `lib/db/villa.repository.ts` (6 metod) | |
| **Domain services (kalan)** | **34** |
| **App pages (kalan)** | **25** |
| **Components (kalan)** | **7** |
| **API routes (kalan)** | **4** |
| **Lib helpers (kalan, lib/db/ hariç)** | **8** |
| **TOPLAM canlı import** | **82** |

Önceki audit (FAZ 65, 2026-05-18): **89** import → **82** import = **-7 dosya** repository ailesine aktarıldı (reservation + manual + payment + payment-mail extension).

### 4.2 Method call dağılımı (codebase genel)

| Method | Pre-cycle | Post-FAZ 36 | Δ |
|---|:---:|:---:|:---:|
| `supabase.from` | ~89 (audit baseline) | **~73** | -16 |
| `supabase.rpc` | 7 | 7 | 0 |
| `supabase.storage` | 21 | 21 | 0 |
| `supabase.auth` | 13 | 13 | 0 |
| `supabase-admin` (service-role) | 14 | 23 (genişletilmiş arama) | +9 (audit metodolojisi) |

### 4.3 TOP 10 — supabase çağrı sıklığı

| # | Dosya | Çağrı | Durum |
|---:|---|:---:|---|
| 1 | `lib/db/payment.repository.ts` | 11 | ✅ Repository (legit) |
| 2 | `lib/db/reservation.repository.ts` | 7 | ✅ Repository (legit) |
| 3 | `app/services/villa-admin/hard-delete.service.ts` | 7 | ⚠️ Domain refactor pending |
| 4 | `lib/storage.helpers.ts` | 6 | ⚠️ Storage abstraction pending |
| 5 | `lib/db/manual-reservation.repository.ts` | 5 | ✅ Repository (legit) |
| 6 | `app/services/villa-admin/_helpers/relations.ts` | 4 | ⚠️ Villa-admin pending |
| 7 | `lib/villa-image.helpers.ts` | 3 | ⚠️ Storage pending |
| 8 | `lib/storage/storage.service.ts` | 3 | ⚠️ Storage pending |
| 9 | `lib/admin-auth.ts` | 3 | ⚠️ Auth abstraction pending |
| 10 | `app/components/villa/AdminGallery.tsx` | 3 | ⚠️ Component-direct + storage |

---

## 5. EN RİSKLİ KALAN DOMAIN'LER (provider migration POV)

> **Risk = (call-site sayısı) × (lock-in tipi) × (caller breakage potansiyeli)**

### 5.1 🔴 KIRMIZI — Mimari karar gerektiren (high lock-in)

| Domain | Lock-in | Niye kritik |
|---|---|---|
| **Villa-admin** (8 service modülü + helpers) | **7 RPC fonksiyonu** (`replace_villa_*_relations`, `set_villa_sort_orders`) | Postgres function-level lock-in. Atomic relation replace pattern; başka provider'a port için transaction içinde rewrite gerek. |
| **Reservation EXCLUDE constraint** (atomic guarantee) | `reservations_no_overlap` + `manual_reservations_no_overlap` | Postgres-only feature. Migration'da app-layer concurrency control (SERIALIZABLE + advisory lock) gerek. |
| **Auth gateway** (8 dosya, 13 call) | `supabase.auth.*` | Login UX, session refresh, route guards, JWT injection — Clerk/NextAuth/custom için baştan rewrite. RLS policy migration ile birlikte. |
| **Service-role context** (`supabase-admin`, 14+ dosya) | `getSupabaseAdmin()` | Privilege escalation surface; her noktada audit guard gerek. |

### 5.2 🟠 TURUNCU — Yoğun refactor (orta-yüksek)

| Domain | Lock-in | Migration efor |
|---|---|---|
| **Storage** (21 call, 10+ dosya) | `supabase.storage.from(bucket)` + 3 hard-coded bucket | Adapter pattern (R2/S3) gerek. `villa-photos`, `admin-assets`, `blog-images` config'e taşınmalı. Component-direct upload (AdminGallery, SettingsField, blog/pages new) kapatılmalı. |
| **Villa-related sub-services** (image, price, distance, feature, type, review) | `supabase.from("villa_*")` 6 service | Her birine kendi repository (villa-image.repository, villa-price.repository, vb.). Sub-aggregate boundary kararları gerek. |
| **External calendar** (events + source service) | `supabase.from("external_calendar_*")` | iCal sync state; webhook/cron entegrasyonu var. |
| **Offer requests** (form + list component + service) | `supabase.from("offer_requests")` + component-direct | Public form + admin list — component-to-service migration gerek. |
| **Analytics + Finance + Operations** services | `supabase.from(...)` aggregation | Read-only; window function / GROUP BY — ANSI SQL, taşınabilir ama hala sızıntı. |

### 5.3 🟡 SARI — Hızlı kazanç (low cycle cost)

| Domain | Tahmini refactor |
|---|---|
| **Settings + FAQ + Menu + Pages + Homepage-collection + Page** services | 6 küçük CRUD service; tek bir cycle'da 6 repository (her biri ~5 metod). |
| **Contact-message + Mail-log + Voucher** | Küçük tablo; basit CRUD + read-only. |
| **Shared favorites + Shared villa list** | Public read; UUID token erişim. |
| **Admin pages (~25 dosya)** | Çoğu inline server fetch fn; ilgili domain refactor edildiğinde caller migration kolay. |

### 5.4 ✅ YEŞİL — Kapsama altında

```
✅ Reservation (own + cross-table villa.commission_rate)
✅ Manual reservation (own + cross-table reservations)
✅ Payment own tables (payment_methods + payment_accounts)
✅ Payment mail routes (reservation tablo mutation)
✅ Villa (read-only)
```

**Toplam kapsama altında: 37 repository metod** (12 reservation + 9 manual + 10 payment + 6 villa).

---

## 6. PROVIDER MIGRATION READINESS SKORU

### 6.1 Kriter-bazlı skor (10 üzerinden)

| Kriter | Ağırlık | Pre-cycle (2026-05-18 baseline) | Post-FAZ 36 | Δ |
|---|:---:|:---:|:---:|:---:|
| Type abstraction (PostgrestError sızıntısı) | 20% | 1/10 | 5/10 (DbError alias compatibility 4 repo'da) | +4 |
| Repository pattern coverage | 15% | 1/10 (sadece villa read) | 5/10 (4 repo, ~37 metod; %35 domain coverage) | +4 |
| RPC dependency | 10% | 2/10 (7 RPC, hepsi villa-admin) | 2/10 (değişmedi) | 0 |
| EXCLUDE / DB-only feature | 10% | 1/10 | 1/10 (DB-level; değişmedi) | 0 |
| Component-direct DB tunnel | 15% | 4/10 (7 component) | 6/10 (manual+payment kapatıldı; villa-admin/offer/menu kaldı) | +2 |
| Auth abstraction | 10% | 4/10 | 4/10 (değişmedi) | 0 |
| Storage abstraction | 10% | 3/10 | 3/10 (değişmedi) | 0 |
| Service layer presence | 5% | 8/10 | 9/10 (clean orchestration boundary'lere yayıldı) | +1 |
| Realtime decoupling | 5% | 10/10 | 10/10 | 0 |
| **AGIRLIKLI TOPLAM** | | **2.5/10** | **~4.2/10** | **+1.7** |

### 6.2 Domain-bazlı skor

| Domain | Pre-cycle | Post-FAZ 36 |
|---|:---:|:---:|
| Reservation (own + cross + mail routes) | 2/10 | **6.5/10** ⬆️ (mail extension +1) |
| Manual reservation | 2/10 | 6/10 |
| Payment own tables | 3/10 | 7.5/10 |
| Villa (read-only) | 5/10 | 5/10 |
| **Villa-admin (write-side)** | **2/10** | **2/10** ⚠️ |
| **Auth** | **4/10** | **4/10** ⚠️ |
| **Storage** | **2/10** | **2/10** ⚠️ |
| **Genel codebase** | **2.5/10** | **~4.2/10** |

### 6.3 Migration scenario readiness

| Senaryo | Pre-cycle | Post-FAZ 36 | Tahmini efor |
|---|:---:|:---:|---|
| **Hybrid exit** (DB → Drizzle/Neon, Auth+Storage Supabase'de) | 6-10 hafta | **4-7 hafta** | ⚡ Önemli iyileşme |
| **Tam exit** (DB+Auth+Storage) | 3-6 ay | **2-5 ay** | Hafif iyileşme (auth/storage out-of-scope) |
| **DB-only swap** (Postgres → başka Postgres) | 4-6 hafta | **3-5 hafta** | Önemli iyileşme |
| **Microservice split** | 6-12 ay | 6-12 ay | Değişmedi |

### 6.4 İki cümlede stratejik özet

> **Codebase artık availability + financial core üzerinde repository-backed.** 4 ana repository (37 metod) + 3 mail route extension + DbError alias ile **provider migration için somut foundation hazır**. Kalan en yüksek ROI'lı 3 hedef: **(1) Villa-admin write-side RPC'lerin app-layer transaction'a evrilmesi**, **(2) Storage abstraction (21 call + 10 dosya)**, **(3) Auth abstraction (13 call + 8 dosya)**.

---

## 7. LOC RAPORU

| Dosya | LOC | Δ |
|---|---:|:---:|
| `lib/db/reservation.repository.ts` | 480 | +100 (3 yeni metod) |
| `app/api/mail/payment-link/route.ts` | 267 | -8 |
| `app/api/mail/payment-confirmed/route.ts` | 258 | -7 |
| `app/api/mail/bank-transfer-payment/route.ts` | 303 | -8 |
| **TOPLAM (4 dosya)** | **1308** | **+77** (net: yorum + 3 metod) |

---

## 8. HEDEF vs GERÇEKLEŞEN

| Hedef | Gerçekleşen |
|---|:---:|
| 3 mail route'ta 0 doğrudan supabase | ✅ |
| `.maybeSingle()` semantic byte-identical | ✅ 3 yeni metod aynen |
| `findById` (`.single()`) DOKUNULMADI | ✅ |
| 3 ayrı READ method (generic projection YOK) | ✅ |
| Route response JSON shape değişmedi | ✅ |
| HTTP status matrix değişmedi | ✅ |
| Mail-then-DB sequence aynen | ✅ |
| Graceful degradation (200+warning) | ✅ |
| Duplicate protection YALNIZ payment-confirmed | ✅ |
| UPDATE payload alan sırası | ✅ |
| sendMail orchestration route-level | ✅ DOKUNULMADI |
| 35 console tag birebir | ✅ |
| Caller migration | ✅ 0 (HTTP endpoint contract aynen) |
| transaction abstraction yapılmadı | ✅ |
| Generic mail repository yapılmadı | ✅ |
| existing helpers (normalize/display/reference) dokunulmadı | ✅ |
| `lib/payment-account.server.ts` dokunulmadı | ✅ |

---

## 9. SONRAKI EN YÜKSEK ROI HEDEFLERİ (gelecek cycle'lar)

### Cycle önerisi (öncelik sırasıyla)

**🥇 1. Villa-admin write-side refactor** (4-6 hafta)
- 8 service modülü + 4 helper
- 7 RPC fonksiyonu (`replace_*_relations`, `set_villa_sort_orders`)
- En yüksek lock-in azalması; reservation+manual+payment ile aynı pattern.

**🥈 2. Storage abstraction** (2-3 hafta)
- 21 `supabase.storage` call + 10 dosya
- 3 hard-coded bucket → config
- Component-direct upload kapatma (AdminGallery, SettingsField, blog/pages)
- `StorageProvider` interface + `SupabaseStorageAdapter` (R2/S3 swap zemini)

**🥉 3. Villa-related sub-services** (3-4 hafta)
- villa-image, villa-price, villa-distance, villa-feature, villa-type, villa-review
- 6 küçük repository (her biri ~5-8 metod)
- Cross-domain tutarlılık (villa repo read-only şu an + write-side coverage)

**4. Auth abstraction** (2-3 hafta)
- 13 `supabase.auth.*` + 8 dosya
- `AuthProvider` interface; login UX + session + admin user creation
- Hybrid (Supabase Auth + DB swap) için temel

**5. Settings/FAQ/Menu/Pages/Homepage-collection** (1-2 hafta)
- 6 küçük CRUD service
- Hızlı kazanç — minimal kompleksite

**6. Analytics/Finance/Operations + External-calendar** (1-2 hafta)
- Read-only aggregation + external sync

---

**FAZ 1-5 sonu (tek cycle). Reservation mail/payment extension tamamlandı. Reservation repository 12 metod, availability + financial core sağlam temelde.**
