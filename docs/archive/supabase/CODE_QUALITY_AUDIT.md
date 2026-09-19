# Maki Villa Platform — Code Quality / Maintainability / Architecture Audit

**Tarih:** 2026-05-17
**Kapsam:** Yalnızca kod kalitesi, sürdürülebilirlik, mimari sağlamlık. Güvenlik, RLS, infra, devops, feature scope ve UX dışarıda bırakıldı.
**Yaklaşım:** Read-only statik analiz — hiçbir dosya değiştirilmedi.

---

## 0. Ölçek Özeti

| Metrik | Değer |
|---|---|
| TS / TSX dosyası (node_modules ve .next hariç) | 326 |
| Toplam LOC | ~77.200 |
| API route handler | 25 |
| `app/services/` altında servis dosyası | 33 |
| `app/components/` altında bileşen | ~110 |
| Test dosyası | 13 (~2.110 LOC) |
| Manuel-tipli DB schema (types/database.ts) | 720 LOC |
| `unstable_cache` + tag invalidation kullanan helper sayısı | 10+ |
| Manuel migration sayısı | DB tarafında muhafaza ediliyor |
| `useState` toplam (tsx) | 240+ occurrence |
| `useEffect` toplam (tsx) | 240 occurrence |
| `: any` / `<any>` / `as any` occurrence | 95 |
| `// eslint-disable ... no-explicit-any` | 25 |
| TSX dosyalarında doğrudan `supabase.from(...)` (service layer'ı bypass) | 7 dosya |
| 500+ LOC dosya sayısı | 35 |
| 800+ LOC dosya sayısı | 11 |
| 1000+ LOC dosya sayısı | 4 |
| Server component sayısı (page.tsx, `"use client"` yok) | ~25 |
| `"use client"` directive | 98 dosya |

---

## 1. Puanlama (10 üzerinden)

| Boyut | Skor | Kısa Yargı |
|---|---|---|
| **Overall Code Quality** | **7.3 / 10** | Senior-level mühendislik kararları var, ama orchestration / mega-file katmanı henüz refactor tamamlanmadan duruyor. |
| **Maintainability** | **6.8 / 10** | Domain bazında iyi izolasyon var, ama "dokunması korkutucu" 4-5 dosya hala mevcut. |
| **TypeScript Quality** | **7.5 / 10** | Hand-rolled `Database` typed; saf domain'ler güçlü typed; ancak admin formlarında `useState<any>` adası kalmış. |
| **React Architecture** | **6.5 / 10** | Hook hijyeni saf domain'lerde temiz; admin orchestrator sayfalarında "useEffect chain spaghetti" var. |
| **Testability** | **7.0 / 10** | Pure helper'lar exceptional düzeyde test edilmiş; React layer + service layer + E2E hiç test edilmemiş. |
| **Frontend Cleanliness** | **6.2 / 10** | Public villa sayfaları temiz; admin sayfaları JSX yoğun + inline logic ağır. |
| **Service Layer Quality** | **6.8 / 10** | Tek (villa) domain'de repository pattern uygulanmış; geri kalan 32 service hala Supabase'e doğrudan bağlı. |

**Senior SaaS hissi:** Orta-üst. Refactor metodolojisi (FAZ X numaralı stabilization sweep'ler) gerçekten profesyonel. Bittiğinde 9.0+ olabilecek bir codebase'in yolda 7 noktasındaki snapshot'ı.

---

## 2. Dosya Yapısı Analizi

### 2.1 Mega-file tablosu (en büyük 15)

| LOC | Dosya | Tür | Yargı |
|---|---|---|---|
| 1810 | `app/(admin)/maki-admin/reservations/[id]/page.tsx` | God orchestrator | FAZ 1+2+3 extraction sonrası **hala** kritik mega-file. 19 useEffect, 31 useState, saveAll ~220 satır. |
| 1278 | `app/(admin)/maki-admin/reservations/ekle/page.tsx` | God orchestrator | Yukarıdakinin "create" eşi. `useState<any>` ile tek tip ada. 16 useEffect. |
| 1054 | `app/services/villa-admin.service.ts` | God service | Tek dosyada villa lifecycle CRUD + asset cleanup + commission + youtube + tüm villa-* foreign-key replace. |
| 1034 | `app/components/ui/Hero.tsx` | God component | Public homepage hero'nun tüm UI + search panel + state'i içeride. |
| 966  | `app/components/admin/villa/PricingCalendarCanvas.tsx` | Calendar canvas | Tek bileşen, 14 useState, custom canvas + drag select + grid math. |
| 933  | `app/(public)/kiralik-villa/[slug]/page.tsx` | Server component page | Server-rendered olduğu için riski daha düşük; 6+ servisten paralel veri çekiyor. |
| 859  | `app/components/reservation/ReservationForm.tsx` | Public reservation form | 10 `any`, 7 useEffect; tek dosyada tüm public booking form'u. |
| 847  | `app/components/admin/reservation-form/ReservationCalendar.tsx` | Shared calendar | Drag-select multi-month grid; reuse ediliyor, ama 800+ LOC tek dosya. |
| 844  | `app/(admin)/maki-admin/external-reservations/ExternalReservationList.tsx` | Admin list page | 19 useState, 5 useEffect. |
| 812  | `app/(public)/arama/page.tsx` | Server component | Inline supabase query + filter logic page.tsx içinde. |
| 799  | `app/services/reservation.service.ts` | Service | Domain-coherent ama tek dosya; create + update + listing + status + delete + helpers. |
| 783  | `app/(public)/v/[token]/page.tsx` | Private villa page | Token-based; server-rendered. |
| 776  | `app/(public)/teklif-al/OfferRequestForm.tsx` | Public form | Çok adımlı offer request wizard; useEffect ile shadow state synchronization var. |
| 751  | `app/(admin)/maki-admin/users/page.tsx` | Admin users page | Tek client component; CRUD + form + table inline. |
| 736  | `app/(admin)/maki-admin/pages/new/page.tsx` | CMS editor | Inline JSX yoğun. |

**Pattern okuması:** Mega-file'ların büyük çoğunluğu admin tarafında, page-level orchestrator olarak. Public tarafta server component'ler büyük ama hizalı (paralel servis çağrıları + JSX); risk profili daha düşük. Asıl maintenance kabusu adayları: **2 rezervasyon orchestrator + 1 villa-admin service + 1 Hero**.

### 2.2 İyi yapılandırılmış dizinler

- `app/(admin)/maki-admin/reservations/[id]/_components/` — 18 single-purpose card. Ortalama 1.000-6.000 byte. **Örnek alınacak yapı.**
- `app/(admin)/maki-admin/reservations/[id]/_helpers/` — 7 pure helper, 600-4.800 byte. Her biri test edilmiş.
- `app/(admin)/maki-admin/reservations/[id]/_types/` — Domain typing tek dosyada. Açıklayıcı yorumlarla.
- `lib/db/` — repository pattern adası (şu an yalnız `villa.repository.ts`); doğru abstraksiyon.
- `tests/unit/reservation-helpers/` — 8 dosya, fixtures + AST-contract dahil. Senior testing.
- `app/components/villa/booking/` — `useBookingEngine` + `BookingCalendar` tek booking state machine. Single source-of-truth temiz.

### 2.3 Klasör organizasyonu problemleri

1. **Üçüncü kez tekrar eden `Section / Row / Label` primitive'leri:**
   - `app/components/admin/villa-form/shared/Section.tsx` (31 LOC)
   - `app/(admin)/maki-admin/reservations/[id]/_components/Section.tsx` (32 LOC)
   - `app/components/admin/reservation-form/shared/Row.tsx` (tek başına yaşıyor; Section/Label burada **yok**)
   Bu primitives `app/components/admin/shared/` altında merge edilmeli. Şu an "form ergonomy" değil "yan ayrı kopyalar" durumu.

2. **`lib/` dizini şişiyor:** 49 dosya, alt klasörleşmemiş çoğu (`security/`, `auth/`, `db/`, `storage/` var ama `payment/`, `mail/`, `calendar/`, `external-calendar/`, `villa/` yok). Domain helper'lar kök seviyede dağınık (`damage-deposit.helper.ts`, `payment-link.helper.ts`, `payment.helper.ts`, `reservation-code.helper.ts`, `reservation-confirm.helper.ts` hepsi yan yana).

3. **`app/services/` flat liste:** 33 dosya tek dizinde. `villa-*.service.ts`, `external-calendar*.service.ts` aileler oluşturuyor ama klasörleşmemiş.

4. **`app/components/` dizini hibrit:** Bazı domain'ler kendi klasöründe (`villa/`, `admin/`, `reservation/`), bazı flat tek dosya. `cms/`, `seo/`, `home/` küçük; `ui/Hero.tsx` 1034 LOC tek başına.

### 2.4 Helper extraction fırsatları (kod yazmadan tespit)

- `app/(admin)/maki-admin/reservations/[id]/page.tsx` içinde **hala** `handleVillaChange` (55 satır), `handleCustomPriceToggle` (130 satır), `handleCustomPriceAmountChange` (25 satır), `triggerPaymentConfirmation` (47 satır), `dispatchStatusChangeMail` (45 satır), `fetchReservations` for blocked dates (~100 satır) bulunuyor. FAZ 4 hedefi olarak yorumda not edilmiş ama henüz çıkartılmamış.
- `app/(admin)/maki-admin/reservations/ekle/page.tsx` aynı pattern'i daha fazla yaşıyor; ortak kod var ama paylaşılmıyor.
- `lib/date-format.ts` (374 LOC) — `parseLocalDate`/`formatLocalDate` doğru centralize edilmiş, **iyi örnek**.

---

## 3. React / Next Architecture

### 3.1 Server / Client ayrımı

- Server component oranı sağlıklı: tüm public sayfalar (`/`, `/arama`, `/kiralik-villa/[slug]`, `/v/[token]`, `/iletisim`, `/teklif-al`, `/favoriler`, `/liste/[token]`) server-rendered. Admin tarafı zorunlu olarak `"use client"`.
- 98/175 tsx (`"use client"`) — admin yoğunluğu nedeniyle. Public tarafta interaktif bileşenler (FavoriteButton, BookingSidebar) küçük client island'lar; iyi pattern.
- `app/(public)/arama/page.tsx` server component, ancak inline `supabase.from(...)` çağrısı kontrolden çıkmadan duruyor — `force-dynamic` directive var, RSC akışı doğru.
- `useBookingEngine` — sole booking state machine; `BookingSidebar` (villa detay) + `VillaCardBookingModal` (listing) tek hook üzerinden gidiyor. **Mimari özen.**

### 3.2 Hook hijyeni

- **Saf domain'ler:** `useFavorites`, `useBookingEngine` — temiz, deterministic, SSR-safe (cross-tab broadcast helper'ı dahil).
- **Sorunlu nokta:** `app/(admin)/maki-admin/reservations/[id]/page.tsx` 19 ayrı `useEffect`. Bunların önemli kısmı veri fetch (villa list, prices, blocked dates, settings, rates, external cal), birkaçı state sync (guestNames padding, current month, original date lock). Effect chain'lerin dependency array'leri uzun (ör. price recalc effect 18 alanlı dep array). Test edilebilir değil, mental load yüksek.
- `useEffect` ile data fetch — React Query / SWR yok. Bütün admin sayfaları custom hand-rolled fetch + state pattern'i. Stale-while-revalidate, retry, dedup yok.
- Single-source `useState<ReservationDetailData | null>` ile null-guard ediliyor — bu yeni FAZ 2.5 disiplini, **iyi yön**.

### 3.3 Prop drilling

- `reservations/[id]/page.tsx` JSX'i (1650-1805 satır) child component'lere `data`/`setData` çiftini her birine ayrı veriyor (DateRangeCard, PriceCard, PersonalInfoCard, GuestsCard, ...). Bu prop drilling değil — flat composition; her child kart top-level state'in bir slice'ını okuyor/yazıyor. Pragmatik; context overkill olurdu. Ama child'lara `setData` mantığını anlamak için `_types/reservation-form-data.ts` zorunluluk haline geliyor.

### 3.4 State duplication

- `data.start_date` (DB string) ↔ `startDate` (Date object) ikilisi page.tsx içinde iki ayrı state olarak yaşıyor; effect'lerle senkronize ediliyor. Bu **klasik UI/DB type drift** kaynağı.
- `originalStartDate`, `originalEndDate`, `originalStatus`, `originalVillaId` — recalculation tetiklemek için "first-load snapshot" pattern'i. İşlevsel ama 4 ayrı state + 4 ayrı effect maliyetinde.
- `guestNames[]` ile `data.guest_names` ayrı state; init guard ref + sync effect.

Bunların hepsi tek bir `useReducer` veya yapılı bir custom hook (örn. `useReservationEditor`) altında 1/5 satırda toplanabilir, ama refactor riski yüksek olduğu için bilinçli ertelenmiş gibi duruyor.

### 3.5 UI Composition kalitesi

- `Section / Row / Label` tek-amaçlı primitive'ler — temiz composition.
- `WizardStepBar` + `StickyFooterNav` admin sayfalarında shared; pattern reuse iyi.
- `ReservationCalendar` 847 LOC — drag-select multi-month grid, manuel + create + edit sayfalarında reuse ediliyor; tek source.
- **Sorun:** Hero.tsx (1034 LOC), VillaCard.tsx (709 LOC), VillaCardBookingModal.tsx (642 LOC) — composition'a hiç ayrılmamış mono-bileşenler.

### 3.6 Sürdürülebilirlik yargısı

React tarafı saf domain'lerde sağlıklı büyüyebilir (booking engine, favorites, calendar engine, price engine — hepsi izole, test edilebilir). Admin orchestrator sayfaları büyüdükçe **giderek daha riskli olur**; her yeni alan ekleme 19+ useEffect dep array'ini ve 220-satır saveAll'ı dikkatle okumayı zorlar. Şu anki haliyle 1-2 yıl daha yürür, sonra çatışmaya başlar.

---

## 4. TypeScript Kalitesi

### 4.1 Olumlu yönler

- **`types/database.ts`** (720 LOC) — hand-rolled Supabase schema mirror. Her Row için `Insert`/`Update` partial union, RPC functions, `Database` generic = `createClient<Database>(url, key)`. Çok ciddi disiplin.
- **`lib/villa-row.types.ts`** — DB row → domain typed çevirim. `normalizePriceRanges` ile `PriceRange[]` strict.
- **`reservation-form-data.ts`** — `ReservationRow & { villa: Embed; payment_method: Embed }` ile getReservationById return shape'i strict typed. **Örnek refactor.**
- **`price.engine.ts`** — pure functions, ReadonlyArray, generic + narrow. Test edilmiş.
- **Literal union'lar:** `ReservationStatus`, `PaymentPreference`, `PaymentLinkStatus`, `Currency` — runtime davranışla aligned.
- **`PaymentMethodLike`** — duck-typed extensible helper compat.
- Çoğu helper `unknown` ile parametrelenip içeride `Number(...) || 0` ile coerce ediyor — runtime safety + type strictness.

### 4.2 Type drift / problem alanları

- **95 `any` occurrence**, en yoğun yerler:
  - `reservations/ekle/page.tsx`: 12 (state tipinin tamamı `useState<any>` — bilinçli pragmatik karar, comment'lerde itiraf edilmiş)
  - `reservation/ReservationForm.tsx`: 10 (public reservation formu)
  - `villas/[id]/page.tsx`: 5
  - Mail API route'ları: her biri 4 (request/cancelled/approved)
  - `manual-reservations/ManualReservationList.tsx`: 4
- **25 `// eslint-disable @typescript-eslint/no-explicit-any`** — bilinçli kapatılmış. İyi pattern: yorumda neden kapatıldığı genelde yazıyor.
- **`PriceCard.tsx`** child component prop'unda `data: Record<string, any>`. Yorum: "FAZ 4 hedefi typed yapmak". Page typed `ReservationDetailData` kullanıyor ama child'da bu typing kayboluyor → **typing pipeline'da kop**.
- **`prices` state'i** `any[]` — yorumda gerekçesi var (calculateGrandTotal `PriceRange[]` istiyor, DB row'da end_date `string | null`, normalize ediliyor sonra).

### 4.3 Nullable handling

- `ReservationDetailData` strict null contract'a sahip; `setData` her yerde `prev ? { ... } : prev` pattern'i ile null-guard ediyor. **Doğru disiplin.**
- `updateReservationFull` signature FAZ "TUR 1" ile `string | null` / `number | null` widening aldı — caller drift kapandı.
- `Number(x) || 0` / `string || null` / `!!flag` coerce pattern'i tutarlı şekilde kullanılıyor.
- **Sorun:** `useState<any>` adalarda nullable belirsiz; payload manuel `||` ile coerce ediliyor → runtime safe ama compile-time fayda yok.

### 4.4 DTO / Row / Domain model ayrımı

- Repository pattern uygulanan tek domain (villa) için: `VillaRawRow` (repo) → `Villa` (service raw) → `VillaDTO` (mapVilla output). 3 seviye ayrım. **Senior pattern.**
- Geri kalan domain'lerde DTO katmanı **yok**: service raw DB row'u doğrudan UI'a akıtıyor. ReservationRow (DB) hem servis hem UI tarafında aynı tipi taşıyor → UI level concern (formatLocalDate, parseLocalDate) DB layer'a sızıyor.

### 4.5 TypeScript "gerçekten güven veriyor mu?"

- **Saf domain layer'da: kesinlikle evet.** price.engine, calendar.engine, date-format, payment.helper, currency, villa-row.types, reservation helpers — typing meaningful guarantee veriyor.
- **Admin form layer'da: kısmen.** Reservation edit page `ReservationDetailData` ile typed ama child component'lar prop'u `Record<string, any>` alıyor. State setter `setData((prev) => ...)` ile typed ama child'da exit yapıyor.
- **Reservation create page'de: hayır.** `useState<any>` ile statik tip rehberliği yok. Test yok. saveAll benzeri orchestration burada hiç decompose edilmemiş.

**Net yargı:** TypeScript yarı-gerçek. "Varmış gibi" değil, "yer yer var" — strict tarafı disiplinli, gevşek tarafı bilinçli pragmatik. Genel: 7.5/10.

---

## 5. Maintainability

### 5.1 Okunabilirlik

- **Yorum kültürü:** Olağanüstü yoğun. Çoğu dosyanın başında ne yaptığını, hangi davranışı koruduğunu, hangi FAZ'da değiştirildiğini açıklayan blok yorumlar var. Birkaç gözlem:
  - **Artı:** Yeni gelen geliştirici için "neden bu kod böyle?" sorusunun cevabı dosyanın içinde. Onboarding maliyeti **düşer**.
  - **Eksi:** Yorum-kod oranı yer yer 1:1'e yakın. Hero.tsx, reservations/[id]/page.tsx gibi dosyalarda yorumlar gerçek kodun bulunmasını yavaşlatıyor. "Inline runbook" tarzı çalışıyor.
  - **Eksi:** Yorumların büyük çoğunluğu Türkçe — ileride non-TR developer çalıştırırsa friction. Type-level yorumlar bazen İngilizce, bazen TR; karışık.

- **Naming consistency:** Genel olarak iyi. `getX / createX / updateX / deleteX` service convention, `buildXPayload` helper convention, `*.helper.ts` / `*.engine.ts` / `*.service.ts` ayrımı tutarlı.

- **File discoverability:** Domain bazlı subfolder'lar (özellikle reservations/[id]/_components, _helpers, _types) **mükemmel**. Geri kalanda `lib/` flat olduğu için "bu helper nerede?" arama gerektiriyor.

### 5.2 Future refactor readiness

- **Pure helper kütüphanesi:** `lib/price.engine`, `lib/date-format`, `lib/calendar.engine`, `lib/payment.helper` — bunlar büyük refactor olmadan dokunulabilir, replace edilebilir.
- **Reservation helper'lar:** FAZ TUR 3 extraction sonrası `_helpers/*` standalone test edilebilir, replace edilebilir.
- **Repository pattern (villa):** İleride başka DB'ye geçişte 1 dosya değişir (`lib/db/villa.repository.ts`); service + route + komponent değişmez. **Doğru abstraksiyon.**

- **Risk:** 33 servisten yalnız 1'i repository üzerinden geçiyor. Geri kalan 32'sinde Supabase coupling **kod içinde**. Backend swap maliyeti yüksek.

### 5.3 Onboarding difficulty

- **Saf domain'ler:** Düşük. price.engine.ts, calendar.engine.ts, _helpers/ klasörleri sadece "vitest çalıştır + helper'ı oku" ile anlaşılır.
- **Admin orchestrator sayfaları:** Yüksek. Yeni developer 1810-satır page.tsx + 19 useEffect + saveAll'ın iki branch'lı 220-satır akışını anlamak için 1-2 gün harcayacak. Yorumlar yardım ediyor; yoksa onboarding 1 haftalık.

### 5.4 "6 ay sonra bu sistemde geliştirme yapmak ne kadar kolay?"

- **Reservation domain:** Refactor sonrası **kolay**. Yeni alan eklenince: type'a alan ekle → buildNormalPayload / buildCustomPricePayload'a alan ekle → buildReservationBeforeSnapshot / buildReservationAfterSnapshot'a alan ekle → test ekle → child kartta input ekle. AST contract test orchestration sırasını koruyor. 6 ay sonra hala manageable.
- **Villa admin domain:** **Zorlaşır**. villa-admin.service.ts 1054 satır; her yeni alan formData → service payload → DB column → cache invalidate → form initial → wizard step zincirinde 5-6 noktayı manuel takip eder.
- **Public side:** **Kolay**. Server component'lerin paralel fetch'i + cache layer + JsonLd; yeni alan eklemek küçük diff.

### 5.5 Side-effect visibility

- saveAll: mail dispatch (await + fire-forget mix), audit log (fire-forget), `window.location.reload()` final — comments saveAll içinde **çok açık**. Senior-level discipline.
- `revalidate.actions.ts` server action — mutation sonrası tag invalidate (revalidateVillas / revalidateMenu vb). **Doğru pattern.**
- **Risk:** `logActivity(...).catch(() => {})` her yerde fire-forget; audit log fail-safe ama monitoring olmadan sessizce kayıp olabilir. Sentry import var (`@sentry/nextjs`) ama bu noktada bağlı görünmüyor.

### 5.6 Debugging kolaylığı

- `console.error("[domain.action] FAILED", err.message)` structured-string logging pattern'i her yerde kullanılıyor. Sentry breadcrumb collection için **iyi temel**.
- `console.warn("[mail.x] non-blocking error:", ...)` non-blocking error pattern'i.
- 189 `console.*` çağrısı app/services + lib içinde — production'da temizlenmesi gereken bir bölüm, ama formatları tutarlı olduğu için filter'la temiz.

---

## 6. Testability

### 6.1 Mevcut test mimarisi

| Test | LOC | Yargı |
|---|---|---|
| `tests/unit/price-engine.test.ts` | 192 | Pure math; TZ-safe (DST boundary case dahil). |
| `tests/unit/currency.test.ts` | 66 | Pure conversion. |
| `tests/unit/date-range.test.ts` | 54 | getValidEndDate corner case'leri. |
| `tests/unit/availability-validator.test.ts` | 114 | Pure validator. |
| `tests/unit/offer-request-humanize.test.ts` | 154 | Pure renderer. |
| `tests/unit/reservation-helpers/_fixtures.ts` | 117 | Deterministic minimum fixture'lar — **iyi yapılmış**. |
| `buildCustomPricePayload.test.ts` | 320 | Multi-currency + paid_amount preservation. |
| `buildNormalPayload.test.ts` | 280 | Full pipeline test. |
| `buildReservationAfterSnapshot.test.ts` | 177 | Snapshot stability. |
| `buildReservationBeforeSnapshot.test.ts` | 101 | Snapshot shape. |
| `detectConfirmTransition.test.ts` | 94 | Boolean transition logic. |
| `normalizeStatusKey.test.ts` | 49 | String normalize. |
| **`saveAllOrchestrationContract.test.ts`** | **394** | **AST-based contract test (TypeScript Compiler API).** |

**Toplam test:** ~2.110 LOC, 13 dosya. **Coverage konfigürasyonu:** `vitest --coverage` v8; lib + services target.

### 6.2 Standout: AST-based orchestration contract test

`saveAllOrchestrationContract.test.ts` saveAll'ın **kaynak kodunu** TypeScript Compiler API ile parse ediyor, AST üzerinde walk yapıp `updateReservationFull → logReservationUpdate → triggerPaymentConfirmation (gated) → dispatchStatusChangeMail → toast.success → window.location.reload` çağrı sırasını assertion'a bağlıyor. Runtime'da hiçbir şey çağrılmıyor, hiçbir mock yok.

Bu yaklaşım **gerçek senior practice**:
- Implementation detail'a bağımlı değil (değişken isimleri, payload field içerikleri test edilmez).
- Brittle değil — yorum, whitespace, identifier rename'ler kırmaz.
- Orchestration sırasının yanlışlıkla değişmesini katı yakalar (en sık görülen production bug kaynağı bu).
- Documentation niteliğinde — kontratı kodla ifade ediyor.

Bu tek dosya bile codebase'in "senior SaaS" puanını 1.5 yukarı çekiyor.

### 6.3 Hangi domain'ler testable?

| Domain | Testability |
|---|---|
| price.engine, calendar.engine, date-format, currency | **Excellent** — pure, deterministic, no mocks. |
| Reservation helpers (`_helpers/*`) | **Excellent** — pure, test edilmiş. |
| Reservation orchestrator (saveAll) | **Good (contract)** — AST contract var; davranış testi yok. |
| availability.helper, offer-request humanize | **Excellent** — test edilmiş. |
| Service layer (reservation, villa, vs) | **Poor** — Supabase coupling, mock gerekli, hiç test yok. |
| API routes (`/api/admin/...`, `/api/mail/...`) | **Untested** — entegrasyon test yok. |
| React components | **Untested** — RTL kurulu (`@testing-library/react`) ama hiç component testi yazılmamış. |
| Booking engine (`useBookingEngine`) | **Testable but untested** — pure logic hook; RTL ile test edilebilir, edilmemiş. |
| Reservation edit page orchestrator | **Hard to test** — 1810 LOC, 19 useEffect, Supabase calls inline. Component test maliyeti çok yüksek. |

### 6.4 Future regression risk

- **Düşük risk:** Pure helper + reservation domain — AST contract + 8 helper test + 7 helper birim test ile korunuyor.
- **Orta risk:** Villa CRUD — repository test yok, service test yok, ama davranış stable; rare change.
- **Yüksek risk:** Reservation create page (`ekle/page.tsx`) — 1278 LOC, hiç test yok, `useState<any>`, manual code path; her dokunmada regression riski.
- **Yüksek risk:** Mail API route'lar — `: any` 4 occurrence, custom error handling, fire-forget pattern; entegrasyon test yok.

### 6.5 Mock ihtiyacı

- Şu an reservation helper test'lerinde minimum fixture pattern kullanılıyor → mock yok, fakat helper'lar zaten pure olduğu için fixture yeterli.
- Service / route test'leri için Supabase mock factory kurulmamış. Eğer kurulsaydı: `lib/db/villa.repository.ts` benzeri tüm domain'ler için repository abstraction çekildikten sonra mock injection ucuz olur.

---

## 7. Frontend Code Cleanliness

### 7.1 JSX yoğunluğu

- **Public villa detay sayfası** (`kiralik-villa/[slug]/page.tsx`, 933 LOC) — JSX çoğunluk; conditional sections, JsonLd, gallery, BookingSidebar. JSX yoğun ama amaca uygun (CMS-style detay sayfası).
- **Hero.tsx** (1034 LOC) — JSX + state + form alanları + style tek dosyada. **Refactor adayı.**
- **Reservation edit page** — JSX bölümü `currentStep === N && <Card />` conditional render ile düzenli. JSX kısmı (1648-1805) okunabilir.
- **VillaCardBookingModal** (642 LOC) — modal + form. Composition yok.

### 7.2 Inline logic

- Page.tsx içinde `useEffect` blokları büyük (örn. reservations/[id]/page.tsx 102 satırlık price recalc effect; 18 dep array). Bu inline logic. Component'lere taşınmamış.
- Yorumlardaki business rule açıklamaları yer yer logic'in kendisini gölgeliyor.

### 7.3 Conditional rendering karmaşıklığı

- Wizard step pattern (`currentStep === N && <X />`) — temiz.
- `data?.field || fallback` chain'leri yer yer 3-4 derinlik (`selectedVilla?.cleaning_fee ?? data?.villa?.cleaning_fee ?? 0`); doğru fallback chain, okunabilir.
- **Sorun:** PriceCard içinde `data.custom_price && (<...>)`, `priceDetail && (<...>)`, `(data.original_currency !== "TRY") && (<...>)` 3 ayrı nested conditional render var.

### 7.4 Repeated UI pattern'leri

- **Section/Row/Label** primitive'i 3 ayrı yerde tekrarlanmış (bkz. 2.3.1).
- Toast notification pattern (`toast.success(...)`, `toast.error(...)`) tutarlı, ama her save flow'unda manuel dispatch.
- Confirm modal (`confirm({ title, description, variant })`) tutarlı.
- Wizard step bar + sticky footer nav — admin form'larda reuse.

### 7.5 Reusable layout eksikleri

- Admin sayfalarında `card-premium` className pattern her yerde; ama wrapper component yok. Her sayfa kendi `<div className="card-premium p-12">` yazıyor.
- Form layout (label + input + hint) standardize edilmemiş — `Section / Row / Label` var ama tüm yerlere yayılmamış.

### 7.6 Form pattern consistency

- Reservation create + reservation edit + villa create + villa edit — hepsi farklı state pattern'i (`useState<any>` vs `useState<ReservationDetailData | null>`).
- Manual reservation form ayrı (`ManualReservationForm.tsx`, 434 LOC).
- Offer request form ayrı (`OfferRequestForm.tsx`, 776 LOC).
- Public reservation form ayrı (`ReservationForm.tsx`, 859 LOC).
- **5 ayrı form orchestrator, ortak abstraction yok.**

### 7.7 Admin UI standardization

- Layout (`app/(admin)/maki-admin/layout.tsx`, 650 LOC) tek dosyada sidebar + auth gate + notification provider.
- AdminDateInput, AdminDateRangePicker var; reuse iyi.
- Pek çok admin liste sayfası (users, reservations, reviews, offer-requests, external-reservations, etc.) **birbirinden bağımsız** olarak yeniden yazılmış. Ortak `<AdminTable>` veya `<AdminList>` abstraction yok.

### 7.8 Public-side cleanliness

- Public detay sayfası, listing, arama — modern, JsonLd, breadcrumb, structured data. Temiz.
- Yalnız Hero.tsx outlier.

### 7.9 Net yargı

**Public-side: temiz ve sürdürülebilir.** Admin-side: çalışıyor ama duplicated form orchestrators uzun vadede arızalanır. 4-5 form'u standardize eden bir form-machine layer (`useFormState` + `useFormSchema` benzeri) eklenmedikçe her yeni feature 5 yerde manuel tekrar yazılır.

---

## 8. Service / Data Layer

### 8.1 Service layer temizliği

- 33 service dosyası; çoğu domain-coherent (`villa.service.ts`, `villa-image.service.ts`, `villa-feature.service.ts`).
- Naming convention: `getX / createX / updateX / deleteX / replaceX`. **Tutarlı.**
- Service-level error handling: `console.error("❌ X error:", err.message); throw new Error("User-facing TR")` pattern'i her yerde. **Tutarlı.**
- Service-side server-side guards (örn. `assertCanConfirm`) — business rule duplicate edilmemiş, helper ile single-source.

### 8.2 Repository pattern kullanımı

- **Tek domain:** `lib/db/villa.repository.ts` (247 LOC). 6 read method (`listPublic`, `listForAdmin`, `listTrashed`, `findById`, `findBySlug`, `findByIds`, `findByPrivateToken`).
- `villa.service.ts` repository üzerinden geçiyor; başka service yok.
- **Sonuç:** Repository abstraction'ın **proof-of-concept**'i var, **codebase-wide rollout** yok.

### 8.3 Duplicate query pattern'leri

- Availability merge — 3 yerde (reservation create service, reservation edit page, useBookingEngine hook) **aynı pattern**: `reservations` `.in('status', ['pending', 'confirmed'])` + `manual_reservations` `.lt/.gt`. Yorumda "lockstep contract" olarak işaretlenmiş; 3 yerde değiştirilmeli notu var. **Single source-of-truth eksik.**
- Conflict check (reservation create) + blocked date fetch (reservation edit) — aynı tablo + status filter ama farklı return shape.

### 8.4 Supabase coupling seviyesi

- `app/services/`: 33 dosya. 10'u doğrudan `supabase.from(...)` veya `supabase.auth.*` çağırıyor. Repository üzerinden geçen tek service: `villa.service.ts`.
- `app/(admin)/maki-admin/`: 5 tsx dosyası doğrudan `supabase.from(...)` çağırıyor (offer-requests list, manual-reservations ekle, menu page'leri, pages list).
- `app/(public)/`: server component'ler yer yer doğrudan supabase (arama, kiralik-villalar). Bu page-level coupling.
- `app/components/`: 2 tsx (`reservation/ReservationForm.tsx`, `teklif-al/OfferRequestForm.tsx`) doğrudan supabase.
- `app/components/villa/booking/useBookingEngine.ts` — hook'tan supabase çağırıyor (availability fetch).

**Net:** ~25 noktada Supabase coupling direkt. Repository pattern hızla yayılmazsa backend swap **çok pahalı**.

### 8.5 Business logic dağılımı

- **Pricing logic:** `lib/price.engine.ts` — TEK source-of-truth. Tüm consumer'lar (public + admin) buradan geçiyor. **İyi.**
- **Availability logic:** `lib/availability.helper.ts` + `useBookingEngine` + reservation.service create flow — 3 yerde aynı kural farklı kod. Yorumda "lockstep" olarak işaretlenmiş ama otomatik enforcement yok.
- **Confirmation guard:** `lib/reservation-confirm.helper.ts` — `canConfirmReservation` + `RESERVATION_CONFIRM_GUARD_MESSAGE`. Hem client-side guard (page.tsx) hem server-side guard (service `assertCanConfirm`) **aynı helper'ı kullanıyor**. **Senior pattern.**
- **Mail dispatch:** `dispatchStatusChangeMail` page.tsx içinde inline. Burada page-level orchestration var; service-level değil. Sorumluluk biraz UI'a sızmış.

### 8.6 Payload builder kalitesi

- Reservation helper'lar (`buildNormalPayload`, `buildCustomPricePayload`, `buildReservationBeforeSnapshot`, `buildReservationAfterSnapshot`) — pure, test edilmiş, typed. **Örnek pattern.**
- Service-side payload coercion (`Number(data.x) || 0`, `data.y || null`) tutarlı; spread-pattern ile undefined alanlar atlanıyor (`...(data.x !== undefined ? { x: ... } : {})`) — eski rezervasyonları bozmama disiplini.

### 8.7 Service Layer Quality Score: 6.8 / 10

- Pure helper / engine katmanı **9/10** seviyesinde.
- Service layer **6.5/10** — duplicate query pattern + supabase coupling + business logic karma.
- Repository pattern **3/10** — sadece 1 domain.

---

## 9. En Güçlü Yapılar (Top 10 Strongest Engineering Decisions)

1. **AST-based orchestration contract test** (`saveAllOrchestrationContract.test.ts`, 394 LOC) — saveAll çağrı sırasını TypeScript Compiler API ile parse ederek koruyan brittle-olmayan kontrat testi. Senior production technique.
2. **Reservation domain refactor (FAZ 1-2-3 sweep'leri)** — 1810-satır page.tsx'in `_components/` (18 kart), `_helpers/` (7 pure helper), `_types/` (typed shape) altında parçalanması. Her helper test edilmiş, byte-identical semantics tutulmuş, comment'lerde her adım dokümante edilmiş.
3. **Pure pricing/calendar engines** (`lib/price.engine.ts`, `lib/calendar.engine.ts`) — domain math'i Supabase'den, React'ten, UI'dan tamamen izole edilmiş. Test edilebilir + replace edilebilir.
4. **Hand-rolled typed Database schema** (`types/database.ts`, 720 LOC) — `createClient<Database>(...)` ile Supabase JS'e tipli kontrat. Codegen olmadan disiplinli mirror.
5. **Repository pattern (proof-of-concept)** (`lib/db/villa.repository.ts`) — service'ten Supabase'i ayıran data access layer. İleride backend swap maliyetini düşürecek doğru abstraction.
6. **Single booking state machine** (`useBookingEngine`) — BookingSidebar + VillaCardBookingModal aynı hook'tan besleniyor. Codebase-wide tek booking engine.
7. **Single source-of-truth confirmation guard** — `canConfirmReservation` helper'ı hem client-side UX guard hem service-side hard enforcement noktasında aynı kod. Duplicate business rule yok.
8. **DB-level EXCLUDE constraint + application fast-path** — `reservations_no_overlap` Postgres constraint atomik concurrency garantisi; service-side conflict check UX feedback için; iki katman ayrı sorumluluk. SQLSTATE 23P01 deterministic catch.
9. **Cache layer + tag invalidation** (`lib/cache.helpers.ts`, 587 LOC) — `unstable_cache` + `revalidateTag` admin mutation sonrası kalibreli invalidate. TTL stratejisi domain-bazlı.
10. **Date/timezone single source-of-truth** — `parseLocalDate` / `formatLocalDate` (`lib/date-format.ts`) tüm reservation / pricing / calendar logic'inden geçiyor. UTC drift'i kategorik olarak elimine edilmiş. Vitest config'inde `TZ: "Europe/Istanbul"` ile test'ler deterministic.

**Onursal mansiyon:** `useFavorites` hook — localStorage + SSR-safe hydration + cross-tab broadcast + same-tab custom event. Yorumlar bile öğretici kalitede.

---

## 10. En Büyük Temizlik Borçları (Top 10 Maintainability Risks)

1. **`reservations/[id]/page.tsx` (1810 LOC, 19 useEffect, 31 useState)** — FAZ 1-2-3 sonrası **hala** orchestrator god page. `handleVillaChange` (55 LOC), `handleCustomPriceToggle` (130 LOC), data fetch effect'leri page.tsx içinde. FAZ 4 hedefi yorumda işaretlenmiş ama yapılmamış.
2. **`reservations/ekle/page.tsx` (1278 LOC, `useState<any>`)** — yukarıdakinin create eşi; **hiçbir extraction yapılmamış**. `[id]/` versiyonundaki helper'lar burada da bekliyor ama paylaşılmıyor.
3. **`villa-admin.service.ts` (1054 LOC, 27 supabase çağrısı)** — villa create/update/delete/asset-cleanup/commission/youtube/distance/feature/rule/include hepsi tek dosyada. Repository pattern uygulanmamış.
4. **`Hero.tsx` (1034 LOC)** — public homepage hero; state + form + JSX tek dosyada. Domain bağımsız UI ama monolithic.
5. **3 yerde duplicate `Section/Row/Label` primitive** — `app/components/admin/villa-form/shared/`, `app/(admin)/maki-admin/reservations/[id]/_components/`, `app/components/admin/reservation-form/shared/`. Birleştirilmeli.
6. **5 ayrı form orchestrator** — public reservation form (859 LOC), reservation edit page, reservation create page, manual reservation form (434 LOC), offer request form (776 LOC), villa create + edit — hiçbiri ortak form-machine kullanmıyor.
7. **Mail API route'ları (~310 LOC her biri)** — `: any` 4'er occurrence, business logic + DB query + mail template + error handling tek route handler'da. Test yok.
8. **`PriceCard.tsx` ve diğer reservation _components prop'ları** — `data: Record<string, any>` + `setData: (prev: any) => any`. Page tarafında typed, child'da type drift.
9. **Saf duplicate query pattern (availability)** — `lib/availability.helper.ts` `getBlockedVillaIds` + `useBookingEngine` availability fetch + `reservation.service` create conflict check — 3 yerde aynı status allow-list (`pending+confirmed`) ve half-open overlap kuralı. "Lockstep contract" yorum var ama 1 noktada toplanmamış.
10. **PricingCalendarCanvas.tsx (966 LOC, 14 useState)** — admin pricing calendar; custom canvas + drag + grid math + state. Tek dosya. Test yok.

**Onursal mansiyon:**
- `lib/distance.helper.ts` (481 LOC) — distance computation + icon mapping + tone resolution tek dosyada.
- `cache.helpers.ts` (587 LOC) — tek dosyada 10+ cache helper + tag definition; alt domain'lere split olmamış.
- Admin layout (650 LOC).

---

## 11. Future Cleanup Targets (Önerilen Sıra — Refactor yapılmadı, sadece sıralama)

1. **Reservation create page (`ekle/page.tsx`) için FAZ 1-2-3 sweep'ini tekrarla** — edit sayfasından çıkan helper/component/type'ları paylaş. En yüksek ROI.
2. **`saveAll` orchestrator'ın page.tsx'ten ayrı dosyaya alınması** — AST contract test orchestration sırasını koruyor; helper olarak çıkarılırsa page.tsx 220 satır küçülür.
3. **Repository pattern'in 5 hot-domain'e yayılması** — reservation, manual_reservation, offer_request, settings, payment_method. villa.repository.ts şablonu kopyala.
4. **Availability rule'ın tek noktada toplanması** — `lib/availability/policy.ts` veya benzeri; allow-list, half-open overlap, status filter — 3 caller buradan beslensin.
5. **5 form orchestrator için ortak form-machine** — `useFormState<T>` + `useFormSubmit<T, P>` hook'u. Public reservation, reservation edit, reservation create, manual reservation, offer request — 5 sayfa toplam ~4.500 LOC, %40-50 küçülme realistic.
6. **`Section/Row/Label` primitive merge** — 3 kopyayı `app/components/admin/shared/` altında birleştir.
7. **`villa-admin.service.ts`'nin alt-dosyalara bölünmesi** — `villa-create.service.ts`, `villa-update.service.ts`, `villa-asset.service.ts`, `villa-commission.service.ts`.
8. **Hero.tsx'in alt-bileşenlere bölünmesi** — HeroImage, HeroSearch, HeroTrustStrip, HeroEditorial.
9. **Mail API route'larının logic'inin `app/lib/mail/dispatch/*.ts`'e taşınması** — route handler ince katman, business logic test edilebilir.
10. **PriceCard / PaymentCard / DateRangeCard child component'lerinin typed prop'lara geçişi** — `ReservationDetailData` zaten typed; child prop'ları da typed yap.

---

## 12. "Şu Alanlara Artık Dokunmayın" Listesi

Bu dosya/kavramlar **şu an yeterince temiz** — feature pressure olmadıkça refactor risk/getiri negatif:

- `lib/price.engine.ts` — pure, test edilmiş, tüm consumer'lar tek source.
- `lib/calendar.engine.ts` — pure helper; getDayStyle modifier'ları byte-identical hold.
- `lib/date-format.ts` (parseLocalDate / formatLocalDate / parseUtcDate) — TZ single source-of-truth.
- `lib/currency.ts` — pure conversion + formatCurrency.
- `lib/villa-row.types.ts` — domain typing temiz.
- `lib/reservation-confirm.helper.ts` — tek noktada business rule.
- `lib/payment.helper.ts` (getPaymentDisplayValues / normalizePaymentPreference) — single source-of-truth.
- `lib/db/villa.repository.ts` — repository pattern referansı; replicate ama dokunma.
- `hooks/use-favorites.ts` — örnek hook kalitesinde.
- `app/components/villa/booking/useBookingEngine.ts` — tek booking state machine.
- `app/(admin)/maki-admin/reservations/[id]/_helpers/*` — saf helper, test edilmiş, byte-identical kontrat.
- `app/(admin)/maki-admin/reservations/[id]/_types/reservation-form-data.ts` — domain typing.
- `tests/unit/reservation-helpers/*` ve `tests/unit/price-engine.test.ts` — örnek test kalitesi.
- `types/database.ts` — manual ama disiplinli; codegen yokken bunu manuel tutmak doğru.
- DB-level constraint sistemi (EXCLUDE / `reservations_no_overlap`) — atomik garanti.

---

## 13. "Şu Alanlar Kesin Refactor Edilmeli" Listesi

Bu dosyalar uzun vadede **regression çekirdeği** olur — hemen olmasa da kısa-orta vadede planlanmalı:

1. `app/(admin)/maki-admin/reservations/ekle/page.tsx` (1278 LOC) — `[id]/page.tsx`'in extraction'ından yararlanmak için **acil**.
2. `app/(admin)/maki-admin/reservations/[id]/page.tsx` — saveAll'ı + handleX helper'larını çıkartma (FAZ 4 hedefi).
3. `app/services/villa-admin.service.ts` (1054 LOC) — domain alt-modülleri.
4. `app/components/ui/Hero.tsx` (1034 LOC) — alt-bileşenlere ayır.
5. `app/components/admin/villa/PricingCalendarCanvas.tsx` (966 LOC) — canvas + drag + state ayrımı.
6. `app/components/reservation/ReservationForm.tsx` (859 LOC) — public reservation form; `useFormState` machine.
7. `app/components/admin/reservation-form/ReservationCalendar.tsx` (847 LOC) — shared calendar; sub-component decomposition.
8. `app/(admin)/maki-admin/external-reservations/ExternalReservationList.tsx` (844 LOC) — admin list component.
9. Mail API route'ları (`/api/mail/*`) — business logic'i `app/lib/mail/dispatch/`'e taşı.
10. `lib/cache.helpers.ts` (587 LOC) — `lib/cache/villa.ts`, `lib/cache/menu.ts` gibi alt-dosyalar.

---

## 14. Reservation Domain — Refactor Sonrası Durum Değerlendirmesi

**Bu, codebase'in en çok ilerlemiş ve en disiplinli refactor edilen alanı.** Bu yüzden ayrı değerlendiriliyor.

### saveAll decomposition kalitesi

- **Önce:** ~1400-1500 satır page.tsx, saveAll içinde ~400 satır inline orchestration + 2-3 ayrı duplicate path.
- **Şimdi:** Page.tsx 1810 LOC; saveAll **hala** ~220 satır ama:
  - `buildCustomPricePayload` / `buildNormalPayload` payload inşası ayrı (138 + 134 LOC).
  - `buildReservationBeforeSnapshot` / `buildReservationAfterSnapshot` audit log shape'leri ayrı.
  - `normalizeStatusKey` / `detectConfirmTransition` boolean logic'i ayrı.
  - `logReservationUpdate` fire-forget pattern korunarak helper'a alınmış.
- **Custom branch vs Normal branch** — bilinçli olarak henüz merge edilmemiş; yorumda gerekçesi: pricing math ve snapshot derivasyonu farklı. Pragmatik karar.

**Yargı:** saveAll **şu an refactorable durumda**, çünkü orchestration step'leri tek-satır helper çağrıları haline gelmiş. Bir sonraki FAZ'da bu fonksiyon kolayca standalone bir `saveReservation(input)` haline gelir. **B+ → A** geçişine 1 FAZ uzaklıkta.

### Helper / test architecture kalitesi

- **7 pure helper** — her biri tek sorumluluk, typed input/output, JSDoc-rich yorumlar.
- **8 test dosyası** — 6'sı helper unit, 1'i fixture, 1'i AST contract. Coverage'ı `_helpers/` için neredeyse %100.
- AST contract test yeni helper eklendiğinde orchestration sırasını korumayı sürdürür; brittle değil.
- Fixture pattern (`_fixtures.ts`) `Pick<ReservationDetailData, ...>` ile minimum data + cast helper. **Senior-level test infrastructure.**

### Orchestration visibility seviyesi

- saveAll yorumlu ve net: status guard → before snapshot → branch (custom/normal) → updateReservationFull → audit log → conditional payment-confirmed (awaited) → dispatchStatusChangeMail (fire-forget) → toast → reload.
- AST contract bu sırayı kodla expose ediyor; documentation niteliğinde.
- Side-effect'ler (mail dispatch, audit log, window.location.reload) açıkça yorumda işaretli.

### Bu domain'in genel teknik kalitesi

**8.5 / 10.** Codebase'in en olgun yeri. Burada kullanılan pattern'lerin (typed shape + pure helper + AST contract + fixture-based test + structured logging) **diğer 4 mega-file'a yayılması**, projeyi 7.3'ten 8.5'e taşır.

---

## 15. Genel Kapanış Değerlendirmesi

### Codebase'in genel "senior SaaS" hissi: **7.3 / 10**

**Senior SaaS gibi olan tarafları:**
- AST-based orchestration contract test — bu seviyede çok nadir görülür.
- Reservation domain refactor disiplini — her FAZ'ın belgelenmesi, "byte-identical" semantic garantisi, helper extraction sırası.
- Pure engine layer'ı — price, calendar, date, currency, availability.
- `createClient<Database>` ile typed Supabase, hand-rolled schema mirror.
- DB-level EXCLUDE constraint + service-level fast-path + UI-level guard — 3-katmanlı concurrency disiplini.
- `unstable_cache` + tag invalidation, server actions ile revalidate — modern Next.js pattern'leri doğru uygulanmış.
- Single source-of-truth helper'lar (parseLocalDate, calculateGrandTotal, getPaymentDisplayValues, canConfirmReservation) — duplicate business rule yok.

**Henüz senior SaaS olmayan tarafları:**
- 4 mega-file (>1000 LOC) hala mevcut; en kritik 2'si reservation orchestrator.
- 32/33 service hala Supabase'e direkt bağlı; repository abstraction yayılmamış.
- React component testi yok; service testi yok; E2E yok.
- Admin form orchestrator'ları 5 ayrı yerde duplicate; form-machine layer yok.
- 95 `any` occurrence + `useState<any>` adası; özellikle reservation create + public reservation form.
- 3 yerde duplicate `Section/Row/Label` primitive.
- Availability rule 3 yerde "lockstep" olmaya bağımlı; tek noktada toplanmamış.

### Tek cümlede özet

> Refactor metodolojisi senior, orchestrator dosyaları junior — bu codebase tutarlı bir disiplinle ileri taşınırsa 6 ay içinde 8.5/10 seviyesine ulaşır; ihmal edilirse 5 mega-file'ın altında ezilir.

### Final puanlar

| Skor | Değer |
|---|---|
| **Overall Code Quality** | **7.3 / 10** |
| **Maintainability** | **6.8 / 10** |
| **TypeScript Quality** | **7.5 / 10** |
| **React Architecture** | **6.5 / 10** |
| **Testability** | **7.0 / 10** |
| **Frontend Cleanliness** | **6.2 / 10** |
| **Service Layer Quality** | **6.8 / 10** |
| **Reservation Domain (ayrı)** | **8.5 / 10** |
| **Senior SaaS Vibe** | **7.3 / 10** |

---

*Bu audit yalnız read-only analiz sonucudur. Hiçbir dosya değiştirilmedi. Refactor implementasyonları için bu raporun "kesin refactor edilmeli" listesi öncelik sırasıdır; sıralamalar ROI tahminlerine dayanır.*
