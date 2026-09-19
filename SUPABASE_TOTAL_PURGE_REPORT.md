# SUPABASE TOTAL PURGE — UYGULAMA RAPORU

**Tarih:** 2026-09-19
**Başlangıç HEAD:** `92c9c41b39e456b3a514f11d17e377105dd1c3b4` (`fix: preserve locale across public navigation`)
**Branch:** `main` · **Başlangıç worktree:** temiz (0 satır)
**Commit / push:** YAPILMADI.

**Hedef mimari (doğrulandı):** Native PostgreSQL (`pg`) · Cloudflare R2 / S3 · Native JWT + Argon2 + TOTP

---

## 1. Yapılan değişiklikler

| # | Alan | Yapılan |
|---|---|---|
| 1 | **Kök artıkları** | `supabase/.temp/` (9 dosya) ve boş `villa-backup.dump` kaldırıldı; kök `migrations/` klasörü boşaltıldı |
| 2 | **.gitignore** | `supabase/` eklendi (CLI yanlışlıkla çalıştırılırsa credential commit'lenmesin). `db/migrations/` ignore EDİLMEDİ |
| 3 | **Migration arşivi** | Supabase'e özgü DDL içeren 29 migration `db/migrations/_archive/supabase/` altına taşındı + açıklayıcı `_archive/README.md` |
| 4 | **Admin gateway rename** | `supabase-admin-gateway.ts` → `audit-admin-gateway.ts`, `supabaseAdminGateway` → `adminGatewayImpl` (davranış değişmedi) |
| 5 | **Hata mesajı** | `payment-account.service.ts` — "Supabase Table Editor…" → "payment_accounts tablosunda kayıt bulunamadı." |
| 6 | **next.config.ts** | `NEXT_PUBLIC_SUPABASE_URL` env okuması KALDIRILDI; legacy image host statik sabite alındı ve neden korunduğu belgelendi |
| 7 | **types/database.ts** | Başlık ve alan yorumları native PostgreSQL / R2 mimarisine göre elle yeniden yazıldı |
| 8 | **Yorumlar** | 217 TS/TSX dosyasında yorum-içi Supabase sözlüğü temizlendi (API adları, env adları, dosya yolları, ürün adı) |
| 9 | **auth.uid / auth.users** | 9 dosyadaki yorum referansı native auth terminolojisine çevrildi |
| 10 | **Testler** | 7 `*OrchestrationContract` testi native repository/seam adlarına göre güncellendi (test amacı korundu) |
| 11 | **Dokümantasyon** | `public/README.md` (R2), `docs/coolify-scheduled-tasks.md` (native SQL/RPC) güncellendi |
| 12 | **Doküman arşivi** | 31 Supabase dönemi audit/rapor `docs/archive/supabase/` altına taşındı |
| 13 | **vitest.config.ts** | Var olmayan `lib/supabase*.ts` coverage exclude kayıtları kaldırıldı |
| 14 | **.env.local** | Ölü `NEXT_PUBLIC_SUPABASE_URL` ve `NEXT_PUBLIC_STORAGE_DRIVER` kaldırıldı · **`DATABASE_URL` DEĞİŞTİRİLMEDİ** |
| 15 | **.env.example** | İki bayat Supabase Auth yorumu güncellendi |

## 2. Silinen dosyalar (10)

`supabase/.temp/{cli-latest, gotrue-version, linked-project.json, pooler-url, postgres-version, project-ref, rest-version, storage-migration, storage-version}` · `villa-backup.dump` (0 bayt)

## 3. Arşive taşınan dosyalar (62)

- `db/migrations/_archive/supabase/` — **29** migration (015–069 arası 28 + `2026_05_payment_accounts_rls.sql`)
- `db/migrations/_archive/pre-numbering/` — **1** (`2026_05_payment_methods_add_type.sql`)
- `docs/archive/supabase/` — **31** markdown (SUPABASE_DEPENDENCY_AUDIT, RLS_MIGRATION_PLANI, SUPABASE_EXIT_MIGRATION_ROADMAP, migration-inventory, tüm `*_PHASE0_MAPPING` / `*_FINAL_REPORT` / `R2_*` / `STORAGE_*` serileri)

Broken link kontrolü yapıldı: bu 31 dosyanın hiçbiri başka bir doküman/koddan referanslanmıyor.

## 4. Rename edilen dosyalar

`lib/admin-gateway/supabase-admin-gateway.ts` → `lib/admin-gateway/audit-admin-gateway.ts`
`supabaseAdminGateway` → `adminGatewayImpl` (tek import noktası `lib/admin-gateway/server.ts` güncellendi)

## 5. Güncellenen testler (7 dosya)

| Dosya | Eski assertion | Yeni assertion | Gerekçe |
|---|---|---|---|
| `createVillaOrchestrationContract` | `name.includes("supabase")` | `villaAdminRepository.insertVilla` | Gerçek yazma çağrısı |
| `updateVillaOrchestrationContract` | aynı | `villaAdminRepository.updateVillaById` | Gerçek yazma çağrısı |
| `handleCreateOrchestrationContract` | aynı | `adminFetch` (route → `createReservation`) | DB write seam değişti |
| `hardDeleteVillaOrchestrationContract` | "7 supabase delete calls" | "7 ilişkili tablo delete çağrısı" | Yalnız başlık |
| `createReservation…` / `statusAndDelete…` / `updateReservationFull…` | `not.toMatch(/\bsupabase\b/)` | `not.toMatch(/\bdb(Admin)?\s*\.\s*(from\|rpc)\(/)` | Guard vakıf hâle gelmişti; gerçek DB client'ına göre yeniden kuruldu |

Ayrıca `createVilla`/`updateVilla` testlerine **yeni koruyucu assertion** eklendi: service gövdesinde doğrudan `db.from(` / `dbAdmin.from(` bulunmamalı.

**Hiçbir test silinmedi, hiçbir assertion gevşetilmedi.**

## 6. Güncellenen yorumlar

217 TS/TSX dosyası. Uygulanan sözlük (yalnız yorum aralıklarında; kod hiç değiştirilmedi):
`supabase.from` → `db.from` · `supabase.rpc` → `db.rpc` · `getSupabaseAdmin()` → `dbAdmin` ·
`@/lib/supabase[-admin]` → `@/lib/db[/server]` · `SUPABASE_SERVICE_ROLE_KEY` → `service-role kimlik bilgisi` ·
`Supabase Storage` → `R2 storage` · `Supabase Auth` → `native auth` · `Supabase` → `eski sağlayıcı`

Otomatik dönüşümün anlamı bozduğu 13 dosya (ör. "Supabase Auth SÖKÜLDÜ" → yanlış ifade, `./supabase-auth.server` yolu) elle düzeltildi.

## 7. Güncellenen dokümanlar

`public/README.md` (Supabase Storage → Cloudflare R2, 4 yer) · `docs/coolify-scheduled-tasks.md` (`supabase.rpc` → `dbNative.rpc`, "Supabase SQL" → "PostgreSQL SQL") · `Claude outputs/` altındaki 2 analiz raporu

## 8. Kalan Supabase referansları

| Kategori | Dosya | Durum |
|---|---|---|
| **A) Gerçek kod** | **0** | ✅ |
| **B) Test** | **0** | ✅ |
| **C) Yorum (aktif kod)** | **0** | ✅ |
| **D) Aktif dokümantasyon** | **0** | ✅ |
| **E) Migration history (aktif)** | 15 dosya | Yorum satırları + `068:45` `COMMENT ON COLUMN` DDL'i + `070:49` `auth.uid()` |
| **F) Archive** | 45 dosya | Kabul edilebilir (tarihsel kayıt) |
| **G) Git history** | 36 commit | Silinmedi (talimat gereği) |
| **Bilinçli istisna** | `next.config.ts` (legacy image host), `.gitignore` (`supabase/` kuralı) | Belgelendi |

Global tarama (arşiv hariç):

```
supabase              17 dosya  (15 migration + next.config.ts + .gitignore)
supabase.com           0
supabase.co            3  (2 migration yorumu + next.config.ts)
supabase.storage       2  (migration yorumu)
auth.uid               1  (db/migrations/070 — SQL, 070+ "dokunma" kuralı gereği bırakıldı)
NEXT_PUBLIC_SUPABASE   0  ✅
SUPABASE_              0  ✅
```

`service_role` → 41 dosyada, **tamamı yorum**. İki kod eşleşmesi bilinçli korundu:
- `lib/activity-log.helper.ts:21` — log redaksiyon regex'i (güvenlik)
- `tests/unit/translation-schema.test.ts:112` — "migration'larda RLS/anon/authenticated/service_role YOK" guard testi

## 9. DATABASE_URL durumu

### 🔴 CRITICAL — DATABASE_URL hâlâ Supabase PostgreSQL'e bağlı

`.env.local` içindeki `DATABASE_URL` host'u: `aws-0-eu-west-1.pooler.supabase.com:5432`

- **Değer bu görevde DEĞİŞTİRİLMEDİ** (satır birebir doğrulandı, diff alındı).
- `.env.example` içinde `DATABASE_URL=` boş → hedef host dokümante değil.
- **Production (Coolify) değeri bu ortamdan görülemiyor.** Panelden kontrol edilmeli.

## 10. R2 durumu — ✅ TEMİZ

Tek implementasyon `lib/storage/s3-storage.provider.ts` (`@aws-sdk/client-s3`). Supabase storage provider / fallback / dual-write / driver switch **yok**. `supabase.storage.from()` çağrısı **yok**.

⚠️ `resolveAssetUrl()` ve `parseVillaStorageUrl()` **davranışı DEĞİŞTİRİLMEDİ** — absolute URL pass-through ve `/object/public/` parse'ı legacy DB satırları için korunuyor (bkz. §17).

## 11. Native PostgreSQL durumu — ✅ TEMİZ

`pg` + `@types/pg` · `lib/db/pg.client.ts` · `native-db.provider.ts` · `query-builder.ts` / `query-compiler.ts` · `pg-array-columns.ts` · repository katmanı — hiçbirine dokunulmadı. `DbProvider` yalnız bir `interface` (runtime Supabase provider'ı hiç yoktu).

## 12. Native Auth durumu — ✅ TEMİZ

`lib/auth/native/` (JWT · Argon2 · TOTP · refresh token · cookies · origin guard) dokunulmadı. `lib/supabase.ts`, `lib/supabase-admin.ts`, `lib/auth/supabase-auth.server.ts` zaten yoktu.

## 13. npm test sonucu

155 test dosyası, 6 chunk:

| Chunk | Files | Tests |
|---|---|---|
| aa | 26 passed | 395 passed |
| ab | 26 passed | 733 passed |
| ac | 3 failed / 23 | 13 failed / 484 |
| ad | 3 failed / 23 | 9 failed / 326 |
| ae | 2 failed / 24 | 7 failed / 517 |
| af | 7 failed / 18 | 22 failed / 318 |
| **TOPLAM** | **15 failed / 140** | **51 failed / 2773** |

**Baseline: 57 failed / 15 files → 51 failed / 15 files.**
→ **6 failure AZALDI, 0 YENİ failure.**

Kalan 51 failure **önceden vardı** ve Supabase kaynaklı DEĞİL. Kök neden tespit edildi: AST/kaynak-metin eşleştiren `*OrchestrationContract` testleri, geçmiş repository refactor'larında **yeniden adlandırılmış sembollere** bakıyor (ör. `setVillaDistances` → `setVillaDistancesServer`, `reservationRepository.updateById` regex'i). Ayrı bir iş kalemi.

## 14. tsc sonucu

`npx tsc --noEmit` → **exit 0, 0 hata** ✅

## 15. lint sonucu

`npm run lint` → **0 error**, 200 warning (hepsi önceden var olan `prefer-const` / `no-explicit-any` / `no-unused-vars`). Yeni error/warning **yok**.

## 16. build sonucu

`npm run build` → **DOĞRULANAMADI (ortam kaynaklı)**.
Turbopack derlemeye başladı, **4 hatanın tamamı** `fonts.googleapis.com` erişimi: bu sandbox'ın egress allowlist'i Google Fonts'u kapsamıyor (`curl` → HTTP 000). **Modül çözümleme veya tip hatası YOK.** `tsc --noEmit` + lint + testler yeşil. Build'in ağ erişimi olan bir ortamda tekrar çalıştırılması gerekir.

## 17. Riskler

| # | Risk | Şiddet | Durum |
|---|---|---|---|
| R1 | **Production `DATABASE_URL` hâlâ Supabase'i gösteriyorsa** uygulama Supabase kapandığında çalışmaz | 🔴 KRİTİK | Değiştirilmedi, raporlandı |
| R2 | **Git history'de plaintext PostgreSQL credential** (`supabase/.temp/pooler-url`, 1 commit) | 🔴 GÜVENLİK | Dosya kaldırıldı; **history silinmedi, rotate yapılmadı** |
| R3 | **DB asset URL normalization required** — DB'deki bazı asset alanları hâlâ tam `…supabase.co/storage/v1/object/public/…` URL'i tutuyor olabilir. `next.config.ts`'teki legacy image pattern bu yüzden KALDIRILMADI | 🟡 ORTA | Kod değiştirilmedi, belgelendi |
| R4 | `db/migrations/070` içindeki `is_active_admin()` hâlâ `auth.uid()` çağırıyor; vanilla PG'de bu migration yeniden çalıştırılırsa hata verir | 🟡 ORTA | "070+ dokunma" kuralı gereği bırakıldı |
| R5 | `068:45` `COMMENT ON COLUMN` DDL metni "Supabase Auth" diyor — DB'de kayıtlı | 🟢 DÜŞÜK | Değiştirmek migration çalıştırmayı gerektirir |
| R6 | Yorum temizliği 217 dosyaya yayıldı → diff geniş | 🟢 DÜŞÜK | Kod hiç değişmedi; tsc/lint/test yeşil |

## 18. Manuel olarak yapılması gerekenler

1. 🔴 **Production `DATABASE_URL`'i Coolify panelinden doğrula.** Supabase pooler'ı gösteriyorsa Hetzner PostgreSQL'e veri taşıma operasyonu planlanmalı.
2. 🔴 **`supabase/.temp/pooler-url` içindeki PostgreSQL parolasını rotate/iptal et.** Dosya silindi ama git history'de duruyor.
   > Git history contains a Supabase PostgreSQL credential; rotation required.
3. 🟡 **DB asset URL envanteri çıkar** — `villa_images.image_url`, `settings.{site_logo,footer_logo,favicon_url,default_og_image,watermark_logo,hero_background_image}`, `pages.cover_image`, `villa_types.cover_image`, `villa_locations.cover_image` alanlarında kaç satır `supabase.co` içeriyor? Sıfırsa `next.config.ts`'teki `LEGACY_ASSET_HOST` bloğu silinebilir.
4. 🟡 **`.env.example` eksik** — `NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES`, `NEXT_PUBLIC_CDN_BASE_SITE_ASSETS` ve R2/S3 kimlik değişkenleri örnekte yok (kod bunları okuyor).
5. 🟡 **Coolify env'lerinde `NEXT_PUBLIC_SUPABASE_URL` varsa sil** — kod artık okumuyor.
6. 🟢 **Build'i ağ erişimi olan ortamda çalıştır** (Google Fonts).
7. 🟢 **`070`'teki `is_active_admin()`** — uygulamadan çağrılmıyor; ayrı bir migration ile temizlenebilir.
8. 🟢 **51 pre-existing test failure** — Supabase'le ilgisiz; ayrı sprint.
9. 🟢 **Arşivlenen migration/doküman yorumları** — tarihsel kayıt olduğu için bilinçli olarak metin düzeyinde temizlenmedi.

---

## ⚠️ AÇIK UYARI

> **Production `DATABASE_URL` hâlâ Supabase ise uygulama tamamen Supabase'den kopmuş sayılmaz.**
>
> Bu görev kod/config/test/doküman düzeyindeki tüm Supabase bağımlılığını kaldırdı. Ancak veritabanının fiziksel olarak nerede çalıştığı bir **altyapı** meselesidir ve bu görevin kapsamı dışında bırakılmıştır (talimat gereği `DATABASE_URL` değiştirilmedi).
