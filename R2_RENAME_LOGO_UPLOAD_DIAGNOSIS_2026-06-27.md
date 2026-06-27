# R2 Bucket Rename — Logo Upload Teşhis Raporu
**Tarih:** 2026-06-27 · **Kapsam:** Sadece teşhis (kod/dosya değiştirilmedi)

Eski → Yeni bucket:
`site-assets` → `yazvillam-site-assets` · `villa-images` → `yazvillam-villa-images`

---

## 0. Tek cümlelik özet
Kodda bucket adı **tek bir sabitten** (`STORAGE_BUCKETS`) türüyor ve bu sabitin değeri, R2'ye giden S3 `PutObjectCommand({ Bucket })` parametresinin **birebir kendisi**. Buketler R2'de yeniden adlandırıldı ama sabit hâlâ **eski** adları tutuyor → upload R2'de `NoSuchBucket` alıyor → logo yüklenmiyor.

---

## 1. Eski bucket ismi kalan dosyalar (tam liste)

### A. FONKSİYONEL — gerçekten davranışı etkileyen (öncelik)
| # | Dosya | Satır | Ne |
|---|-------|-------|-----|
| 1 | `lib/storage/storage.constants.ts` | 18, 21 | **KÖK KAYNAK.** `VILLA_IMAGES:"villa-images"`, `SITE_ASSETS:"site-assets"`. Bu değer hem CDN map key'i hem de R2'ye giden bucket adı. |
| 2 | `app/(admin)/maki-admin/blog/BlogPostForm.tsx` | 98 | **Hardcoded literal:** `fd.append("bucket","site-assets")` — sabiti kullanmıyor, elle eski isim yazılmış. |
| 3 | `app/components/admin/villa-form/RichTextEditor.tsx` | 122 | **Hardcoded literal:** `fd.append("bucket","villa-images")` — aynı sorun. |
| 4 | `app/api/admin/storage/upload/route.ts` | 43–46 | Allow-list `ALLOWED_BUCKETS` sabitten türüyor → eski isimleri bekliyor (yeni isim gelse "Geçersiz bucket" reddeder). |
| 5 | `app/api/admin/storage/remove/route.ts` | 31–34 | Aynı allow-list (remove tarafı). |

### B. SABİTE BAĞLI — otomatik miras alır (kendileri eski string içermez, #1 düzelince düzelir)
`lib/storage/cdn.config.ts` (CDN_BASES key'leri), `lib/storage.helpers.ts` (`SITE_ASSETS_BUCKET`), `lib/villa-image.helpers.ts` (`VILLA_IMAGES_BUCKET`), `lib/admin-branding.ts` (`ADMIN_BRANDING_BUCKET`), `lib/storage/storage.service.ts`, `lib/storage/supabase-storage.provider.ts`, `lib/storage/s3-storage.provider.ts`, `lib/storage/index.ts`, `next.config.ts` (CDN host türetimi). → Hepsi `STORAGE_BUCKETS` üzerinden gider.

### C. FONKSİYONEL DEĞİL — yorum / dokümantasyon / SQL migration / types
`types/database.ts`, `db/migrations/*.sql`, tüm `*_2026-06-07.md` audit dosyaları, `public/README.md`, `app/api/admin/pages/route.ts` (yorum), `settings.service.ts` (yorum), `webmaster/page.tsx` (UI metni), `settings/genel/page.tsx` (hint metni). → Davranışı etkilemez; sadece tutarlılık için sonradan güncellenebilir.

---

## 2. Risk puanı: **8 / 10**
Düzeltmesi kısa (tek sabit) ama: (a) aynı sabit hem Supabase hem R2 için kullanılıyor — yalnız R2 yeniden adlandırıldı, bu yüzden kör değişiklik diğer provider'ı kırabilir; (b) 2 yerde sabit baypas edilip elle string yazılmış; (c) CDN custom-domain bağının yeni bucket'a taşınmış olması gerekir. Yanlış düzeltme upload + render'ı topluca bozabilir.

---

## 3. En olası root cause
**`storage.constants.ts` içindeki eski bucket adları, write=R2 yolunda doğrudan S3 `Bucket` parametresi olarak R2'ye gidiyor.**

Logo upload akışı baştan sona:
1. `SettingsField` / `uploadAdminBranding` → `storageProvider.upload(STORAGE_BUCKETS.SITE_ASSETS, path, blob)` → bucket = `"site-assets"`.
2. `lib/storage/index.ts`: `isR2WriteEnabled()` (`NEXT_PUBLIC_STORAGE_WRITE_DRIVER=r2`) + browser ise → `routeUpload` → `POST /api/admin/storage/upload` (FormData `bucket="site-assets"`).
3. Route: allow-list eski adı kabul eder → `s3StorageProvider.upload("site-assets", ...)`.
4. `s3-storage.provider.ts`: `PutObjectCommand({ Bucket: "site-assets" })` → R2'de bu bucket **yok** (artık `yazvillam-site-assets`) → **`NoSuchBucket`** → `{ ok:false }` → route **502** → admin panel "yüklenmiyor".

"Görünmüyor" kısmı ikincil: dosya hiç yazılamadığı için yeni logo render edilemiyor. (Okuma URL'i `assets.villayagel.com/branding/...` bucket adını içermez; eski logolar custom-domain yeni bucket'a bağlıysa görünmeye devam eder.)

**Soru bazında:**
- Hardcoded eski isim? → **Evet:** `storage.constants.ts` (kök) + BlogPostForm.tsx + RichTextEditor.tsx.
- Env eski bucket/CDN mi? → CDN base env'leri **domain** (`assets.villayagel.com`), bucket adı içermez; muhtemelen etkilenmedi. **Asıl bağ env değil, kod sabiti.** (Doğrula: `NEXT_PUBLIC_STORAGE_WRITE_DRIVER`, `S3_ENDPOINT`, custom-domain binding.)
- Allow-list eski mi bekliyor? → **Evet**, sabitten türediği için eski isimleri bekliyor.
- Upload başarılı ama resolve URL mi yanlış? → **Hayır**, upload'ın kendisi 502 ile başarısız (NoSuchBucket). Resolve URL ikincil.
- Delete/overwrite path conflict? → Path conflict yok; ama remove/route da aynı eski bucket adını R2'ye yollar → silme/overwrite de aynı sebepten sessizce başarısız olur.

---

## 4. Minimum düzeltme planı (kod yazılmadı — adımlar)
1. **Önce aktif sürücüyü doğrula** (env): `NEXT_PUBLIC_STORAGE_WRITE_DRIVER`, `NEXT_PUBLIC_STORAGE_DRIVER`, `NEXT_PUBLIC_STORAGE_DUAL_WRITE`, `S3_ENDPOINT` ve R2 custom-domain'in yeni bucket'a bağlı olup olmadığı.
2. **Eğer tamamen R2'ye geçilmişse** (Supabase artık kullanılmıyor, dual-write kapalı): **tek değişiklik** → `storage.constants.ts`'teki iki değeri `yazvillam-villa-images` / `yazvillam-site-assets` yap. Sabite bağlı tüm modüller (B listesi) otomatik düzelir.
3. **Eğer Supabase hâlâ devredeyse** (dual-write açık veya read/write=supabase fallback): tek sabit yetmez — aynı sabit Supabase bucket adını da besler ve Supabase tarafı yeniden adlandırılmadı. Bu durumda provider başına ayrı bucket eşlemesi gerekir (R2 adı ≠ Supabase adı) **veya** Supabase bucket'larını da aynı adla yeniden adlandır. (Bu artık "minimum"un ötesi — önce env'i netleştir.)
4. **Sabiti baypas eden 2 literal'i sabite çevir:** `BlogPostForm.tsx:98` ve `RichTextEditor.tsx:122` → elle `"site-assets"/"villa-images"` yerine `STORAGE_BUCKETS.*`. Aksi halde allow-list güncellense bile bu iki akış uyumsuz kalır.
5. **NEXT_PUBLIC_ uyarısı:** write/read driver flag'leri `NEXT_PUBLIC_` → build-time inline. Sabit/flag değişikliği **yeniden build + deploy** gerektirir; runtime env değişimi yetmez.
6. **Render doğrulaması:** R2 custom-domain (`assets.villayagel.com`) yeni `yazvillam-site-assets` bucket'ına bind edilmiş mi? Edilmemişse upload düzelse de görünmez.
7. **Smoke test:** logo upload (settings/genel) → 200 + R2'de obje → public URL render; sonra remove yolunu da test et (aynı NoSuchBucket riski).
