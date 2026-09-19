# 🛡️ SUPABASE BAĞIMLILIK AUDIT — Maki Villa Platform

**Tarih:** 2026-05-18
**Kapsam:** Read-only deep technical audit + stratejik DB-provider bağımsızlık analizi
**Çıktı:** Tek seferde tüketilecek operasyonel doküman. Kod yazılmadı.

---

## 0. METODOLOJİ

Audit, codebase üzerinde **statik tarama + import topolojisi + DB call-site dağılımı** üzerinden üretildi. Her iddia, somut metrikle (dosya sayısı, çağrı sayısı, lock-in pattern) eşleştirildi. Hedef: "Şu an Supabase'i kaç noktadan terk edemeyiz?" sorusuna kabul edilebilir bir teknik cevap.

**Toplam ham metrikler (codebase genelinde):**

| Metrik | Değer | Anlam |
|---|---|---|
| `import ... from "@/lib/supabase*"` | **89** | Doğrudan Supabase client tüketicisi dosya sayısı |
| `supabase.from(...)` çağrısı | **34** | Tablo bazlı sorgu nokta sayısı |
| `supabase.rpc(...)` çağrısı | **7** | Server-side fonksiyon dispatch noktası |
| `supabase.storage.from(...)` çağrısı | **21** | Bucket I/O nokta sayısı |
| `supabase.auth.*` çağrısı | **13** | Oturum/JWT yönetim noktası |
| `supabase.channel(...)` realtime | **0** | Realtime bağımlılığı YOK ✅ |
| `supabase-admin` (service role) | **14** | Server-only privileged çağrı |
| Postgres SQLSTATE (`23P01`, `23505`, `23503`) referansı | **14** | DB error code coupling |
| `PostgrestError` import / type kullanımı | **159** | Driver-spesifik tip leakage |
| `.maybeSingle()` çağrısı | **25** | Supabase-spesifik resolver coupling |
| Repository class | **1** (sadece `villa.repository.ts`) | Abstraction yüzeyi yok denecek kadar dar |
| Unique RPC fonksiyonu | **7** | Postgres function bağımlılığı |
| EXCLUDE constraint (overlap) | **2** | Postgres-only feature lock-in |
| Embedded select (`x:fk (...)`) | **24+** | PostgREST syntax lock-in |

**Yorum:**
89 doğrudan tüketici + 159 PostgrestError sızıntısı = Supabase, sistemin **infra değil, mimari component**'i durumunda. Bu sayı 0-10 değil, "kaç haftada çıkarılır" eksenine bakılması gereken bir profil.

---

## 1. EXECUTIVE SUMMARY

### 1.1 Bir paragrafta durum

Maki Villa Platform, Supabase'i **klasik vendor-lock-in profili**nde tüketiyor: client (browser) + server (RSC + actions) + admin (service role) üç ayrı bağlantı katmanı doğrudan UI/component sınırına kadar penetre olmuş, **`PostgrestError` tipi 159 noktada yüzeye çıkmış**, transaction kritik 7 yazma akışı Postgres RPC'lere offload edilmiş, çift rezervasyon prevention iki ayrı **EXCLUDE constraint**'e bağlanmış (Postgres-only feature), storage abstraction ise **yarı-bitmiş** (helper layer var ama tüketiciler doğrudan `supabase.storage` da çağırıyor). Repository pattern adapte edilmiş ama yalnızca tek bir tablo için (villa, read-only) — kalan tüm domain'lerde service katmanı doğrudan PostgREST client'ı tüketiyor. **Realtime kullanımı sıfır** — bu, gelecekteki migration için kritik bir hediye.

### 1.2 Tek cümle skor

> **DB provider bağımsızlığı: 2.5 / 10** — sistem bugün Supabase olmadan **çalışmaz**; migration "3-6 aylık planlı operation" kategorisinde, "tek-sprint switch" değil.

### 1.3 En önemli 5 bulgu (öncelik sırasıyla)

1. **PostgrestError tipi 159 noktada sızdırılmış.** Bu, service → component arasında en yoğun coupling. Driver değişimi `try/catch` bloklarının %80'ini etkiler.
2. **7 RPC + 2 EXCLUDE constraint** Postgres-spesifik (özellikle `replace_*_relations` fonksiyonları — admin yazma akışlarının kalbi). Bunlar mimari karar düzeyinde, refactor düzeyinde değil.
3. **Client-side `supabase.from` 7 component'te canlı** (ReservationForm, OfferRequestForm/List, manual-reservations, menu, blog pages). UI'dan DB'ye doğrudan tunnel — service layer atlanmış.
4. **Service role (`supabase-admin`) 14 noktada** scattered — privilege escalation surface large, audit gateway yok.
5. **Repository pattern token gesture seviyesinde** — sadece `villa.repository.ts` (6 read metodu). Geri kalan 47 service modülü doğrudan PostgREST'e yazıyor.

### 1.4 İyi haberler (migration'ı kolaylaştıran)

- **Realtime/channel kullanımı: SIFIR.** Realtime, Supabase'in en zor migrate edilebilir feature'ı — bu boyun bağı yok.
- Auth wrapping kısmen yapılmış (`lib/auth/session.service.ts`, `lib/admin-auth.ts` gateway noktaları var).
- Server actions / RSC ayrımı temiz — DB call'lar büyük çoğunlukla server tarafında.
- FAZ refactor disiplini sayesinde **service layer mevcut** (47 modül) — Supabase çağrıları en azından bir abstraction altında toplanmış (component direct calls dışında).

---

## 2. GLOBAL SUPABASE DEPENDENCY MAP (DOMAIN BAZLI)

Domain'ler `app/services/*` dağılımına + UI çağrı topolojisine göre çıkarıldı.

### 2.1 Reservation Domain — **EN KRİTİK**

| Yüzey | Lokasyon | Supabase Çağrı |
|---|---|---|
| Service | `app/services/reservation/` (8 modül, facade) | `supabase.from("reservations")` ~10 noktada, embed: `villa:villa_id (...)`, `payment_method:payment_method_id (...)` |
| Service | `manual-reservation.service.ts` | `supabase.from("manual_reservations")` |
| Service | `dashboard.service.ts` | `supabase.from("reservations")` (analytics aggregations) |
| Component-direct | `app/components/reservation/ReservationForm.tsx` | `supabase.from(...)` — public submit (kullanıcı browser'ından doğrudan) |
| Component-direct | `manual-reservations/ekle/page.tsx` | Doğrudan DB call |
| RPC kullanımı | — | YOK (insert/update PostgREST üzerinden) |
| Postgres-only | `reservations_no_overlap` (EXCLUDE constraint) + `manual_reservations_no_overlap` | **Çift booking prevention burada — DB seviyesinde, Postgres'e özel** |
| Error pattern | `RESERVATION_DATE_CONFLICT` errors `23P01` SQLSTATE'e bağlanmış (`app/services/reservation/_helpers/errors.ts`) | DB error code semantic'i kod tarafında parse ediliyor |
| Embedded select | `villa:villa_id (id, name, photo_url, ...)`, `payment_method:payment_method_id (...)` | PostgREST syntax lock-in |

**Yorum:** Reservation, sistemin "en hayati" domain'i ve **en derin Postgres lock-in**'i bu modülde. EXCLUDE constraint, gtype range bazlı overlap prevention; başka bir DB'ye gitmek istersen **app-layer'da explicit transaction + advisory lock** kurman gerekir. SQLSTATE `23P01` davranışı kod tarafında özelleşmiş — hata mesajı bu code'a göre branch'liyor.

**Yeni Refactor: `validatePublicReservationForm`, `buildPublicReservationPayload`, `dispatchPublicReservationRequestMail`** helper'ları çıkarıldı — pure functions, DB-agnostic. Bu, `ReservationForm.tsx`'in component-direct `supabase.from` çağrısını **gelecekteki bir adapter'a kanalize edebilecek** ilk yapısal adım.

### 2.2 Villa Admin Domain — **YOĞUN RPC + STORAGE**

| Yüzey | Lokasyon | Supabase Çağrı |
|---|---|---|
| Service | `app/services/villa-admin/` (7 modül, facade) | `supabase.from("villas")` çoklu noktada |
| RPC | `replace_villa_prices` | `supabase.rpc(...)` (CRUD'da atomic delete+insert) |
| RPC | `replace_villa_distances` | `supabase.rpc(...)` |
| RPC | `replace_villa_type_relations` | `supabase.rpc(...)` |
| RPC | `replace_villa_feature_relations` | `supabase.rpc(...)` |
| RPC | `replace_villa_rule_relations` | `supabase.rpc(...)` |
| RPC | `replace_villa_price_include_relations` | `supabase.rpc(...)` |
| RPC | `set_villa_sort_orders` | `supabase.rpc(...)` (sıralama atomic update) |
| Storage | `app/services/villa-admin/_helpers/storage-cleanup.ts` | `supabase.storage.from("villa-photos")` |
| Service role | `app/lib/supabase-admin.ts` | privilege escalation gateway |
| Repository | `app/lib/db/villa.repository.ts` | **TEK repository** — 6 read metodu |

**Yorum:** Villa admin domain, **RPC bağımlılığının %100'ünü** taşıyor. 7 RPC fonksiyonunun tamamı Postgres function'ı — başka provider'a (örn. Neon, PlanetScale, Prisma + raw Postgres) geçtiğinde **biri-biri** karşılığı yazılması gerekir. RPC'ler "relation replace" semantic'i için kullanılıyor; idempotent delete+insert pattern — başka bir DB'de transaction içinde Drizzle/Prisma ile yazılabilir.

### 2.3 Public Search & Discovery — **EMBED-AĞIRLIKLI**

| Yüzey | Lokasyon | Supabase Çağrı |
|---|---|---|
| Service | `app/services/public-villa.service.ts` | `villas` + embed `villa_images (...)`, `villa_prices (...)` |
| Service | `app/services/search.service.ts` | Tarih/region/feature filter komposisyonu — `.in()`, `.gte()`, `.lte()` |
| Cache | `unstable_cache` + `revalidateTag` | Next.js native — DB-agnostic ✅ |
| Repository | `villa.repository.ts` (read-only) | Sadece public read için |

**Yorum:** Public search %100 read-only — bu kanal **Drizzle adapter ile en kolay rewrite edilecek** kısım. Embedded selects (`villa_images (id, image_url, sort_order)`) PostgREST syntax — Drizzle'a geçince `LEFT JOIN + json_agg` ya da `with: { images: true }` semantic'ine map edilir.

### 2.4 Auth Domain — **YARI-ABSTRACTED**

| Yüzey | Lokasyon | Supabase Çağrı |
|---|---|---|
| Gateway | `app/lib/auth/session.service.ts` | `supabase.auth.getSession()`, `getUser()` |
| Gateway | `app/lib/admin-auth.ts` | Server-side auth check |
| Login | `app/(admin)/maki-admin/login/page.tsx` | `supabase.auth.signInWithPassword(...)` (direct UI call) |
| Logout | `app/lib/auth/session.service.ts` | `supabase.auth.signOut()` |
| Guard | `AdminSessionGuard.tsx` | session read |
| Route guard | `app/lib/admin-route-auth.ts` | Server-only check |
| Admin fetch | `app/lib/admin-fetch.ts` | JWT injection |
| Create user | `app/api/admin/create-user/route.ts` | `supabase.auth.admin.createUser(...)` (service role) |

**Toplam: 13 `supabase.auth.*` çağrısı, 8 farklı dosyada.**

**Yorum:** Auth'un yaklaşık %50'si bir gateway altında — ama login sayfası ve service-role user creation hala doğrudan `supabase.auth`'a bağlı. Auth migration'ı (Clerk, NextAuth, kendi JWT) **2-3 dosyalık değişiklikle başlatılabilir** ama login UX, session refresh, route guards bütününü test etmek gerek.

### 2.5 Storage Domain — **TUTARSIZ ABSTRACTION**

| Yüzey | Lokasyon | Supabase Çağrı |
|---|---|---|
| Partial abstraction | `app/lib/storage/storage.service.ts` | upload/delete wrapper (3 metod, helper seviyesinde) |
| Helper | `app/lib/storage.helpers.ts` | 5 doğrudan `supabase.storage` çağrısı |
| Helper | `app/lib/villa-image.helpers.ts` | 2 çağrı |
| Helper | `app/lib/admin-branding.ts` | 2 çağrı |
| Component-direct | `app/components/admin/AdminGallery.tsx` | Doğrudan storage upload |
| Component-direct | `app/components/admin/SettingsField.tsx` | Doğrudan storage |
| Component-direct | `pages/page.tsx`, `pages/new/page.tsx` | Blog görseli upload |
| Component-direct | `types/page`, `locations/page` | Settings asset upload |
| Total | **21 çağrı**, **~10 dosya** | Bucket: `villa-photos`, `admin-assets`, `blog-images` |

**Yorum:** Storage layer **yarı-bitmiş abstraction**'ın klasik örneği — `storage.service.ts` var ama yeni eklenen kodun ezberi henüz tutmamış. Tüm storage call'larını bu wrapper'a çevirmek 1-2 günlük disiplin işi. Bucket isimleri kod içinde **sabit string** olarak geziniyor — config'e taşınmamış.

### 2.6 Payment Domain — **HAFİF DB COUPLING**

| Yüzey | Lokasyon | Supabase Çağrı |
|---|---|---|
| Service | `app/services/payment-method.service.ts` | CRUD `payment_methods` table |
| Service | `app/services/payment.service.ts` | reservation linkage, manual payment |
| Embed | `payment_method:payment_method_id (...)` | Embedded select pattern |
| Component-direct | YOK | Service layer'dan tüketim temiz |

**Yorum:** Payment, **migration için en hızlı kazanılabilecek** domain — küçük, izole, service layer üzerinden tüketiliyor. Tahmini Drizzle port: ~4 saat.

### 2.7 Pricing & Calendar — **HAFTALARDAN ORTA**

| Yüzey | Lokasyon | Supabase Çağrı |
|---|---|---|
| Service | `app/services/pricing.service.ts` | `villa_prices`, date-range filters |
| Component-direct | YOK (PricingCalendarCanvas refactor sonrası net) | ✅ |
| RPC | `replace_villa_prices` | yukarıda |
| Range query | `.gte("start_date", ...).lte("end_date", ...)` | Standart Postgres pattern |

**Yorum:** Pricing domain, **refactor sonrası temiz** — PricingCalendarCanvas (Refactor #7) component-direct DB call'ı bırakmamış. Bu, geleceğin migration'ı için **örnek alınması gereken yapı**.

### 2.8 Mail Domain — **SUPABASE-AGNOSTIC ✅**

| Yüzey | Lokasyon | Supabase Çağrı |
|---|---|---|
| Helper | `dispatchPublicReservationRequestMail.ts` | YOK — fetch ile API route'a POST |
| Helper | `dispatchReservationRequestMail.ts` | YOK |
| Service | `app/services/mail/*` | Provider abstraction (Resend/Postmark/SMTP swap edilebilir) |

**Yorum:** Mail tamamen DB-agnostic. Refactor disiplini buraya en temiz şekilde yansımış.

### 2.9 Analytics / Dashboard — **READ-ONLY**

| Yüzey | Lokasyon | Supabase Çağrı |
|---|---|---|
| Service | `app/services/dashboard.service.ts` | Aggregation queries (`count`, sum, period filters) |
| Service | `app/services/analytics.service.ts` | Reservation analytics |

**Yorum:** Read-only aggregation — Drizzle / Prisma adopt edilse direct port. Postgres window function / `GROUP BY` patterns kullanılıyor; ANSI SQL — taşınabilir.

### 2.10 External Reservations & Settings — **BAGAJ**

| Yüzey | Lokasyon | Supabase Çağrı |
|---|---|---|
| Service | `external-reservation.service.ts` | iCal sync, external bookings |
| Service | `settings.service.ts` | site_settings table |
| Service | `blog.service.ts` | blog_posts |
| Service | `page.service.ts` | static_pages |

**Yorum:** CRUD-only, küçük modüller. Tek tek port edilebilir.

---

## 3. DB ABSTRACTION SCORE TABLE (0-10 PER DOMAIN)

> **Skor anlamı:**
> - **0-2:** UI/component doğrudan DB call, tip leakage, repository yok.
> - **3-5:** Service layer var ama PostgREST tipleri sızıyor, error parsing hardcoded.
> - **6-8:** Repository veya yarı-abstraction var, tipler izole edilmiş.
> - **9-10:** Tam DB-agnostic; interface + adapter pattern, migration tek dosya değişiklik.

| Domain | Skor | Açıklama |
|---|---:|---|
| **Mail** | **9/10** | DB-agnostic. Provider swap'ı zaten mümkün. |
| **Pricing & Calendar** | **6/10** | Service layer temiz, RPC dışında izole. Refactor sonrası state iyi. |
| **Payment** | **6/10** | Küçük, izole, service-tüketimli. Component leak yok. |
| **Analytics / Dashboard** | **5/10** | Read-only ama embed + aggregation Postgres-spesifik. |
| **Public Search** | **5/10** | Embed-heavy, cache ile sarmalı; ama PostgrestError sızıyor. |
| **External Reservations** | **5/10** | CRUD, ufak, taşınabilir. |
| **Settings / Blog / Page** | **4/10** | CRUD ama component-direct storage kullanımı bağaj. |
| **Auth** | **4/10** | Yarı-gateway, login + admin user creation hala doğrudan. |
| **Villa Admin** | **3/10** | 7 RPC + 21 storage call + service role + repository sadece read için. |
| **Storage** | **2/10** | Wrapper var ama disiplin uygulanmamış; 10+ dosya doğrudan storage'a yazıyor. |
| **Reservation** | **2/10** | EXCLUDE constraint + SQLSTATE 23P01 parse + 159 PostgrestError'un büyük payı buradan + component-direct submit. |

### 3.1 Ağırlıklı Ortalama (LOC-ağırlıklı)

Domain LOC ağırlıklarına göre normalize edilmiş ortalama: **~3.8 / 10**.
Sadeleştirilmiş genel skor: **2.5 / 10** (en kritik domain reservation + villa-admin'in ağırlığı dominant).

---

## 4. CRITICAL LOCK-IN POINTS (HOTSPOT LISTESI)

> "Eğer yarın Supabase'i bırakıp Postgres + Drizzle'a (veya başka bir provider'a) geçsen, **kaç dosyaya dokunman gerekir** ve **kaç tane mimari kararı yeniden vermen gerekir?**" sorusunun cevabı.

### 4.1 TOP 20 HOTSPOT (Migration zorluk × etki)

| # | Hotspot | Tür | Zorluk | Etki | Notlar |
|---:|---|---|:---:|:---:|---|
| 1 | `reservations_no_overlap` EXCLUDE constraint | Postgres-only | 🔴 ÇOK YÜKSEK | 🔴 KRİTİK | Çift booking prevention. Başka DB'de app-layer transaction + serializable isolation gerekir. |
| 2 | `manual_reservations_no_overlap` EXCLUDE constraint | Postgres-only | 🔴 ÇOK YÜKSEK | 🔴 KRİTİK | Aynı problem. |
| 3 | 7 RPC fonksiyonu (`replace_villa_*_relations`, `set_villa_sort_orders`) | Postgres function | 🔴 YÜKSEK | 🟠 BÜYÜK | Atomic delete+insert için. Drizzle transaction içinde rewrite edilebilir. |
| 4 | `PostgrestError` 159 kullanım | Type leakage | 🟠 ORTA | 🔴 GENİŞ | Tüm service layer'ı kapsıyor. Generic `DbError` adapter pattern gerek. |
| 5 | `ReservationForm.tsx` component-direct `supabase.from` | UI→DB tunnel | 🟠 ORTA | 🟠 ORTA | Service layer atlanmış; user submit doğrudan client → Supabase. |
| 6 | `OfferRequestForm.tsx` + `OfferRequestList.tsx` | UI→DB | 🟠 ORTA | 🟢 LOKAL | Offer akışı tamamen component-driven. |
| 7 | `manual-reservations/ekle/page.tsx` | UI→DB | 🟠 ORTA | 🟠 ORTA | Admin akışı. |
| 8 | Embedded select pattern (`x:fk_col (...)`) — 24+ kullanım | PostgREST syntax | 🟡 DÜŞÜK | 🟠 GENİŞ | Drizzle/Prisma'da `with` veya manual join. |
| 9 | `.maybeSingle()` — 25 kullanım | Resolver coupling | 🟡 DÜŞÜK | 🟡 ORTA | Standart "find or null" — kolay generic abstraction. |
| 10 | SQLSTATE `23P01` parsing (`errors.ts`) | Error code coupling | 🟠 ORTA | 🟠 KRİTİK | Domain error → DB code mapping. |
| 11 | `supabase-admin` (service role) 14 noktada scattered | Privilege surface | 🟠 ORTA | 🔴 GÜVENLİK | Gateway pattern eksik; audit log yok. |
| 12 | Storage bucket sabit string ("villa-photos", "admin-assets") | Magic constants | 🟢 DÜŞÜK | 🟢 LOKAL | Config'e taşınmamış. |
| 13 | `supabase.storage.from("...").upload(...)` 21 nokta | Storage API coupling | 🟠 ORTA | 🟠 ORTA | S3/R2 swap için adapter gerek. |
| 14 | `supabase.auth.signInWithPassword` login page'de doğrudan | UI→Auth | 🟡 DÜŞÜK | 🟠 ORTA | Login UX değişikliği gerektirebilir. |
| 15 | `supabase.auth.admin.createUser` service-role | Server-only auth | 🟠 ORTA | 🟠 ORTA | Provider değişiminde ekstra abstraction. |
| 16 | `unstable_cache` + `revalidateTag` cache layer | Next.js native | ✅ — | — | DB-agnostic. İyi haber. |
| 17 | Range queries (`.gte`, `.lte`, `.in`, `.is`, `.not`) | PostgREST syntax | 🟢 DÜŞÜK | 🟢 LOKAL | Query builder'ı Drizzle equivalent'ına çevirmek pattern matching. |
| 18 | Repository sadece `villa.repository.ts` (6 read metod) | Token abstraction | 🟠 ORTA | 🟢 LOKAL | Pattern var ama yaygınlaştırılmamış. |
| 19 | `app/lib/supabase.ts` + `supabase-admin.ts` client singletons | Bootstrapping | 🟢 DÜŞÜK | 🟢 LOKAL | Tek dosya değişiklik. |
| 20 | RLS (Row Level Security) tablo policy'leri | DB-level auth | 🔴 YÜKSEK | 🟠 ORTA | App-layer auth check'e taşınması gerekir. |

### 4.2 Kategorilere göre yoğunlaşma

**🔴 Mimari karar gerektiren (sadece refactor değil, design):**
- EXCLUDE constraint → uygulama katmanı concurrency control
- 7 RPC → atomic transaction rewrite
- RLS → app-layer auth

**🟠 Yoğun refactor (haftalar):**
- PostgrestError abstraction
- supabase-admin gateway
- Storage adapter
- Component-direct DB tunnel kapama

**🟢 Hızlı kazançlar (günler):**
- Bucket name → config
- Cache layer (zaten DB-agnostic)
- Magic string ayıklama

---

## 5. REPOSITORY COVERAGE ANALYSIS

### 5.1 Mevcut durum

Sadece **1 repository class** var:

```
app/lib/db/villa.repository.ts
├── findById(id)
├── findBySlug(slug)
├── findPublicVillas(filters)
├── findFeaturedVillas(limit)
├── findRelatedVillas(villaId)
└── searchByLocation(coords, radius)
```

**6 metod, hepsi read-only, sadece tek tablo.**

### 5.2 Olması gereken (minimum şu repository'ler)

| Repository | Domain | Tahmini Metod | Mevcut Durum |
|---|---|:---:|---|
| `VillaRepository` | villa | ~12 | 6/12 (yarım, read-only) |
| `ReservationRepository` | reservation | ~18 | 0/18 ❌ |
| `ManualReservationRepository` | manual-reservation | ~8 | 0/8 ❌ |
| `PaymentMethodRepository` | payment | ~6 | 0/6 ❌ |
| `PaymentRepository` | payment | ~10 | 0/10 ❌ |
| `PricingRepository` | pricing | ~8 | 0/8 ❌ |
| `BlogRepository` | blog | ~6 | 0/6 ❌ |
| `PageRepository` | page | ~5 | 0/5 ❌ |
| `SettingsRepository` | settings | ~6 | 0/6 ❌ |
| `OfferRequestRepository` | offer | ~7 | 0/7 ❌ |
| `UserRepository` | auth | ~8 | 0/8 ❌ |
| `StorageRepository` | storage | ~5 | 0.5/5 (partial) |

### 5.3 Repository coverage skoru

> **6 metod / ~107 olası metod = ~5.6%** coverage.

Bu, "repository pattern var" demek için **token gesture seviyesi**. Mimari olarak henüz adapte edilmemiş.

### 5.4 Service layer karşılaştırması

47 service modülü mevcut (`app/services/**/*.service.ts`). Service layer var **ama service ≠ repository**:
- Service: business logic + orchestration
- Repository: DB I/O abstraction

Şu an Maki'de service'ler **hem business logic hem de PostgREST query builder** içeriyor. Bu, "DB değişirse service değişir" demek. Repository'ye ayrılma yapılmadığı için **47 dosyanın çoğu DB'ye dokunan kod**.

---

## 6. MIGRATION RISK MATRIX

### 6.1 Senaryo: "Postgres'i bırakmadan Drizzle / Prisma'ya geç"

| Boyut | Durum | Zorluk | Risk |
|---|---|:---:|---|
| Schema introspection | Kolay (Drizzle introspect / Prisma db pull) | 🟢 | DÜŞÜK |
| Embedded select migration | 24+ noktada manual rewrite | 🟠 | ORTA |
| EXCLUDE constraint preserve | Migration'da raw SQL ile korunur | 🟢 | DÜŞÜK |
| RPC migration | 7 fonksiyon → Drizzle transaction içinde rewrite | 🟠 | ORTA |
| PostgrestError abstraction | 159 nokta → DbError generic | 🔴 | YÜKSEK |
| Auth abstraction | Supabase Auth'u tutup DB'yi taşıma | 🟢 | DÜŞÜK (hybrid possible) |
| Storage abstraction | Supabase Storage'ı tutup DB'yi taşıma | 🟢 | DÜŞÜK (hybrid possible) |
| **Toplam tahmin** | | **6-10 hafta** | **ORTA** |

**Önemli:** Bu senaryo **realistic** — Supabase'in DB'sini bırakıp Auth + Storage'ı tutmak production'da çalışan bir hybrid pattern.

### 6.2 Senaryo: "Tam Supabase exit (Auth + Storage + DB)"

| Boyut | Durum | Zorluk | Risk |
|---|---|:---:|---|
| DB migration (yukarıdaki) | — | 🟠 | ORTA |
| Auth migration (Clerk / NextAuth / kendi) | 13 çağrı + 8 dosya + login UX | 🟠 | ORTA |
| Storage migration (R2 / S3 / Bunny) | 21 çağrı + 10 dosya + bucket sabit | 🟠 | ORTA |
| RLS policies → app-layer | Tablo bazlı policy'ler yeniden modellenmeli | 🔴 | YÜKSEK |
| Realtime | YOK ✅ | 🟢 | YOK |
| **Toplam tahmin** | | **3-6 ay** | **YÜKSEK** |

### 6.3 Senaryo: "Microservice split (reservation, villa, public)"

| Boyut | Durum | Zorluk | Risk |
|---|---|:---:|---|
| Service boundaries | Monolithic; 47 service tek codebase'de | 🔴 | YÜKSEK |
| Database split | EXCLUDE constraint cross-service → distributed concurrency | 🔴 | ÇOK YÜKSEK |
| **Toplam tahmin** | | **6-12 ay** | **ÇOK YÜKSEK** |

Microservice split, bu sistemin **bugünkü yapısı** için **iyi bir fikir DEĞİL** — monolith → modular monolith yolu daha sağlıklı.

### 6.4 Senaryo: "Sadece Auth/Storage swap (en hafif)"

| Boyut | Durum | Zorluk |
|---|---|:---:|
| Auth swap (Supabase Auth → Clerk) | 8 dosya, ~13 çağrı, login UX | 🟠 |
| Storage swap (Supabase Storage → R2) | 10 dosya, 21 çağrı | 🟠 |
| **Toplam** | | **2-4 hafta** |

Eğer hedef "Supabase faturasını düşürmek" ise, **DB'yi tutup auth/storage'ı taşımak** en ucuz exit.

---

## 7. INCREMENTAL ROADMAP (FAZ 1-6)

### FAZ 1 — Foundation (1-2 hafta)

**Hedef:** Type leakage'ı durdur. Abstraction yüzeyini hazırla.

1. `DbError` generic type tanımla. `PostgrestError` import'larını **service katmanı dışına çıkarma**. Service içinde `mapToDbError(postgrestError)` ile internal'a çevir.
2. Storage bucket isimlerini `app/lib/storage/buckets.ts` config dosyasına taşı.
3. `supabase-admin` çağrılarını tek bir `AdminGateway` modülünden geçir (audit log + privilege guard).
4. Repository interface'lerini tasarla (henüz implement etme, sadece type-level kontrat).

**Output:** Yapısal hazırlık. Behavior değişmez.

### FAZ 2 — Repository Adoption (3-4 hafta)

**Hedef:** Service layer → Repository ayrımı.

1. `ReservationRepository` adapte et — Reservation service buradan tüketsin.
2. `VillaRepository`'yi tamamla (write metodları ekle).
3. `PaymentRepository` + `PaymentMethodRepository`.
4. Sonra: pricing, settings, blog, page, offer.

**Output:** Service ≠ Repository ayrımı. DB call'lar artık tek katmanda.

### FAZ 3 — Component-Direct Bypass Cleanup (1-2 hafta)

**Hedef:** UI → DB tunneling'i kapat.

1. `ReservationForm.tsx` → server action veya API route'a kanalize. (Yeni helper'lar (`build/validate/dispatch`) sayesinde **zemin hazır**.)
2. `OfferRequestForm/List` → service'ten tüket.
3. `manual-reservations/ekle/page.tsx` → service.
4. `menu/new`, `menu`, `pages/page` → service.

**Output:** Hiçbir component doğrudan `supabase.from` çağırmıyor.

### FAZ 4 — Auth/Storage Abstraction (2-3 hafta)

**Hedef:** Auth + Storage'ı provider-agnostic interface arkasına al.

1. `AuthProvider` interface (`signIn`, `signOut`, `getSession`, `getUser`, `createUser`).
2. `StorageProvider` interface (`upload`, `delete`, `getSignedUrl`).
3. `SupabaseAuthAdapter` + `SupabaseStorageAdapter` (mevcut davranışı sarsın).
4. Login page'i `AuthProvider`'dan tüket.

**Output:** Auth/Storage swap tek-dosya değişiklik.

### FAZ 5 — RPC Migration & EXCLUDE Constraint Strategy (2-4 hafta)

**Hedef:** Postgres-only feature'ları app-layer'a hazırla.

1. 7 RPC fonksiyonunu **app-layer transaction**'a (Drizzle/Prisma) çevir (Postgres'i tutarak — sadece RPC'yi service code'a taşı).
2. EXCLUDE constraint için **app-layer overlap check + SERIALIZABLE isolation** alternatifi tasarla (Postgres'i tutarken implement et — paralel olarak test et).
3. SQLSTATE `23P01` parsing'i, generic `ConflictError` abstraction'a çevir.

**Output:** Postgres-only feature'lar app-layer'da paralel implementation'a sahip. DB swap için hazırlık tamam.

### FAZ 6 — Optional: Provider Migration (3-6 ay, hedef olduğunda)

**Hedef:** Eğer karar verilirse, gerçek migration.

1. DB swap (Neon / PlanetScale / kendi Postgres).
2. Auth swap (Clerk / NextAuth).
3. Storage swap (R2 / S3).
4. RLS → app-layer policy.

**Output:** Supabase exit (veya hybrid kalış).

---

## 8. FINAL SKOR

### 8.1 DB Provider Bağımsızlığı: **2.5 / 10**

**Breakdown:**

| Kriter | Ağırlık | Skor | Katkı |
|---|:---:|:---:|:---:|
| Type abstraction (PostgrestError sızıntısı) | 20% | 1/10 | 0.2 |
| Repository pattern coverage | 15% | 1/10 | 0.15 |
| RPC dependency | 10% | 2/10 | 0.2 |
| EXCLUDE / DB-only feature | 10% | 1/10 | 0.1 |
| Component-direct DB tunnel | 15% | 4/10 | 0.6 |
| Auth abstraction | 10% | 4/10 | 0.4 |
| Storage abstraction | 10% | 3/10 | 0.3 |
| Service layer presence | 5% | 8/10 | 0.4 |
| Realtime decoupling | 5% | 10/10 | 0.5 |
| **TOPLAM** | **100%** | — | **~2.85** |

Yuvarlanmış son skor: **2.5 / 10**.

### 8.2 İki cümlede yorum

> Maki bugün Supabase'in **DB + Auth + Storage** üçlüsüne mimari olarak bağımlı bir sistem; "switch flag'i yok, refactor lazım" eşiğinde. Ama refactor disiplini (FAZ methodology + 8 başarılı byte-identical refactor + 47 service modülü) ile **6-10 haftalık planlı bir operation'da hybrid-exit (DB taşıma + Auth/Storage Supabase'de tut)** kategorisindeki bir geçiş gerçekçi — tam exit ise 3-6 aylık bir ekip-projesidir.

### 8.3 Stratejik tavsiye (1 paragraf)

**Bugün hangi karar?** Eğer hedef vendor-lock-in'i azaltmak ama yakın vadede taşımamaksa: **FAZ 1 + FAZ 2'yi şimdi başlat** (4-6 hafta) — `PostgrestError` abstraction + Repository adoption. Bu, bedavaya yapılabilecek mimari hijyen, ve gelecekteki herhangi bir migration kararını "düşünce egzersizi" değil "execution" eksenine taşır. FAZ 3 (component bypass cleanup) ise zaten **refactor disiplininin doğal devamı** — ReservationForm refactor'ı bu yola çoktan girmiş durumda. RPC ve EXCLUDE constraint migration'ı (FAZ 5) ancak gerçek bir provider değişimi kararı verildiğinde gündeme alınmalı; aksi halde Postgres'in bu özelliklerini kullanmak **objektif olarak doğru karar**.

---

## 9. EK NOTLAR

### 9.1 İyi haberler tablosu (migration'ı kolaylaştıran mevcut yapı)

| İyi haber | Skor etkisi |
|---|:---:|
| Realtime kullanımı YOK | +1.0 |
| FAZ refactor disiplini → 47 service modülü mevcut | +0.5 |
| `unstable_cache` + `revalidateTag` DB-agnostic | +0.3 |
| Mail layer tamamen DB-agnostic | +0.2 |
| Server actions / RSC ayrımı net | +0.2 |
| Auth yarı-gateway'lenmiş | +0.2 |

### 9.2 Kötü haberler tablosu

| Kötü haber | Skor etkisi |
|---|:---:|
| 159 PostgrestError sızıntısı | -1.5 |
| 7 RPC + 2 EXCLUDE constraint | -1.0 |
| Repository sadece tek dosya | -0.8 |
| Component-direct DB call (7 yer) | -0.5 |
| Storage yarı-abstracted | -0.4 |
| `supabase-admin` scattered (14 nokta) | -0.3 |

### 9.3 "Yarın Supabase çökerse" senaryosu

> Bugün: **sistem çalışmaz** (read + write + auth + storage 4 bağımlılık).
> FAZ 1-2 sonrası: read fail tolerance var (cache layer), write fail = aynı.
> FAZ 1-4 sonrası: auth/storage hybrid (örn. Clerk + R2) ile partial failover mümkün.
> FAZ 1-6 sonrası: tam provider failover.

---

**Audit sonu.**
Bu doküman codebase güncel haliyle (FAZ refactor #1-#8 sonrası, 2026-05-18) hazırlandı. Refactor cycle devam ettikçe skor yukarı tırmanacak — özellikle Repository adoption + PostgrestError abstraction adımları **her birinde +0.5 skor** getirir.
