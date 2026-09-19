# STORAGE MIGRATION — PHASE C EXECUTION PLAN (upload+delete → R2)

**Tarih:** 2026-06-07 · **Kapsam:** Uygulama planı (analiz-only; kod/commit/env YOK). Tüm bulgular dosyalardan doğrulandı.
**Mevcut (doğrulanmış):** READ = R2/CDN aktif (Faz B, `index.ts` getPublicUrl CDN-aware) · UPLOAD = Supabase (`storageProvider.upload` = `supabaseStorageProvider.upload`) · DELETE = Supabase (`storageProvider.remove`).
**Hedef:** UPLOAD + DELETE = R2; Supabase Storage tamamen kapanabilir. Kısıt: sıfır veri kaybı / sıfır kırık görsel / sıfır upload kesintisi / sıfır rollback riski.

---

## 1) FAZ C DOSYA BAZLI DEĞİŞİKLİK PLANI

| Dosya | Durum | Neden | Risk | Rollback |
|-------|-------|-------|------|----------|
| `lib/storage/s3-storage.provider.ts` | **YENİ** | S3-compatible write/remove (server-only, AWS SDK v3) | MEDIUM | dosya kullanılmazsa etkisiz |
| `app/api/admin/storage/upload/route.ts` | **YENİ** | Server upload (`authorizeAdminCaller` + S3) + (opsiyonel) dual-write Supabase | HIGH | route kullanılmaz → eski path |
| `app/api/admin/storage/remove/route.ts` | **YENİ** | Server remove (`authorizeAdminCaller` + S3 DeleteObjects) | MEDIUM | route kullanılmaz → eski remove |
| `lib/storage/index.ts` | **DEĞİŞİR** | `upload`/`remove`'u driver-aware yap (r2→route/S3, supabase→mevcut). `getPublicUrl` AYNEN (Faz B) | HIGH | `STORAGE_DRIVER=supabase` |
| `lib/storage/cdn.config.ts` | **DEĞİŞMEZ** (veya +S3 write flag) | Faz B read config; write için server S3 env ayrı | LOW | — |
| `lib/storage/supabase-storage.provider.ts` | **DEĞİŞMEZ** | Rollback yedeği (upload/remove Supabase impl) | — | — |
| `lib/image.helpers.ts` (`convertImageToWebP`) | **DEĞİŞMEZ** | Browser WebP conversion korunur | — | — |
| `app/components/villa/AdminGallery.tsx` | **DEĞİŞMEZ*** | `storageProvider.upload/remove` çağırıyor; seam switch sayesinde dokunmaya gerek yok | LOW | — |
| SettingsField / types / locations / pages-new | **DEĞİŞMEZ*** | Aynı seam; ekran kodu sabit | LOW | — |
| `lib/admin-branding.ts` | **DEĞİŞMEZ*** | Aynı seam | LOW | — |
| `app/services/villa-image.service.ts` (`deleteVillaImage`) | **OLASI DEĞİŞİR** | Storage cleanup bugün client (anon); R2 remove server gerektirir → route'a çağrı | MEDIUM | eski client remove |
| `app/services/villa-admin/_helpers/storage-cleanup.ts` | **DEĞİŞMEZ** | `storageProvider.remove` çağırıyor (server); seam switch yeterli | LOW | — |
| `lib/villa-image.helpers.ts` (`removeVillaStorageFiles`, `parseVillaStorageUrl`) | **DEĞİŞMEZ** | `storageProvider.remove`'a delege; parse Faz B'de CDN-aware | LOW | — |
| `next.config.ts` | **DEĞİŞMEZ** | CDN host'ları Faz B'de eklendi | — | — |

> *`*`: Seam (`storageProvider.upload/remove`) driver-aware yapılırsa **upload ekranlarına dokunmaya gerek kalmaz** — en düşük riskli yol budur. AdminGallery/SettingsField vb. `storageProvider.upload`'ı çağırmaya devam eder; davranış driver'a göre route'a/Supabase'e gider.

---

## 2) UPLOAD MIGRATION TASARIMI

Bugünkü akış (doğrulanmış): browser `convertImageToWebP` → `storageProvider.upload(bucket, path, blob, opts)` → `supabase.storage.from().upload()` (anon + Storage RLS). DB'ye relative path.

| Kriter | A) Browser→Supabase (mevcut) | B) Browser→Presigned→R2 | C) Browser→API Route→R2 |
|--------|------------------------------|--------------------------|--------------------------|
| Güvenlik | Storage RLS; vendor-özel | İyi (kısa-TTL presigned) | **En iyi** (secret serverda, `authorizeAdminCaller`) |
| Bakım | Düşük ama vendor-kilitli | Orta (presign + bucket CORS) | **Düşük** (tek route, CORS yok) |
| Performans | Direct | **En iyi** (direct, sunucu baypas) | Orta (sunucudan geçer; ~150KB WebP'de ihmal) |
| Hata ayıklama | Orta (RLS opak) | Orta (presign+CORS+PUT) | **En iyi** (tek server log) |
| Rollback | — | env + route | env + route |
| Vendor bağımsızlığı | **Yok** (Supabase'e özgü) | Yüksek (S3 std) | Yüksek (S3 std) |

**ÖNERİ: C (Browser → API Route → R2).**
**Gerekçe (koddan):** Upload admin-only, dosyalar `convertImageToWebP` ile ~150KB WebP'ye küçültülmüş, frekans düşük (7 nokta, hepsi admin paneli). C; mevcut `authorizeAdminCaller` (`lib/admin-route-auth.ts`) pattern'iyle en güvenli, CORS/presign karmaşıklığı yok, tek noktada loglanır, tam vendor-bağımsız (S3 SDK). **Browser WebP conversion KORUNUR** (`lib/image.helpers.ts` dokunulmaz); yalnız son blob route'a POST edilir. Presigned (B) yalnız ileride büyük dosya/yüksek hacim gelirse; seam aynı kaldığı için sonradan yükseltilebilir.

---

## 3) DELETE MIGRATION TASARIMI

Bugünkü delete (doğrulanmış):
- `deleteVillaImage` (villa-image.service L166, **client/anon**): DB delete → `removeVillaImageByUrl` → `parseVillaStorageUrl` → `removeVillaStorageFiles` → `storageProvider.remove`.
- `hardDeleteVilla` (hard-delete.service L56, **server**): `cleanupVillaStorageForHardDelete` → `removeVillaStorageFiles` → `storageProvider.remove`.
- AdminGallery rollback (L374, **client**): `storageProvider.remove(VILLA_IMAGES, [fileName])`.

**R2'ye taşıma:**
- `storageProvider.remove` driver=r2 iken **server remove route**'a (S3 `DeleteObjects`) gider. `supabase-storage.provider.remove`'daki **3x retry + idempotent "not found"** semantiği (L84-130) S3 provider'da birebir korunmalı.
- **hardDelete + AdminGallery rollback:** `storageProvider.remove` çağırdıkları için seam switch yeterli; hardDelete zaten server.
- **`deleteVillaImage`:** Storage cleanup'ı bugün **client/anon**. R2 remove **server secret** gerektirir → bu fonksiyonun storage adımı remove **route**'una çağrı yapmalı (DB delete adımı değişmez). Best-effort + orphan-log davranışı (L205-218) korunur.

**Analiz:**
- **Retry:** `supabaseStorageProvider.remove` 3 deneme / 200ms-400ms backoff → S3 provider aynı sabitlerle.
- **Idempotent:** "not found" → success (L113-119) → S3 `DeleteObjects` zaten eksik key'de hata vermez → idempotent doğal.
- **Orphan riski:** Bugün best-effort (DB öncelikli, orphan log). Faz C'de **çift kaynak orphan'ı**: dual-write açıksa silme de **çift** olmalı (R2+Supabase) yoksa Supabase'de orphan kalır (decommission'da temizlenir). Cover/logo silme çağrısı yok → overwrite; eski path slug değişiminde orphan (mevcut, kabul).

---

## 4) DUAL WRITE GEREKLİ Mİ?

| | Strateji 1 — Doğrudan flip (Upload→R2) | Strateji 2 — Dual write (R2+Supabase, 1-2 hafta) |
|---|---|---|
| Veri kaybı riski | Rollback'te R2-yazılanlar Supabase'de YOK → **eksik görsel** | **Sıfır** (her dosya iki tarafta) |
| Rollback güvenliği | Zayıf (env geri alınsa veri eksik) | **Güçlü** (env geri al → Supabase'de mevcut) |
| Karmaşıklık | Düşük | Orta (route iki hedefe yazar) |
| Maliyet | Düşük | Düşük (sistem küçük) |
| Decommission | Hemen riskli | Gözlem sonrası güvenli |

**Sistem boyutu (doğrulanmış):** 2433 dosya / 394 MB, admin-only, düşük upload frekansı.
**ÖNERİ: Strateji 2 (Dual Write, 1-2 hafta).** Kullanıcı "sıfır rollback riski + sıfır veri kaybı" istediği için, küçük sistemde dual-write ucuz sigortadır: flip sonrası bir sorun çıkarsa `STORAGE_DRIVER=supabase`'e dönüş **veri eksiği olmadan** çalışır. Gözlem penceresi sonunda Supabase write/dual kapatılır. (Read zaten R2; dual yalnız write+delete için.)

---

## 5) STORAGE_DRIVER ANALİZİ (Faz B implementasyonu — doğrulanmış)

Mevcut `lib/storage/index.ts` (Faz B):
```
storageProvider.getPublicUrl → resolveCdnPublicUrl (r2) ?? supabase getPublicUrl   ✅ read switch
storageProvider.upload  = supabaseStorageProvider.upload    ⟵ HARD-WIRED Supabase
storageProvider.remove  = supabaseStorageProvider.remove    ⟵ HARD-WIRED Supabase
```

**Faz C'de yapılması gerekenler (dosya bazında):**
- **upload switch:** `index.ts` → `upload` driver-aware olmalı:
  `STORAGE_DRIVER=r2` → `s3StorageProvider.upload` (server) / route; `supabase` → mevcut. Dual-write modunda r2 yazımı + best-effort Supabase yazımı.
- **remove switch:** `index.ts` → `remove` driver-aware: r2 → S3 DeleteObjects; supabase → mevcut. Dual-write modunda iki taraf.
- **read layer bozulur mu?** **Hayır.** `getPublicUrl` mantığı değişmiyor; yalnız upload/remove dallanıyor. Faz B read switch'i izole.
- **rollback gerçekten çalışır mı?** Evet — `STORAGE_DRIVER=supabase` → upload/remove/read tümü Supabase. ⚠️ **`NEXT_PUBLIC_*` build-time inline** → flip/rollback **redeploy** ister (hot değil). ⚠️ Dual-write YOKsa rollback'te R2-yazılan dosyalar Supabase'de eksik → **dual-write şart**.
- **Server secret:** Upload/remove route S3 credential'ı **server-only env** (`S3_*`, NEXT_PUBLIC değil) kullanır; client yalnız route'u çağırır.

---

## 6) PRODUCTION GEÇİŞ SIRASI

| Adım | Aksiyon | Risk | Test | Rollback |
|------|---------|------|------|----------|
| 1 | `s3-storage.provider.ts` (write/remove) + upload/remove route (`authorizeAdminCaller`+S3), **default OFF** | LOW (pasif) | route'a manuel POST (staging) → R2'de obje | dosya/route kullanılmaz |
| 2 | `index.ts` upload/remove driver-switch + **dual-write** modu ekle (default supabase) | MEDIUM | unit/staging: driver=supabase → davranış aynı | env supabase |
| 3 | **Staging** `STORAGE_DRIVER=r2` + dual-write: 7 upload + 3 delete (galeri/hardDelete/cover) tam test | MEDIUM | yeni upload R2+Supabase'de; render CDN; silme iki tarafta | env supabase |
| 4 | Production **dual-write** aç (`STORAGE_DRIVER=r2`, write R2+Supabase) | MEDIUM | canlı upload → iki tarafta; CDN render; Sentry temiz | env supabase (redeploy) |
| 5 | Gözlem penceresi 1-2 hafta (upload/delete/orphan log izle) | LOW | hata oranı sıfır; orphan log yok | env supabase |
| 6 | Dual-write KAPAT (yalnız R2 write) | MEDIUM | upload yalnız R2; render CDN | dual-write geri aç |
| 7 | Supabase Storage **decommission** (RLS + bucket) | HIGH (geri dönülmez) | site tam tarama | — (artık geri yok; 6'ya kadar ertelenebilir) |

---

## 7) EXIT READINESS (Faz C tamamlanınca — hedef)

| Katman | Faz B sonrası | Faz C sonrası (hedef) |
|--------|--------------:|----------------------:|
| Data Layer | 95 | **95** (relative path; provider-bağımsız) |
| Read Layer | 88 | **92** (CDN; villa-zip resolve fix) |
| Upload Layer | 55 | **90** (server S3 route + authorizeAdminCaller) |
| Delete Layer | 60 | **88** (server S3 DeleteObjects + retry/idempotent) |
| Config Layer | 70 | **85** (driver switch + S3 server env) |
| Rollback | 90 | **85** (dual-write güçlü; ama NEXT_PUBLIC rebuild + decommission geri dönülmez) |
| **GENEL** | ~80 | **~89** |

**Karar:** Faz C **uygulanıp**, **dual-write gözlem penceresi (Adım 4-5) sorunsuz tamamlandıktan sonra** → "**Supabase Storage'ı kapatmaya HAZIR**". Faz C öncesinde veya gözlem öncesinde → "**HAZIR DEĞİL**" (upload/delete hâlâ Supabase; flip rollback'i dual-write olmadan veri-eksik).

---

## EN KRİTİK 3 NOKTA
1. **Seam yeterli:** upload/remove `index.ts`'te driver-aware yapılırsa **7 upload ekranı + storage-cleanup + AdminGallery rollback dokunulmadan** taşınır (yalnız `deleteVillaImage`'in client storage adımı route'a bağlanmalı).
2. **Dual-write şart:** "sıfır rollback riski" için flip'te R2+Supabase çift yazım; aksi halde rollback'te R2-yazılanlar Supabase'de eksik.
3. **Rollback hot değil:** `NEXT_PUBLIC_STORAGE_DRIVER` build-time inline → her flip/rollback redeploy ister; decommission (Adım 7) geri dönülmez, gözlem sonrası yapılmalı.

*Bu rapor yalnız plandır; hiçbir kod, dosya, env veya yapılandırma değiştirilmemiştir.*
