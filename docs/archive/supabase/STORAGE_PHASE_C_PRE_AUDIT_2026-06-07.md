# STORAGE MIGRATION — PHASE C PRE-AUDIT (upload/delete → R2)

**Tarih:** 2026-06-07 · **Kapsam:** Upload+delete tam haritası (analiz-only; kod/dosya/commit/env YOK)
**Yöntem:** Tüm bulgular gerçek dosyalardan + grep ile doğrulandı (varsayım yok).
**Mevcut durum:** READ = R2/CDN (Faz B, flip env'e bağlı) · UPLOAD = Supabase · DELETE = Supabase.

---

## 1) UPLOAD ENVANTERİ

| Dosya | Fonksiyon | Bucket | Path üretimi | DB yazımı | Browser/Server |
|-------|-----------|--------|--------------|-----------|----------------|
| `app/components/villa/AdminGallery.tsx` (L317-388) | upload loop | `VILLA_IMAGES_BUCKET` | `buildVillaImagePath(villaForPath, seq)` → `villas/{slug}__{shortId}/gallery-NNNN-XXXX.webp` | `onUploaded(fileName)` → `addVillaImage` → **anon supabase insert** | **Browser** |
| `app/(admin)/maki-admin/settings/_components/SettingsField.tsx` (L311-336) | `handleFile` | `SITE_ASSETS_BUCKET_NAME` | `${folder}/${slug}.webp` | `onChange(path)` → settings save | **Browser** |
| `app/(admin)/maki-admin/types/page.tsx` (L113-150) | cover upload | `SITE_ASSETS_BUCKET_NAME` | `buildCategoryCoverPath(slug)` → `category-covers/{slug}.webp` | `setVillaTypeCover(id, path)` (service) + `revalidateTaxonomy` | **Browser** |
| `app/(admin)/maki-admin/locations/page.tsx` (L220-265) | `handleCoverUpload` | `SITE_ASSETS_BUCKET_NAME` | `buildLocationCoverPath(slug)` → `location-covers/{slug}.webp` | `adminFetch PATCH /api/admin/villa-locations?id=` `{cover_image: path}` (**server route**) | **Browser** (DB write server) |
| `app/(admin)/maki-admin/pages/new/page.tsx` (L95-115) | cover upload | `SITE_ASSETS_BUCKET_NAME` | `buildPageCoverPath(slug)` → `page-covers/{slug}.webp` | `setCoverPath(path)` → form submit | **Browser** |
| `app/(admin)/maki-admin/pages/new/page.tsx` (L168-185) | section image | `SITE_ASSETS_BUCKET_NAME` | `page-covers/{slug}-section-{idx}.webp` | `section.path` → form submit | **Browser** |
| `lib/admin-branding.ts` (L244) | `uploadAdminBranding` | `ADMIN_BRANDING_BUCKET` (=site-assets) | `ADMIN_BRANDING_PATHS[fileKey]` | dönen `{publicUrl}` (display); DB çağırana ait | **Browser** |

**Ortak akış (7 noktada da bire bir):** dosya seçimi → **browser WebP conversion** (`convertToWebP` / `convertImageToWebP`) → relative path üretimi → `storageProvider.upload(bucket, path, blob, opts)` → DB'ye **relative path**.

**Upload opsiyonları (doğrulanmış):**
- AdminGallery: `{ contentType: "image/webp", upsert: false }` (L342-346)
- Cover/branding/settings: `{ upsert: true, contentType: "image/webp", cacheControl: "3600" }`

---

## 2) StorageProvider HARİTASI (grep ile doğrulanmış gerçek çağrılar)

| Method | Çağrı sayısı | Dosyalar | Browser/Server |
|--------|-------------|----------|----------------|
| `upload()` | **7** | AdminGallery L342, SettingsField L315, types L120, locations L228, pages/new L99+L172, admin-branding L244 | Browser (admin-branding helper de browser'dan çağrılır) |
| `remove()` | **2 doğrudan** + helper zinciri | AdminGallery L374 (rollback); `villa-image.helpers.removeVillaStorageFiles` L428 (zincir ucu) | AdminGallery=Browser; helper hem Browser (deleteVillaImage) hem Server (hardDelete) |
| `getPublicUrl()` | **8** | storage.helpers L53/L94/L127/L192/L226, storage.service L78, villa-image.helpers L282, admin-branding L68 | Browser + Server (SSR) |
| `createSignedUrl()` | **0 gerçek caller** | yalnız provider tanımı | — |
| `exists()` | **0 caller** | yalnız provider (NOT_IMPLEMENTED throw) | — |

**Tek doğrudan `supabase.storage.from()` runtime tüketicisi:** `lib/storage/supabase-storage.provider.ts`. (Diğer grep eşleşmeleri yalnız yorum + `lib/supabase.ts`/`client.ts` client tanımı.)

---

## 3) DELETE AKIŞLARI (dosyadan doğrulanmış çağrı zincirleri)

**A) Villa fotoğrafı silme** (`app/(admin)/maki-admin/villas/[id]/galeri/page.tsx` L71 — Browser)
```
deleteVillaImage(imageId)                         [villa-image.service L166, ANON supabase]
  → supabase.from("villa_images").select(image_url)   (anon)
  → supabase.from("villa_images").delete().eq(id)     (anon)  ← DB ÖNCE
  → removeVillaImageByUrl(image_url)                  (best-effort)
      → parseVillaStorageUrl(url) → {bucket, path}
      → removeVillaStorageFiles → storageProvider.remove   [Supabase]
```

**B) Hard delete villa** (`hard-delete.service.ts` L56 — Server)
```
hardDeleteVilla(id)
  → cleanupVillaStorageForHardDelete(id)            [storage-cleanup.ts, SERVER]
      → villaAdminRepository.findImageUrlsByVillaId (service-role repo)
      → her url: parseVillaStorageUrl → bucket grupla
      → removeVillaStorageFiles → storageProvider.remove   [Supabase]  (best-effort)
  → villaAdminRepository.deleteVillaImagesByVillaId(id)     (DB)
```

**C) AdminGallery upload rollback** (DB insert fail → orphan önleme, L373-376 — Browser)
```
onUploaded(fileName) === false
  → storageProvider.remove(VILLA_IMAGES, [fileName])   [Supabase]
```

**D) Cover değişimi (kategori/bölge/sayfa)** — explicit remove **YOK**.
```
storageProvider.upload(..., { upsert: true })   → aynı path overwrite
(slug değişirse eski path orphan kalır — kabul edilmiş davranış)
```

**E) Logo / watermark / hero / favicon / og değişimi** — explicit remove **YOK**.
```
SettingsField / admin-branding → upsert:true overwrite (deterministik path)
```

**Özet:** Gerçek `remove()` yalnız **villa-images** için (A/B/C). Cover/logo/hero **overwrite** ile yönetiliyor, silme çağrısı yok.

---

## 4) SUPABASE STORAGE BAĞIMLILIK HARİTASI

| Dosya | İşlem | Upload | Remove | Read (getPublicUrl) |
|-------|-------|:------:|:------:|:-------------------:|
| `lib/storage/supabase-storage.provider.ts` | **tek SDK tüketici** (`supabase.storage.from`) | ✅ | ✅ | ✅ |
| `lib/storage/index.ts` (barrel) | provider compose | delege | delege | CDN-aware (Faz B) |
| AdminGallery.tsx | upload + rollback remove | ✅ | ✅ | — |
| SettingsField / types / locations / pages-new / admin-branding | upload | ✅ | — | admin-branding ✅ |
| villa-image.service `deleteVillaImage` | remove zinciri | — | ✅ | — |
| storage-cleanup.ts (hardDelete) | remove zinciri | — | ✅ | — |
| storage.helpers / storage.service / villa-image.helpers | URL üretimi | — | — | ✅ |

`grep "\.storage\.from("` → **provider dışında runtime çağrısı YOK** (yalnız yorum/client tanımı). Tek seam doğrulandı.

---

## 5) AUTH VE GÜVENLİK ANALİZİ (koddan doğrulanmış)

- **Upload yetkisi = Supabase Storage RLS + admin session cookie.** `storageProvider.upload` → `supabase.storage` (lib/supabase.ts `createBrowserClient`, cookie-backed). Route-level `authorizeAdminCaller` **kullanılmıyor**; yetki `storage.objects` RLS admin-write policy'sinde.
- **DB metadata yazımı yetkisi (karışık):**
  - AdminGallery `addVillaImage` + `deleteVillaImage`: **anon supabase client** → `villa_images` tablo RLS (`is_active_admin()` admin-write).
  - Locations cover: `adminFetch PATCH` → **server route** (`authorizeAdminCaller` + Bearer).
  - Types cover: `setVillaTypeCover` (service).
- **Sonuç:** Bugün hem storage hem (galeri) DB write güvenliği **Supabase Auth oturumu + RLS**'e dayanıyor. R2'de RLS yok → upload/delete güvenliği **server route + S3 credential**'a taşınmalı.

---

## 6) PATH VE VERİ ANALİZİ (koddan doğrulanmış)

**Path üreticiler:**
- villa-images: `buildVillaImagePath` → `villas/{slug}__{shortId}/{slug|gallery}-NNNN-XXXX.webp` (`villa-image.helpers`)
- category cover: `buildCategoryCoverPath(slug)` → `category-covers/{slug}.webp` (`storage.helpers`)
- location cover: `buildLocationCoverPath(slug)` → `location-covers/{slug}.webp`
- page cover: `buildPageCoverPath(slug)` → `page-covers/{slug}.webp` + section `page-covers/{slug}-section-{idx}.webp`
- admin branding: `ADMIN_BRANDING_PATHS[fileKey]` (sabit path'ler)
- settings singleton: SettingsField `${folder}/{slug}.webp` (logo/watermark/favicon/hero/seo)

**Relative path tutan DB kolonları:**
- `villa_images.image_url` (%100 relative, full_url=0 — doğrulandı)
- `settings.{site_logo, favicon_url, watermark_logo, hero_background_image, default_og_image}` (SettingsField "Aşama B" relative yazar)
- `villa_types.cover_image` (`category-covers/...`)
- `villa_locations.cover_image` (`location-covers/...`)
- `pages.cover_image` + section path'leri (`page-covers/...`)

---

## 7) UPLOAD → R2 GEÇİŞ RİSKLERİ (koddan doğrulanmış)

| Risk | Bulgu (dosya) | Seviye |
|------|---------------|--------|
| **Sequence mantığı** | `nextGallerySequenceFromUrls(existingUrls)` CLIENT-side, mevcut `image_url` listesinden regex ile max+1 (AdminGallery L328). Route'a geçişte seq yine client'ta hesaplanır; route yalnız yazar → korunmalı. | MEDIUM |
| **Çoklu upload** | AdminGallery sıralı `for` loop, per-file upload + `onUploaded` + seq++ (L330-385). Route per-file çağrılmalı; sıra + rollback semantiği korunmalı. | MEDIUM |
| **upsert davranışı** | Gallery `upsert:false` (L345; rand4 ile collision ~1/65536), cover/logo `upsert:true`. S3 PUT default overwrite (=upsert:true). Gallery'nin `upsert:false` semantiği S3'te native değil (If-None-Match gerekir); rand4 sayesinde overwrite-on-collision kabul edilebilir. | MEDIUM |
| **Cleanup / rollback** | DB insert fail → `storageProvider.remove` rollback (AdminGallery L373). Route modelinde bu rollback server'da yapılmalı. | MEDIUM |
| **Orphan dosya** | deleteVillaImage + hardDelete **best-effort** (orphan log, DB öncelikli). Faz C'de R2 remove de best-effort + retry korunmalı. Cover overwrite slug değişiminde orphan bırakır (mevcut, kabul). | LOW-MEDIUM |
| **DB consistency** | Upload: storage→DB (fail→rollback). Delete: DB→storage (orphan-tolerant). Bu sıralama route modeline taşınırken **korunmalı**. | MEDIUM |
| **Yetki modeli** | Storage RLS → server route `authorizeAdminCaller`. 7 upload + 3 delete yolu yeni yetki kapısına bağlanır. | HIGH |
| **Read/write drift (Faz B'den devr.)** | Flip sonrası upload Supabase / read R2 → yeni dosyalar görünmez (Faz B M2). Faz C tam da bunu kapatır. | HIGH (Faz C ile çözülür) |

---

## 8) FAZ C TASARIMI — HAZIRLIK SORULARI (koddan gerekçeli)

- **Upload route gerekli mi?** **EVET.** Upload bugün tarayıcıda `supabase.storage` (anon+RLS). R2'de tarayıcıda kullanılabilir güvenli anahtar/RLS yok → server route + S3 SDK (secret server-only) zorunlu.
- **Presigned URL gerekli mi?** **HAYIR (bu iş yükünde).** Admin-only, ~150KB WebP, seyrek upload → **server-side proxy route** daha basit + daha güvenli (CORS yok, secret çıkmaz). Presigned yalnız ileride büyük dosya/yüksek hacim gelirse; interface aynı kaldığı için sonradan eklenebilir.
- **Browser WebP conversion korunmalı mı?** **EVET.** `convertToWebP`/`convertImageToWebP` browser Canvas (zero-infra, CPU client'ta). Korunur; yalnız son blob route'a POST edilir. Server'a taşınırsa `sharp` gerekir → kaçınılmalı.
- **Delete nasıl taşınmalı?** `remove()` server S3'e (DeleteObjects). `deleteVillaImage`'in storage cleanup'ı (bugün client) server route'a çağrı yapmalı veya `deleteVillaImage` tümüyle server-side'a alınmalı; `hardDelete` zaten server. Best-effort + retry + idempotent korunur.
- **En düşük riskli geçiş stratejisi?** Provider seam'i koru: `STORAGE_DRIVER=r2` iken `storageProvider.upload/remove` → **server route + S3**; `supabase` iken eski Supabase. Browser convert korunur; seq/rollback/best-effort semantiği route'ta birebir taşınır. **Dual-write opsiyonu** (geçiş penceresinde hem R2 hem Supabase) rollback'i kolaylaştırır.

---

## RİSK MATRİSİ (özet)

| Bileşen | Değişiklik | Risk | Rollback |
|---------|-----------|------|----------|
| Server upload route (S3 SDK + authorizeAdminCaller) | YENİ | HIGH | route kullanılmaz → eski upload |
| storageProvider.upload driver-switch | seam | HIGH | `STORAGE_DRIVER=supabase` |
| storageProvider.remove → S3 | seam | MEDIUM | env switch |
| deleteVillaImage storage cleanup → route | akış | MEDIUM | eski client remove |
| 7 upload ekranı (route'a bağlanma) | bağlama | MEDIUM | seam sayesinde ekran değişmeyebilir |
| upsert:false semantiği | S3 davranış | MEDIUM | rand4 ile kabul |

---

## FAZ C ÖNERİSİ (kod yok)

1. **`s3-storage.provider.ts` write/remove** (AWS SDK v3, S3-compatible) — server-only.
2. **Server route'lar:** `/api/admin/storage/upload` + `/api/admin/storage/remove` (`authorizeAdminCaller` + S3 SDK). Browser convert → blob POST.
3. **Seam switch:** `storageProvider.upload/remove` `STORAGE_DRIVER=r2` iken route/S3'e, `supabase` iken mevcut Supabase'e (rollback). Mümkünse **dual-write** (geçiş penceresi).
4. **Semantik koruma:** client-side seq hesabı, per-file loop, upload→DB→rollback sırası, delete DB→storage best-effort.
5. **site-assets:** R2'ye kopyala + `assets.villayagel.com` bağla (Faz B M3) — flip öncesi.

## GEÇİŞ SIRASI
1. s3 write/remove provider + upload/remove route (default OFF).
2. Staging: `STORAGE_DRIVER=r2` → 7 upload + 3 delete (galeri/hardDelete/cover) tam test.
3. site-assets copy + assets CDN bind.
4. (Opsiyonel) dual-write aç → re-sync ihtiyacını kaldırır.
5. Production flip → read+write+delete R2.
6. Gözlem (2-4 hafta) → Supabase Storage decommission.

## ROLLBACK PLANI
- **Anında (rebuild ile):** `STORAGE_DRIVER=supabase` → upload/remove/read tümü Supabase'e döner. ⚠️ `NEXT_PUBLIC_*` build-time inline → flip/rollback **redeploy** ister (hot değil).
- **Veri güvenliği:** Dual-write aktifse rollback'te yeni dosyalar iki tarafta da var → kayıp yok. Dual-write yoksa, r2-yazılan dosyalar Supabase'de olmaz (rollback'te eksik) → **dual-write önerilir**.
- **Decommission en sonda**; doğrulanana dek Supabase Storage silinmez.

---

## EN KRİTİK 3 BULGU
1. **Upload+galeri-DB-write bugün Supabase Auth+RLS'e dayanıyor** (route auth değil) → Faz C'de güvenlik server route'a taşınmalı (HIGH).
2. **7 upload tek seam (`storageProvider.upload`)** → ekranlara dokunmadan, yalnız provider switch + route ile taşınabilir (kolaylaştırıcı).
3. **Sequence + rollback + best-effort cleanup client-side mantıkları** route modeline birebir taşınmalı; aksi halde orphan/seq-collision/DB-drift riski.

*Bu rapor yalnız analizdir; hiçbir kod, dosya, env veya yapılandırma değiştirilmemiştir.*
