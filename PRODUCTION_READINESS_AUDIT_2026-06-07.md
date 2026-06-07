# PRODUCTION READINESS AUDIT — villa-kiralama

**Tarih:** 2026-06-07
**Kapsam:** A'dan Z'ye production denetimi (analiz-only; kod değiştirilmedi)
**Hedef profil:** 1000+ villa, yüksek trafik, SEO-kritik, rezervasyon-kritik, uzun ömürlü mimari
**Stack:** Next.js 16.2.4 (App Router) · React 19 · Supabase (Postgres + Auth + Storage + RLS) · Upstash rate-limit · Sentry · Vercel/self-host
**Boyut:** ~97.900 LOC · 397 app dosyası · 95 lib dosyası · 51 SQL migration · 45 unit test dosyası

---

## YÖNETİCİ ÖZETİ

Bu proje, çoğu erken-aşama SaaS'tan **belirgin şekilde daha olgun**. Rezervasyon bütünlüğü DB seviyesinde atomik olarak garanti altına alınmış (EXCLUDE GiST constraint + cross-table trigger), RLS fazlı ve fail-safe biçimde sertleştirilmiş, admin API'leri Bearer-token ile korunmuş, SSRF/rate-limit/secret yönetimi düşünülmüş. Çekirdek iş mantığı (fiyatlandırma, müsaitlik, rezervasyon) için güçlü bir unit test katmanı var.

Üretim hedefini (1000+ → 10.000 villa) **riske atan asıl alanlar mimari değil, ölçeklenme ve operasyon**:

1. **Performans/ölçek:** Liste ve arama sayfaları tüm villa setini belleğe çekip JS tarafında filtreliyor/sayfalıyor. 1000'de tolere edilir, 5.000–10.000'de bozulur.
2. **Operasyon:** Doğrulanmış bir backup/DR stratejisi, alerting ve fail-open rate-limit riski production'da zayıf halka.
3. **SEO fırsat kaybı:** Bölge/kategori için indekslenebilir landing sayfaları yok; tüm filtreler noindex `/arama`'ya akıyor — 1000+ villa ölçeğinde en büyük organik trafik kaybı.

**Genel değerlendirme: Production'a çıkabilir, ancak ölçek ve operasyon sertleştirmesi yapılmadan "yüksek trafik + 10.000 villa" hedefine güvenli değil.**

---

## 1. GÜVENLİK — 82/100

### Güçlü yanlar
- **RLS fazlı + sertleştirilmiş** (migration 037/038/040/042). Her fazda `pg_policies` taranıp canonical-dışı tüm policy'ler siliniyor, doğrulama EXCEPTION ile transaction rollback. Tek bir "allow all" legacy policy'nin OR ile güvenliği delmesi engellenmiş — bu, çoğu projede atlanan bir detay.
- **`is_active_admin()`** SECURITY DEFINER + pinned `search_path` → recursion/lockout yok.
- **Admin API güvenliği:** Tüm `/api/admin/*` ve mail route'ları `authorizeAdminCaller` (Supabase JWT → `admin_users.is_active`) ile korunuyor. Taranan 60+ route'ta yalnız `/api/health`, `/api/public/payment-methods`, `/api/public/taxonomies` guard'sız — üçü de salt-okunur public veri.
- **Secret yönetimi:** `.env*` gitignore'da; `resend_api_key` DB'den env-first'e taşınıyor; service-role key `NEXT_PUBLIC_` değil, `server-only` zinciriyle korunuyor.
- **SSRF:** External takvim ingest'inde DNS-aware validator (resolve sonrası private/reserved IP guard) — DNS rebinding'in %99'unu kapatıyor.
- **Cron güvenliği:** `CRON_SECRET` fail-closed (env yoksa 503).
- **CSRF:** Admin mutation'ları cookie değil **Bearer-token** ile çalıştığı için klasik CSRF yüzeyi büyük ölçüde kapalı; public formlar rate-limited.

### Bulgular

| # | Dosya | Risk | Etki | Öncelik |
|---|-------|------|------|---------|
| S1 | `lib/rate-limit.ts` | Upstash env yoksa veya bağlantı hatasında **fail-open** (tüm istekler geçer) | Prod'da env unutulursa booking/iletişim/mail/brute-force koruması TAMAMEN devre dışı; sessizce | **HIGH** |
| S2 | `app/api/public/reservations/route.ts` + `_helpers/price-verify` | Server-side fiyat doğrulama **enforce edilmiyor** (compare/log mode) | Client manipüle edilmiş `total_price/cleaning_fee/prepayment` gönderebilir; kayıt buna göre oluşur (admin onayı yakalar ama otomasyon değil) | **HIGH** |
| S3 | `middleware.ts` + `AdminSessionGuard.tsx` | Admin route koruması edge'de yalnız **non-kriptografik marker cookie** (`admin-session=1`); gerçek koruma client-side guard + API Bearer + RLS'te | Forge edilen cookie ile admin **shell**'i yüklenebilir (veri değil; veri Bearer/RLS arkasında). Defense-in-depth boşluğu, yanlış güven hissi | **MEDIUM** |
| S4 | `lib/admin-route-auth.ts` (`authorizeAdminCallerFlex`) | Admin token `?token=` query param ile kabul ediliyor (voucher/yeni sekme UX) | Token URL/access-log/Referer üzerinden sızabilir; kısa ömürlü ama egress log riski | **MEDIUM** |
| S5 | `AdminSessionGuard.tsx` | 30dk inactivity timeout **sadece client-side** | Token süresi (Supabase default ~1s) içinde çalınan oturum sunucu tarafında erken sonlandırılmaz | **LOW** |
| S6 | `villa-backup.dump` | Boş (0 byte) dosya git'e **commit edilmiş** | Veri sızıntısı yok (boş) ama repo hijyeni; gerçek dump kazara commit edilirse PII riski | **LOW** |

---

## 2. PERFORMANS — 62/100

### En pahalı sayfalar (maliyet sırasıyla)

1. **`/kiralik-villa/[slug]` (villa detay) — en pahalı.**
   - `getVillaBySlug(slug)` **iki kez** çağrılıyor: `generateMetadata` (satır 143) + page (satır 224). İkisi de cache'siz DB hit.
   - Ardından **sıralı (sequential) await zinciri**: `getVillaImages` → `getVillaPrices` → `getVillaDistances` → `getVillaFeaturesByVilla` → `getRuleItemsByVilla` → `getPriceIncludeItemsByVilla`. `Promise.all` yok → her request'te ~8-10 round-trip waterfall, yalnız review'lar cache'li.
   - `generateStaticParams`/`revalidate` yok → her istek dynamic render. 1000+ villa + crawler + trafik = yüksek tekrar maliyet.

2. **`/kiralik-villalar` (arşiv) ve `/arama` (arama).**
   - `getCachedVillas()` **tüm villa listesini** (`SELECT *` + embed) çekip cache'liyor; sayfalama/sıralama **bellekte slice** ediliyor (`computePageWindow`). `/arama` ek olarak `getVillaReviewStatsBatch()` ile tüm villaların review aggregate'ini her render'da topluyor.
   - 1000 villa: kabul edilebilir. **5.000–10.000 villa: cache payload MB'lara çıkar, bellek + serileştirme maliyeti patlar, in-memory filtre lineer büyür.**

### Güçlü yanlar
- `villa_images` embed'i hot list path'lerinde **yalnız cover**'a indirilmiş (~%80 payload azalması) — iyi mitigasyon.
- `unstable_cache` + tag-based invalidation (villas/taxonomy/homepage/reviews) düzgün kurulmuş.
- Liste sayfasında taxonomy + rates + villas `Promise.all` ile paralel.
- `next/image` remote pattern Supabase storage'a sınırlı.

### Bulgular

| # | Dosya | Risk | Etki | Öncelik |
|---|-------|------|------|---------|
| P1 | `lib/cache.helpers.ts` `getCachedVillas` + `/arama` + `/kiralik-villalar` | Full-list fetch + in-memory pagination/filter | 5k-10k villada bellek/latency çöküşü; DB'de WHERE+LIMIT+OFFSET (veya keyset) sayfalama yok | **CRITICAL** (hedef ölçek için) |
| P2 | `app/(public)/kiralik-villa/[slug]/page.tsx` | Çift `getVillaBySlug` + 6+ sıralı uncached query + ISR yok | En pahalı sayfa; TTFB yüksek, DB yükü trafikle lineer | **HIGH** |
| P3 | `/arama` `getVillaReviewStatsBatch()` | Her render'da tüm villa review aggregate'i | Filtre sonucundan bağımsız tam-tablo aggregate; ölçekle büyür | **MEDIUM** |
| P4 | `lucide-react` import'ları (villa detay) | Sayfa-local geniş icon import | Bundle/hydration maliyeti (tree-shake var ama izlenmeli) | **LOW** |

---

## 3. SEO — 78/100

### Güçlü yanlar
- `app/robots.ts` ve `app/sitemap.ts` production-grade: dinamik sitemap (aktif villa + CMS sayfaları), doğru disallow'lar (`/arama`, `/favoriler`, token route'ları, `/rezervasyon/`), prefix-çakışma kontrolü yapılmış (`/kiralik-villa/` açık kalıyor).
- 7 sayfada `generateMetadata`, canonical, OpenGraph, Twitter card.
- JSON-LD: BreadcrumbList + ItemList + CollectionPage + AggregateRating (`StructuredData.tsx`).
- Filtre/sort URL'leri (`?page`, `?sort`, `?pageSize`) clean (default'lar URL'e yazılmıyor); `/arama` noindex/disallow ile duplicate önlenmiş.

### Bulgular

| # | Alan | Risk | Etki | Öncelik |
|---|------|------|------|---------|
| SEO1 | Bölge/kategori landing yok | `/kiralik-villalar/bodrum`, `/kiralik-villa-bodrum` gibi indekslenebilir koleksiyon sayfaları yok; tüm filtreler noindex `/arama`'ya akıyor | **1000+ villada en büyük organik trafik kaybı**; "bodrum kiralık villa" gibi yüksek-hacim sorgular için landing yok | **HIGH** (fırsat) |
| SEO2 | `app/(public)/kiralik-villa/[slug]` | ISR/static yok → crawler'a dynamic, yavaş TTFB | Crawl bütçesi + Core Web Vitals (LCP) zayıflar | **MEDIUM** |
| SEO3 | `/kiralik-villalar?page=N` | Sayfalı listede canonical hep page-1'e sabit | Derin sayfalar deindex olabilir (villalar sitemap'te tekil olduğu için kısmen telafi) | **LOW-MEDIUM** |
| SEO4 | `app/sitemap.ts` | `lastModified = created_at` (şemada `updated_at` yok) | "Son güncelleme" sinyali zayıf; Google kabul eder ama optimal değil | **LOW** |

---

## 4. DATABASE — 80/100

### Güçlü yanlar
- **Double-booking DB-level atomik:** `reservations_no_overlap` / `manual_reservations_no_overlap` EXCLUDE GiST (half-open `[)`, adjacent = checkout==checkin valid), `btree_gist`. App allow-list ile lockstep (migration 030: `status IN (pending,confirmed)`).
- **Cross-table guard:** External takvim çakışması BEFORE INSERT/UPDATE trigger'ı (migration 031) — deadlock/perf analizi dahil dokümante.
- **Availability index'leri:** `idx_reservations_avail` (partial), `idx_manual_reservations_avail`, `idx_admin_users_auth_user_id`, external overlap idx.
- **PII-safe availability:** SECURITY DEFINER RPC'ler (`get_blocked_villa_ids`, `get_villa_blocked_ranges`, `check_villa_availability_conflict`) → anon PII görmeden müsaitlik okur.

### Ölçek riskleri ve bulgular

| # | Alan | 1.000 | 5.000 | 10.000 | Öncelik |
|---|------|-------|-------|--------|---------|
| DB1 | `villa` liste filtreleri (`is_active`, `deleted_at`, `sort_order`, `location_id`, `guests`) için kompozit index | OK | Yavaşlar | Tablo/seq-scan riski | **MEDIUM** |
| DB2 | `getVillas` full-table read (bkz. P1) — DB değil **app bellek** darboğazı | OK | Risk | Çöküş | **HIGH** |
| DB3 | `villa_prices`/`villa_images` `villa_id` FK index doğrulanmalı (detay sayfa join'leri) | OK | OK | İzlenmeli | **LOW** |
| DB4 | `reservations` zamanla büyür; tarih-bazlı partition/arşiv stratejisi yok | OK | OK | İzlenmeli | **LOW** |

> Not: Müsaitlik/overbooking sorgu planları sağlıklı (partial index + RPC). Asıl ölçek riski rezervasyon tablosunda değil, **villa listeleme bellek modelinde**.

---

## 5. KOD MİMARİSİ — 76/100

### Güçlü yanlar
- Net katmanlama: **repository** (`lib/db/*`) → **service** (`app/services/*`) → **route/RSC**. Provider seam'leri: `DbProvider`, `AuthProvider`, `StorageProvider`, `AdminGateway`.
- `server-only` direktifleri ile privilege boundary build-time'da korunuyor (`supabase-admin`, `auth/server`, `rate-limit`, `cron-auth`).
- Pure modüller test edilebilir biçimde ayrılmış (`availability.validator`, `price.engine`, `date-format`).
- 45 unit test dosyası — fiyat, rezervasyon, müsaitlik orchestration contract'ları kapsanmış.

### Bulgular / teknik borç

| # | Dosya/Alan | Risk | Öncelik |
|---|-----------|------|---------|
| A1 | `lib/supabase.ts` + `lib/supabase/client.ts` | İki paralel browser-client entry; duplication, karışıklık | **MEDIUM** |
| A2 | `lib/db/db.provider.ts` | "Soyutlama" `SupabaseClient["from"]`/`["rpc"]` tipine yaslanıyor → leaky abstraction (bkz. Bölüm 6) | **MEDIUM** |
| A3 | Genel | Aşırı yoğun "FAZ X" yorum katmanları + 397 dosya; iteratif yamalama kaynaklı dokümantasyon/kompleksite borcu | **LOW-MEDIUM** |
| A4 | `lib/admin-auth.ts` ↔ `lib/auth/session.service.ts` | İki isim için aynı davranış (re-export) — migration ortası ikilik | **LOW** |

**En riskli dosyalar:** `app/(public)/kiralik-villa/[slug]/page.tsx` (waterfall + boyut), `lib/cache.helpers.ts` (full-list cache mantığı), `app/(public)/arama/page.tsx` (in-memory filtre + boyut).

---

## 6. SUPABASE BAĞIMLILIĞI — Exit Readiness: 55/100

**Senaryo: "Yarın Supabase kapanırsa çıkabilir miyiz?"** — Veritabanı taşınabilir, ama auth/storage/sorgu katmanı maliyetli.

### Doğrudan bağımlılıklar
- `@/lib/supabase` (anon browser client): **32 import**
- `getSupabaseAdmin()` (service-role): **56 çağrı**
- `@supabase/supabase-js` / `@supabase/ssr` doğrudan: 7 dosya
- `supabase.storage`: 6 kullanım
- `supabase.rpc`: müsaitlik + settings + villa relation replace

### Vendor lock-in noktaları
1. **PostgREST embed sözleşmesi:** Repository sorguları `.select("*, location:villa_locations(name), villa_images(...)")` gibi PostgREST-spesifik embed sintaksına bağlı. `DbProvider` seam'i var ama tip olarak `SupabaseClient["from"]`'a yaslandığı için **portable değil** — başka client'a geçişte tüm sorgular yeniden yazılır.
2. **Supabase Auth (GoTrue):** `auth.users`, JWT, `auth.uid()`, `onAuthStateChange`, `supabase.auth.admin.createUser`. RLS policy'leri `auth.uid()`'e bağlı.
3. **Storage:** villa görselleri + public/sign bucket'ları.
4. **Rol modeli:** RLS politikaları `anon/authenticated/service_role` Supabase rollerine bağlı.
5. **SECURITY DEFINER RPC'ler:** Postgres'e taşınabilir (standart SQL) — bu kısım kolay.

### Çıkış kolaylığı
- ✅ **Kolay:** Şema + 51 migration standart Postgres SQL → herhangi bir Postgres host'a (Hetzner/RDS/Neon) taşınır. RPC + constraint + trigger portable.
- ⚠️ **Orta-zor:** RLS rol modeli yeniden eşlenir; SECURITY DEFINER fonksiyonlar korunur.
- ❌ **Zor:** Auth (GoTrue → NextAuth/Clerk/custom), Storage (→ S3/R2), ve **tüm PostgREST embed sorgularının** Drizzle/Prisma/pg'ye yeniden yazımı.

> **Exit Readiness puanı: 55/100.** Mimari niyet (provider seam'leri) doğru yönde ama henüz "byte-identical wrapper" aşamasında; gerçek soyutlama tamamlanmamış. Postgres taban taşınabilir olduğu için ümitsiz değil, ancak auth+storage+sorgu yeniden yazımı haftalar sürer.

---

## 7. REZERVASYON SİSTEMİ — 85/100

### Doğruluk
- **Availability doğruluğu:** App fast-path (RPC `check_villa_availability_conflict`) + **DB EXCLUDE constraint** garantisi. Asıl atomiklik DB'de.
- **Race condition / overbooking:** Concurrent INSERT'lerde ikinci işlem 23P01 ile reddedilir → **overbooking DB-level imkânsız**. App error mapping (`23P01 → "Bu tarihler dolu"`) byte-identical.
- **Tarih hesapları / timezone:** `parseLocalDate`/`formatLocalDate` LOCAL alanlardan kurar → `new Date("YYYY-MM-DD")` UTC drift'i engellenmiş. Half-open semantik tutarlı (gece sayısı, fiyat aralığı, döngü). Invalid input → deterministik Invalid Date (sonsuz döngü guard'ı).
- **Temizlik ücreti:** `cleaning_limit` mantığı doğru (limit altı gece → ücret uygulanır).
- **External takvim:** Cross-table trigger ile çakışma engelli; iCal sync ile milisaniyelik residual race dokümante + kabul edilmiş (mutlak garanti için SERIALIZABLE kapsam dışı bırakılmış — makul).

### Bulgular

| # | Dosya | Risk | Etki | Öncelik |
|---|-------|------|------|---------|
| R1 | `_helpers/price-verify` (bkz. S2) | Public booking fiyatı server'da **enforce edilmiyor** (log-only) | Fiyat manipülasyonu; finansal tutarsızlık (manuel onay telafi eder) | **HIGH** |
| R2 | `price.engine.ts` (server "local"=UTC) | Fiyat gün sınırları server timezone'a göre; Vercel'de UTC | Gün-sınırı edge case'lerinde TR'de beklenen günden sapma teorik olarak mümkün | **LOW** |
| R3 | iCal sync ↔ booking | ms-window residual race (dokümante) | Çok nadir çift-blok; admin reconciliation | **LOW** |

> **Kritik mantık hatası bulunamadı.** Çekirdek overbooking koruması production-grade. Tek gerçek açık: fiyat enforcement'ın log modunda kalması.

---

## 8. NEXT.JS MİMARİSİ — 75/100

### Güçlü yanlar
- Server/client ayrımı tutarlı: public SSR + ISR/tag-cache; admin client-guarded.
- `(admin)` route group'unda `force-dynamic` (mutation sonrası stale HTML engeli) — doğru.
- Cache invalidation tag-based (`revalidateTag`).
- Sentry instrumentation (`instrumentation.ts`) official pattern.

### Bulgular

| # | Dosya | Risk | Etki | Öncelik |
|---|-------|------|------|---------|
| N1 | `middleware.ts` | Next 16'da `middleware` convention **deprecated** (proxy pattern öneriliyor); TODO olarak işaretli | İleride breaking; build uyarısı | **MEDIUM** |
| N2 | `package.json` `lucide-react: ^1.14.0` | Lucide normalde 0.x sürümlerde; `^1.14.0` şüpheli/yanlış sürüm pinleme olabilir | Beklenmedik API/bundle; doğrulanmalı | **MEDIUM** |
| N3 | `kiralik-villa/[slug]` ISR yok (bkz. P2/SEO2) | Dynamic render | Maliyet + LCP | **HIGH** (perf'le örtüşür) |
| N4 | React 19 + Next 16.2.4 | Cutting-edge sürümler | Ekosistem/uyumluluk olgunluk riski | **LOW** |

---

## 9. OPERASYON — 58/100

### Mevcut
- **Sentry:** Error-only (tracing/profiling **kapalı**), `beforeSend` + `ignoreErrors` ile beklenen 4xx noise filtresi. DSN yoksa no-op.
- **Health endpoint:** `/api/health` (serverStartTime/nodeVersion/nextVersion; PII yok).
- **Cron:** External calendar sync, exchange rates, mail/activity log cleanup (Bearer secret korumalı).
- **Activity/audit logging:** `admin_audit_logs`, activity-log helper'ları.

### Eksikler / bulgular

| # | Alan | Risk | Öncelik |
|---|------|------|---------|
| O1 | Backup/DR | Doğrulanmış backup stratejisi yok; `villa-backup.dump` **0 byte** ve commit'li; DR runbook görünmüyor; tek dayanak Supabase managed backup (vendor) | **HIGH** |
| O2 | Rate-limit fail-open (S1) | Upstash env/bağlantı yoksa koruma sessizce kapanır; prod alert yok | **HIGH** |
| O3 | Monitoring | Sentry tracing kapalı → performans/latency gözlemlenemiyor; APM/uptime/alerting yok | **MEDIUM** |
| O4 | Logging | Yalnız `console.error` → Vercel logs; merkezi/aranabilir log aggregation yok | **MEDIUM** |
| O5 | Deployment | `vercel.json` cron var; ama rollback/blue-green/staging stratejisi dokümante değil | **LOW** |

---

## 10. PUANLAMA

| Kategori | Puan | Not |
|----------|-----:|-----|
| Güvenlik | **82** / 100 | RLS + API auth güçlü; rate-limit fail-open ve fiyat enforcement açık |
| Performans | **62** / 100 | Full-list in-memory model ölçekte çöker |
| SEO | **78** / 100 | Teknik SEO iyi; bölge/kategori landing yok |
| Database | **80** / 100 | Rezervasyon bütünlüğü mükemmel; liste için index/sayfalama eksik |
| Kod Kalitesi | **76** / 100 | Net katmanlama; iteratif borç + leaky abstraction |
| Operasyon | **58** / 100 | Backup/DR/alerting/monitoring zayıf |
| Supabase Exit Readiness | **55** / 100 | Postgres taşınabilir; auth/storage/sorgu lock-in |

### Bonus değerlendirme (puanlamaya dahil değil)
- Rezervasyon Sistemi: **85** / 100
- Next.js Mimarisi: **75** / 100

---

## ⭐ TOPLAM PUAN: **72 / 100**

> **Yorum:** Sağlam çekirdek, production-grade rezervasyon bütünlüğü ve güvenlik temeli. "1000 villa + orta trafik" için bugün çıkabilir. **"10.000 villa + yüksek trafik"** hedefi için listeleme performansı, operasyon (backup/monitoring) ve SEO landing katmanı tamamlanmadan güvenli değil.

---

## İLK DÜZELTİLMESİ GEREKEN 10 KRİTİK KONU

| Sıra | Konu | Dosya | Öncelik | Neden |
|------|------|-------|---------|-------|
| 1 | **Liste/arama'da DB-side sayfalama + filtreleme** (full-list in-memory'yi kaldır) | `lib/cache.helpers.ts` (`getCachedVillas`), `app/(public)/arama/page.tsx`, `app/(public)/kiralik-villalar/page.tsx` | **CRITICAL** | 5k-10k villada bellek/latency çöküşü — hedefin doğrudan engeli |
| 2 | **Rate-limit fail-open'ı kapat / prod'da Upstash env zorunlu + alert** | `lib/rate-limit.ts` | **HIGH** | Env unutulursa booking/spam/brute-force koruması sessizce sıfırlanır |
| 3 | **Public rezervasyonda server-side fiyat enforcement** (log-only → reject) | `app/api/public/reservations/route.ts`, `_helpers/price-verify` | **HIGH** | Fiyat manipülasyonuna açık finansal akış |
| 4 | **Backup/DR stratejisi + doğrulama** (otomatik dump, restore testi, runbook; 0-byte dump'ı sil) | `villa-backup.dump`, ops dokümanı | **HIGH** | Veri kaybı senaryosunda kurtarma garantisi yok |
| 5 | **Villa detay sayfası: paralel fetch + tekilleştirme + ISR** | `app/(public)/kiralik-villa/[slug]/page.tsx` | **HIGH** | En pahalı sayfa; çift `getVillaBySlug` + 6+ sıralı query + dynamic render |
| 6 | **Bölge/kategori SEO landing sayfaları** (indekslenebilir, canonical'lı) | yeni route + `sitemap.ts` | **HIGH** | 1000+ villada en büyük organik trafik kaybı |
| 7 | **Monitoring/alerting** (Sentry tracing aç, uptime + rate-limit/cron/mail fail alert) | `sentry.*.config.ts`, ops | **MEDIUM** | Yüksek trafikte sorunlar görünmez |
| 8 | **villa liste filtreleri için kompozit index** (`is_active, deleted_at, sort_order, location_id, guests`) | yeni migration | **MEDIUM** | Ölçekte seq-scan |
| 9 | **Admin edge koruması güçlendir** (marker-cookie'yi kriptografik/SSR doğrulamayla değiştir veya middleware'de gerçek session kontrolü) | `middleware.ts`, `AdminSessionGuard.tsx` | **MEDIUM** | Defense-in-depth + Next 16 proxy migration ile birlikte |
| 10 | **Supabase soyutlamasını gerçekten portable hale getir** (PostgREST embed'leri repository ardına gizle) + `lucide-react` sürümünü doğrula | `lib/db/*`, `package.json` | **MEDIUM** | Exit readiness + sürüm riski |

---

*Bu rapor yalnızca analizdir; hiçbir kod, dosya veya yapılandırma değiştirilmemiştir.*
