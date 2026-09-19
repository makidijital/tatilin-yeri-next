# Villa Kiralama / Rezervasyon Sistemi — CTO Düzeyi Teknik Audit

> Bağımsız audit. Kod tabanı üzerinde dosya/satır seviyesinde inceleme yapıldı. Boş övgü yok, abartı yok — sadece teknik gerçekler ve önceliklendirilmiş riskler. Tarih: 22 Mayıs 2026.

---

## 1. Genel Sistem Skoru

**6.0 / 10**

Bu, "kötü bir proje" puanı değil — tam tersine, ortalamanın belirgin üzerinde bir mühendislik özeni gösteren ama **tek bir temel mimari güvenlik kararı yüzünden production'a güvenle çıkamayacak** bir sistemin puanı.

Puanı yukarı çeken nedenler:
- Çift rezervasyon (double-booking) DB seviyesinde `EXCLUDE USING gist` constraint'i ile **atomik** çözülmüş. Bu, çoğu rezervasyon sisteminin yanlış yaptığı şeyi doğru yapmak demek.
- Caching mimarisi olgun: `unstable_cache` + tag bazlı invalidation + makul TTL'ler.
- Servis katmanı / repository ayrımı, kod organizasyonu ve dokümantasyon disiplini güçlü.
- Service-role kullanan API route'ları (create-user vb.) Bearer token + `admin_users` lookup ile doğru korunmuş.

Puanı aşağı çeken nedenler:
- **Kritik:** Çekirdek tablolar (`reservations`, `manual_reservations`, `admin_users`, `settings`, `villa_prices` …) RLS'siz. Tüm iş mantığı tarayıcıda anon key ile çalışıyor. Bu, müşteri PII'si ve fiyat bütünlüğü için gerçek bir production riski.
- Auth sınırı (admin paneli) tamamen client-side. Sunucuda zorlayıcı bir kapı yok.
- Sitemap / robots.txt yok — SEO odaklı bir proje için temel bir eksik.
- Testler dar kapsamlı; en kritik akışlar (rezervasyon/ödeme/RLS) test edilmemiş.

Kısaca: **iyi zanaatkârlık, hatalı güven sınırı.** Mimari karar düzeltilirse bu sistem hızla 8+ seviyesine çıkar.

---

## 2. Kritik Problemler

### 2.1 — Çekirdek tablolarda RLS yok + tüm veri erişimi tarayıcıda anon key ile

**Risk seviyesi:** 🔴 Kritik (sistemin en büyük problemi)

**Kanıt (kodun kendi yorumlarından):**
- `migration 033`: *"villa table'ı şu an RLS-free"*
- `migration 019`: *"public anon role villa table'a zaten SELECT"*
- `ENABLE ROW LEVEL SECURITY` yalnızca ~11 tabloda var. `reservations`, `manual_reservations`, `admin_users`, `settings`, `payment_methods`, `villa_prices`, `mail_logs`, `villa_images` bu listede **yok**.
- `lib/db/reservation.repository.ts` anon `supabase` client'ını kullanıyor; `ReservationForm.tsx` (client component) → `createReservation()` → repository zinciri **baştan sona tarayıcıda** çalışıyor.

**Gerçek dünya etkisi:**
Supabase'te bir tabloda RLS kapalıysa, `anon` rolüne verilen default GRANT'ler devreye girer ve tablo, public bundle içinde görünen anon key ile **doğrudan REST API'den** okunabilir/yazılabilir hale gelir.

1. **PII sızıntısı (KVKK/GDPR ihlali):** Saldırgan `https://<proje>.supabase.co/rest/v1/reservations?select=*` çağrısını anon key ile yapıp **tüm müşteri ad/telefon/e-posta/fiyat/komisyon kayıtlarını** çekebilir. Uygulamayı hiç ziyaret etmesine gerek yok.
2. **Fiyat bütünlüğü çöküşü:** Rezervasyon payload'u (`total_price_try`, komisyon) client'ta hesaplanıp doğrudan tabloya yazılıyor. Sunucu tarafı doğrulama yok → saldırgan fiyatı 0 TL yapıp veya istediği değeri yazıp **geçerli rezervasyon enjekte edebilir**.
3. **Sır sızıntısı:** `settings` tablosunda `resend_api_key` tutulabiliyor (`app/lib/mail/client.ts`). `settings` RLS'siz olduğundan bu **gizli API anahtarı anon key ile okunabilir**.
4. **Privilege riski:** `admin_users` RLS'siz ise anon rol bu tabloyu okuyabilir; GRANT'lere bağlı olarak `is_active`/`sidebar_permissions` UPDATE edilebilirse yetki yükseltme kapısı açılır.

**Nasıl exploit edilir:** Anon key tarayıcı bundle'ında açıkça mevcut. Saldırgan onu kopyalar, Supabase REST endpoint'ine doğrudan istek atar. Uygulama katmanı tamamen bypass edilir; rate-limit, validasyon, auth — hiçbiri devreye girmez.

**Çözüm önerisi:**
- **Tüm public tablolarda RLS'i AÇ** ve "default deny" prensibini uygula (policy yoksa erişim yok).
- Sadece gerçekten public okunması gereken sütunlar için (villa public verisi, onaylı yorumlar) `anon SELECT` policy'si tanımla; geri kalan her şeyi `service_role`/admin'e kapat.
- `reservations`, `manual_reservations`, `settings`, `admin_users`, `payment_methods` → anon'a **kapalı**.
- Rezervasyon **oluşturma/güncelleme/silme akışını server action veya API route'a taşı**; service-role veya admin-gated client ile yap. Fiyat ve komisyonu **sunucuda yeniden hesapla**, client'tan gelen tutara güvenme.
- `settings` içindeki sırları (resend_api_key) DB'den çıkar; env değişkenine taşı.

---

### 2.2 — Admin auth sınırı tamamen client-side; sunucuda zorlayıcı kapı yok

**Risk seviyesi:** 🔴 Kritik

**Kanıt:**
- `middleware.ts` yorumu açıkça: *"Gerçek auth doğrulaması SUNUCUDA değil… security boundary client-side helper'dadır."* Middleware yalnızca forge edilebilir bir `admin-session=1` cookie marker'ına bakıyor.
- `app/(admin)/maki-admin/layout.tsx` baştan `"use client"`. Tüm panel `AdminSessionGuard` (client) ile korunuyor.
- Admin sayfaları veriyi anon client ile doğrudan okuyor (`reservations/page.tsx`, `villas/[id]/page.tsx` vb.).

**Gerçek dünya etkisi:**
Admin panelinin "korunması" yalnızca UI'ı gizlemekten ibaret. Asıl veri koruması yine 2.1'deki RLS'e bağlı. RLS olmadığından, admin paneline hiç girmeden de veriye erişilebilir. Yani client-side guard, gerçek bir güvenlik sınırı değil — sadece UX yönlendirmesi.

**Nasıl bozulur:** Cookie marker'ı elle set edip middleware redirect'i atlatmak mümkün; ama gerçek tehlike bu bile değil — veri katmanı zaten korumasız (2.1).

**Çözüm önerisi:**
- 2.1 çözüldüğünde bu otomatik olarak büyük ölçüde kapanır (gerçek sınır RLS'e iner).
- Admin veri okuma/yazmasını mümkün olduğunca server component / route handler + service-role + `authorizeAdminToken` üzerinden yap. Hassas listeleri (rezervasyon, kullanıcı, ödeme) client'tan anon ile çekmeyi bırak.

---

### 2.3 — Rate limiting "fail-open" (env yoksa sessizce devre dışı)

**Risk seviyesi:** 🟠 Yüksek

**Kanıt:** `lib/rate-limit.ts`: *"Env eksikse: null döner (open mode)"*. `.env.local` içinde `UPSTASH_REDIS_REST_URL/TOKEN` yok.

**Gerçek dünya etkisi:** Upstash env'i production'da set edilmezse, mail/availability/geocode endpoint'leri **limitsiz** çalışır. Resend mail kötüye kullanımı (spam relay), maliyet patlaması ve geocode/exchange-rate abuse riski. Üstelik sessizce — hiçbir uyarı yok.

**Çözüm:** Production'da env varlığını boot-time'da doğrula; eksikse **fail-closed** ol veya en azından kritik mutasyon endpoint'lerinde zorunlu kıl. Health-check'e rate-limit aktiflik kontrolü ekle.

---

## 3. Orta Seviye Problemler

**Yetki modeli granülaritesi (`create-user`):** Her aktif admin, başka bir admin'i (istediği `permissions` ile) oluşturabiliyor; "super admin" ayrımı yok. Kötü niyetli/ele geçirilmiş bir admin hesabı yeni tam yetkili admin açabilir. Role bazlı bir ayrım (owner vs staff) ve bu route için ayrı bir permission key gerekli.

**Token query parametresinde (`authorizeAdminCallerFlex`, voucher):** Access token `?token=` ile URL'de taşınıyor. Kod bunu kabul edip "HTTPS + no-referrer" ile hafifletmiş; yine de URL'ler tarayıcı geçmişi, proxy logları ve sunucu access loglarına düşer. Kısa ömürlü olsa bile imzalı/tek kullanımlık bir voucher token tercih edilmeli.

**Karışık image stratejisi:** 5 dosya `next/image`, 5 dosya ham `<img>` kullanıyor. Medya ağırlıklı (galeri) bir villa sitesinde ham `<img>` LCP ve CWV'yi düşürür. Galeri ve kart görsellerinin tamamı `next/image` + uygun `sizes` ile servis edilmeli.

**Dar test kapsamı:** Testler `villa-admin` helper'ları ve `date-range` ile sınırlı. En kritik akışlar — rezervasyon çakışma, fiyat/komisyon hesabı, RLS davranışı, ödeme — test edilmemiş. Revenue-critical kod test dışı.

**`force-dynamic` kullanımı:** Arama ve liste sayfaları `force-dynamic`. İşlevsel olarak doğru ama yoğun trafikte her isteği sunucuya bindirir; arama için edge-cache + parametre bazlı revalidate stratejisi düşünülmeli.

**Audit log kapsamı:** `admin_activity_logs` var (iyi) ama veri katmanı bypass edilebildiği için (2.1) loglar gerçek erişimin tamamını yakalamıyor — sadece uygulama üzerinden geçen aksiyonları görüyor.

---

## 4. Mimari Analiz

**Genel yapı:** Next.js 16 App Router + Supabase, servis/repository katmanlı, helper'lara bölünmüş temiz bir yapı. "FAZ" bazlı iteratif gelişim ve repository extraction çalışmaları, kod tabanının düşünülerek büyütüldüğünü gösteriyor. DX ve maintainability açısından ortalama üstü.

**Temel mimari hata:** "Fat client" modeli. İş mantığının ve veri erişiminin büyük kısmı tarayıcıda anon key ile çalışıyor. Bu, prototip hızında geliştirme sağlar ama production güven sınırını yok eder. Sistem, Supabase RLS'i "varmış gibi" yazılmış ama RLS çoğu tabloda yok — bu boşluk mimarinin kalbinde.

**1000+ villa / yoğun trafik senaryosu:**
- Villa listeleme/anasayfa `unstable_cache` + tag invalidation ile iyi ölçeklenir.
- Asıl darboğaz: client tarafında anon ile yapılan geniş `select` + embed sorguları (admin listeleri, arama). 1000+ villa ve ilişkili tablolarda bu N+1 ve büyük payload sorunları doğurur.
- Rezervasyon yazımı DB constraint'i sayesinde concurrency'de güvenli; ancak yüksek eşzamanlılıkta `EXCLUDE` constraint reddi (23P01) kullanıcıya net hata olarak dönmeli (retry/UX).
- `force-dynamic` sayfalar trafikle doğrusal sunucu yükü üretir.

**Teknik borç:** En büyük borç güvenlik mimarisi (RLS + güven sınırı). İkincil borç: tiplenmemiş Supabase client (`createClient` generic'siz, `lib/supabase.ts` yorumunda açıklanmış) — tip güvenliği elle alias'larla taşınıyor, refactor riskini artırıyor. Üçüncül: test boşlukları.

---

## 5. Güvenlik Analizi

**Auth:** Supabase Auth + `admin_users` (is_active + permissions) modeli mantıklı kurulmuş. Authentication sağlam; **authorization sınırı yanlış yerde** (client). 30 dk inactivity timeout var (iyi).

**RLS:** En zayıf halka. ~11 tabloda var, çekirdek tablolarda yok. `payment_accounts` için yapılan hardening (migration 034) doğru pattern'i gösteriyor — bu pattern **tüm tablolara** uygulanmalı. Önceki `USING(true)` faciası (banka hesapları herkesçe yazılabilirdi) bu riskin proje genelinde gerçek olduğunu kanıtlıyor.

**API:** Service-role route'ları (create-user, exchange-rates refresh, external-calendar sync, mail) Bearer + admin lookup ile **doğru korunmuş**. SSRF koruması var (`lib/security/ssrf.ts`) — geocode/iCal fetch için önemli ve doğru bir önlem. Bu katman güçlü.

**Admin:** Panel UI client-gated; veri sınırı yok (yukarıda).

**Session:** JWT default 1h, marker cookie SameSite=Lax. Makul.

**Privilege escalation:** İki vektör — (a) `admin_users` RLS'siz ise doğrudan UPDATE, (b) her admin'in yeni admin açabilmesi. İkisi de kapatılmalı.

**Data exposure:** En yüksek risk. Reservations PII + settings sırları + admin listesi anon ile erişilebilir.

**Injection:** Supabase client parametrik sorgular kullandığı için SQL injection riski düşük. XSS: dinamik içerik (pages, villa açıklamaları) render'ında `dangerouslySetInnerHTML` kullanımı denetlenmeli (CMS içerikleri admin kaynaklı ama yine de sanitize edilmeli).

---

## 6. Performans Analizi

**Frontend:** Karışık image stratejisi (ham `<img>`) galeri ağırlıklı sayfalarda LCP'yi düşürür. Admin paneli tamamen client + anon sorguları → ilk yük ağır olabilir.

**Backend / Query:** Caching katmanı olgun (tag + TTL). Public villa/anasayfa yolları iyi. Client-side geniş embed select'ler (özellikle admin ve arama) büyük ölçekte payload ve N+1 riski taşır.

**Database:** `btree_gist` + EXCLUDE constraint mükemmel bir tercih. Ancak migration'larda kapsamlı index tanımı görülmedi — `reservations(villa_id, start_date)`, `villa(slug)`, `villa_images(villa_id)`, FK kolonları üzerinde index varlığı doğrulanmalı (1000+ villa'da kritik).

**Image/media:** `next/image` remotePattern doğru kurulu (Supabase public bucket). Ama tutarlı kullanım yok. CDN/optimization tam değil.

**Cache:** Güçlü nokta. `revalidateTag` invalidation admin yazımlarıyla bağlanmış.

**Rendering:** SSR/client sınırı çoğu yerde mantıklı; ancak admin'in tümüyle client olması ve `force-dynamic` sayfalar optimize edilebilir.

---

## 7. SEO & Public Site Analizi

**Teknik SEO — ciddi eksik:** `app/sitemap.ts` ve `app/robots.ts` **yok**. SEO sayfaları olan bir villa platformu için bu temel bir boşluk; villa detay sayfalarının indekslenmesi şansa kalıyor.

**Metadata:** 7 sayfada `generateMetadata` var (iyi). `metadataBase` ve canonical URL kullanımı seyrek/şüpheli (grep'teki çoğu eşleşme "canonical date" gibi alakasız yorumlar) — canonical etiketlerinin gerçekten render edildiği doğrulanmalı.

**Structured data:** `StructuredData.tsx` (JSON-LD) mevcut — iyi. Villa için `LodgingBusiness`/`Product` + `AggregateRating` (yorumlar zaten var) şemaları zenginleştirilebilir.

**Indexing/canonical:** Dinamik villa sayfaları (`kiralik-villa/[slug]`) server component + Metadata kullanıyor (doğru yaklaşım). Ama sitemap olmadan keşfedilebilirlik düşük.

**Yapılması gerekenler:** `sitemap.ts` (villa + lokasyon + tip + sayfa rotaları, dinamik), `robots.ts`, her public sayfada açık canonical, OG görselleri (`public/` yalnızca default SVG'ler içeriyor).

---

## 8. Veritabanı Analizi

**Schema:** İlişkisel model olgun — villa, ilişki tabloları (feature/rule/type/price-include relations), fiyat takvimi, manuel ve harici rezervasyonlar net ayrılmış. Soft-delete + active flag var.

**Index:** EXCLUDE GiST constraint güçlü. Ancak genel index disiplini migration'larda görünmüyor; FK ve sık filtrelenen kolonlar (slug, villa_id, start_date, status) için index varlığı **mutlaka doğrulanmalı** — 1000+ villa ölçeğinde sorgu performansının belirleyicisi bu.

**Relation:** Çoktan-çoğa ilişkiler ayrı tablolarla doğru modellenmiş.

**Transaction ihtiyacı:** Rezervasyon + komisyon + (gelecekte ödeme) yazımı tek atomik işlem olmalı. Şu an client-side orchestration ile yapılıyor; kısmi başarı (reservation yazıldı ama mail/log atılamadı) durumları için sunucu tarafı transaction'a geçilmeli.

**Concurrency:** Çift rezervasyon DB seviyesinde **çözülmüş** — projenin en güçlü teknik kararı. `cancelled` vs `rejected` allow-list drift'i migration 030 ile düzeltilmiş; detaya hâkim bir ekip işareti.

---

## 9. Production Readiness

**Değerlendirme: Üst düzey MVP / erken Startup seviyesi — henüz güvenli production değil.**

- Özellik kapsamı (villa, rezervasyon, takvim/fiyat, medya, SEO, çoklu kullanıcı, WhatsApp, mail, harici takvim sync) **mid-scale bir ürünün** kapsamında.
- Mühendislik olgunluğu (caching, concurrency, kod organizasyonu) startup ortalamasının üstünde.
- **Ancak** güvenlik mimarisi (RLS boşluğu + client güven sınırı + PII açığı) bir sistemi production-ready saymaktan alıkoyan türden. Müşteri PII'si ve ödeme verisi işleyen bir sistem için bu, "çıkmadan önce mutlaka kapat" kategorisinde.

Net: Özellik ve zanaat olarak mid-scale'e yakın; **güvenlik olarak MVP'nin gerisinde.** Enterprise'dan uzak (audit bütünlüğü, RBAC, transaction, monitoring, DR eksik).

---

## 10. Öncelikli Yapılacaklar (Impact / Effort)

1. **Tüm tablolarda RLS'i aç, default-deny uygula** — Impact: çok yüksek / Effort: orta. (En kritik. payment_accounts pattern'ini her tabloya taşı.)
2. **Rezervasyon create/update'i server action + service-role'e taşı, fiyat/komisyonu sunucuda yeniden hesapla** — Impact: çok yüksek / Effort: orta.
3. **`settings`'teki sırları (resend_api_key) env'e taşı** — Impact: yüksek / Effort: düşük.
4. **Hassas admin listelerini (rezervasyon/kullanıcı/ödeme) client anon yerine server-side okumaya çevir** — Impact: yüksek / Effort: orta.
5. **Rate-limit'i fail-closed yap + boot-time env doğrulaması** — Impact: yüksek / Effort: düşük.
6. **`sitemap.ts` + `robots.ts` + canonical + OG görselleri** ekle — Impact: yüksek (SEO) / Effort: düşük.
7. **FK ve sık-filtre kolonlarına index ekle/doğrula** — Impact: yüksek (ölçek) / Effort: düşük.
8. **RBAC: super-admin vs staff ayrımı + create-user'a permission gate** — Impact: orta / Effort: orta.
9. **Görsellerde tutarlı `next/image` + `sizes`** — Impact: orta (CWV) / Effort: düşük.
10. **Revenue-critical akışlara (rezervasyon/fiyat/RLS) integration testleri** — Impact: orta / Effort: orta.

---

## 11. Final CTO Yorumu

Dürüst değerlendirme: bu, **yetenekli birinin elinden çıkmış, özenle iterate edilmiş bir kod tabanı.** Concurrency'i DB seviyesinde doğru çözmek, olgun bir cache stratejisi kurmak, servis/repository katmanı ayırmak — bunlar deneyim isteyen şeyler ve burada var. Kod kalitesi ve özellik kapsamı beni olumlu yönde şaşırttı.

Ama bir CTO olarak yatırım/lansman kararı verecek olsam, **bugünkü haliyle production'a "evet" diyemem.** Tek bir mimari karar — tüm veri erişimini tarayıcıya, anon key ile, RLS olmadan yıkmak — sistemin geri kalanındaki tüm iyi işi gölgeliyor. Müşteri PII'si ve ödeme verisi işleyen bir sistemde "anon key ile tüm rezervasyonlar okunabiliyor" cümlesi, lansmanı durduran türden bir cümledir. Bu, teorik değil; saldırgan için 5 dakikalık bir iş.

İyi haber: bu **kapatılabilir ve hızlı kapatılabilir** bir açık. Sorun yapısal değil, sınırın yanlış yere konmasından ibaret. Madde 1–5'i (RLS + server-side rezervasyon + sır temizliği + rate-limit) bitirmek muhtemelen 1–2 haftalık odaklı bir iş ve sistemi anında 8/10 bandına taşır.

- **Piyasaya çıkmaya hazır mı?** Hayır — önce güvenlik maddeleri (1–5) kapatılmalı.
- **Güven verir mi?** Mühendislik kalitesi güven veriyor; mevcut güvenlik duruşu vermiyor.
- **Büyük trafik kaldırır mı?** Public/cache yolları büyük ölçüde evet; admin ve arama yolları index + server-read optimizasyonu ister; rezervasyon concurrency'si zaten hazır.
- **Teknik seviye?** Zanaat olarak güçlü mid-level/senior; güvenlik mimarisi olarak şu an junior bir hata barındırıyor. Bu çelişki kapatılınca ortaya gerçekten sağlam bir ürün çıkar.

**Tek cümlelik özet:** Sağlam yapılmış bir araba, ama kapıları kilitli değil — önce kilitleri tak, sonra yola çık.
