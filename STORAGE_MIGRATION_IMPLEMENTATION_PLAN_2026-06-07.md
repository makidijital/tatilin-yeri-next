# STORAGE PROVIDER MIGRATION — UYGULAMA PLANI

**Tarih:** 2026-06-07 · **Kapsam:** Provider-agnostic (S3-compatible) geçiş uygulama planı
**Sınır:** Plan-only — kod/dosya/commit YOK. Hedef: Storage katmanı R2/AWS/B2/MinIO/Hetzner'a **ENV ile** taşınabilsin.
**Mevcut:** villa-images R2'de (2433 dosya/394 MB), `image_url` %100 relative, full_url=0, CDN hazır, Supabase Storage aktif (rollback mümkün).

---

## 1) DEĞİŞECEK DOSYALAR

| Dosya | Neden değişiyor | Risk | Etki alanı | Rollback |
|-------|------------------|------|------------|----------|
| `lib/storage/storage.constants.ts` | Bucket başına **CDN base URL** config'i eklenir (env-driven) | **LOW** | Yalnız URL üretimi | Eski sabitler dursun; env okunmazsa Supabase fallback |
| `lib/storage/s3-storage.provider.ts` **(YENİ)** | S3-compatible provider (read=saf URL, write=server S3 SDK) | **MEDIUM** | Yeni dosya; switch açılana dek pasif | Dosya kullanılmazsa etkisiz; sil |
| `lib/storage/index.ts` | `storageProvider` switch: `STORAGE_DRIVER` env ile supabase↔s3 | **MEDIUM** | Tüm storage tüketicileri | `STORAGE_DRIVER=supabase` → anında geri |
| `lib/storage.helpers.ts` | `resolveAssetUrl`/`getXxxCoverPublicUrl` saf-URL provider'a uyum (davranış aynı) | **LOW** | site-assets read | Eski delege geri |
| `lib/villa-image.helpers.ts` | `getVillaImagePublicUrl` + `parseVillaStorageUrl` CDN host'u tanısın | **LOW** | villa-images read + remove parse | Eski parse geri |
| `lib/storage/supabase-storage.provider.ts` | **DEĞİŞMEZ** (rollback yedeği olarak kalır) | — | — | — |
| `next.config.ts` | `images.remotePatterns`'a **CDN host** eklenir (env-driven, dual-host) | **MEDIUM** | `next/image` tüm görseller | CDN host'u kaldır; Supabase host korunur |
| `app/api/admin/storage/upload/route.ts` **(YENİ)** | Server-side upload (S3 SDK + admin-auth) | **HIGH** | Tüm upload akışı | Route kullanılmazsa etkisiz; upload eski browser path'e döner |
| `app/components/villa/AdminGallery.tsx` | `storageProvider.upload` → server route çağrısına geçer | **HIGH** | Villa galeri upload | Eski `storageProvider.upload` çağrısı geri |
| `app/(admin)/maki-admin/settings/_components/SettingsField.tsx` | aynı upload-route geçişi | **MEDIUM** | logo/watermark/favicon/hero/og upload | Eski çağrı geri |
| `app/(admin)/maki-admin/types/page.tsx` | kategori cover upload route'a | **MEDIUM** | kategori cover | Eski çağrı geri |
| `app/(admin)/maki-admin/locations/page.tsx` | bölge cover upload route'a | **MEDIUM** | bölge cover | Eski çağrı geri |
| `app/(admin)/maki-admin/pages/new/page.tsx` | CMS cover+section upload route'a | **MEDIUM** | CMS görselleri | Eski çağrı geri |
| `lib/admin-branding.ts` | admin logo/icon upload route'a | **LOW** | admin panel branding | Eski çağrı geri |
| `app/api/villa-zip/[token]/route.ts` | `image_url`'i `resolveVillaImageUrl` ile CDN URL'e çevirip fetch | **MEDIUM** | ZIP indirme | `image_url` ham fetch'e geri |
| `lib/image.helpers.ts` | **DEĞİŞMEZ** (browser WebP — provider-agnostic) | — | — | — |
| `.env` / Vercel env | `STORAGE_DRIVER`, `S3_*`, `NEXT_PUBLIC_CDN_BASE_*` | **LOW** | Config | Env geri al |

> Not: Upload ekranları (`HIGH/MEDIUM`) yalnız **upload'ı server route'a taşımayı seçersek** değişir. Read-only geçişte (Faz 1-3) bu dosyalara **dokunulmaz**.

---

## 2) UYGULAMA SIRASI (fazlar)

### Faz 0 — Hazırlık (env + doğrulama)
- **Amaç:** R2 dosya bütünlüğü + CDN public-read teyidi (kod yok).
- **Dosyalar:** yok (yalnız `rclone check` + `curl cdn.villayagel.com/<path>` 200).
- **Risk:** LOW · **Rollback:** yok (sıfır değişiklik).
- **Başarı:** 2433 dosya R2'de doğrulandı, rastgele path'ler CDN'den 200.

### Faz 1 — Read'i saf-URL + CDN'e çevir (en kritik kazanım)
- **Amaç:** `getPublicUrl` vendor SDK yerine `${CDN_BASE[bucket]}/${path}` üretsin. Read tamamen agnostic.
- **Dosyalar:** `storage.constants.ts` (CDN base config), `s3-storage.provider.ts` (yalnız read/getPublicUrl kısmı), `index.ts` (switch read için), `next.config.ts` (CDN host — dual).
- **Risk:** MEDIUM · **Rollback:** `STORAGE_DRIVER=supabase` → SDK URL'e döner; `next.config` CDN host kalsa da zararsız.
- **Başarı:** Site genelinde villa + cover + logo görselleri CDN'den geliyor; `next/image` 200; LCP regresyon yok.

### Faz 2 — `parseVillaStorageUrl` + `villa-zip` CDN-uyumlu
- **Amaç:** Remove/parse ve ZIP indirme CDN URL'lerini tanısın.
- **Dosyalar:** `villa-image.helpers.ts`, `app/api/villa-zip/[token]/route.ts`.
- **Risk:** LOW-MEDIUM · **Rollback:** eski parse/fetch geri.
- **Başarı:** Galeri sil çalışıyor; ZIP indirme görselleri R2'den çekiyor.

### Faz 3 — Read gözlem penceresi
- **Amaç:** Production'da read tarafını izlemek (2-7 gün). Upload hâlâ Supabase'e (eski path).
- **Dosyalar:** yok.
- **Risk:** LOW · **Rollback:** env switch.
- **Başarı:** Sentry'de görsel 404/next-image hatası yok; CDN cache-hit sağlıklı.

### Faz 4 — Upload'ı server-side S3'e taşı
- **Amaç:** Upload Supabase RLS modelinden çıkıp provider-agnostic olsun.
- **Dosyalar:** `app/api/admin/storage/upload/route.ts` (YENİ), `s3-storage.provider.ts` (write), upload ekranları (AdminGallery, SettingsField, types, locations, pages/new, admin-branding).
- **Risk:** HIGH · **Rollback:** upload ekranları eski `storageProvider.upload` (Supabase) çağrısına geri; flag ile.
- **Başarı:** Yeni upload R2'ye yazıyor (relative path DB'ye), render anında CDN'den; eski silme/sıra korunuyor.

### Faz 5 — Legacy/site-assets envanter + (gerekiyorsa) rewrite
- **Amaç:** site-assets/cover'larda FULL-URL satır varsa relative'e çek (villa-images zaten temiz).
- **Dosyalar:** yok (SQL batch).
- **Risk:** MEDIUM · **Rollback:** yedek kolon/tablodan geri yaz.
- **Başarı:** Tüm okumalar CDN'den; FULL-URL satır kalmadı.

### Faz 6 — Supabase Storage decommission
- **Amaç:** Vendor tamamen çıkar.
- **Dosyalar:** `supabase-storage.provider.ts` ve Supabase storage RLS'leri kaldırılabilir; `next.config`'ten Supabase host çıkar.
- **Risk:** MEDIUM (geri dönülmez) · **Rollback:** decommission ÖNCESİ tüm fazlar haftalarca gözlemlenmeli.
- **Başarı:** Supabase Storage kapalı, site sorunsuz; aylarca stabil.

---

## 3) READ LAYER ANALİZİ

**Etkilenen dosyalar (URL üretimi):**
- `lib/storage.helpers.ts` → `resolveAssetUrl`, `getCategoryCoverPublicUrl`, `getLocationCoverPublicUrl`, `getPageCoverPublicUrl`
- `lib/villa-image.helpers.ts` → `getVillaImagePublicUrl`
- `lib/storage/supabase-storage.provider.ts` → `getPublicUrl` (saf-URL'e çevrilecek nokta)
- `next.config.ts` → `remotePatterns` (CDN host)

**Etkilenmeyen dosyalar (tüketiciler — imza değişmez):**
- `villa.service.ts` (`mapVilla`), `lib/cache.helpers.ts`, `VillaCard.tsx`, `Gallery.tsx`, `WatermarkOverlay.tsx`, koleksiyonlar, `Footer/HeaderWrapper`, `Hero*`, CMS renderer, detay/`/p` sayfaları. Hepsi `resolveXxx`'in **dönen string'ini** kullanır → resolver içi değişir, imza/çıktı aynı kalır.

**Mevcut davranış (lehte):** `resolveAssetUrl`/`resolveVillaImageUrl` dual-format: full URL → pass-through, relative → `getPublicUrl`. villa-images %100 relative olduğu için **provider switch'te otomatik CDN'e döner**.

**Geçişte kırılabilecek yerler:**
1. `next.config.remotePatterns`'a CDN host eklenmezse → `next/image` **400** (en olası kırılma). Dual-host şart.
2. CDN public-read yanlışsa → 403/kırık görsel.
3. CDN base'in **bucket-kök eşlemesi**: `cdn.villayagel.com` `villa-images` bucket köküne bağlıysa, `getPublicUrl` path'e **bucket adı eklememeli** (`https://cdn.../villas/...`, `.../villa-images/villas/...` DEĞİL). site-assets ayrı domain/prefix gerektirir.
4. Legacy full-URL satır (site-assets'te olabilir) → switch'ten etkilenmez, Supabase'e bağlı kalır (Faz 5 rewrite).
5. `villa-zip` `image_url`'i **ham fetch** ediyor; relative path'i absolute CDN'e çevirmeden fetch ederse kırılır (Faz 2).

---

## 4) UPLOAD LAYER ANALİZİ

**Mevcut akış:** Browser `convertImageToWebP` → `storageProvider.upload` → `supabase.storage.from().upload()` (tarayıcıda anon key + Storage RLS admin-write) → DB'ye relative path.

| Kriter | A) Browser→Supabase (mevcut) | B) Browser→Presigned→S3 | C) Browser→API Route→S3 (server-side) |
|--------|------------------------------|--------------------------|----------------------------------------|
| **Güvenlik** | Storage RLS'e bağlı; vendor-özel | İyi (kısa-TTL presigned; secret serverda) | **En iyi** (secret hiç çıkmaz, admin-auth route'ta) |
| **Bakım maliyeti** | Düşük ama vendor-kilitli | Orta (presign endpoint + CORS) | **Düşük** (tek route, CORS yok) |
| **Performans** | İyi (direct) | **En iyi** (direct, sunucu baypas) | Orta (sunucudan geçer; küçük WebP'de ihmal) |
| **Debug kolaylığı** | Orta (RLS hataları opak) | Orta (presign + CORS + client PUT) | **En iyi** (tek noktada server log) |
| **Vendor lock-in** | **Yüksek** (Supabase'e özgü) | Düşük (S3 standart) | Düşük (S3 standart) |
| **Uzun vade sürdürülebilirlik** | Düşük | İyi (yüksek hacimde) | **İyi (bu iş yükünde)** |

**Öneri: C) Server-side upload (API Route → S3).**
**Neden:** Bu uygulamanın profili admin-only, browser'da ~150KB'a küçültülmüş WebP, düşük frekans. C; en yüksek güvenlik (secret serverda, mevcut `authorizeAdminCaller` pattern'iyle), en kolay debug (tek route log), CORS/presign karmaşıklığı yok ve tam provider-agnostic (S3 SDK). Browser WebP conversion **korunur** (CPU client'ta), yalnız son blob route'a POST edilir → serverless body/time limiti küçük dosyalarda sorun değil. **B (presigned)** yalnız ileride video/yüksek-hacim/büyük-dosya gelirse gerekir; interface aynı kaldığı için sonradan yükseltilebilir.

---

## 5) SUPABASE BAĞIMLILIK HARİTASI (storage açısından)

**Doğrudan bağlı (Supabase Storage kapatılınca kırılır — refactor şart):**
- `lib/storage/supabase-storage.provider.ts` (upload/remove/getPublicUrl SDK)
- Upload ekranları → bugün `storageProvider.upload` → Supabase (Faz 4'te kopar)
- `next.config.ts` (Supabase host) — CDN host eklenmezse next/image
- Supabase Storage RLS migration'ları

**Dolaylı bağlı (provider seam üzerinden; switch'le otomatik kopar):**
- `lib/storage.helpers.ts`, `lib/villa-image.helpers.ts` (getPublicUrl çağırır)
- `villa.service.ts`, `cache.helpers.ts`, tüm render component'leri (resolver çıktısını kullanır)
- `app/api/villa-zip/[token]/route.ts` (image_url URL'i)

**Tamamen bağımsız (Supabase Storage kapansa bile etkilenmez):**
- `lib/image.helpers.ts` (browser WebP)
- `lib/storage/storage.provider.ts` / `storage.types.ts` (saf interface/tipler)
- `lib/storage/storage.constants.ts` (sabitler)
- DB `villa_images.image_url` **verisi** (relative path; provider'dan bağımsız)
- Tüm render component imzaları (string URL tüketir; kaynağı umursamaz)

**Sonuç:** Supabase Storage kapatıldığında yalnız **provider impl + upload modeli + next.config host** etkilenir. Veri, interface, render ve browser-convert **etkilenmez** → exit yüzeyi dar.

---

## 6) EXIT READINESS SKORU

| Katman | Puan | Gerekçe |
|--------|-----:|---------|
| Data Layer | **95** | image_url %100 relative, full_url=0; provider'dan bağımsız |
| Storage Layer (soyutlama) | **85** | Tek seam + interface + switch; yalnız getPublicUrl saf-URL'e çevrilmeli |
| Upload Layer | **55** | Browser+RLS modeli vendor-kilitli; server/presigned refactor gerekiyor |
| Read Layer | **88** | Relative + resolver hazır; next.config host + CDN-kök eşlemesi kalan iş |
| Config Layer | **70** | env şeması + next.config dual-host kurulmalı |
| Rollback Readiness | **90** | Tek-satır/ENV switch; Supabase aktif; dosyalar iki tarafta |
| **GENEL** | **~80/100** | Read'e çok yakın; asıl iş upload refactor + config |

---

## 7) NİHAİ MİMARİ (uzun vade — kod yok)

**İlke: Vendor SDK yalnızca *write* tarafında, *read* tamamen saf-URL + CDN.**

1. **Read = saf URL.** `getPublicUrl(bucket, path)` = `${CDN_BASE[bucket]}/${path}`. Hiç SDK, hiç secret, browser-safe. CDN base'ler env'den (villa-images + site-assets ayrı domain/prefix). Provider değişimi read'i **hiç etkilemez** (yalnız CDN DNS).

2. **Write = server-side S3.** Tek `s3-storage.provider.ts` (AWS SDK v3), tüm S3-uyumlu hedeflerde aynı kod. Upload `/api/admin/storage/upload` route'unda (`authorizeAdminCaller` + S3 SDK + secret server-only). Browser yalnız WebP'ye çevirip blob POST eder.

3. **Tek seam + ENV switch.** `STORAGE_DRIVER` (`s3`|`supabase`) → `index.ts` barrel'da provider seçilir. `supabaseStorageProvider` rollback için bir süre korunur, sonra silinir.

4. **Bucket ayrımı korunur** (villa-images / site-assets — farklı CDN/ACL/cache).

5. **Config tamamen ENV.** `S3_ENDPOINT/REGION/KEY/SECRET` + `NEXT_PUBLIC_CDN_BASE_*` + `next.config` host env-driven. Provider değiştirmek = ENV + DNS; **kod sabit**.

6. **Güçlü rollback.** Her faz geri alınabilir; Supabase Storage en sonda, haftalarca gözlem sonrası kapatılır; veri iki tarafta tutulur.

**Hedeflere uyum:**
- *Vendor bağımsız:* read saf-URL, write S3-standart → R2/AWS/B2/MinIO/Hetzner aynı kod.
- *Düşük bakım:* RLS storage policy bakımı yok; tek provider dosyası.
- *Minimum geçiş işi:* yeni provider = ENV değişikliği.
- *Güçlü rollback:* tek-satır/ENV + dual veri.

**Tek cümle:** *Read'i CDN+saf-URL ile vendordan tamamen kopar; write'ı server-side S3 standardına al; provider seçimini ENV'e indir → gelecekteki her provider değişimi "kod değil, config" olur.*

---

*Bu doküman yalnız uygulama planıdır; hiçbir kod, dosya veya yapılandırma değiştirilmemiştir.*
