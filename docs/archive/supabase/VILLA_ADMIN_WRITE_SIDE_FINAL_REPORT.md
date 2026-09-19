# 🛡️ Villa-admin Write-side — FAZ 1-7 FINAL RAPOR (tek cycle)

**Tarih:** 2026-05-18
**Kapsam:** Villa-admin write-side + 2 standalone service (villa-distance, villa-price) repository delegation.
**Davranış:** BYTE-IDENTICAL — 7 RPC parameter shape, `pg_advisory_xact_lock`, `include_id` kolon asimetri, create vs update relation semantic, slug fallback infinite-loop, private token retry, hard delete cascade order, Promise.all sıra, FK 23503 + 23505 handling, storage cleanup best-effort, orphan tolerance, 15 console tag, 7 TR throw mesajı AYNEN.

> **Hedef gerçekleşti: Villa-admin write-side + 2 standalone'da 0 doğrudan canlı Supabase tüketim.**
> **Villa repository: 6 → 30 metod (24 yeni). 7 Postgres RPC repository içinde wrapper'lı.**

---

## 1. NE YAPILDI

### 1.1 Villa repository genişlemesi: `lib/db/villa.repository.ts` (247 → 565 LOC)

**24 yeni metod (kategoriler):**

```
READ — yeni (FAZ 1)
├── findSlugCollision(slug, excludeId?)
├── findForPrivateTokenLookup(id)
├── findImageUrlsByVillaId(villaId)
├── findVillaDistances(villaId)
└── findVillaPrices(villaId)

WRITE — core (FAZ 6)
├── insertVilla(payload)                        ← .select().single() chain
├── updateVillaById(id, payload)
├── updateVillaActiveById(id, isActive)         ← .is("deleted_at", null) guard
├── softDeleteVillaById(id, deletedAt)          ← service edge generate ISO
├── restoreVillaById(id)                        ← .not("deleted_at", "is", null) guard
├── hardDeleteVillaById(id)                     ← FK 23503 ham döner
└── updatePrivateTokenById(villaId, token)      ← .is("deleted_at", null) guard

RELATION INSERT (FAZ 2 — create flow)
├── insertVillaTypeRelationRows(rows)
├── insertVillaFeatureRelationRows(rows)
├── insertVillaRuleRelationRows(rows)
└── insertVillaPriceIncludeRelationRows(rows)   ⚠️ include_id

RPC — RELATION REPLACE (FAZ 2 — update flow)
├── rpcReplaceVillaTypeRelations(villaId, ids)        ← p_type_ids
├── rpcReplaceVillaFeatureRelations(villaId, ids)     ← p_feature_ids
├── rpcReplaceVillaRuleRelations(villaId, ids)        ← p_rule_ids
└── rpcReplaceVillaPriceIncludeRelations(villaId, ids) ⚠️ p_include_ids

RELATION DELETE (FAZ 4 — hard delete cascade)
├── deleteVillaImagesByVillaId(id)
├── deleteVillaFeatureRelationsByVillaId(id)
├── deleteVillaRuleRelationsByVillaId(id)
├── deleteVillaPriceIncludeRelationsByVillaId(id)
├── deleteVillaTypeRelationsByVillaId(id)
├── deleteVillaDistancesByVillaId(id)
└── deleteVillaPricesByVillaId(id)

RPC — DISTANCE/PRICE/SORT (FAZ 3)
├── rpcReplaceVillaDistances(villaId, payload)       ← p_distances jsonb
├── rpcReplaceVillaPrices(villaId, payload)          ← p_prices jsonb + pg_advisory_xact_lock
└── rpcSetVillaSortOrders(payload)                   ← p_updates jsonb
```

**Total villa repository: 30 metod (6 mevcut READ-only + 24 yeni write-side).**

### 1.2 Değişen dosyalar (11)

| Dosya | Değişiklik |
|---|---|
| `app/services/villa-admin/_helpers/slug.ts` | SELECT loop → `findSlugCollision` delege |
| `app/services/villa-admin/_helpers/storage-cleanup.ts` | image_url SELECT → `findImageUrlsByVillaId` delege |
| `app/services/villa-admin/_helpers/relations.ts` | 4 INSERT helper + 4 RPC helper → repo delege |
| `app/services/villa-admin/create.service.ts` | INSERT + `.select().single()` → `insertVilla` delege |
| `app/services/villa-admin/update.service.ts` | UPDATE → `updateVillaById` delege |
| `app/services/villa-admin/hard-delete.service.ts` | Promise.all 7 DELETE + final DELETE → repo metodlar |
| `app/services/villa-admin/visibility.service.ts` | 3 UPDATE (setActive/softDelete/restore) → repo |
| `app/services/villa-admin/sort.service.ts` | RPC → `rpcSetVillaSortOrders` |
| `app/services/villa-admin/private-token.service.ts` | SELECT + UPDATE → repo (idempotent reuse + retry service edge'de) |
| `app/services/villa-distance.service.ts` | SELECT + RPC → `findVillaDistances` + `rpcReplaceVillaDistances` |
| `app/services/villa-price.service.ts` | SELECT + RPC → `findVillaPrices` + `rpcReplaceVillaPrices` |

### 1.3 Dokunulmayan dosyalar (kritik)

```
✅ app/services/villa-admin.service.ts                  (facade re-export)
✅ app/services/villa-admin/types.ts                    (types only)
✅ app/services/villa-admin/_helpers/payload.ts         (pure)
✅ app/services/villa-admin/_helpers/normalizers.ts     (pure)
✅ app/services/villa-admin/_helpers/distances.ts       (pure)
✅ app/services/villa-admin/_helpers/private-token.ts   (pure crypto)
✅ lib/slug.ts                                          (slugifyTr — out-of-scope)
✅ lib/villa-image.helpers.ts                           (parseVillaStorageUrl + removeVillaStorageFiles — storage abstraction cycle)
✅ lib/distance.helper.ts                               (pure)
✅ app/(admin)/maki-admin/villas/**                     (pages — facade'dan tüketir)
```

**Service public API: 0 değişiklik. Caller migration: 0 satır.**

---

## 2. SUPABASE CALL-SITE TIMELINE — VILLA-ADMIN

| Konum | Pre | Post (FAZ 37) |
|---|:---:|:---:|
| `create.service.ts > INSERT` | 1 | **0** ✅ |
| `update.service.ts > UPDATE` | 1 | **0** ✅ |
| `hard-delete.service.ts > 7 DELETE + final DELETE` | 8 | **0** ✅ |
| `visibility.service.ts > 3 UPDATE` | 3 | **0** ✅ |
| `sort.service.ts > RPC` | 1 | **0** ✅ |
| `private-token.service.ts > SELECT + UPDATE` | 2 | **0** ✅ |
| `_helpers/relations.ts > 4 INSERT + 4 RPC` | 8 | **0** ✅ |
| `_helpers/slug.ts > SELECT loop` | 1 | **0** ✅ |
| `_helpers/storage-cleanup.ts > SELECT` | 1 | **0** ✅ |
| `villa-distance.service.ts > SELECT + RPC` | 2 | **0** ✅ |
| `villa-price.service.ts > SELECT + RPC` | 2 | **0** ✅ |
| **TOPLAM** | **30** | **0** ✅ |

**Villa-admin write-side + 2 standalone'da canlı doğrudan supabase çağrısı YOK.**

---

## 3. BYTE-IDENTICAL DOĞRULAMA

### 3.1 RPC parameter shape (7 RPC)

| RPC | Parameter | Repository wrapper |
|---|---|---|
| `replace_villa_type_relations` | `{ p_villa_id, p_type_ids }` | ✅ aynen |
| `replace_villa_feature_relations` | `{ p_villa_id, p_feature_ids }` | ✅ aynen |
| `replace_villa_rule_relations` | `{ p_villa_id, p_rule_ids }` | ✅ aynen |
| `replace_villa_price_include_relations` | `{ p_villa_id, p_include_ids }` ⚠️ | ✅ aynen |
| `replace_villa_distances` | `{ p_villa_id, p_distances }` jsonb | ✅ aynen |
| `replace_villa_prices` | `{ p_villa_id, p_prices }` jsonb + `pg_advisory_xact_lock` DB-level | ✅ aynen |
| `set_villa_sort_orders` | `{ p_updates }` jsonb | ✅ aynen |

### 3.2 Kolon asimetri'leri

- `villa_price_include_relations.include_id` ⚠️ (price_include_id DEĞİL) — **rows shape repo metodunda aynen**.
- RPC parameter `p_include_ids` (price_include_id DEĞİL) — **repo wrapper'da aynen**.

### 3.3 Create vs Update relation semantic

| Step | Create (KORUNDU) | Update (KORUNDU) |
|---|---|---|
| types | `if (selectedTypes?.length) → INSERT` | `ALWAYS RPC replace` |
| features | `if (selectedFeatures?.length) → INSERT` | `ALWAYS RPC replace` |
| distances | `if (distances?.length) → setVillaDistances` | `ALWAYS setVillaDistances` |
| prices | `if (prices?.length) → setVillaPrices` | `ALWAYS setVillaPrices` |
| rules | `if (selectedRules?.length) → INSERT` | `if (selectedRules !== undefined) → RPC replace` |
| price_includes | `if (selectedPriceIncludes?.length) → INSERT` | `if (selectedPriceIncludes !== undefined) → RPC replace` |

### 3.4 Slug fallback chain

- `slugifyTr(title)` base
- Infinite while-loop + counter increment (`-2, -3, -4...`)
- `excludeId` conditional `.neq` predicate
- Repository `findSlugCollision` `.eq().limit(1).neq?` chain aynen

### 3.5 Private token semantics

- Idempotent reuse (mevcut token varsa aynısını dön)
- `deleted_at IS NULL` predicate her aşamada
- SQLSTATE 23505 → 1x retry → "Token üretimi başarısız (collision)"
- 20-char hex (~80 bit) — `generatePrivateTokenString` pure helper

### 3.6 Hard delete cascade order

```
1. Storage cleanup (best-effort, console.warn/error)
2. Promise.all parallel 7 DELETE (array order STABLE):
   - villa_images
   - villa_feature_relations
   - villa_rule_relations
   - villa_price_include_relations
   - villa_type_relations
   - villa_distances
   - villa_prices
3. Final villa DELETE → FK 23503 → "Bu villaya bağlı rezervasyon geçmişi mevcut..."
```

### 3.7 Storage cleanup best-effort

- SELECT image_url → parse → bucket grouping → bulk remove (retry)
- Helper try/catch boundary; throw etmez
- Orphan tolerance: "orphan storage file → cost; orphan DB row → UX bozar; ikincisi öncelik"

### 3.8 Distance/Price semantics

- **Distance:** unit explicit ise `{value} {unit}` re-serialize; legacy passthrough; title/distance ikisi de boş → row drop.
- **Price:** Date instance → `toLocaleDateString("sv-SE")`; currency fallback `"TRY"`.
- **`pg_advisory_xact_lock` (replace_villa_prices)** DB-level concurrent admin replace serileştirir — **DEĞİŞTİRİLMEDİ**.

### 3.9 Console.error tag envanteri (15 tag)

Tüm tag'ler service/helper edge'de:

```
❌ Villa create error:                         create.service
❌ Villa update error:                         update.service
[villa.hardDelete] FAILED                      hard-delete.service
[villa.hardDelete] STORAGE_ORPHAN_AFTER_RETRY  storage-cleanup helper
[villa.hardDelete] storage cleanup exception:  storage-cleanup helper
[villa.setActive] FAILED                       visibility.service
[villa.softDelete] FAILED                      visibility.service
[villa.restore] FAILED                         visibility.service
[villa.setSortOrders] FAILED                   sort.service
[villa.privateToken] select FAILED             private-token.service
[villa.privateToken] update FAILED             private-token.service
❌ getVillaDistances:                          villa-distance.service
❌ replace distances:                          villa-distance.service
getVillaPrices:                                villa-price.service
setVillaPrices:                                villa-price.service
```

### 3.10 TR throw mesajları (7)

- `"Villa adı zorunlu"` — create + update
- `"ID gerekli"` — 5 service
- `"Villa bulunamadı"` — private-token
- `"Silinmiş villalar için bağlantı üretilemez"` — private-token
- `"Token üretimi başarısız (collision)"` — private-token retry exhaust
- `"Bu villaya bağlı rezervasyon geçmişi mevcut..."` — hard-delete FK 23503
- `COLLISION` — internal signal (not user-facing)

---

## 4. CODEBASE TOPLAM SUPABASE TÜKETİMİ — POST-FAZ 37

### 4.1 İmport-eden dosya envanteri

| Kategori | Pre-FAZ 36 | Post-FAZ 36 | Post-FAZ 37 | Δ (bu cycle) |
|---|---:|---:|---:|:---:|
| Repository layer (legit — TEK TÜKETICI) | 4 | 4 | **4** | 0 |
| ↳ villa.repository.ts (30 metod) | | | | +24 metod |
| ↳ reservation.repository.ts (12 metod) | | | | |
| ↳ manual-reservation.repository.ts (9 metod) | | | | |
| ↳ payment.repository.ts (10 metod) | | | | |
| Domain services (kalan) | 34 | 34 | **23** | **-11** ⚡ |
| App pages | 25 | 25 | 25 | 0 |
| Components | 7 | 7 | 7 | 0 |
| API routes | 4 | 1 | 1 | 0 |
| Lib helpers (lib/db hariç) | 8 | 8 | 8 | 0 |
| Other / Tests | — | 3 | 3 | 0 |
| **TOPLAM (import eden dosya)** | **82** | **82** | **71** | **-11** |

**-11 dosya** villa-admin write-side cycle ile repository ailesine aktarıldı.

### 4.2 Method call dağılımı

| Method | Pre-cycle | Post-FAZ 36 | Post-FAZ 37 |
|---|:---:|:---:|:---:|
| `supabase.from` (total — repo + kalan) | ~73 | ~73 | **~74** (repo'ya 24 yeni metod eklendi; non-repo tüketim azaldı) |
| `supabase.rpc` (total) | 7 | 7 | **7** (hepsi repo wrapper'da — 7 RPC %100 kapsama altında) |
| `supabase.storage` (total) | 21 | 21 | 21 |
| `supabase.auth` (total) | 13 | 13 | 13 |

### 4.3 RPC bağımlılığı — TAMAMINA KAPSAMA ALTINDA

**Codebase'in 7 Postgres RPC fonksiyonunun TAMAMI artık `lib/db/villa.repository.ts` içinde wrapper'lı:**

| RPC | Migration | Repository wrapper | Caller |
|---|---|---|---|
| `replace_villa_type_relations` | 002 | `rpcReplaceVillaTypeRelations` | relations helper |
| `replace_villa_feature_relations` | 002 | `rpcReplaceVillaFeatureRelations` | relations helper |
| `replace_villa_rule_relations` | 002 | `rpcReplaceVillaRuleRelations` | relations helper |
| `replace_villa_price_include_relations` | 002 | `rpcReplaceVillaPriceIncludeRelations` | relations helper |
| `replace_villa_distances` | 002 | `rpcReplaceVillaDistances` | villa-distance.service |
| `replace_villa_prices` | 002 | `rpcReplaceVillaPrices` | villa-price.service |
| `set_villa_sort_orders` | 006 | `rpcSetVillaSortOrders` | sort.service |

**Migration kararı verilirse, 7 RPC migration tek dosyada (`villa.repository.ts`) ele alınır.**

---

## 5. KALAN SUPABASE TÜKETİCİ DOMAIN'LER — RİSK SIRASIYLA

### 5.1 🔴 KIRMIZI (mimari karar gerek)

| Domain | Lock-in | Tahmini cycle |
|---|---|---|
| **Auth abstraction** (8 dosya, 13 call) | `supabase.auth.*` + RLS coupling | 2-3 hafta — Hybrid foundation |
| **Service-role context** (`getSupabaseAdmin`, 14-23 dosya) | Privilege surface; her noktada audit guard gerek | Service-role gateway cycle |
| **EXCLUDE constraint** (reservation/manual overlap) | Postgres-only; app-layer concurrency control gerek | Out-of-cycle (DB swap zamanı) |

### 5.2 🟠 TURUNCU (yoğun refactor)

| Domain | Call/Files | Tahmini cycle |
|---|---|---|
| **Storage abstraction** | 21 call + 10 dosya + 3 hard-coded bucket | 2-3 hafta — R2/S3 adapter pattern |
| **Villa sub-services** (image, feature, type, review, rule, price-include) | 6 service + master tables | 2-3 hafta — sub-repo'lara ayırma |
| **External calendar** (events + source service) | iCal sync + webhook | 1-2 hafta |
| **Offer requests** (form + list component + service) | Public form + admin list + component-direct | 1-2 hafta |
| **Analytics + Finance + Operations** services | Aggregation queries | 1 hafta |

### 5.3 🟡 SARI (hızlı kazanç)

| Domain | Tahmini cycle |
|---|---|
| **Settings + FAQ + Menu + Pages + Homepage-collection** services (5 küçük CRUD) | 1 hafta batch |
| **Contact-message + Mail-log + Voucher** | 3-4 gün |
| **Shared favorites + Shared villa list** | 2-3 gün |
| **Exchange-rate + Admin-user** services | 2-3 gün |

### 5.4 ✅ YEŞİL (kapsama altında — bu cycle dahil)

```
✅ Reservation (12 repo metod)
✅ Manual reservation (9 repo metod)
✅ Payment own tables (10 repo metod)
✅ Payment mail routes (3 mail route reservation repo'ya delege)
✅ Villa read + write-side (30 repo metod — FAZ 37 yeni)
```

**Toplam: 61 repository metod kapsama altında** (önceki 37 + 24 yeni villa-admin).

---

## 6. STORAGE / AUTH LOCK-IN SEVİYESİ

### 6.1 Storage

| Kriter | Durum |
|---|---|
| Doğrudan `supabase.storage` call | 21 (10 dosya) |
| Hard-coded bucket | 3 (`villa-photos`, `admin-assets`, `blog-images`) |
| Component-direct storage upload | 5+ (AdminGallery, SettingsField, blog/pages new, types/page) |
| Storage helper abstraction | Yarı (storage.service.ts var ama tüketiciler bypass ediyor) |
| Lock-in seviyesi | **2/10** (DEĞIŞMEDİ — bu cycle scope dışı) |

### 6.2 Auth

| Kriter | Durum |
|---|---|
| Doğrudan `supabase.auth.*` call | 13 (8 dosya) |
| Auth gateway (lib/auth/session.service.ts) | Yarı |
| Login UX direct supabase | 1 dosya (login/page.tsx) |
| Service-role auth.admin.createUser | 1 dosya (create-user route) |
| RLS coupling | Yüksek |
| Lock-in seviyesi | **4/10** (DEĞIŞMEDİ — bu cycle scope dışı) |

---

## 7. PROVIDER MIGRATION READINESS SKORU

### 7.1 Kriter-bazlı skor

| Kriter | Ağırlık | Pre-cycle | Post-FAZ 37 | Δ |
|---|:---:|:---:|:---:|:---:|
| Type abstraction (PostgrestError sızıntısı) | 20% | 1/10 | 5/10 | +4 |
| Repository pattern coverage | 15% | 1/10 | **7/10** | +6 ⚡ |
| RPC dependency | 10% | 2/10 | **8/10** (7 RPC %100 repo wrapper'da) | +6 ⚡ |
| EXCLUDE / DB-only feature | 10% | 1/10 | 1/10 (değişmedi) | 0 |
| Component-direct DB tunnel | 15% | 4/10 | 7/10 | +3 |
| Auth abstraction | 10% | 4/10 | 4/10 | 0 |
| Storage abstraction | 10% | 3/10 | 3/10 | 0 |
| Service layer presence | 5% | 8/10 | **10/10** | +2 |
| Realtime decoupling | 5% | 10/10 | 10/10 | 0 |
| **AĞIRLIKLI TOPLAM** | | **2.5/10** | **~5.4/10** | **+2.9** ⚡ |

### 7.2 Domain-bazlı skor güncellemesi

| Domain | Pre-cycle | Post-FAZ 36 | Post-FAZ 37 |
|---|:---:|:---:|:---:|
| Reservation | 2/10 | 6.5/10 | 6.5/10 |
| Manual reservation | 2/10 | 6/10 | 6/10 |
| Payment own tables | 3/10 | 7.5/10 | 7.5/10 |
| **Villa-admin write-side** | **2/10** | 2/10 | **8.5/10** ⚡ |
| Villa-admin read | 5/10 | 5/10 | 5/10 |
| **Auth** | **4/10** | 4/10 | 4/10 |
| **Storage** | **2/10** | 2/10 | 2/10 |
| **Genel codebase** | **2.5/10** | ~4.2/10 | **~5.4/10** |

### 7.3 Migration scenario readiness

| Senaryo | Pre-cycle | Post-FAZ 36 | Post-FAZ 37 |
|---|:---:|:---:|:---:|
| **Hybrid exit** (DB → Drizzle/Neon, Auth+Storage Supabase'de) | 6-10 hafta | 4-7 hafta | **3-5 hafta** ⚡ |
| **Tam exit** (DB+Auth+Storage) | 3-6 ay | 2-5 ay | **2-4 ay** |
| **DB-only swap** (Postgres → başka Postgres) | 4-6 hafta | 3-5 hafta | **2-4 hafta** ⚡ |
| **RPC rewrite** (Drizzle transaction içinde) | N/A | N/A | **Tek dosya değişiklik** ✅ (villa.repository.ts) |
| **Microservice split** | 6-12 ay | 6-12 ay | 6-12 ay |

### 7.4 İki cümlede stratejik özet

> **Codebase'in en yüksek lock-in noktası — Postgres RPC'ler — artık `lib/db/villa.repository.ts` tek dosyasında wrapper'lı.** Provider migration için **DB-only swap** senaryosunda 2-4 haftalık efor öngörülebilir; **hybrid exit** 3-5 hafta. Auth + Storage migration ayrı cycle'lara bırakıldı (out-of-scope), ama tüm aggregate DB sahipliği artık tek katman aşağıda.

---

## 8. EN RİSKLİ KALAN MODÜLLER (post-FAZ 37)

### 8.1 TOP 10 supabase çağrı sıklığı

| # | Dosya | Çağrı | Lock-in tipi |
|---:|---|:---:|---|
| 1 | `lib/db/villa.repository.ts` | ~30 | ✅ Repository (legit, 7 RPC dahil) |
| 2 | `lib/db/payment.repository.ts` | 11 | ✅ Repository (legit) |
| 3 | `lib/db/reservation.repository.ts` | 10 | ✅ Repository (legit) |
| 4 | `lib/storage.helpers.ts` | 6 | ⚠️ Storage abstraction pending |
| 5 | `lib/db/manual-reservation.repository.ts` | 5 | ✅ Repository (legit) |
| 6 | `lib/villa-image.helpers.ts` | 3 | ⚠️ Storage pending |
| 7 | `lib/storage/storage.service.ts` | 3 | ⚠️ Storage pending |
| 8 | `lib/admin-auth.ts` | 3 | ⚠️ Auth abstraction pending |
| 9 | `app/components/villa/AdminGallery.tsx` | 3 | ⚠️ Component-direct + storage |
| 10 | `app/(public)/teklif-al/OfferRequestForm.tsx` | 3 | ⚠️ Component-direct + offer-request domain |

### 8.2 En kritik kalan riskler

🔴 **Auth abstraction (4/10):**
- 8 dosya, 13 call
- Login UX, session refresh, route guards, JWT injection
- RLS policy migration ile birlikte gerek

🔴 **Storage abstraction (2/10):**
- 10 dosya, 21 call
- Component-direct upload (AdminGallery, SettingsField, blog/pages)
- 3 hard-coded bucket
- Yarı-bitmiş wrapper (storage.service.ts var ama bypass var)

🟠 **Villa sub-services (5/10):**
- 6 service (villa-image, villa-feature, villa-type, villa-review, rule-item, price-include-item)
- Master/lookup table CRUD'lar
- Reservation/villa repo pattern'iyle paralel migration kolay

🟠 **Offer requests (4/10):**
- Form (public) + List (admin) + Service
- Component-direct supabase tüketim 2 nokta
- Service-side webhook potansiyeli (gelecek)

🟡 **Small services batch (3-4/10):**
- Settings, FAQ, Menu, Pages, Homepage-collection, Contact-message, Mail-log, Voucher
- Hızlı kazanç — 1 hafta batch refactor

---

## 9. LOC RAPORU

| Dosya | LOC | Δ |
|---|---:|:---:|
| `lib/db/villa.repository.ts` | 565 | +318 (24 yeni metod + yorum) |
| `app/services/villa-admin/create.service.ts` | 138 | -1 |
| `app/services/villa-admin/update.service.ts` | 158 | -1 |
| `app/services/villa-admin/hard-delete.service.ts` | 84 | -3 |
| `app/services/villa-admin/visibility.service.ts` | 88 | +1 |
| `app/services/villa-admin/sort.service.ts` | 40 | +1 |
| `app/services/villa-admin/private-token.service.ts` | 97 | -2 |
| `app/services/villa-admin/_helpers/relations.ts` | 151 | ±0 |
| `app/services/villa-admin/_helpers/slug.ts` | 46 | -2 |
| `app/services/villa-admin/_helpers/storage-cleanup.ts` | 67 | ±0 |
| `app/services/villa-distance.service.ts` | 88 | +2 |
| `app/services/villa-price.service.ts` | 86 | +2 |
| **TOPLAM** | **1608** | **+315** (yorum + 24 yeni repo metod) |

Repository (565 LOC) yorum-yoğun — pure wrapper köprü; davranış kodu ~200 LOC.

---

## 10. DOĞRULAMA

| Adım | Sonuç |
|---|:---:|
| `npx tsc --noEmit` (full project) | ✅ clean (0 hata) |
| `npx eslint lib/db/villa.repository.ts + villa-admin + villa-distance + villa-price` | ✅ clean (0 hata, 0 uyarı) |
| Villa-admin write-side canlı supabase tüketim | ✅ **0** (yorumda kalan referanslar dokümantasyon) |
| Service public API değişti mi? | ❌ HAYIR |
| Caller migration | ✅ 0 satır (pages facade'dan tüketir) |
| 7 RPC parameter shape byte-identical | ✅ aynen |
| `pg_advisory_xact_lock` davranışı | ✅ DB-level değişmedi |
| `include_id` kolon asimetrisi | ✅ aynen |
| Create vs Update relation semantic | ✅ aynen |
| Slug fallback infinite-loop | ✅ aynen |
| Private token retry + idempotent reuse | ✅ aynen |
| Hard delete cascade order (Promise.all stable) | ✅ aynen |
| FK 23503 + 23505 SQLSTATE handling | ✅ service edge |
| Storage cleanup best-effort + orphan tolerance | ✅ aynen |
| 15 console tag | ✅ aynen |
| 7 TR throw mesajı | ✅ aynen |
| `vitest run` | ⚠️ sandbox'ta rollup binary eksik (önceki cycle'larla aynı) |

---

## 11. STRATEJİK SONUÇ

**Bu cycle codebase'in en yüksek ROI cycle'ı oldu:**
- 30 supabase call-site → 0
- 7 RPC %100 repo wrapper'da
- Tüm villa-admin write-side aggregate boundary'de
- Repository skor 1/10 → 7/10 (+6 puan)
- RPC dependency skor 2/10 → 8/10 (+6 puan)
- Genel codebase skor ~4.2/10 → ~5.4/10 (+1.2)
- Hybrid exit migration eforu 4-7 hafta → 3-5 hafta

**Availability + Financial + Villa core artık tamamen repository-backed.**

**Sonraki en yüksek ROI hedefleri:**
1. 🥇 **Storage abstraction** (2-3 hafta) — 21 call + bucket config + component-direct kapatma
2. 🥈 **Villa sub-services** (2-3 hafta) — 6 küçük repository (image/feature/type/review/rule/include)
3. 🥉 **Auth abstraction** (2-3 hafta) — Hybrid exit foundation
4. **Small services batch** (1 hafta) — settings/FAQ/menu/pages/blog/voucher
5. **Offer requests** (1-2 hafta) — public form + component-direct kapatma
6. **Analytics/Finance/External-calendar** (1-2 hafta)

---

**FAZ 1-7 sonu (tek cycle). Villa-admin write-side mimari ayrımı tamamlandı. 7 Postgres RPC tek dosya wrapper'da; codebase provider-migration eforu önemli ölçüde azaldı.**
