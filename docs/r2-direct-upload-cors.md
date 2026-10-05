# R2 — Villa galerisi direct upload (CORS + env)

Villa galerisi görselleri artık tarayıcıdan **doğrudan** Cloudflare R2'ye yüklenir:

```
Browser → POST /api/admin/villas/{id}/gallery/upload-url   (küçük JSON; auth + "villas" izni)
        ← { uploadUrl (imzalı, 120 sn), key (sunucu üretir) }
Browser → PUT uploadUrl  (WebP dosya — VPS'ten GEÇMEZ)
Browser → server action addGalleryImage(villaId, key)       (key/villa + HeadObject doğrulaması → DB)
```

## 1. R2 bucket CORS (Cloudflare panel → R2 → `tatilinyeri-villa-images` → Settings → CORS Policy)

Tarayıcının imzalı adrese `PUT` atabilmesi için **yalnız bu bucket'a** şu kural eklenmeli
(`ORIGIN` = admin panelinin açıldığı tam origin, örn. `https://www.alanadi.com`; birden fazla
domain/staging varsa her biri ayrı satır):

```json
[
  {
    "AllowedOrigins": ["https://ORIGIN"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

- `GET` eklemeye gerek yok: görseller CDN custom domain'inden okunur (değişmedi).
- `*` origin KULLANMAYIN.
- `Content-Length`'i tarayıcı kendisi gönderir; CORS'ta listelemek gerekmez.

## 2. Env

Yeni env YOK. Mevcutlar kullanılır: `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, `NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES`.

- Admin CSP (Report-Only) `connect-src`'ye `S3_ENDPOINT` origin'i eklenir. `next.config.ts`
  headers build sırasında hesaplandığı için `S3_ENDPOINT` **build ortamında da** tanımlı olmalı
  (tanımsızsa yalnız CSP ihlal raporu üretilir; Report-Only olduğu için upload engellenmez).
- R2 API token'ının bu bucket'a **Object Read & Write** yetkisi olmalı (HeadObject + imzalı PUT).

## 3. Güvenlik özeti

- Object key istemciden alınmaz; sunucu üretir (`villas/{slug}__{id8}/gallery-NNNN-xxxx.webp`).
- İmzalı adres 120 sn geçerli; `Content-Type: image/webp` ve `Content-Length` imzaya dahil
  (boyut üst sınırı 10 MB).
- DB kaydından önce key'in villaya ait olduğu ve nesnenin R2'de var olduğu (HeadObject) doğrulanır.
- Kayıt başarısızsa yeni nesne sunucuda silinir; istemcinin mevcut rollback'i de çalışır.

## 4. Kapsam

Yalnız villa galerisi (`AdminGallery`). `/api/admin/storage/upload` route'u diğer admin ekranları
(blog, sayfalar, ayarlar, kategori/lokasyon kapakları, editör, branding) için AYNEN duruyor.
