# VILLA DETAY SAYFASI — PERFORMANS DENETİMİ

**Tarih:** 2026-06-07
**Hedef dosya:** `app/(public)/kiralik-villa/[slug]/page.tsx` (968 satır)
**Kapsam:** Yalnız villa detay sayfası performansı · analiz-only (kod/diff/commit yok)
**İncelenen bağımlılıklar:** `villa.service`, `villa-image.service`, `villa-price.service`, `villa-distance.service`, `villa-feature.service`, `rule-item.service`, `price-include-item.service`, `settings.service`, `external-calendar.public.helper`, `cache.helpers`, `lib/db/villa.repository.ts`

---

## A) MEVCUT DURUM

### Sayfa iki ayrı server fonksiyonu çalıştırıyor

| Fonksiyon | Satır | Görev |
|-----------|-------|-------|
| `generateMetadata()` | 137–195 | SEO meta + OG/Twitter + canonical |
| `VillaDetail()` (page) | 197–967 | Tam sayfa render |

### Veri çekimleri ve cache durumu

| # | Çağrı | Satır(lar) | Cache? | Her request DB? |
|---|-------|-----------|--------|-----------------|
| 1 | `getVillaBySlug(slug)` | **143** (metadata) | ❌ | ✅ |
| 2 | `getVillaBySlug(slug)` | **224** (page) | ❌ | ✅ (**#1 ile DUPLICATE**) |
| 3 | `getVillaImages(villa.id)` | 243 | ❌ | ✅ (**embed ile redundant**) |
| 4 | `getVillaPrices(villa.id)` | 244 | ❌ | ✅ |
| 5 | `getVillaDistances(villa.id)` | 245 | ❌ | ✅ |
| 6 | `getVillaFeaturesByVilla(villa.id)` | 246 | ❌ | ✅ |
| 7 | `getRuleItemsByVilla(villa.id)` | 256 | ❌ | ✅ |
| 8 | `getPriceIncludeItemsByVilla(villa.id)` | 257 | ❌ | ✅ |
| 9 | `fetchExternalCalendarStringsForVilla(villa.id)` | 264 | ❌ | ✅ |
| 10 | `getPublicSettings()` | 270 | ❌ (global veri!) | ✅ (RPC) |
| 11 | `getCachedVillaReviews(villa.id)` | 278 | ✅ tag `villa-reviews` | hit'te ❌ |
| 12 | `getCachedVillaReviewStats(villa.id)` | 279 | ✅ tag `villa-reviews` | hit'te ❌ |

**Önemli yapısal gerçek:** `getVillaBySlug` → `villaRepository.findBySlug` → `SELECT_BASIC` (repository satır ~92) zaten `villa_images (image_url, is_cover, sort_order)` embed ediyor. Yani villa görselleri **getVillaBySlug içinde zaten geliyor**; satır 243'teki `getVillaImages` ikinci kez aynı tabloyu okuyor. Sayfa görselleri yalnız `img.image_url` olarak kullanıyor (satır 293–295) → embed verisi yeterli.

### Render modu
- `export const dynamic` **yok**, `export const revalidate` **yok**, `generateStaticParams` **yok**.
- Sayfa `searchParams` (start/end) okuyor (satır 213) → Next.js bu sayfayı **otomatik DYNAMIC** yapar.
- Sonuç: **her request'te tam re-render + tüm uncached sorgular yeniden çalışır. Hiçbir HTML/data cache yok** (reviews hariç).

---

## B) TESPİT EDİLEN PROBLEMLER

### B1 — Duplicate villa sorgusu (generateMetadata + page)
`getVillaBySlug` satır 143 ve 224'te **iki kez** çağrılıyor. Next.js `fetch()`'i otomatik dedupe eder ama Supabase client çağrıları dedupe **edilmez** (React `cache()` sarması yok). → Her request'te **2 özdeş villa sorgusu**.

### B2 — Redundant görsel sorgusu
`villa_images` hem `getVillaBySlug` embed'inde (satır 224 sonucu) hem de `getVillaImages` ile (satır 243) okunuyor. Sayfa yalnız `image_url` kullandığından ikincisi **tamamen gereksiz**.

### B3 — Sequential await zinciri (en büyük gecikme kaynağı)
Satır 243–270 arası **8 bağımsız sorgu sırayla (sequential)** bekleniyor. Toplam gecikme = sorguların **toplamı** (örn. 8 × ~25ms ≈ 200ms), oysa paralelde **en yavaş tek sorgu** (~25–40ms) kadar olabilir.

```
await getVillaBySlug      (224)  ← GATE (villa.id gerekli)
await getVillaImages      (243)  ┐
await getVillaPrices      (244)  │
await getVillaDistances   (245)  │  hepsi yalnız villa.id'ye bağlı
await getVillaFeatures…   (246)  │  → BİRBİRİNDEN BAĞIMSIZ
await getRuleItemsByVilla (256)  │  → Promise.all adayı
await getPriceIncludes…   (257)  │
await fetchExternalCal…   (264)  ┘
await getPublicSettings   (270)  ← HİÇBİR ŞEYE bağlı değil (villa'dan önce başlayabilir)
Promise.all([reviews, stats]) (277–280)  ← zaten paralel ✅
```

### B4 — Global veri (settings) cache'siz
`getPublicSettings()` (satır 270) **tüm villa sayfalarında özdeş** global watermark/ayar verisi; her request'te RPC çağrısı. `cache.helpers.ts` içinde hazır `getCachedSettings` varken kullanılmıyor.

### B5 — ISR/static yok
`searchParams` okunduğu için sayfa dynamic'e zorlanıyor; ancak `searchParams` yalnız BookingSidebar'a başlangıç tarihi geçirmek için kullanılıyor — **sayfa içeriği searchParams'a bağımlı değil**. Yani cache'lenebilir bir sayfa, sırf tarih prop'u yüzünden tamamen dynamic.

### B6 — Tek-tek 1:N sorguları (mimari)
images/prices/distances/features/rules/includes ayrı ayrı tablolardan ayrı sorgularla çekiliyor. PostgREST tek embed'li select ile tek round-trip'te getirilebilir (yüksek kazanç / orta-yüksek risk).

---

## C) KAZANÇ SIRASINA GÖRE OPTİMİZASYONLAR

> Tahminler: tipik Supabase round-trip ~20–40ms (aynı region). Soğuk (cache miss) senaryosu baz alınmıştır.

### C1 — Sequential await'leri `Promise.all`'a çevir ⭐ (en yüksek kazanç/risk oranı)
**Mevcut:** 8 sorgu sırayla (~200ms toplam). **Sonra:** tek paralel dalga (~30–40ms).
**Neden paralelleşebilir:** satır 243–264 sorgularının tümü yalnız `villa.id`'ye bağlı, birbirine bağımlı değil. `getPublicSettings` hiçbir şeye bağlı değil.
**Tahmini kazanç: ~150–170ms (sayfa veri süresinin %70–80'i).**

### C2 — `getVillaBySlug`'ı React `cache()` ile dedupe et
generateMetadata + page tek fetch paylaşır.
**Tahmini kazanç: ~1 sorgu (~25–40ms) + DB yükünün ~%8'i.**

### C3 — Redundant `getVillaImages`'i kaldır (embed verisini kullan)
`villa.images` zaten DTO'da; satır 243 elenebilir.
**Tahmini kazanç: ~1 sorgu (~25ms) + bir tablo okuması daha az.**

### C4 — `getPublicSettings` → `getCachedSettings`
Global veri cache'ten gelir; tüm villa sayfaları paylaşır.
**Tahmini kazanç: villa başına ~1 RPC; yüksek trafikte toplamda çok büyük DB tasarrufu.**

### C5 — Statik datasetleri per-villa `unstable_cache` ile sar
villa + images + prices + distances + features + rules + includes nadir değişir; tag `villas` (mevcut villa CRUD invalidation'ı zaten var) ile cache'lenebilir.
**Tahmini kazanç: warm request'te ~0 DB hit; soğuk/revalidate'te tam maliyet.**

### C6 — ISR'a geç (`revalidate` + searchParams'ı client'a taşı)
Sayfa HTML'i tamamen cache'lenir; CDN'den servis.
**Tahmini kazanç: cache hit'te ~0 server compute + ~0 DB; TTFB düşer, LCP/Core Web Vitals iyileşir, crawl bütçesi rahatlar.**

### C7 — Tek embed'li mega-select (1:N'leri tek sorguda topla)
~8 sorgu → 1.
**Tahmini kazanç: soğuk yolda ~7 round-trip; mimari sadeleşme.** (Risk yüksek — aşağıda.)

---

## D) HER OPTİMİZASYONUN RİSK SEVİYESİ

| Kod | Optimizasyon | Risk | Gerekçe |
|-----|--------------|------|---------|
| C1 | Sequential → `Promise.all` | **LOW** | Saf paralelleştirme; sorgular/veri shape/sonuç aynı, yalnız bekleme biçimi değişir. Reviews zaten bu pattern'de. |
| C2 | `getVillaBySlug` `cache()` dedupe | **LOW** | Standart Next.js pattern; davranış byte-identical, sonuç memoize. |
| C3 | Redundant `getVillaImages` kaldır | **MEDIUM** | Gallery yalnız `image_url` kullanıyor (doğrulandı) ama `getVillaImages` `select("*")` ile ek alan döndürüyor; Gallery/watermark beklentisi tekrar doğrulanmalı. |
| C4 | `getCachedSettings` kullan | **LOW** | Cache helper zaten public-safe RPC sarmalıyor; watermark alanları aynı. |
| C5 | Per-villa `unstable_cache` | **MEDIUM** | Tag invalidation (`villas`) villa CRUD'da tetikleniyor; external iCal blokları cache'lenirse ~TTL kadar bayatlar — onları cache dışı bırakmak gerekir. |
| C6 | ISR + searchParams client'a taşıma | **MEDIUM** | BookingSidebar tarih hydration'ı (initialStart/initialEnd) URL'den client-side okumaya geçmeli; refresh-safe davranış korunmalı. Availability zaten client RPC ile geliyor, bu yüzden ISR güvenli. |
| C7 | Tek embed'li mega-select | **HIGH** | Repository `SELECT_BASIC` + `mapVilla` + relation mapping değişir; PostgREST embed sıralaması/null davranışı; çok sayıda downstream tüketici. Rezervasyon/fiyat/galeri kırılma riski. |

---

## E) UYGULANMASINI ÖNERDİĞİM İLK 5 DEĞİŞİKLİK

Sırasıyla (kazanç × düşük risk):

1. **C1 — Sequential await'leri `Promise.all`'a al** (LOW)
   En büyük tek kazanç (~150ms), sıfıra yakın risk. `getPublicSettings` + reviews dahil tek paralel blok.

2. **C2 — `getVillaBySlug`'ı `cache()` ile dedupe et** (LOW)
   metadata ↔ page çift sorgusunu eler; standart pattern, davranış değişmez.

3. **C4 — `getPublicSettings` → `getCachedSettings`** (LOW)
   Global veri; yüksek trafikte DB yükünü villa-sayfası başına 1 RPC azaltır.

4. **C5 — villa + ilişkili statik datasetleri per-villa `unstable_cache` (tag: `villas`)** (MEDIUM)
   Warm trafikte DB hit'i ~0'a indirir; mevcut invalidation altyapısıyla uyumlu. External iCal blokları cache dışı tutulur.

5. **C6 — ISR'a geç (`revalidate`), searchParams date'i BookingSidebar'da client-side oku** (MEDIUM)
   HTML cache + CDN; TTFB/LCP/crawl kazancı. Availability zaten client RPC olduğu için içerik tazeliği bozulmaz.

> **C3** (redundant images) ve **C7** (mega-select) sonraya bırakılmalı: C3 küçük kazançlı + doğrulama gerektirir; C7 yüksek riskli (rezervasyon/galeri/fiyat zincirini etkiler).

---

## 4) ISR KARARI — `revalidate` kaç olmalı?

Villa detay içeriği iki sınıfa ayrılır:
- **Yavaş değişen (admin düzenler):** villa bilgisi, görseller, fiyatlar, özellikler, mesafeler, kurallar, fiyata dahil → **saatler/günler** mertebesinde değişir.
- **Müsaitlik:** AvailabilityInlineCalendar ve BookingSidebar müsaitliği **client-side RPC** ile okur (sayfaya gömülü değil). Yalnız `externalBlocks` (iCal) server-side prop olarak geliyor; iCal sync cron'u **4 saatte bir** çalışıyor.

| Süre | Değerlendirme |
|------|---------------|
| 5 dk | ❌ Gereksiz agresif. İçerik bu kadar sık değişmiyor; cache faydasını büyük ölçüde yok eder, DB yükü yüksek kalır. |
| 15 dk | 🟡 Savunulabilir. External iCal bloklarını daha taze tutar; orta trafikte iyi denge. |
| **1 saat** | ✅ **Önerilen.** İçerik değişim frekansıyla örtüşür; sitemap/taxonomy TTL'i ile tutarlı. Villa CRUD'da **tag invalidation (`villas`)** eklenirse düzenlemeler **anında** yansır; external bloklar en kötü ~1 saat bayatlar (4 saatlik cron'a göre kabul edilebilir, takvim zaten client RPC ile tazelenir). |
| 24 saat | ❌ Fiyat/müsaitlik güncellemeleri için fazla bayat; sezon fiyatı değişiminde yanlış bilgi riski. |

**Karar: `revalidate = 3600` (1 saat) + villa mutation'larında tag/path invalidation.** Daha taze external takvim isteniyorsa 15 dk'ya çekilebilir; ancak asıl çözüm external blokları cache dışı bırakıp client RPC'ye güvenmektir.

---

## 5) DATABASE ROUNDTRIP ANALİZİ

### Sayfa açıldığında (soğuk / cache miss) mevcut çağrılar:
```
1.  getVillaBySlug            (generateMetadata, satır 143)
2.  getVillaBySlug            (page, satır 224)            ← DUPLICATE
3.  getVillaImages            (satır 243)                  ← embed ile REDUNDANT
4.  getVillaPrices            (satır 244)
5.  getVillaDistances         (satır 245)
6.  getVillaFeaturesByVilla   (satır 246)
7.  getRuleItemsByVilla       (satır 256)
8.  getPriceIncludeItemsByVilla (satır 257)
9.  fetchExternalCalendarStringsForVilla (satır 264)
10. getPublicSettings (RPC)   (satır 270)
11. getCachedVillaReviews     (satır 278)                  ← cache hit'te 0
12. getCachedVillaReviewStats (satır 279)                  ← cache hit'te 0
```
**Mevcut soğuk toplam: ~12 round-trip** (reviews cache hit ise ~10). Üstelik 1–10 arası **sıralı** (Promise.all yalnız 11–12'de).

### Minimuma indirme hesabı:

| Adım | Eleme | Kalan roundtrip |
|------|-------|-----------------|
| Başlangıç (soğuk) | — | ~12 |
| C2: villa dedupe (`cache()`) | −1 (duplicate villa) | ~11 |
| C3: redundant images kaldır | −1 | ~10 |
| C4: settings cache (global, paylaşılan) | −1 (villa-başına) | ~9 |
| C1: kalanları paralelleştir | round-trip **sayısı** aynı ama **süre** = 1 dalga | ~9 sorgu / ~1 dalga |
| C5: per-villa cache (warm) | warm'da statik veri 0 | **~1–2** (external + cold reviews) |
| C6: ISR (HTML cache hit) | tüm sayfa cache | **~0** |
| C7: mega-select (opsiyonel, cold) | 1:N'leri 1'e indir | **soğukta ~1 villa + 1 settings(cached) + reviews** |

**Sonuç:**
- **Hızlı kazanım (C1+C2+C3+C4):** ~12 sıralı → **~9 sorgu / tek paralel dalga**, çift+redundant elenmiş.
- **Caching ile (C5):** warm request'te **~1–2 DB hit**.
- **ISR ile (C6):** cache hit'te **~0 DB hit, ~0 server compute**.
- **Teorik minimum (C7+C5/C6):** soğuk yolda **tek embed'li villa sorgusu (1)** + cache'li settings + cache'li reviews ≈ **1 gerçek DB round-trip**.

---

## 6) EN GÜVENLİ OPTİMİZASYON PLANI (hiçbirini bozmadan)

> Repository / Service / Cache / Availability / Booking / SEO / StructuredData / Reviews / Gallery **dokunulmadan** veya davranışı korunarak, en düşük riskten yükseğe:

1. **`Promise.all` (C1)** — yalnız `page.tsx` içi await düzeni değişir; servis/sorgu/veri shape aynı. Availability/Booking/SEO/Gallery prop'ları birebir aynı değerleri alır. **Risk: LOW.**
2. **`cache()` dedupe (C2)** — `getVillaBySlug` sarmalanır; metadata ve page aynı sonucu paylaşır. SEO/StructuredData aynı villa nesnesini görür. **Risk: LOW.**
3. **`getCachedSettings` (C4)** — watermark/ayar alanları aynı; Gallery watermark prop'u değişmez. **Risk: LOW.**
4. **Per-villa `unstable_cache` (C5)** — mevcut `villas` tag invalidation altyapısı kullanılır; external iCal blokları cache **dışında** bırakılır → availability tazeliği korunur. Booking/Reviews etkilenmez. **Risk: MEDIUM.**
5. **ISR (C6)** — searchParams tarih geçişi BookingSidebar'da client-side `useSearchParams` ile okunur; refresh-safe davranış korunur. Availability zaten client RPC. **Risk: MEDIUM.**
6. **(Opsiyonel) redundant images kaldır (C3)** — Gallery'nin yalnız `image_url` kullandığı doğrulandıktan sonra. **Risk: MEDIUM.**
7. **(Sona bırak) mega-select (C7)** — repository/mapping değişikliği; ayrı PR + tam regresyon testi. **Risk: HIGH.**

---

*Bu rapor yalnız analizdir; hiçbir kod, dosya veya yapılandırma değiştirilmemiştir.*
