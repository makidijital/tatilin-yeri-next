# SUPABASE STORAGE ENVANTERİ — R2 GEÇİŞ HAZIRLIĞI

**Tarih:** 2026-06-07 · **Kapsam:** Veri envanteri (analiz-only; migration/kod yok)

---

## ⚠️ ÖNEMLİ — CANLI SAYILAR HAKKINDA

Bu analiz ortamının ağı, Supabase projenize (`uauhkizhzdpsjtctddbe.supabase.co`) **erişemiyor** (sandbox allowlist dışı; hem TCP:443 hem `supabase-js` `fetch failed` döndü). Bu nedenle **kaç kayıt FULL URL / kaç relative gibi canlı sayıları buradan üretemiyorum** — ve tahmini sayı uydurmuyorum.

İki bölüm sunuyorum:
- **Bölüm 1 — Hazır envanter sorguları:** Supabase Dashboard → SQL Editor'a yapıştırıp çalıştırın; tüm istenen sayılar/örnekler birebir çıkar (salt-okunur, hiçbir veri değişmez).
- **Bölüm 2 — Koddan kesin çıkarımlar:** Hangi alanın FULL URL hangi alanın relative path yazdığı upload kodundan **kesin** bilinir → "switch sonrası ne çalışır" sorusunu sayı olmadan da niteliksel olarak cevaplar.

---

# BÖLÜM 1 — HAZIR ENVANTER SORGULARI (SQL Editor)

> Hepsi `SELECT` — salt-okunur. Sütun adları koddaki bucket kontratından alındı (`lib/storage.helpers.ts`).

### 1) villa_images — FULL URL vs relative + 10 örnek
```sql
-- Sayım
select
  count(*) filter (where image_url ilike 'http%')                                   as full_url,
  count(*) filter (where image_url not ilike 'http%'
                    and image_url is not null
                    and length(trim(image_url)) > 0)                                 as relative_path,
  count(*) filter (where image_url is null or length(trim(image_url)) = 0)           as bos_null,
  count(*)                                                                           as toplam
from villa_images;

-- 10 örnek (format etiketli)
select id, villa_id,
       left(image_url, 90) as image_url_ornek,
       case when image_url ilike 'http%' then 'FULL_URL' else 'RELATIVE' end as format
from villa_images
order by created_at desc nulls last
limit 10;
```

### 2) settings — logo / favicon / watermark / hero / og
```sql
select
  case when site_logo            ilike 'http%' then 'FULL_URL'
       when site_logo is null then 'NULL' else 'RELATIVE' end as logo,
  case when favicon_url          ilike 'http%' then 'FULL_URL'
       when favicon_url is null then 'NULL' else 'RELATIVE' end as favicon,
  case when watermark_logo       ilike 'http%' then 'FULL_URL'
       when watermark_logo is null then 'NULL' else 'RELATIVE' end as watermark,
  case when hero_background_image ilike 'http%' then 'FULL_URL'
       when hero_background_image is null then 'NULL' else 'RELATIVE' end as hero,
  case when default_og_image     ilike 'http%' then 'FULL_URL'
       when default_og_image is null then 'NULL' else 'RELATIVE' end as og_image,
  site_logo, favicon_url, watermark_logo, hero_background_image, default_og_image
from settings;
```

### 3) villa_types — cover_image
```sql
select
  count(*) filter (where cover_image ilike 'http%')                       as full_url,
  count(*) filter (where cover_image not ilike 'http%' and cover_image is not null) as relative_path,
  count(*) filter (where cover_image is null)                             as null_bos,
  count(*)                                                                as toplam
from villa_types;

select id, name, left(cover_image, 90) as ornek,
       case when cover_image ilike 'http%' then 'FULL_URL'
            when cover_image is null then 'NULL' else 'RELATIVE' end as format
from villa_types order by name limit 10;
```

### 4) villa_locations — cover_image
> Tablo adı **`villa_locations`** (kod: migration 009/011), `locations` değil.
```sql
select
  count(*) filter (where cover_image ilike 'http%')                       as full_url,
  count(*) filter (where cover_image not ilike 'http%' and cover_image is not null) as relative_path,
  count(*) filter (where cover_image is null)                             as null_bos,
  count(*)                                                                as toplam
from villa_locations;

select id, name, left(cover_image, 90) as ornek,
       case when cover_image ilike 'http%' then 'FULL_URL'
            when cover_image is null then 'NULL' else 'RELATIVE' end as format
from villa_locations order by name limit 10;
```

### 5) pages — cover_image
```sql
select
  count(*) filter (where cover_image ilike 'http%')                       as full_url,
  count(*) filter (where cover_image not ilike 'http%' and cover_image is not null) as relative_path,
  count(*) filter (where cover_image is null)                             as null_bos,
  count(*)                                                                as toplam
from pages;

select id, slug, left(cover_image, 90) as ornek,
       case when cover_image ilike 'http%' then 'FULL_URL'
            when cover_image is null then 'NULL' else 'RELATIVE' end as format
from pages order by created_at desc limit 10;
```

### 6) Bucket listesi + dosya sayıları (Storage metadata = `storage.objects`)
```sql
-- Bucketlar
select id, name, public, created_at from storage.buckets order by name;

-- Bucket başına dosya sayısı
select bucket_id, count(*) as dosya_sayisi
from storage.objects
group by bucket_id
order by dosya_sayisi desc;

-- site-assets klasör kırılımı (logo/watermark/category-covers/...)
select split_part(name, '/', 1) as klasor, count(*) as dosya
from storage.objects
where bucket_id = 'site-assets'
group by 1 order by 2 desc;

-- TAŞINACAK TOPLAM DOSYA SAYISI (migration ölçeği)
select count(*) as tasinacak_toplam_dosya from storage.objects;

-- (Opsiyonel) toplam boyut — bant genişliği planı
select bucket_id,
       pg_size_pretty(sum( (metadata->>'size')::bigint )) as toplam_boyut
from storage.objects
group by bucket_id;
```

### 7) ÇAPRAZ KONTROL — DB'de referanslı ama format riski (opsiyonel)
```sql
-- villa_images içinde HANGI host'lar geçiyor (beklenmeyen 3. parti URL var mı?)
select split_part(split_part(image_url,'//',2),'/',1) as host, count(*)
from villa_images where image_url ilike 'http%'
group by 1 order by 2 desc;
```

> **REST/curl alternatifi (kendi makinenizde):** her tabloya `?select=id` + header `apikey: <SERVICE_ROLE>` + `Prefer: count=exact` + `Range: 0-0` ile de sayı alınır; ama SQL Editor en pratik.

---

# BÖLÜM 2 — KODDAN KESİN ÇIKARIMLAR (sayı gerekmeden)

Upload kodundaki **yazım formatı** her alan için kesindir. Switch sonrası kural:
**relative path → R2'ye döner (provider `getPublicUrl` R2 domain). FULL URL → `resolveXxx` pass-through ile Supabase'e bağlı kalır.**

| Tablo / Alan | Yazım formatı (koddan) | Kaynak | Switch sonrası | Risk |
|--------------|------------------------|--------|----------------|------|
| `villa_images.image_url` | **MIXED**: yeni = relative (`villas/<slug>__<id>/gallery-NNNN-XXXX.webp`), legacy = FULL URL | `AdminGallery.tsx` "Aşama B" + `resolveVillaImageUrl` dual-format | Relative kısım R2; **legacy FULL URL Supabase'de kalır** | **HIGH** (oran DB'den ölçülmeli — Sorgu 1) |
| `settings.site_logo` | **FULL URL** | `storage.helpers`: "singleton asset upload sonrası DB'ye **full public URL** yazılır" | **Supabase'e bağlı kalır** | **HIGH** |
| `settings.favicon_url` | **FULL URL** (aynı singleton kontratı) | aynı | Supabase'e bağlı kalır | **HIGH** |
| `settings.watermark_logo` | **FULL URL** (aynı) | aynı | Supabase'e bağlı kalır | **HIGH** (watermark tüm görsellerde overlay) |
| `settings.hero_background_image` | **FULL URL** (aynı) | aynı | Supabase'e bağlı kalır | **HIGH** (anasayfa LCP) |
| `settings.default_og_image` | **FULL URL** (aynı) | aynı | Supabase'e bağlı kalır | MEDIUM (paylaşım önizleme) |
| `villa_types.cover_image` | **RELATIVE** (`category-covers/<slug>.webp`) | `buildCategoryCoverPath` | **R2'ye döner** ✅ | LOW |
| `villa_locations.cover_image` | **RELATIVE** (`location-covers/<slug>.webp`) | `buildLocationCoverPath` | **R2'ye döner** ✅ | LOW |
| `pages.cover_image` + image-section | **RELATIVE** (`page-covers/<slug>.webp`) | `buildPageCoverPath` | **R2'ye döner** ✅ | LOW |

> Not: `settings.*` için "FULL URL" çıkarımı `storage.helpers.ts` yorumundaki singleton kontratına dayanır ("Yeni upload sonrası DB'ye full public URL yazılır"). Sorgu 2 ile kesinleştirin — eğer FULL URL çıkarsa bu 5 alan switch sonrası **mutlaka rewrite** edilmeli.

### Bucket envanteri (koddan kesin)
Kodda tanımlı **yalnız 2 bucket** var (`lib/storage/storage.constants.ts`):
- `villa-images` — villa galeri
- `site-assets` — logo / watermark / favicon / hero / og / category-covers / location-covers / page-covers / admin branding

Başka bucket referansı kodda yok. (Sorgu 6 canlı listeyi + varsa beklenmeyen ekstra bucket'ı gösterir.)

---

## "Bugün provider switch yapılırsa ne olur?" — CEVAP

**Çalışmaya devam eder (R2'ye döner):**
- `villa_images` içindeki **relative-path** satırlar (yeni yüklenen galeri görselleri)
- `villa_types`, `villa_locations`, `pages` **cover_image** alanları (relative)
- _Önkoşul:_ dosyalar R2'ye **path-korumalı** kopyalanmış + `next.config` R2 host'u eklenmiş olmalı.

**Supabase'e bağlı kalır (kırılma riski):**
- `villa_images` içindeki **FULL URL** legacy satırlar
- `settings.site_logo / favicon_url / watermark_logo / hero_background_image / default_og_image` (büyük olasılıkla FULL URL — Sorgu 2 ile doğrula)
- Bunlar `resolveXxx` pass-through olduğu için provider swap'ten **etkilenmez**; Supabase Storage kapanırsa **kırık görsel** olurlar.

**Sonuç:** Switch tek başına yeterli değil. Sıralama:
1. Sorgu 1–6 ile **kesin envanter** çıkar (özellikle villa_images FULL-URL oranı + settings formatı + toplam dosya sayısı).
2. Dosyaları R2'ye path-korumalı kopyala + `next.config` dual-host.
3. Provider'ı R2'ye al (relative satırlar anında döner).
4. **FULL URL satırlarını rewrite et** (villa_images legacy + settings singletonları) → tüm okumalar R2.
5. Supabase Storage'ı decommission et.

---

## SONRAKİ ADIM
Yukarıdaki **Sorgu 1–6**'yı SQL Editor'da çalıştırıp sonuçları bana iletirseniz, gerçek sayılarla (kaç dosya, kaç FULL URL, rewrite edilecek tam satır sayısı) net bir migration iş-yükü ve süre tahmini çıkarırım. Alternatif olarak, bu ortamın Supabase'e ağ erişimi açılırsa sorguları doğrudan ben çalıştırıp envanteri tamamlarım.

*Bu rapor yalnız analizdir; hiçbir kod, dosya, veri veya yapılandırma değiştirilmemiştir. Sunulan SQL'ler salt-okunurdur.*
