# STORAGE ABSTRACTION AUDIT — SUPABASE EXIT READINESS

**Tarih:** 2026-06-07 · **Kapsam:** Storage katmanı provider-agnostic mimari denetimi (analiz-only; kod/dosya/commit yok)
**Hedef:** "R2 çalışsın" değil → **Storage katmanı gelecekte herhangi bir S3-uyumlu provider'a (R2 / B2 / MinIO / AWS S3 / Hetzner) minimum değişiklikle taşınabilsin.**

---

## YÖNETİCİ ÖZETİ

İyi haber: **Read (okuma) katmanı zaten provider-agnostic'e %85 hazır.** DB'de relative path tutuluyor (villa-images + site-assets), tek bir `getPublicUrl` seam'i var, dual-format resolver (`resolveAssetUrl`/`resolveVillaImageUrl`) mevcut, ve **tek doğrudan `supabase.storage` tüketicisi** `supabase-storage.provider.ts`.

Asıl iş **iki noktada**:
1. **`getPublicUrl` hâlâ vendor SDK'sına bağlı** (Supabase URL üretiyor) → saf config-tabanlı URL üretimine çevrilmeli (CDN base + path). Bu, read katmanını **tamamen vendor-bağımsız** yapar.
2. **Upload tarayıcıda Supabase anon key + Storage RLS ile yapılıyor** → bu model **yalnız Supabase'e özgü**. Generic S3 provider'larında RLS/anon-key yok → **presigned URL veya server-side upload** gerekir. Provider-agnostic mimarinin tek gerçek refactor'ı budur.

**Sonuç:** Soyutlama olgun; exit readiness orta-yüksek. Doğru hamle R2'ye özel kod yazmak DEĞİL, **S3-uyumlu standart + saf URL üretimi + presigned/server upload** kurmaktır.

---

## 1) STORAGE'A DOKUNAN TÜM DOSYALAR

### Çekirdek katman
| Dosya | Rol |
|-------|-----|
| `lib/storage/index.ts` | Barrel + **provider switch noktası** (`storageProvider = ...`) |
| `lib/storage/storage.provider.ts` | `StorageProvider` interface (upload/remove/getPublicUrl/createSignedUrl/exists) |
| `lib/storage/supabase-storage.provider.ts` | **TEK doğrudan `supabase.storage.*` tüketici** |
| `lib/storage/storage.constants.ts` | Bucket sabitleri (`villa-images`, `site-assets`) |
| `lib/storage/storage.types.ts` | Provider-agnostic tipler |
| `lib/storage/storage.service.ts` | Service facade (provider'a delege) |
| `lib/storage.helpers.ts` | `resolveAssetUrl`, `resolveVillaImageUrl`, cover URL/path builder'ları |
| `lib/villa-image.helpers.ts` | Villa path builder + `parseVillaStorageUrl` + remove |
| `lib/image.helpers.ts` | Browser WebP convert (**provider-agnostic — vendora bağımsız**) |

### Upload tüketicileri (hepsi `storageProvider` üzerinden)
`app/components/villa/AdminGallery.tsx` (villa galeri), `app/(admin)/maki-admin/settings/_components/SettingsField.tsx` (logo/watermark/favicon/hero/og), `types/page.tsx` (kategori cover), `locations/page.tsx` (bölge cover), `pages/new/page.tsx` (CMS cover+section), `lib/admin-branding.ts` (admin logo/icon).

### Read/render tüketicileri
`villa.service.ts` (`mapVilla`), `lib/cache.helpers.ts`, `VillaCard.tsx`, `Gallery.tsx`, `WatermarkOverlay.tsx`, `Footer.tsx`/`HeaderWrapper.tsx` (logo), `Hero.tsx`+`hero/*`+`lib/hero.helpers.ts`, `CategoryCollection/LocationCollection.tsx`, `cms/PageSectionRenderer.tsx`, `app/p/[slug]/page.tsx`, `kiralik-villa/[slug]/page.tsx`.

### Altyapı / kenar
`next.config.ts` (`images.remotePatterns` — yalnız Supabase host), `app/api/villa-zip/[token]/route.ts` (`fetch(image_url)` doğrudan), Supabase Storage RLS migration'ları.

---

## 2) StorageProvider MİMARİSİ (detay)

```
Tüketiciler (upload ekranları, resolve helpers)
        │  import { storageProvider } from "@/lib/storage"
        ▼
lib/storage/index.ts  (BARREL — tek switch noktası)
        │  export const storageProvider = supabaseStorageProvider   ⟵ değiştirilecek tek satır
        ▼
StorageProvider interface  (storage.provider.ts)
   upload() · remove() · getPublicUrl() · createSignedUrl() · exists?()
        ▼
supabaseStorageProvider  (supabase-storage.provider.ts)
        │  supabase.storage.from(bucket).{upload/remove/getPublicUrl/createSignedUrl}
        ▼
@supabase/ssr browser client  (lib/supabase.ts)
```

**Güçlü yönler:**
- Interface provider-agnostic (Supabase'e özgü alan yok; bucket parametre).
- Tek switch satırı (barrel).
- Result envelope pattern (throw değil); console tag'leri caller'da.
- DB **relative path** tutuyor → URL üretimi runtime'da, tek noktada.

**Zayıf/eksik yönler:**
- `getPublicUrl` implementasyonu vendor SDK çağırıyor (saf URL değil).
- `upload` implementasyonu **browser anon client** kullanıyor → S3-uyumlu provider'a taşınamaz (aşağıda).
- `exists()` NOT-IMPLEMENTED.
- `createSignedUrl` tanımlı ama **gerçek caller yok** (ikisi de public bucket).

---

## 3) HALEN SUPABASE'E DOĞRUDAN BAĞIMLI KALAN NOKTALAR

| # | Yer | Bağımlılık | Provider-agnostic için |
|---|-----|-----------|------------------------|
| 1 | `supabase-storage.provider.ts` | `supabase.storage.*` (upload/remove/getPublicUrl/signed) | S3-uyumlu provider implementasyonu + read için saf URL |
| 2 | **Upload modeli** (tüm upload ekranları → provider.upload → browser anon client) | Supabase Storage **RLS + browser anon key** | Presigned PUT veya server-side upload (RLS yok) |
| 3 | `getPublicUrl` (read) | Supabase URL formatı SDK'dan | `${PUBLIC_CDN_BASE}/${path}` saf string |
| 4 | `next.config.ts` | `remotePatterns` yalnız Supabase host | CDN host env-driven |
| 5 | `villa-zip` route | `fetch(image_url)` ham | `resolveVillaImageUrl` ile CDN URL |
| 6 | Legacy FULL-URL satırlar | (villa-images'te **yok**: full_url=0; settings/cover'larda envanterle doğrula) | Varsa rewrite |
| 7 | Supabase Storage RLS policy'leri | `storage.objects` admin-write/anon-read | S3 model'de gereksiz (credential + presigned) |

> Not: `lib/supabase.ts` / `lib/supabase/client.ts` Supabase **Auth/DB** için zaten gerekli; storage provider'ı bundan ayrıştırılınca storage tarafı Supabase'siz çalışabilir.

---

## 4) UPLOAD AKIŞI (mevcut)

```
[Admin tarayıcı]
  → convertImageToWebP (browser Canvas — CPU client'ta)
  → buildVillaImagePath / `${folder}/${slug}.webp` (relative path üret)
  → storageProvider.upload(bucket, path, webpBlob)
       └─ supabase.storage.from(bucket).upload()   ⟵ TARAYICIDA anon key + Storage RLS (admin-write policy)
  → DB'ye RELATIVE PATH yaz (AdminGallery + SettingsField "Aşama B")
```
**Kritik:** Upload **tarayıcıdan doğrudan Supabase Storage'a** gidiyor; güvenlik Storage RLS ile sağlanıyor. **Bu model Supabase'e özgüdür** — S3-uyumlu generic provider'larda RLS ve tarayıcıda kullanılabilir güvenli anahtar yoktur.

## 5) DOWNLOAD / READ AKIŞI (mevcut)

```
DB image_url (relative path; villa-images'te %100 relative)
  → resolveVillaImageUrl / resolveAssetUrl:
        full URL → pass-through (legacy; villa-images'te yok)
        relative → storageProvider.getPublicUrl(bucket, path)   ⟵ vendor SDK
  → <Image>/<img> src → next/image host kontrolü
```
**Read zaten relative-path tabanlı** → provider switch'te otomatik döner. Tek vendor bağı: `getPublicUrl`'ün SDK kullanması (saf URL'e çevrilince tamamen agnostic).

## 6) next/image ETKİLERİ

- `next/image` kullanan 8+ component (VillaCard, Hero, Footer, koleksiyonlar, CMS…).
- `next.config.remotePatterns` **yalnız Supabase host + `/storage/v1/object/public/**`** izinli.
- Provider değişiminde **CDN host (`cdn.villayagel.com`) eklenmeli** (env-driven), yoksa `next/image` 400 verir.
- Öneri: remotePattern'i **env'den** (`NEXT_PUBLIC_CDN_HOST`) türet → provider değişince config'e dokunmadan host değişir. Geçiş boyunca **dual-host** (Supabase + CDN) tutulabilir.
- R2 + CDN custom domain → `next/image` optimizasyonu (WebP/AVIF, resize) aynen çalışır; CDN cache LCP'yi iyileştirir.

## 7) SITE-ASSETS vs VILLA-IMAGES AYRIMI

| | `villa-images` | `site-assets` |
|---|---|---|
| İçerik | Villa galeri | logo/watermark/favicon/hero/og + category/location/page-covers + admin branding |
| Path | `villas/{slug}__{shortId}/...` + legacy `{uuid}/...` | `logo/logo.webp`, `category-covers/{slug}.webp`, … |
| DB format | %100 relative (full_url=0) | relative (SettingsField "Aşama B"); legacy full-URL envanterle doğrula |
| Hacim | 2433 dosya / 394 MB | düşük (singleton + cover) |
| Resolver | `resolveVillaImageUrl` (VILLA_IMAGES bucket) | `resolveAssetUrl` (SITE_ASSETS bucket) |

**Mimari öneri:** İki bucket ayrımı **provider-agnostic tasarımda korunmalı** (farklı cache/ACL/CDN davranışı). Provider interface zaten bucket'ı parametre alıyor → tek provider iki bucket'ı yönetir.

## 8–9) PROVIDER-AGNOSTIC / S3-COMPATIBLE STANDART MİMARİ ÖNERİSİ

R2'ye özel değil — **S3 API standardı** üzerine kur. Tüm hedefler (R2/B2/MinIO/AWS/Hetzner) S3-uyumlu.

**Önerilen yapı:**
```
lib/storage/
  storage.provider.ts        (interface — değişmez)
  s3-storage.provider.ts      ⟵ YENİ: AWS SDK v3 (@aws-sdk/client-s3) ile S3-compatible
                                 endpoint/region/keys/bucket ENV'den; R2/B2/MinIO/AWS hepsi aynı
  supabase-storage.provider.ts (geçiş boyunca kalır; rollback için)
  index.ts                    (switch: env STORAGE_DRIVER = "s3" | "supabase")
```

**İki ayrı sorumluluk (kritik ayrım):**
- **READ (public URL):** Vendor SDK GEREKMEZ. Saf: `getPublicUrl(bucket, path) = ${PUBLIC_CDN_BASE[bucket]}/${path}`.
  - `PUBLIC_CDN_BASE` env'den (örn. `villa-images → https://cdn.villayagel.com`).
  - Browser-safe, sıfır secret, sıfır SDK → **tamamen provider-agnostic**.
- **WRITE (upload/remove):** S3 API, **server-side** (secret yalnız sunucuda). Browser doğrudan bucket'a yazmaz.

**Env şeması (örnek):**
```
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<acct>.r2.cloudflarestorage.com   # B2/MinIO/AWS'de farklı
S3_REGION=auto
S3_ACCESS_KEY_ID=...        (server-only)
S3_SECRET_ACCESS_KEY=...    (server-only)
NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES=https://cdn.villayagel.com
NEXT_PUBLIC_CDN_BASE_SITE_ASSETS=https://assets.villayagel.com
```
Provider değiştirmek = bu env'leri değiştirmek (+ DNS/CDN). Kod sabit.

## 10) PRESIGNED UPLOAD GEREKLİ Mİ?

**Cevap: Provider-agnostic olmak için EVET — browser upload korunacaksa presigned ZORUNLU.**
- Mevcut model (browser anon + RLS) **yalnız Supabase'de** çalışır. Generic S3'te tarayıcıya secret konamaz; RLS yoktur.
- Browser doğrudan bucket'a yazacaksa → **server route presigned PUT URL üretir** (S3 SDK + secret server'da), tarayıcı o URL'e PUT eder. Bucket'ta CORS (admin origin PUT) gerekir.
- Browser yazmayacaksa → **server-side upload** (presigned'a gerek yok).

## 11) SERVER-SIDE vs BROWSER UPLOAD — DEĞERLENDİRME

| Kriter | Server-side upload (proxy) | Browser presigned PUT |
|--------|---------------------------|------------------------|
| Secret yönetimi | En güvenli (secret hiç çıkmaz) | Güvenli (presigned kısa ömür) |
| CORS | Gerekmez | Bucket CORS şart |
| Bandwidth | Sunucudan geçer (2x) | Doğrudan bucket (sunucu yükü yok) |
| Serverless limit | Body-size/time limiti (Vercel) | Limit yok |
| Karmaşıklık | Düşük (tek route) | Orta (presign + client PUT + CORS) |
| Bu uygulamanın profili | ✅ Admin-only, küçük WebP (~150KB), düşük frekans | Yüksek hacim/büyük dosya gerekirse |

**Öneri:** Bu uygulamanın iş yükü (admin-only, browser'da WebP'ye küçültülmüş ~150KB dosyalar, seyrek upload) için **server-side upload (proxy route)** en düşük bakım + en yüksek güvenlik. Browser WebP conversion KORUNUR (CPU client'ta), sadece son blob bir `/api/admin/storage/upload` route'una POST edilir; route S3 SDK ile yazar.
**Presigned** ise gelecekte yüksek-hacim/büyük-dosya (örn. video, toplu yükleme) gelirse doğru ölçeklenen seçenek — interface aynı kaldığı için sonradan eklenebilir.

## 12) UZUN VADELİ BAKIM MALİYETİ

| Yaklaşım | Bakım maliyeti |
|----------|----------------|
| Bugünkü (Supabase browser+RLS) | Düşük ama **vendor-kilitli**; başka provider'a geçiş = upload yeniden yazımı |
| **Provider-agnostic S3 + server upload** | En düşük uzun vade: provider değişimi = ENV; tek `s3-storage.provider.ts`; RLS bakımı yok |
| Her provider'a özel kod | Yüksek (her geçişte yeniden yazım) — **kaçınılmalı** |

S3 standardı → bir kez yaz, her S3 provider'da çalışır. RLS storage policy bakımı ortadan kalkar (S3'te credential + bucket policy).

## 13) GÜVENLİK ETKİLERİ

- **Server-side/presigned → secret tarayıcıya inmez.** Mevcut modelde Storage RLS'e güveniliyor; S3'te güvenlik **server'da admin-auth + S3 credential** ile sağlanır (mevcut `authorizeAdminCaller` pattern'iyle uyumlu).
- Public read URL'leri zaten herkese açık (galeri public) → değişmez.
- Presigned kullanılırsa: kısa TTL (örn. 60sn), yalnız PUT, content-type kısıtı, bucket CORS allowlist (admin origin).
- R2/S3 bucket **public-read** doğru ayarlanmalı (private kalırsa kırık görsel; fazla açık olursa list-leak).
- `villa-zip` route artık CDN URL'lerini fetch eder → SSRF değil (kendi CDN'i), ama URL doğrulaması korunmalı.

## 14) PERFORMANS ETKİLERİ

- **Read:** CDN (Cloudflare) + `next/image` → R2 zero-egress + edge cache → LCP iyileşir. Saf URL üretimi SDK round-trip'i kaldırır (getPublicUrl zaten senkron ama SDK init yükü kalkar).
- **Upload:** Server-side proxy → küçük WebP'lerde fark ihmal edilebilir; çok sayıda dosyada presigned daha hızlı (paralel direct PUT).
- **next/image:** CDN host eklenmezse kırılır; eklenince optimizasyon aynen.

## 15) MALİYET ETKİLERİ

- **R2:** **egress ücretsiz** (en büyük kazanım; villa görselleri yüksek-trafik). Depolama ucuz.
- Provider-agnostic olmak → **fiyat kaldıracı**: yarın B2/Hetzner daha ucuzsa ENV ile geç.
- Supabase Storage egress + depolama maliyeti decommission sonrası düşer.
- CDN önünde olduğu için origin istek sayısı (dolayısıyla maliyet) düşük kalır.

## 16) ROLLBACK PLANI

Soyutlama tek-satır switch olduğu için rollback trivial; **her faz geri alınabilir**:

| Faz | Rollback |
|-----|----------|
| Read provider'ı S3'e al (env `STORAGE_DRIVER=s3`) | `STORAGE_DRIVER=supabase` → anında Supabase'e döner (dosyalar iki tarafta) |
| `next.config` CDN host ekle | Dual-host tutulduğu için Supabase host korunur; geri alma gerekmez |
| Upload'ı server/presigned'a al | Eski `supabaseStorageProvider.upload` kalır; flag ile geri |
| Legacy rewrite (gerekirse) | Idempotent batch; yedek tablo/kolonla geri yazılabilir |
| Supabase Storage decommission | **EN SON**; gözlem penceresi (2-4 hafta) + iki tarafta veri korunana dek ertelenir |

**Güvence:** Supabase Storage, S3 tarafı tam doğrulanana kadar **silinmez**; dosyalar iki tarafta tutulur → her an geri dönülebilir.

## 17) EN PROFESYONEL MİMARİ (öneri)

1. **READ'i SDK'dan ayır:** `getPublicUrl` = saf `${CDN_BASE[bucket]}/${path}` (env-driven). Vendor-bağımsız, browser-safe. → Read tamamen agnostic.
2. **`s3-storage.provider.ts`** (AWS SDK v3, S3-compatible): upload/remove server-side. R2/B2/MinIO/AWS/Hetzner aynı kod, farklı ENV.
3. **Upload'ı server-side route'a taşı** (`/api/admin/storage/upload`, `authorizeAdminCaller` ile): browser WebP'ye çevirir → route S3'e yazar. (Yüksek hacim gelirse presigned PUT'a yükselt — interface aynı.)
4. **ENV-driven config + dual provider** (geçiş + rollback için `supabaseStorageProvider` kalır).
5. **`next.config` host'u ENV'den** (dual-host geçiş).
6. **Bucket ayrımı korunur** (villa-images / site-assets; ileride farklı CDN/ACL).
7. **Legacy full-URL envanteri** (settings/cover) → varsa relative'e rewrite (villa-images temiz).
8. **Decommission en sonda**, gözlem sonrası.

**Tek cümle:** Vendor SDK'yı yalnız **write**'ta (server-side S3) tut; **read**'i saf URL + CDN ile tamamen vendor-bağımsız yap; provider seçimi ENV'e insin. Böylece bugün R2, yarın B2/MinIO/AWS/Hetzner — **kod değişmeden**.

---

## SUPABASE STORAGE EXIT READINESS: ~78/100
- Read soyutlaması: **90** (relative path + tek seam; yalnız getPublicUrl saf URL'e çevrilmeli)
- Write soyutlaması: **55** (browser+RLS modeli vendor-kilitli; server/presigned refactor gerekiyor)
- Config/infra: **70** (next.config + env host'lar)
- Veri taşınabilirliği: **95** (villa-images full_url=0; relative path her yerde)

*Bu rapor yalnız analizdir; hiçbir kod, dosya veya yapılandırma değiştirilmemiştir.*
