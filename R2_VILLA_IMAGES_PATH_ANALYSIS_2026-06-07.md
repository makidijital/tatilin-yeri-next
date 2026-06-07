# VİLLA GÖRSELLERİ — STORAGE PATH YAPISI & R2 BULK COPY PLANI

**Tarih:** 2026-06-07 · **Kapsam:** Path envanteri + bulk copy yöntemi (analiz-only)
**Kaynak:** `lib/villa-image.helpers.ts`, `lib/storage/storage.constants.ts`, `app/components/villa/AdminGallery.tsx`
**Sınır:** Provider / upload / DB **DEĞİŞTİRİLMEDİ** (talep gereği yalnız analiz).

---

## 1) BUCKET ADI

**`villa-images`** (sabit: `STORAGE_BUCKETS.VILLA_IMAGES`, `lib/storage/storage.constants.ts`).
Villa galerisinin tek bucket'ı budur. (Cover'lar ve branding `site-assets` bucket'ındadır — bu rapor kapsamı dışı.)

---

## 2) PATH FORMATI

DB'de `villa_images.image_url` ya **FULL URL** ya **bucket-relative path** tutar. Bucket içi path **iki desende**:

### NEW pattern (güncel — `buildVillaImagePath`)
```
villas/{slug}__{shortId}/{filename}
```
- `{slug}` = villa.slug, dosya-güvenli normalize (`a-z0-9-`)
- `{shortId}` = villa.id (UUID) ilk **8 hex** hane → klasör **stable** (slug değişse bile sabit)
- `{filename}` = `{slug}-{NNNN}-{rand4}.{ext}` veya slug boşsa `gallery-{NNNN}-{rand4}.{ext}`
  - `NNNN` = 4 haneli villa-içi sıra (`0001`...), `rand4` = 4 hane hex (race koruması), `ext` = `webp`

**Örnekler:**
```
villas/casa-del-mar__a3f2c1d4/casa-del-mar-0001-a3f2.webp
villas/fethiye-luks-deniz-manzarali-villa__7e9b2c10/fethiye-luks-deniz-manzarali-villa-0002-7e9b.webp
villas/villa__00112233/gallery-0001-9f3a.webp     (slug boş → gallery- fallback)
```

### LEGACY pattern (eski kayıtlar — `isLegacyVillaImagePath`)
```
{villaUuid}/{uuid}.{ext}
```
**Örnek:**
```
b1e6...-...-...-...-............/3f9a...-....-....-....-............ .webp
```

### FULL URL (DB'de saklı haliyle)
```
https://uauhkizhzdpsjtctddbe.supabase.co/storage/v1/object/public/villa-images/{yukarıdaki path}
```
`resolveVillaImageUrl`: FULL URL → pass-through; relative → `getPublicUrl(villa-images, path)`.

---

## 3) KLASÖR YAPISI

```
villa-images/                                  ← BUCKET
├── villas/                                     ← NEW pattern kök klasörü
│   ├── {slug}__{shortId}/                       ← villa başına 1 klasör (stable)
│   │   ├── {slug}-0001-XXXX.webp
│   │   ├── {slug}-0002-XXXX.webp
│   │   └── ...
│   └── {slug2}__{shortId2}/
│       └── ...
└── {villaUuid}/                                 ← LEGACY pattern (düz UUID klasörleri)
    └── {uuid}.webp
```

**Önemli invariant:** Slug değişiminde klasör **rename EDİLMEZ** (orphan önleme). Slug değişince yalnız yeni dosyalar yeni slug'la yazılır; eski dosyalar yerinde kalır. Bu yüzden bulk copy'de **path'ler 1:1 korunmalı** — aksi halde relative-path DB satırları kırılır.

---

## 4) DOSYA SAYISI

> Canlı Storage sayısı bu analiz ortamından **alınamıyor** (Supabase host'a ağ erişimi yok). Aşağıdaki sorguları Supabase **SQL Editor**'da çalıştırın (salt-okunur):

```sql
-- villa-images toplam dosya
select count(*) as villa_images_dosya
from storage.objects
where bucket_id = 'villa-images';

-- NEW vs LEGACY klasör kırılımı
select case
         when name like 'villas/%' then 'NEW (villas/...)'
         else 'LEGACY ({uuid}/...)'
       end as desen,
       count(*) as dosya
from storage.objects
where bucket_id = 'villa-images'
group by 1;

-- Villa başına dosya (ilk-iki segment = klasör)
select split_part(name, '/', 1) || '/' || split_part(name, '/', 2) as klasor,
       count(*) as dosya
from storage.objects
where bucket_id = 'villa-images'
group by 1
order by dosya desc
limit 20;

-- Toplam boyut (bant genişliği planı)
select pg_size_pretty(sum((metadata->>'size')::bigint)) as toplam_boyut
from storage.objects
where bucket_id = 'villa-images';
```

---

## 5) R2 BULK COPY — EN GÜVENLİ YÖNTEM

**Önerilen araç: `rclone` (S3 ↔ S3 doğrudan kopya).**
Hem Supabase Storage hem R2 **S3-uyumlu** endpoint sunar; rclone server-side path'i bire bir korur, resume eder, checksum doğrular.

### Neden rclone?
- **Path 1:1 korunur** → relative-path DB satırları dokunulmadan çalışmaya devam eder.
- **Resume + idempotent** (`copy`, kesintide kaldığı yerden) → binlerce dosyada güvenli.
- **Read-only kaynak** → Supabase'den yalnız okur, **silmez** (DELETE yok).
- **Doğrulama** (`rclone check` / `--checksum`) → eksik/bozuk dosya yakalanır.

### Kaynak/hedef bağlantıları (kimlik bilgileri — değişiklik DEĞİL, sadece okuma/yazma erişimi)
- **Supabase S3:** Dashboard → Storage → Settings → **S3 Connection** (endpoint `https://<proj>.supabase.co/storage/v1/s3`, region, Access Key / Secret).
- **R2 S3:** Cloudflare → R2 → **Manage API Tokens** (Account-ID endpoint + Access Key / Secret), hedef bucket `villa-images` (boş, public domain ileride bağlanacak).

### Güvenli akış (sıra)
1. **Hedef R2 bucket'ı oluştur** (`villa-images`) — boş.
2. **Kuru çalışma (dry-run):** ne kopyalanacağını gör, kaynağa dokunma.
   `rclone copy supabase:villa-images r2:villa-images --dry-run --checksum -P`
3. **Kopya:** path-korumalı, checksum'lı.
   `rclone copy supabase:villa-images r2:villa-images --checksum --transfers 16 --retries 5 -P`
4. **Doğrulama:** kaynak↔hedef birebir mi?
   `rclone check supabase:villa-images r2:villa-images --checksum`
5. **Sayım çapraz-kontrol:** SQL `count` (Bölüm 4) = `rclone size r2:villa-images` dosya sayısı.
6. **Cutover öncesi son artımlı sync:** kopya ile geçiş arasında yeni upload olduysa tekrar `rclone copy` (yalnız yeni/değişen dosyalar gider).

### Kesin güvenlik kuralları
- ✅ **Sadece `copy`** kullan — `sync`/`move` **YASAK** (sync hedefte silme yapabilir; move kaynağı boşaltır).
- ✅ **Path/key'leri ASLA değiştirme** (prefix ekleme/çıkarma yok) → DB relative path'leri bozulmaz.
- ✅ Kaynak (Supabase) **salt-okunur** kalır; bu aşamada **provider/upload/DB değişmez** (talep gereği).
- ✅ `--checksum` ile içerik doğrulaması (sadece boyut/zaman değil).
- ✅ Büyük bucket'ta `--transfers`/`--retries` ile dayanıklılık; `-P` ilerleme.
- ⚠️ Bu kopya **tek başına görselleri R2'ye yönlendirmez** — yalnız dosyaları taşır. URL yönlendirme (provider switch), `next.config` R2 host'u ve legacy FULL-URL satır rewrite'ı **ayrı, sonraki adımlardır** (bu turda yapılmıyor).

### Alternatifler (neden değil)
- **`aws s3 cp/sync`:** çalışır ama rclone'un cross-remote resume/check ergonomisi daha güvenli; `sync` riski yüksek.
- **Supabase indir → R2 yükle (custom script):** gereksiz; ara disk + hata yüzeyi + path bütünlüğü riski.
- **Cloudflare Super Slurper (R2 import):** S3 kaynaktan toplu çeker; pratik olabilir ama path/yetki doğrulaması ve artımlı re-sync için rclone daha şeffaf/denetlenebilir.

---

## ÖZET
- **Bucket:** `villa-images`
- **Path:** NEW `villas/{slug}__{shortId}/{slug}-NNNN-XXXX.webp` · LEGACY `{uuid}/{uuid}.webp`
- **Klasör:** `villas/` altında villa-başına stable klasör + düz UUID legacy klasörleri
- **Dosya sayısı:** Bölüm 4 SQL ile ölçülür (ağ kısıtı nedeniyle buradan canlı çekilemedi)
- **Bulk copy:** `rclone copy` (S3↔S3), path 1:1 korunarak, checksum doğrulamalı, kaynak salt-okunur — provider/upload/DB **değiştirilmeden**.

*Bu rapor yalnız analizdir; hiçbir kod, dosya, veri veya yapılandırma değiştirilmemiştir.*
