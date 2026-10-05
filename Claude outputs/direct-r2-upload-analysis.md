# Direct-to-R2 Galeri Upload — Forensic Analiz (READ-ONLY)

Tarih: 2026-10-06 · HEAD: `699b256` · Kod, env, paket ve DB değiştirilmedi.

Not: Sunucuya, R2'ye ve DB'ye erişim yok; bulgular yalnızca kaynak koddan. R2 bucket'ının CORS ayarı ve public erişimi Cloudflare panelinden doğrulanmalı.

---

## 1. Mevcut upload akışı (villa galerisi)

| # | Adım | Nerede | Not |
|---|---|---|---|
| 1 | Dosya seçimi; 2 MB / 80 adet sınırı | `app/components/villa/AdminGallery.tsx` → `handleFiles()` | `accept="image/*"` |
| 2 | Resize (max 1600px) + WebP (q=0.8) | `AdminGallery.tsx` → `convertToWebP()` (`createImageBitmap` + canvas + `toBlob("image/webp", 0.8)`) | Tamamen tarayıcıda |
| 3 | Object key üretimi | `lib/villa-image.helpers.ts` → `nextGallerySequenceFromUrls()` + `buildVillaImagePath()` → `villas/{slug}__{id8}/gallery-NNNN-xxxx.webp` | **Key tarayıcıda üretiliyor** |
| 4 | Upload isteği | `lib/storage/index.ts` → `storageProvider.upload()` → `routeUpload()` → `adminFetch("/api/admin/storage/upload")` (multipart FormData) | 401 gelirse `/api/auth/refresh` çağrılır ve **dosya ikinci kez gönderilir** (`lib/admin-fetch.ts`) |
| 5 | Auth | `app/api/admin/storage/upload/route.ts` → `authorizeAdminCaller` | Access JWT cookie (TTL 900 sn) |
| 6 | Yetki | Aynı route → `storagePermissionFor(bucket, path)` + `callerHasPermission` | `villas/` önekli her path için `villas` izni yeterli. **Villa bazlı kontrol yok** |
| 7 | **Dosya byte'ları VPS'te** | Aynı route → `req.formData()` → `blob.arrayBuffer()` → `Uint8Array` | Tamamı RAM'de; diske yazılmıyor |
| 8 | **R2 PutObject** | `lib/storage/s3-storage.provider.ts` → `upload()` → `PutObjectCommand` | Tek parça. `upsert` yok sayılıyor (S3 PUT her zaman üzerine yazar) |
| 9 | site-assets ETag invalidation | Route → `invalidateSiteAssetVersions` | villa-images için etkisiz (no-op) |
| 10 | DB kaydı | `AdminGallery` → `onUploaded(path)` → `galeri/page.tsx` `handleUploaded` → server action `gallery.action.ts` → `addGalleryImage()` → `authorizeAdminSession` + `callerHasPermission("villas")` → `villa-image.mutations.ts` → `addVillaImage()` | 3 sorgu: en yüksek sort_order, mevcut kapak, INSERT `villa_images {villa_id, image_url: <relative path>, sort_order, is_cover}` |
| 11 | Cache invalidation | `addGalleryImage` → `invalidateVillasCache()` → `revalidateTag("villas", {expire:0})` | **Her görselde**; `lib/cache.helpers.ts` içindeki 3 `unstable_cache` girdisini siler |
| 12 | Galeri yenileme | `galeri/page.tsx` → `loadImages()` → server action `loadGalleryImages()` | **Her görselde** tüm liste yeniden okunuyor |
| 13 | Rollback | DB insert `false` dönerse → `storageProvider.remove()` → `/api/admin/storage/remove` | Rollback isteği de tarayıcıdan gidiyor |

```
Browser
→ convertToWebP (resize 1600 + WebP 0.8)              [AdminGallery.tsx]
→ POST /api/admin/storage/upload (FormData)            [lib/storage/index.ts → admin-fetch]
→ Auth + storage izni                                  [upload/route.ts]
→ R2 PutObject (VPS→R2)                                [s3-storage.provider.ts]
→ Server Action addGalleryImage → INSERT villa_images  [gallery.action.ts → villa-image.mutations.ts]
→ revalidateTag("villas")                              [villas-cache-invalidation.server.ts]
→ loadGalleryImages (tüm galeri)                       [galeri/page.tsx]
```

Aynı route'u kullanan diğer upload noktaları kapsam dışı, ama route kaldırılırsa hepsi etkilenir:

- `RichTextEditor` (villa-images/`descriptions/`)
- `BlogPostForm`
- `types`
- `locations`
- `pages/new` ve `pages/[id]`
- `SettingsField`
- `admin-branding.client`

## 2. Tarayıcı tarafı

- **Resize, WebP ve sıkıştırma:** Tek yerde yapılıyor: `AdminGallery.tsx > convertToWebP` (1600px, kalite 0.8).
- **HEIC:** Özel bir HEIC desteği yok. Dönüşüm, tarayıcının `createImageBitmap` ile dosyayı çözebilmesine bağlı:
  - Safari (macOS/iOS) HEIC'i çözer.
  - Chrome ve Firefox Windows'ta genelde çözemez.
  - iOS dosya seçicisi çoğu zaman HEIC'i kendisi JPEG'e çevirir.
- ⚠️ **Mevcut hata:** Bütün döngü tek bir `try` içinde. Bir dosyanın dönüşümü hata verirse kalan dosyalar sessizce yüklenmez.
- **Final boyut:** Giriş en fazla 2 MB. 1600px WebP q0.8 çıktısı tipik olarak 150–600 KB.
- ⚠️ **Safari ve PNG:** Tarayıcı canvas'ta WebP kodlamayı desteklemiyorsa `toBlob` PNG döndürür. Bu Safari için doğrulanmalı. Böyle olursa `.webp` adlı ve `image/webp` olarak etiketlenmiş bir PNG yüklenir ve boyutu 2 MB'ı aşabilir.
- **Korunabilir mi?** Evet, tamamen. Direct upload yalnızca 4. adımın hedefini değiştirir; `convertToWebP` ve key üretiminin girdisi aynı kalır.

## 3. VPS'in upload sırasındaki görevleri

| Görev | Bugün | Byte gerektirir mi? |
|---|---|---|
| Authentication (JWT cookie) | Upload route + server action | Hayır |
| Authorization (`villas` izni, path önekine göre) | Upload route + server action | Hayır |
| Villa bazlı yetki / path-villa eşleşmesi | **Yok** | Hayır |
| Key oluşturma | **Tarayıcı** (VPS yalnızca kabul ediyor) | Hayır |
| R2 PutObject | VPS | **Bugün evet, ama gerekli değil** |
| DB insert + sıra/kapak | Server action | Hayır |
| Cache invalidation | Server action | Hayır |
| Logging | Yalnızca hata için `console.error`; galeri için audit kaydı yok | Hayır |

**Sonuç:** VPS dosya içeriğine hiç bakmıyor; MIME, boyut veya görsel doğrulaması yapmıyor. Byte'lar yalnızca R2'ye aktarılmak için VPS'ten geçiyor. Yani VPS'in dosyayı alması **gerekmiyor**.

## 4. R2 mimarisi

- **S3 client:** `s3-storage.provider.ts > getClient()` içinde, ilk kullanımda oluşturuluyor ve process boyunca tek instance (her istekte yeni bağlantı açılmıyor). `forcePathStyle: true`, `region: S3_REGION || "auto"`. Timeout/retry ayarı yok; SDK varsayılanları geçerli.
- **Endpoint ve anahtarlar:** Endpoint `S3_ENDPOINT` env'inden (`https://<acct>.r2.cloudflarestorage.com`). Anahtarlar `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`, yalnızca sunucuda.
- **Bucket adları:** `lib/storage/storage.constants.ts` içinde sabit: `tatilinyeri-villa-images`, `tatilinyeri-site-assets`.
- **Object key:** `lib/villa-image.helpers.ts > buildVillaImagePath`.
- **Public URL:** `lib/storage/cdn.config.ts > resolveCdnPublicUrl` → `NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES + "/" + key`. DB'de relative path tutuluyor, URL okuma sırasında üretiliyor.
- **CORS:** Projede tanımlı değil (`cors` / `PutBucketCors` hiç geçmiyor). Bucket CORS'u Cloudflare panelinden ayarlanmalı.
- **Doğrudan PUT:** R2 presigned URL ile doğrudan PUT'u destekliyor. CORS'ta admin origin'ine `PUT` izni gerekiyor.
- **CSP:** Admin CSP'si `connect-src 'self'`. Şu an Report-Only olduğu için engellemez ama ihlal raporu üretir; R2 endpoint'i eklenmeli.

## 5. Presigned URL

Projede presigned URL mekanizması yok; `@aws-sdk/s3-request-presigner` paketi de kurulu değil.

Önerilen model:

```
Browser: convertToWebP (aynı)
→ POST /api/admin/villas/{villaId}/gallery/upload-url   { contentType:"image/webp", size }
   VPS: auth + "villas" izni + villa var/silinmemiş + size ≤ limit + type allow-list
        key'i SUNUCU üretir (buildVillaImagePath + DB'den sıra) → presigned PUT (TTL 60–120 sn,
        ContentType + ContentLength imzaya dahil) → { uploadUrl, key, headers }
→ PUT uploadUrl (Browser → R2 doğrudan)
→ Server Action registerGalleryImage(villaId, key)
   VPS: auth + izin + key bu villanın klasörüne VE bu oturumda verilen
        bilete ait mi + HeadObject ile nesne var mı / boyut / content-type
        → INSERT villa_images (mevcut addVillaImage)
        → invalidateVillasCache (mevcut)
```

Eklenmesi gerekenler:

- Paket: `@aws-sdk/s3-request-presigner`.
- `s3-storage.provider.ts` içine iki fonksiyon:
  - `presignPut(bucket, key, {contentType, contentLength, expiresIn})`
  - `head(bucket, key)` (`HeadObjectCommand` zaten import edilmiş durumda)
- Yeni upload-url route'u.
- Kayıt için yeni bir server action (ya da `addGalleryImage`'a doğrulama eklemek).
- `AdminGallery` içinde `storageProvider.upload` yerine "URL al → PUT" adımı.

## 6. Güvenlik

Bugünkü açıklar (direct upload'a geçerken kapatılabilir):

- **Key istemcide üretiliyor:** `villas` izni olan bir admin, `villas/` altındaki **herhangi bir** villanın klasörüne yazabilir ve mevcut bir dosyanın **üzerine yazabilir** (PUT overwrite).
- **Kayıtta doğrulama yok:** `addGalleryImage(villaId, imageUrl)` path'in o villaya ait olup olmadığını ya da R2'de gerçekten var olup olmadığını kontrol etmiyor.
- **İçerik kontrolü yok:** Content-type istemciden geliyor; MIME ve boyut sunucuda doğrulanmıyor. Route'ta boyut limiti yok; yalnızca Next ve proxy limitleri sınırlıyor.

Önerilen model:

- **Key sunucuda belirlenir:** İstemci bucket veya key göndermez; sunucu `villaId` + sıra + rastgele kısımdan key'i kendisi üretir. Bucket sabittir.
- **URL'i kim alabilir:** Yalnızca `villas` izni olan aktif bir admin, var olan ve silinmemiş bir villa için.
- **İmza sınırları:** TTL 60–120 sn. `ContentType=image/webp` ve `ContentLength` (en fazla ~3 MB) imzaya dahil edilir; R2 farklı başlıkla gelen PUT'u reddeder.
- **Kayıtta doğrulama:** Key öneki (`villas/{slug}__{id8}/`) kontrol edilir; `HeadObject` ile boyut ve content-type doğrulanır.
- **Üzerine yazma:** Key benzersiz olur. Ek olarak `If-None-Match: *` (R2 conditional PUT) kullanılabilir.
- **Bucket erişimi:** S3 API'si private kalır (kimlik bilgisi gerekir); public okuma yalnızca CDN custom domain'inden yapılır. Bu mevcut durum, doğrulanmalı.
- **Endpoint koruması:** Mevcut `authorizeAdminCaller` + `callerHasPermission` kullanılır.

## 7. Database ve orphan dosyalar

**Bugün:** Önce R2'ye, sonra DB'ye yazılıyor. DB insert `false` dönerse tarayıcı `/api/admin/storage/remove` ile dosyayı siliyor. Şu durumlarda R2'de **sahipsiz (orphan) dosya** kalıyor:

- Tarayıcı kapanırsa.
- İnternet koparsa.
- Server action `false` dönmek yerine exception atarsa (`catch` döngüyü bitirir).

Orphan dosyaları tarayan bir temizlik işi yok.

**Önerilen:**

1. **Pending bilet:** URL alınırken kısa ömürlü bir "pending" kaydı tutulur, kayıt tamamlanınca kapatılır. Bu bir migration gerektirir; alternatifi imzalı ve süreli bir JWT bileti (migration gerekmez).
2. **Sunucu tarafı rollback:** Kayıt başarısız olursa dosya sunucuda silinir (`removeServer`); tarayıcıya güvenilmez.
3. **Periyodik orphan taraması:** Coolify scheduled task ile `villas/` önekli dosyalar listelenir; 24 saatten eski olup `villa_images`'ta bulunmayanlar silinir. Bu, bugüne kadar birikmiş orphan'ları da temizler.

## 8. Cache ve galeri yenileme

- Her görselden sonra `revalidateTag("villas", {expire:0})` çalışıyor ve tüm galeri yeniden okunuyor (`loadGalleryImages`).
- Silme ve sıralama sonrasında da `loadImages` çağrılıyor.

**Aynen korumak için:** Kayıt adımı mevcut `addVillaImage` ve `invalidateVillasCache`'i olduğu gibi çağırır; galeri yenileme de aynı kalır.

**İsteğe bağlı iyileştirme (davranış değişikliği, ayrı karar):** Toplu yüklemede invalidation ve galeri yenileme yalnızca **sonda bir kez** yapılır. Kapak ve sıra mantığı bundan etkilenmez, çünkü her insert `findMaxSortOrder` / `findCoverId` ile ayrı ayrı çalışıyor.

## 9. Çoklu görsel yükleme

**Bugün tamamen sıralı** (`for … await`, eşzamanlılık yok). Her görsel için:

- Tarayıcıda dönüşüm
- 1 HTTP upload (VPS→R2 dahil)
- 1 server action (auth + izin + 3 DB sorgusu + invalidation)
- 1 server action (tam galeri)

80 görsel ≈ 240 istek ve 80 kez cache invalidation demek.

**Direct R2 ile paralellik mümkün, ama dikkat gerekiyor:**

- R2 PUT'ları güvenle 3–4 eşzamanlı yapılabilir.
- DB kaydı (sort_order ve kapak) **sıralı** kalmalı. Paralel insert'te aynı `sort_order` ya da iki kapak oluşabilir; mevcut kod bunu kilitlemiyor.
- Önerilen düzen: upload paralel, kayıt sıralı bir kuyrukta.
- Next server action'ları istemci tarafında zaten seri kuyruklar.
- Sıra numarası (`seq`) yüklemeden önce ayrılmalı.

## 10. Hata senaryoları

| Senaryo | Bugün | Önerilen |
|---|---|---|
| R2 upload başarısız | Route 502 döner, `continue` ile sıradaki dosyaya geçilir; kullanıcıya mesaj yok | Aynı; ek olarak dosya bazlı hata mesajı ve isteğe bağlı 1 retry |
| DB insert başarısız | `false` dönerse tarayıcı R2'den siler; exception atılırsa orphan kalır ve döngü durur | Sunucu tarafında silme; döngü devam eder |
| Auth başarısız | 401 → refresh → **dosya ikinci kez gönderilir**; refresh de başarısızsa hata | 401 URL alma adımında olur → refresh (küçük JSON); dosya yalnızca bir kez gider |
| Presigned URL alınamadı | — | Dosya atlanır, mesaj gösterilir; R2'ye hiçbir şey yazılmaz |
| Upload yarıda kaldı | R2'de dosya oluşmaz (tek parça PUT atomik) | Aynı; DB kaydı yapılmaz |
| İnternet kesildi | Döngü hata alır, `catch` ile durur; kalan dosyalar sessizce yüklenmez | Dosya bazlı durum gösterimi + "kalanları tekrar dene" |
| Aynı dosya iki kez gönderildi | Farklı rastgele key → iki ayrı galeri kaydı (duplicate) | Aynı; istenirse içerik hash'i ile tekrar kontrolü (yeni davranış, ayrı karar) |
| Sayfa kapatıldı | R2'ye yazılmış ama DB'de olmayan dosya → orphan | Orphan taraması ve bilet süresiyle temizlenir |

## 11. Mevcut davranışı koruma

| Davranış | Nasıl korunur |
|---|---|
| Admin galeri, villa ilişkisi | Kayıt yine `addVillaImage` ile (`villa_id`, relative path) |
| Kapak, sıra, yeniden sıralama | `addVillaImage` mantığı aynen; reorder ve cover action'larına dokunulmaz |
| Silme / tümünü silme | `villa-image.delete.ts` (önce DB, sonra sunucuda R2 silme) aynen; key formatı değişmez |
| Fotoğraf değiştirme | Galeride ayrı bir "değiştir" akışı yok (sil + yükle); aynen kalır |
| CDN URL'leri | Key formatı ve `resolveCdnPublicUrl` değişmez |
| WebP dönüşümü, HEIC | `convertToWebP` aynen (HEIC bugünkü gibi tarayıcıya bağlı) |
| Yetkilendirme | URL alma ve kayıt mevcut `authorizeAdminCaller` / `callerHasPermission("villas")` ile; ek olarak villa ve key doğrulaması |
| Audit / log | Galeri için bugün audit yok; hata logları korunur. İstenirse `adminGateway.audit` eklenebilir (yeni) |
| Cache invalidation | `invalidateVillasCache` aynen |
| Diğer upload ekranları | `/api/admin/storage/upload` route'u **kalır**; yalnızca galeri yeni yolu kullanır |

## 12. Geçiş planı (önerilen sıra)

0. **Hazırlık (kod dışı):**
   - R2 bucket CORS: admin origin'i, `PUT`, `Content-Type` header.
   - R2 API token'ının yazma yetkisini doğrula.
   - Admin CSP `connect-src`'ye R2 endpoint'ini ekle.
   - Safari'de WebP çıktısını doğrula.
1. **Sunucu tarafı (henüz kullanılmayan):**
   - `presignPut` ve `head` provider fonksiyonları.
   - `upload-url` route'u (auth, villa kontrolü, key sunucuda, TTL, boyut ve tip sınırı).
   - `registerGalleryImage` server action (key doğrulama + HeadObject + mevcut `addVillaImage` + invalidation + başarısızlıkta sunucu tarafı silme).
   - Henüz hiçbir UI bu yola bağlı değil.
2. **Galeri istemcisi (feature flag ile):** `AdminGallery` URL alır → PUT eder → kayıt yapar. Flag kapalıyken eski yol aynen çalışır.
3. **Gözlem:** Flag önce tek ortamda ya da tek admin için açılır, süreler ölçülür, sonra kalıcı hale getirilir.
4. **Orphan temizliği:** Periyodik tarama (scheduled task).
5. **İsteğe bağlı performans:** Paralel PUT (3–4) + sıralı kayıt; toplu yüklemede invalidation ve yenileme sonda bir kez.
6. **Kaldırma:** Galeri için eski yol kaldırılır. `/api/admin/storage/upload` **diğer ekranlar kullandığı için kalır**; onların taşınması ayrı bir iş.

## 13. Risk analizi

**Düşük:**

- 1. adım (sunucu tarafı), UI'ya bağlanmadığı sürece.
- Key formatının ve CDN URL'lerinin değişmemesi.
- Silme ve sıralama akışları (dokunulmuyor).

**Orta:**

- CORS veya CSP yanlış ayarlanırsa upload tamamen durur (feature flag ile geri dönüş mümkün).
- 401 / oturum yenileme davranışı.
- Key üretimi sunucuya taşınırken `nextGallerySequenceFromUrls` mantığı birebir korunmazsa dosya adları çakışabilir.
- Safari'de WebP yerine PNG üretilmesi.

**Yüksek:**

- Paralel kayıt (kapak ve sort_order yarışı).
- Eski route'u erken kaldırmak (7 ekran onu kullanıyor).
- Kayıt adımında doğrulama atlanırsa, DB'ye keyfi key yazılabilmesi bugünkünden daha açık hale gelir.

## 14. Performans (tahmini — ölçüm yapılmadı)

- **VPS ağ yükü:** Galeri byte'ları bugün VPS'ten iki kez geçiyor (giriş + R2'ye çıkış). Direct upload ile neredeyse sıfır; yalnızca küçük JSON istekleri kalır.
- **Upload süresi:** Bugün `müşteri→VPS + VPS→R2` sırayla yapılıyor. Direct upload'da `müşteri→Cloudflare` (genelde daha yakın) ve VPS'teki ağ veya proxy dalgalanmalarından bağımsız.
- **Eşzamanlılık:** VPS bellek ve Node event loop yükü kalkar; paralel PUT mümkün olur.
- **CPU/RAM:** Bugün dosya başına bellekte ~3 kopya var (FormData, ArrayBuffer, Uint8Array). Dosyalar küçük olduğu için etkisi sınırlı; direct upload'da sıfır.
- **R2 bağlantısı:** VPS'te tek S3 client kalır (URL imzalama ve HeadObject için).
- **Değişmeyenler:** Görsel başına ~10 sıralı DB sorgusu ve her görselde invalidation direct upload ile değişmez. Yavaşlığın bir kısmı bunlardan geliyorsa 5. adım da gerekir.

## 15. Karar özeti

**Mevcut sistem:** Tarayıcı WebP üretir → VPS route dosyayı RAM'e alır → VPS R2'ye PUT eder → server action DB'ye yazar → her görselde cache invalidation ve tam galeri yenileme. Hepsi sıralı.

**Sorun:**

- Byte'lar gereksiz yere VPS'ten geçiyor; süre VPS'in ağına ve proxy'sine bağımlı.
- Key istemcide üretiliyor; villa ve key doğrulaması yok.
- 401 durumunda dosya iki kez gönderiliyor.
- Orphan riski var ve temizleyen bir mekanizma yok.

**Önerilen sistem:** Tarayıcı WebP → VPS'ten kısa ömürlü presigned PUT → doğrudan R2 → VPS'te doğrulamalı kayıt.

**VPS'in yeni görevi:**

- Auth ve yetki.
- Villa doğrulaması ve key üretimi.
- URL imzalama.
- HeadObject ile doğrulama.
- DB kaydı, invalidation ve orphan temizliği.

**R2'nin yeni görevi:** İmzalı PUT'u kabul etmek (CORS ile), public okumayı CDN'den sunmak.

**DB'nin görevi:** Değişmiyor — `villa_images` (relative path, sort_order, is_cover).

**Güvenlik modeli:**

- Key ve bucket sunucuda belirlenir.
- URL en fazla 120 sn geçerli; ContentType ve ContentLength imzalı.
- Kayıtta key öneki ve HeadObject doğrulaması.
- S3 API private, okuma CDN üzerinden.

**Riskler:** Bkz. §13. En kritikleri: CORS/CSP, paralel kayıt yarışı, eski route'un erken kaldırılması.

**Değişmesi gereken dosyalar:**

- `lib/storage/s3-storage.provider.ts` (presign/head)
- Yeni upload-url route'u
- `app/(admin)/maki-admin/villas/[id]/galeri/gallery.action.ts` (kayıt + doğrulama)
- `app/components/villa/AdminGallery.tsx` (upload adımı)
- `lib/villa-image.helpers.ts` (yalnızca sunucuda kullanım; format aynı)
- `package.json` (presigner paketi)
- `next.config.ts` (CSP connect-src)

**Değişmemesi gereken dosyalar:**

- `villa-image.mutations.ts` (`addVillaImage`)
- `villa-image.delete.ts`
- `villa-image.read.ts`
- `lib/storage/cdn.config.ts`
- `storage.constants.ts`
- `villas-cache-invalidation.server.ts`
- `/api/admin/storage/upload` ve `/remove` route'ları (diğer ekranlar kullanıyor)
- Diğer upload ekranları

**Geçiş sırası:**

1. Hazırlık (CORS/CSP)
2. Sunucu tarafı (henüz kullanılmayan)
3. Flag'li galeri istemcisi
4. Gözlem
5. Orphan temizliği
6. İsteğe bağlı paralel/toplu iyileştirme
7. Galeri için eski yolun kaldırılması
