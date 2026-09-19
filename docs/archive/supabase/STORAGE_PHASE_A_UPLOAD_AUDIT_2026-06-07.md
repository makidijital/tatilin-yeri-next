# STORAGE MIGRATION — PHASE A: UPLOAD SİSTEMİ HARİTASI

**Tarih:** 2026-06-07 · **Kapsam:** Upload/remove/ZIP tam haritası (analiz-only; kod/dosya/commit yok)
**Amaç:** Server-side S3'e geçmeden önce mevcut upload sisteminin eksiksiz envanteri + kırılma noktaları.

---

## 1) UPLOAD EKRANLARI — DOSYA BAZLI ENVANTER

| # | Ekran / Dosya | Bucket | Path üretici | upsert | DB yazımı (kim) | Çalışma yeri |
|---|---------------|--------|--------------|--------|------------------|--------------|
| 1 | `app/components/villa/AdminGallery.tsx` | villa-images | `buildVillaImagePath` → `villas/{slug}__{shortId}/{slug}-NNNN-XXXX.webp` | **false** | `addVillaImage(villaId, path)` → **anon supabase insert** | Browser |
| 2 | `app/(admin)/maki-admin/settings/_components/SettingsField.tsx` | site-assets | `{folder}/{slug}.webp` (logo/watermark/favicon/hero/seo) | true | `onChange(path)` → settings save akışı (relative path) | Browser |
| 3 | `lib/admin-branding.ts` | site-assets | `ADMIN_BRANDING_PATHS[fileKey]` | true | dönen `{publicUrl, cacheBust}` (display); DB yazımı çağırana ait | Browser |
| 4 | `app/(admin)/maki-admin/types/page.tsx` | site-assets | `buildCategoryCoverPath(slug)` → `category-covers/{slug}.webp` | true | `setVillaTypeCover(id, path)` → **service** + `revalidateTaxonomy` | Browser |
| 5 | `app/(admin)/maki-admin/locations/page.tsx` | site-assets | `buildLocationCoverPath(slug)` → `location-covers/{slug}.webp` | true | `adminFetch PATCH /api/admin/villa-locations?id=` `{cover_image: path}` → **server route** | Browser (DB write server) |
| 6 | `app/(admin)/maki-admin/pages/new/page.tsx` (cover) | site-assets | `buildPageCoverPath(slug)` → `page-covers/{slug}.webp` | true | `setCoverPath(path)` → form submit ile kaydedilir | Browser |
| 7 | `app/(admin)/maki-admin/pages/new/page.tsx` (section) | site-assets | `page-covers/{slug}-section-{idx}.webp` | true | `section.path` → form submit | Browser |

> **Diğer upload noktası yok.** Tüm 7 akış aynı imzayı kullanır: `storageProvider.upload(bucket, path, webpBlob, opts)`.

### Ortak upload akışı (7 ekranda da aynı)
```
1. <input type=file> dosya seçimi (admin)
2. convertImageToWebP (lib/image.helpers — BROWSER Canvas, ~1920px/0.85, → image/webp)
3. path üretimi (yukarıdaki builder — RELATIVE path)
4. storageProvider.upload(bucket, path, webpBlob, {contentType, upsert, cacheControl})
       └─ supabaseStorageProvider → supabase.storage.from(bucket).upload()   ⟵ BROWSER anon + Storage RLS
5. DB güncellemesi → RELATIVE PATH yazılır (anon insert / service / adminFetch route — ekrana göre değişir)
```

---

## 2) StorageProvider KULLANIM HARİTASI

| Method | Çağrı noktaları | Çalışma yeri | Migration etkisi |
|--------|-----------------|--------------|------------------|
| `upload()` | AdminGallery, SettingsField, admin-branding, types, locations, pages/new (cover+section) → **7 call site** | **Browser** | Server-side S3'e taşınacak ana iş |
| `remove()` | AdminGallery (failed-insert cleanup), `removeVillaStorageFiles` (hardDelete cleanup), `removeVillaImageByUrl` (deleteVillaImage) | Browser + Server (hardDelete) | Server S3 deleteObjects'e taşınmalı |
| `getPublicUrl()` | `resolveAssetUrl`, `resolveVillaImageUrl`, `getVillaImagePublicUrl`, `getCategory/Location/PageCoverPublicUrl`, `admin-branding.getAdminBrandingUrl` | Browser + Server (SSR) | Saf URL (`${CDN_BASE}/${path}`) — Read Layer (Faz B) |
| `createSignedUrl()` | **Gerçek caller YOK** (yalnız tanımlı) | — | Migrasyonda gerekmez (public bucket) |
| `exists()` | **NOT-IMPLEMENTED** (throw) | — | Gerekirse S3 HeadObject ile |

---

## 3) SUPABASE STORAGE'A DOĞRUDAN DOKUNAN KODLAR

| Dosya | Dokunuş | Not |
|-------|---------|-----|
| `lib/storage/supabase-storage.provider.ts` | `supabase.storage.from().{upload/remove/getPublicUrl/createSignedUrl}` | **TEK runtime tüketici** |
| `lib/supabase.ts` / `lib/supabase/client.ts` | browser client (storage SDK içerir) | Provider bunu kullanır; Auth/DB için zaten gerekli |

> Başka **hiçbir** dosya `supabase.storage`'ı doğrudan çağırmıyor (kalan grep eşleşmeleri yalnız yorum). DB yazımları (`addVillaImage` anon insert, `setVillaTypeCover`, locations adminFetch) **storage değil DB** tarafıdır.

---

## 4) BROWSER vs SERVER + AUTH + RLS

**Browser-side (client) çalışan:**
- 7 upload akışının tamamı, WebP conversion, path üretimi
- `getPublicUrl` (senkron, SSR'da da çalışır)
- AdminGallery failed-insert remove

**Server-side çalışan:**
- `cleanupVillaStorageForHardDelete` (hardDelete service) → `removeVillaStorageFiles` → `storageProvider.remove`
  - ⚠️ Bu, **browser anon client'ı server bağlamında** kullanır (`storageProvider` → `lib/supabase.ts`); silme yetkisi Storage RLS'e bağlı. Server S3'e geçince bu netleşir (server credential).

**Auth kontrolü (upload):**
- Upload yetkisi = **Supabase Storage RLS** (`storage.objects` admin-write policy) + authenticated admin oturumu (Supabase Auth cookie).
- Route bazlı admin-auth (`authorizeAdminCaller`) upload'ta **kullanılmıyor** — yetki RLS'te. (Locations DB write'ı adminFetch ile route'tan geçer ama bu storage değil DB.)

**RLS bağımlılıkları:**
- `storage.objects` üzerindeki admin-write / anon-read policy'leri → **upload'ın güvenlik temeli budur**. S3-uyumlu provider'da RLS yok → güvenlik server route admin-auth + S3 credential'a taşınır.

---

## 5) SERVER-SIDE S3'E GEÇİNCE KIRILABİLECEK NOKTALAR

| # | Kırılma noktası | Açıklama | Risk |
|---|------------------|----------|------|
| K1 | **Upload auth modeli** | Storage RLS → server route `authorizeAdminCaller` + Bearer (adminFetch). 7 ekran yeni route'a bağlanmalı. | **HIGH** |
| K2 | **WebP conversion yeri** | Browser Canvas conversion KORUNMALI; yalnız blob route'a POST edilir. Server'a taşınırsa `sharp` gerekir (kaçınılmalı). | MEDIUM |
| K3 | **`upsert` semantiği** | AdminGallery `upsert:false` (rand4 collision), cover'lar `upsert:true`. S3 PUT default overwrite (=upsert:true) → galeri için rand4 zaten benzersiz, sorun değil; ama davranış doğrulanmalı. | MEDIUM |
| K4 | **remove() yeri** | hardDelete + deleteVillaImage server S3 `DeleteObjects`'e taşınmalı; `parseVillaStorageUrl` CDN/relative tanımalı. | MEDIUM |
| K5 | **Çoklu/paralel upload** | AdminGallery birden çok dosya + sequence (`nextGallerySequenceFromUrls` client-side mevcut URL'lerden). Route per-file çağrılmalı; sequence hesabı korunmalı. | MEDIUM |
| K6 | **getPublicUrl → CDN** | Yeni upload sonrası render CDN URL beklemeli (Read Layer Faz B ile uyumlu olmalı). | MEDIUM |
| K7 | **Serverless body/timeout** | Blob POST route'tan geçer; küçük WebP'de sorun yok, çoklu büyük yüklemede limit. | LOW-MEDIUM |
| K8 | **DB write path tutarlılığı** | image metadata DB yazımı 3 farklı yol (anon insert / service / adminFetch). Upload route'a geçişte bu yollar **dokunulmadan** korunmalı (storage ≠ DB). | LOW |

---

## 6) RELATIVE PATH YAPISINI ETKİLEYEN TÜM KODLAR

**Path üreticiler (yazım):**
`buildVillaImagePath`, `buildVillaFolderName`, `buildVillaImageFilename` (villa-image.helpers); `buildCategoryCoverPath`, `buildLocationCoverPath`, `buildPageCoverPath` (storage.helpers); `ADMIN_BRANDING_PATHS` (admin-branding); SettingsField `{folder}/{slug}.webp`; pages section `page-covers/{slug}-section-{idx}.webp`.

**URL üreticiler (okuma — relative→absolute):**
`resolveAssetUrl`, `resolveVillaImageUrl` (storage.helpers); `getVillaImagePublicUrl` (villa-image.helpers); `getCategory/Location/PageCoverPublicUrl`; `getAdminBrandingUrl`.

**Parse (remove için):** `parseVillaStorageUrl` (villa-image.helpers) — full URL + relative path ikisini de tanır.

**DB kolonları (relative değer tutan):** `villa_images.image_url`, `settings.{site_logo,favicon_url,watermark_logo,hero_background_image,default_og_image}`, `villa_types.cover_image`, `villa_locations.cover_image`, `pages.cover_image` + section path'leri.

> Relative path **standart** → provider switch'te yazım/okuma path'leri **dokunulmaz**; yalnız `getPublicUrl`'ün ürettiği base değişir.

---

## 7) REMOVE (SİLME) AKIŞI

```
A) AdminGallery — DB insert FAIL → orphan önleme
   storageProvider.remove(VILLA_IMAGES, [fileName])               [browser]

B) deleteVillaImage(urlOrPath)
   → removeVillaImageByUrl → parseVillaStorageUrl → removeVillaStorageFiles
   → storageProvider.remove(bucket, [path])  (3x retry, idempotent "not found")

C) hardDeleteVilla (orchestrator)
   → cleanupVillaStorageForHardDelete(villaId)                    [server]
       → villaAdminRepository.findImageUrlsByVillaId (service-role repo)
       → her url: parseVillaStorageUrl → bucket bazında grupla
       → removeVillaStorageFiles → storageProvider.remove (best-effort; fail → orphan log)

D) Cover'lar (types/locations/pages): explicit remove YOK → upsert ile overwrite.
```
**Migration etkisi:** A/B/C → server S3 `DeleteObjects`'e taşınmalı. C zaten server bağlamında çalışıyor (S3'e en uygun aday). Best-effort + retry + idempotent semantiği korunmalı.

---

## 8) ZIP EXPORT AKIŞI — ⚠️ KRİTİK BULGU

`app/api/villa-zip/[token]/route.ts`:
```
1. applyRateLimit("zip")
2. consume_villa_zip_token RPC (service_role) → villa_id (token doğrula + count++)
3. villa_images.select("image_url, sort_order")
4. her satır: urlStr = row.image_url.trim() → fetch(urlStr) → archiver'a stream
```
**Sorun:** Route `image_url`'i **ham** fetch ediyor (`resolveVillaImageUrl` KULLANMIYOR). Ama `image_url` artık **%100 relative** (full_url=0). `fetch("villas/.../x.webp")` **şemasız → geçersiz/atlanır** → ZIP boş/eksik gelebilir.
- Bu **zaten mevcut bir kırılma riski** (relative path'e geçişten kaynaklı), R2'den bağımsız.
- Migration'da bu route **mutlaka** `resolveVillaImageUrl(image_url)` → absolute CDN URL ile fetch etmeli.
- **Risk: HIGH** (sessiz veri eksikliği — admin ZIP'i eksik indirir).

---

## RİSK MATRİSİ (özet)

| Bileşen | Değişiklik | Risk | Rollback |
|---------|-----------|------|----------|
| Read getPublicUrl → CDN | Saf URL | MEDIUM | env switch |
| Upload → server route (7 ekran) | Auth + akış | **HIGH** | eski `storageProvider.upload` |
| remove → server S3 | DeleteObjects | MEDIUM | eski remove |
| villa-zip resolve | URL çözümü | **HIGH** (zaten riskli) | eski ham fetch |
| next.config CDN host | remotePatterns | MEDIUM | host kaldır |
| parseVillaStorageUrl CDN tanıma | parse | LOW | eski parse |

---

## BAĞIMLILIK HARİTASI (upload odaklı)

- **Doğrudan Supabase Storage:** `supabase-storage.provider.ts` + (dolaylı) 7 upload ekranı + hardDelete cleanup + storage.objects RLS.
- **Dolaylı (seam üzerinden):** resolver'lar, render component'leri, villa-zip.
- **Bağımsız:** `image.helpers` (browser WebP), interface/tipler/sabitler, DB relative path verisi, path builder'lar (saf string).

---

## 10) FAZ PLANI (B / C / D / E)

### Faz B — Read Layer Migration
- **Amaç:** `getPublicUrl` saf-URL + CDN; render tamamen CDN'den.
- **Dosyalar:** `storage.constants.ts` (CDN base), `s3-storage.provider.ts` (read), `index.ts` (switch), `next.config.ts` (CDN host dual), `villa-image.helpers/parseVillaStorageUrl` (CDN tanıma), **`villa-zip` route** (resolve düzeltmesi — K-bulgu).
- **Risk:** MEDIUM · **Rollback:** `STORAGE_DRIVER=supabase`.
- **Başarı:** Tüm görseller CDN'den 200; `next/image` sağlıklı; ZIP eksiksiz; Sentry'de 404 yok.

### Faz C — Server-side Upload Migration
- **Amaç:** Upload + remove Storage RLS'ten çıkıp server S3'e.
- **Dosyalar:** `app/api/admin/storage/upload/route.ts` (YENİ, `authorizeAdminCaller`+S3 SDK), `s3-storage.provider.ts` (write/remove), 7 upload ekranı (browser convert → route POST), remove yolları (deleteVillaImage + hardDelete cleanup).
- **Risk:** **HIGH** · **Rollback:** ekranlar eski `storageProvider.upload` (Supabase) çağrısına geri (flag).
- **Başarı:** 7 akış R2'ye yazıyor; relative path DB'ye; render anında CDN; silme + galeri sırası + cover overwrite korunuyor; WebP conversion hâlâ browser'da.

### Faz D — Production Validation
- **Amaç:** Read+upload+remove+ZIP'i prod'da 2-4 hafta gözlemle.
- **Dosyalar:** yok.
- **Risk:** LOW · **Rollback:** env switch.
- **Başarı:** Hata oranı sıfır; CDN cache-hit sağlıklı; yeni yüklenenler R2'de; eski silme orphan bırakmıyor.

### Faz E — Supabase Storage Decommission
- **Amaç:** Vendor'ı çıkar.
- **Dosyalar:** `supabase-storage.provider.ts` + storage RLS kaldırılabilir; `next.config`'ten Supabase host çıkar.
- **Risk:** MEDIUM (geri dönülmez) · **Rollback:** D tamamen stabil olana dek ERTELE; veri iki tarafta tutulur.
- **Başarı:** Supabase Storage kapalı; site aylarca sorunsuz.

---

## ÖZET — EN KRİTİK 3 NOKTA
1. **villa-zip route relative path'i ham fetch ediyor** → zaten riskli; Faz B'de `resolveVillaImageUrl` ile düzeltilmeli (HIGH).
2. **7 upload ekranının tamamı tek imza** (`storageProvider.upload`, browser) → server route'a geçiş tek pattern'le yapılabilir, ama auth modeli RLS→route değişir (HIGH).
3. **Read zaten relative + tek seam** → Faz B düşük riskle büyük kazanım; upload (Faz C) asıl iş yükü.

*Bu rapor yalnız analizdir; hiçbir kod, dosya veya yapılandırma değiştirilmemiştir.*
