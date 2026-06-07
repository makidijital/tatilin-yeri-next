# SUPABASE STORAGE → CLOUDFLARE R2 — GEÇİŞ ANALİZİ

**Tarih:** 2026-06-07 · **Kapsam:** Storage migration analizi (analiz-only; kod/dosya/commit yok)
**Sonuç özeti:** Mimari geçişe **iyi hazırlanmış** (Faz 38 `StorageProvider` soyutlaması var). Kod tarafı düşük riskli; **asıl risk üç noktada toplanıyor:** (1) legacy FULL-URL DB satırları, (2) client-side upload modeli (R2'de presigned URL gerekiyor), (3) `next/image` + dosya kopyalama.

---

## A) DOSYA LİSTESİ (storage'a dokunan tüm yüzey)

### Çekirdek storage katmanı (migration kalbi)
| Dosya | Rol | Migration etkisi |
|-------|-----|------------------|
| `lib/storage/index.ts` | **Barrel + provider switch noktası** (R2 switch yorumu zaten var) | ⭐ Tek satır switch |
| `lib/storage/supabase-storage.provider.ts` | **TEK doğrudan `supabase.storage.*` tüketici** | ⭐ R2 muadili yazılır |
| `lib/storage/storage.provider.ts` | `StorageProvider` interface (upload/remove/getPublicUrl/createSignedUrl) | Değişmez (kontrat) |
| `lib/storage/storage.constants.ts` | Bucket sabitleri (`villa-images`, `site-assets`) | R2 bucket adları |
| `lib/storage/storage.types.ts` | Provider-agnostic tipler | Değişmez |
| `lib/storage/storage.service.ts` | Service facade | Değişmez (provider'a delege) |
| `lib/storage.helpers.ts` | `resolveAssetUrl`, `resolveVillaImageUrl`, cover URL builder'ları | Değişmez (provider'a delege) |
| `lib/villa-image.helpers.ts` | Villa path builder + `parseVillaStorageUrl` + remove | URL parse pattern'i R2 için güncellenir |
| `lib/image.helpers.ts` | Browser WebP convert | **Provider-agnostic — değişmez** |

### Upload ekranları (hepsi `storageProvider` üzerinden — Faz 38 tamam)
| Dosya | Ne yükler | Bucket |
|-------|-----------|--------|
| `app/components/villa/AdminGallery.tsx` | Villa galeri görselleri | villa-images |
| `app/(admin)/maki-admin/settings/_components/SettingsField.tsx` | Logo/watermark/favicon/hero/OG | site-assets |
| `app/(admin)/maki-admin/types/page.tsx` | Kategori cover | site-assets |
| `app/(admin)/maki-admin/locations/page.tsx` | Bölge cover | site-assets |
| `app/(admin)/maki-admin/pages/new/page.tsx` | CMS sayfa cover + image-section | site-assets |
| `lib/admin-branding.ts` | Admin panel logo/icon | site-assets |

### Okuma / render (URL üretimi tüketicileri)
- `app/components/villa/VillaCard.tsx` (**next/image**), `Gallery.tsx` (`<img>` + watermark), `WatermarkOverlay.tsx`, `AdminGallery.tsx` (thumbnail)
- `app/services/villa.service.ts` (`mapVilla` → `resolveVillaImageUrl`)
- `lib/cache.helpers.ts` (homepage collection + category/location covers)
- `app/components/layout/Footer.tsx`, `HeaderWrapper.tsx` (logo), `app/components/ui/Hero.tsx` + `hero/*` + `lib/hero.helpers.ts` (hero bg)
- `app/components/villa/CategoryCollection.tsx`, `LocationCollection.tsx`, `app/components/cms/PageSectionRenderer.tsx`, `app/p/[slug]/page.tsx`, `app/(public)/kiralik-villa/[slug]/page.tsx`

### Altyapı / kenar durumlar
| Dosya | Rol | Migration etkisi |
|-------|-----|------------------|
| `next.config.ts` | `images.remotePatterns` — **yalnız Supabase host + `/storage/v1/object/public/**`** | ⭐ R2 domain eklenmeli yoksa `next/image` kırılır |
| `app/api/villa-zip/[token]/route.ts` | ZIP stream — DB `image_url`'i **doğrudan `fetch()`** ediyor | ⭐ URL R2'ye dönmeli |
| `app/sitemap.ts` | **Image sitemap tag'i YOK** — etkilenmez | Yok |
| Supabase Storage RLS migration'ları | `storage.objects` policy'leri (admin write/anon read) | R2'de gereksiz (S3 model) |

---

## B) VERİ AKIŞ DİYAGRAMI

### Upload (mevcut — CLIENT-SIDE)
```
[Admin tarayıcı]
  → convertImageToWebP (lib/image.helpers — browser Canvas)
  → buildVillaImagePath / buildXxxCoverPath (relative path üret)
  → storageProvider.upload(bucket, path, blob)        ⟵ lib/storage barrel
       └─ supabaseStorageProvider
            └─ supabase.storage.from(bucket).upload()   ⟵ TARAYICIDA anon key + Storage RLS
  → addVillaImage(villaId, RELATIVE_PATH)  → DB villa_images.image_url
       (yeni satırlar RELATIVE PATH; legacy satırlar FULL URL)
```

### Read / Render (mevcut)
```
DB image_url (relative path VEYA full URL)
  → mapVilla / cache.helpers / resolveAssetUrl
  → resolveVillaImageUrl(value):
        full URL  → AYNEN pass-through  ⚠️ (legacy → Supabase'e sabit)
        relative  → storageProvider.getPublicUrl(bucket, path)  ✅ (provider-swap'le R2'ye döner)
        null      → null (fallback)
  → <Image>/<img> src
       └─ next/image → next.config.remotePatterns host kontrolü  ⚠️ (R2 host eklenmeli)
```

### Kritik gözlem
- **Yeni satırlar = relative path** → provider `getPublicUrl` R2'ye dönünce **otomatik** R2'ye işaret eder. Sıfır DB değişikliği.
- **Legacy satırlar = full Supabase URL** → `resolveVillaImageUrl` pass-through yapar → **provider swap'ten ETKİLENMEZ**, Supabase'e sabit kalır. ➜ **Veri rewrite gerektiren tek nokta budur.**

---

## C) SUPABASE'E GERÇEK BAĞIMLILIK NOKTALARI

1. **`supabase-storage.provider.ts`** — tek doğrudan SDK tüketici. R2 muadili ile değiştirilecek.
2. **Upload modeli (mimari pivot):** Upload TARAYICIDA `supabase.storage...upload()` ile yapılıyor (anon key + Storage RLS). **R2'nin tarayıcı anon+RLS modeli YOK.** R2 upload iki şekilde olur:
   - **Presigned PUT URL** (S3 API): server route presigned URL üretir → tarayıcı doğrudan R2'ye PUT eder (önerilen).
   - **Server proxy upload:** tarayıcı → Next route → R2 (S3 SDK + secret) → ek bandwidth.
   ⚠️ R2 provider'ı tarayıcıda secret tutamayacağı için `StorageProvider.upload`'ın **browser'da çalışan implementasyonu R2 için geçerli değil** → upload akışı presigned pattern'e taşınmalı.
3. **`getPublicUrl`** — R2'de yalnız string birleştirme (`https://<r2-public-domain>/<path>`); SDK/secret gerekmez → **tarayıcı-güvenli kalır, kolay.**
4. **`createSignedUrl`** — provider/service dışında **gerçek caller YOK** (her iki bucket public). ➜ R2'de signed URL gerekmez; public bucket + custom domain yeterli. **Migration'ı basitleştirir.**
5. **Legacy FULL-URL DB satırları** (`villa_images.image_url`, `settings.*`, `villa_types/locations/pages.cover_image`) — Supabase host'a gömülü.
6. **`next.config.ts` remotePatterns** — `next/image` yalnız Supabase host'a izin veriyor.
7. **`villa-zip` route** — `fetch(image_url)` doğrudan; URL R2'ye dönmeli.

---

## D) R2 GEÇİŞ PLANI (bileşen bazında)

| Bileşen | Aksiyon |
|---------|---------|
| **R2 setup** | 2 bucket (`villa-images`, `site-assets`) + **public custom domain** (örn. `cdn.villayagel.com` veya r2.dev). CORS: admin origin'den PUT izni. |
| **Dosya kopyalama** | Supabase Storage → R2 bulk copy (`rclone` ile S3↔S3, **path'leri AYNEN koru** → relative path'ler bozulmaz). |
| **Read provider** | `r2-storage.provider.ts`: `getPublicUrl` = `${R2_PUBLIC_URL}/${bucket}/${path}` (veya bucket-per-domain). Browser-safe. |
| **Upload provider** | Presigned PUT: yeni server route `/api/admin/storage/presign` (S3 SDK + R2 secret, admin-auth'lu) → upload ekranları `storageProvider.upload`'ı presigned akışına uyarlar. |
| **next.config** | `remotePatterns`'a R2 public host eklenir (Supabase host **geçiş boyunca KORUNUR** — dual). |
| **villa-zip** | `image_url` → `resolveVillaImageUrl` ile çözülüp fetch edilmeli (R2 URL). |
| **Legacy data rewrite** | FULL Supabase URL satırları → relative path'e (veya R2 URL'e) UPDATE. **En kritik veri adımı.** |
| **Barrel switch** | `lib/storage/index.ts` → `storageProvider = r2StorageProvider`. |
| **RLS** | Supabase Storage policy'leri R2'de gereksiz; R2 erişimi S3 credential + presigned ile yönetilir. |

---

## E) RİSK SEVİYELERİ

| Alan | Risk | Sebep |
|------|------|-------|
| Read provider (`getPublicUrl` → R2 domain) | **LOW** | Saf string; tek seam; relative path satırlar otomatik döner. |
| `next.config` remotePatterns | **LOW** | Tek dosya; dual host kolay. Eklenmezse `next/image` 400 verir → ama deterministik/erken yakalanır. |
| `createSignedUrl` | **LOW** | Gerçek caller yok; public bucket yeterli. |
| Browser WebP convert (`image.helpers`) | **LOW** | Provider-agnostic; dokunulmaz. |
| **Legacy FULL-URL DB satırları** | **HIGH** | Pass-through olduğu için provider swap'ten etkilenmez; rewrite edilmezse Supabase'e sabit kalır (Supabase kapanınca **kırık görsel**). |
| **Upload modeli (presigned redesign)** | **HIGH** | Tarayıcı anon+RLS → presigned PUT'a geçiş; CORS + auth + upload ekranlarının akışı değişir. En çok kod buradadır. |
| **Dosya bulk kopyalama** | **MEDIUM** | Binlerce görsel; path bütünlüğü ve eksiksizlik doğrulaması şart. |
| `villa-zip` fetch-by-URL | **MEDIUM** | `image_url` raw fetch ediliyor; R2 URL + (relative satırlarda) resolve gerekir. |
| RLS / erişim modeli | **MEDIUM** | Supabase Storage RLS → R2 S3 credential modeli; yanlış public/private ayarı veri sızması veya kırık erişim. |
| CDN/cache invalidation | **LOW-MEDIUM** | `cacheControl` upload'ta var; R2 + CDN cache davranışı doğrulanmalı. |

---

## F) ÖNCE YAPILMASI GEREKENLER (prerequisites)

1. **Legacy veri envanteri:** `villa_images.image_url` + `settings.*` + `*_cover_image` içinde **kaç satır FULL URL, kaç satır relative** → sayım. (Migration ölçeğini belirler.)
2. **R2 bucket + public custom domain + CORS** kurulumu (admin origin PUT).
3. **Path şeması kararı:** Supabase'deki path'leri **birebir koru** (relative path'ler dokunulmadan çalışsın).
4. **Presigned upload pattern kararı** (server route + S3 SDK) — secret yalnız server'da.
5. **`next.config` dual-host** hazırlığı (R2 + Supabase aynı anda izinli).
6. **Bulk copy aracı** (rclone S3↔S3) + **doğrulama scripti** (her DB path R2'de var mı?).
7. **Rollback planı:** barrel tek satır geri alınabilir; legacy satırlar dokunulmadıysa Supabase hâlâ canlı.

---

## G) SIFIR-DOWNTIME MIGRATION PLANI (faz faz)

**Faz 0 — Hazırlık (kullanıcı etkisi yok)**
- R2 bucket + custom domain + CORS. `next.config`'e R2 host **eklenir** (Supabase korunur → dual-read mümkün).

**Faz 1 — Bulk copy (read hâlâ Supabase)**
- Tüm dosyalar Supabase → R2'ye path-korumalı kopyalanır. Doğrulama: DB'deki her path R2'de mevcut mu?

**Faz 2 — Dual-write (yeni upload'lar her iki tarafa / veya R2'ye)**
- Upload akışı presigned R2'ye geçer; istenirse kısa süre Supabase'e de yazılır (güvenlik için). Yeni satırlar relative path (zaten öyle).

**Faz 3 — Read cutover (provider swap)**
- `lib/storage/index.ts` → R2 provider. **Relative-path satırlar anında R2'den** servis edilir. FULL-URL legacy satırlar hâlâ Supabase'den (dual-host sayesinde kırılmaz).

**Faz 4 — Legacy data rewrite**
- FULL Supabase URL satırları → relative path / R2 URL'e UPDATE (batch, idempotent, doğrulamalı). Artık **tüm** okumalar R2.

**Faz 5 — Supabase Storage decommission**
- Bir gözlem penceresi (örn. 2-4 hafta) sonrası `next.config`'ten Supabase host kaldırılır, Supabase Storage kapatılır.

> Her fazda geri dönüş mümkün: Faz 3'e kadar Supabase canlı; provider swap tek satırla geri alınır.

---

## H) EN GÜVENLİ UYGULAMA SIRASI

1. **Legacy URL sayımı** (kaç satır full URL) — ölçek netleşsin.
2. **R2 kurulumu** (bucket + custom domain + CORS).
3. **`next.config` dual-host** (R2 + Supabase) — render geçiş-güvenli olsun.
4. **Bulk copy** (path-korumalı) + **eksiksizlik doğrulaması**.
5. **R2 read provider** yaz + staging'de relative-path görsellerini doğrula (provider'ı sadece staging'de aç).
6. **Presigned upload pattern** (server route + upload ekranlarının uyarlanması) — staging'de tam upload→render testi.
7. **`villa-zip`** route'unu `resolveVillaImageUrl` ile R2 URL'e bağla + indirme testi.
8. **Production read cutover** (barrel swap) — relative satırlar R2, legacy Supabase (dual-host).
9. **Legacy data rewrite** (batch UPDATE) — tüm okumalar R2.
10. **Gözlem + Supabase Storage decommission** (host'u config'ten kaldır, Storage'ı kapat).

---

### Genel değerlendirme
Faz 38 soyutlaması sayesinde **read tarafı düşük riskli** (tek provider + tek barrel switch + relative-path satırların otomatik dönmesi). Asıl iş yükü ve risk: **(1) upload'ın presigned modele taşınması, (2) legacy full-URL satırların rewrite'ı, (3) bulk copy doğrulaması.** Sıfır-downtime, dual-host + dual-read + kademeli cutover ile tamamen mümkün.

*Bu rapor yalnız analizdir; hiçbir kod, dosya veya yapılandırma değiştirilmemiştir.*
