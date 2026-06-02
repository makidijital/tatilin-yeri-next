# 🛡️ Villa-admin Write-side — FAZ 0 MAPPING

**Tarih:** 2026-05-18
**Kapsam:** Villa-admin write-side mimari ayrım hazırlığı (en yüksek lock-in domain'i).
**Durum:** Mapping tamamlandı; kod yazılmadı.
**Davranış kuralı:** BYTE-IDENTICAL — 7 RPC fonksiyonu, relation sync, hard-delete cascade, slug fallback, storage cleanup, race window'ları, SQLSTATE handling, throw mesajları, console tag'leri AYNEN.

> **Bu cycle codebase'in en yüksek ROI cycle'ı:** 7 Postgres RPC fonksiyonu + 11 tablo + storage cleanup + soft/hard delete + idempotent token + slug collision avoidance — hepsi tek domain'de.

---

## 0. SCOPE TANIMI

### 0.1 IN-SCOPE — Tam liste

**Villa-admin service modülleri (`app/services/villa-admin/`):**

| Dosya | LOC | Supabase call | Tür |
|---|---:|:---:|---|
| `create.service.ts` | 138 | 1 (INSERT) | orchestrator |
| `update.service.ts` | 158 | 1 (UPDATE) | orchestrator |
| `hard-delete.service.ts` | 87 | 8 (7 DELETE + 1 final villa DELETE) | orchestrator |
| `visibility.service.ts` | 87 | 3 (3 UPDATE — setActive/softDelete/restore) | service |
| `sort.service.ts` | 39 | 1 (RPC) | service |
| `private-token.service.ts` | 99 | 2 (1 SELECT + 1 UPDATE) | service |
| `types.ts` | 127 | 0 | types only |
| `_helpers/relations.ts` | 151 | 8 (4 INSERT + 4 RPC) | helper |
| `_helpers/slug.ts` | 48 | 1 (SELECT loop) | helper |
| `_helpers/storage-cleanup.ts` | 67 | 1 (SELECT villa_images) | helper |
| `_helpers/payload.ts` | 231 | 0 | pure helper |
| `_helpers/distances.ts` | 29 | 0 | pure helper |
| `_helpers/normalizers.ts` | 109 | 0 | pure helper |
| `_helpers/private-token.ts` | 19 | 0 | pure helper |

**Villa-admin tüketicisi standalone service'ler:**

| Dosya | LOC | Supabase call | Notlar |
|---|---:|:---:|---|
| `villa-distance.service.ts` | 86 | 2 (1 SELECT + 1 RPC) | create/update orchestrator'ları tüketir |
| `villa-price.service.ts` | 84 | 2 (1 SELECT + 1 RPC) | create/update orchestrator'ları tüketir |

**TOPLAM canlı supabase: ~30 call-site.**
**TOPLAM LOC: ~1559** (service + helper + standalone).

### 0.2 OUT-OF-SCOPE (gerekçeli)

| Dosya | Sebep |
|---|---|
| `lib/db/villa.repository.ts` (read-only, 6 metod) | Mevcut — genişletilecek (bu refactor'da yeni metodlar eklenir) |
| `app/services/villa-image.service.ts` | Image CRUD — ayrı sub-aggregate; sonraki cycle |
| `app/services/villa-feature.service.ts`, `villa-type.service.ts`, `villa-review.service.ts` | Master/lookup table services (relation MASTER tarafı; relation çağıran villa-admin write değil) — sonraki cycle |
| `lib/villa-image.helpers.ts` | Storage URL parse + removeVillaStorageFiles; storage abstraction cycle |
| `app/components/villa/AdminGallery.tsx` | Component-direct supabase.storage (upload) — storage cycle |
| `app/(admin)/maki-admin/villas/**` pages | Service'ten tüketir (zaten facade) — caller migration YOK |
| `app/services/villa-admin.service.ts` (facade) | Re-export — değişmez |

---

## 1. RPC ENVANTERİ (7 fonksiyon — POSTGRES LOCK-IN'IN KALBİ)

| RPC | Migration | Çağrılan dosya | Parametre shape | Atomicity |
|---|---|---|---|:---:|
| `replace_villa_type_relations` | 002 | `_helpers/relations.ts` | `{ p_villa_id, p_type_ids }` | DELETE+INSERT tek tx |
| `replace_villa_feature_relations` | 002 | `_helpers/relations.ts` | `{ p_villa_id, p_feature_ids }` | DELETE+INSERT tek tx |
| `replace_villa_rule_relations` | 002 | `_helpers/relations.ts` | `{ p_villa_id, p_rule_ids }` | DELETE+INSERT tek tx |
| `replace_villa_price_include_relations` | 002 | `_helpers/relations.ts` | `{ p_villa_id, p_include_ids }` | DELETE+INSERT tek tx |
| `replace_villa_distances` | 002 | `villa-distance.service.ts` | `{ p_villa_id, p_distances }` jsonb array | DELETE+INSERT tek tx |
| `replace_villa_prices` | 002 | `villa-price.service.ts` | `{ p_villa_id, p_prices }` jsonb array + `pg_advisory_xact_lock` | DELETE+INSERT tek tx + concurrent serileştirme |
| `set_villa_sort_orders` | 006 | `sort.service.ts` | `{ p_updates }` jsonb array | N row UPDATE tek tx |

### 1.1 RPC parameter shape detayı (BYTE-IDENTICAL dondurulmalı)

```sql
-- replace_villa_type_relations(p_villa_id uuid, p_type_ids uuid[])
-- replace_villa_feature_relations(p_villa_id uuid, p_feature_ids uuid[])
-- replace_villa_rule_relations(p_villa_id uuid, p_rule_ids uuid[])
-- replace_villa_price_include_relations(p_villa_id uuid, p_include_ids uuid[])
--   ⚠️ Parametre adı `p_include_ids` (price_include_id DEĞİL).
--   ⚠️ Relation kolonu DB'de `include_id`.

-- replace_villa_distances(p_villa_id uuid, p_distances jsonb)
--   payload: [{ title, distance }, ...]
--   ⚠️ unit ayrı field değil — distance text'i içinde serileştirilmiş.

-- replace_villa_prices(p_villa_id uuid, p_prices jsonb)
--   payload: [{ start_date, end_date, price, currency }, ...]
--   ⚠️ currency default "TRY".
--   ⚠️ start_date/end_date string format: sv-SE locale ("YYYY-MM-DD").
--   ⚠️ Tarih Date instance ise toLocaleDateString("sv-SE") ile serialize.

-- set_villa_sort_orders(p_updates jsonb)
--   payload: [{ id: string, sort_order: number }, ...]
--   ⚠️ Boş array → early return (RPC çağırılmaz).
```

### 1.2 RPC return semantic

Tüm 7 RPC'nin return shape'i Supabase native `{ data, error }`. Helper'lar `if (error) throw error` veya `if (error) return false/result envelope` ile error'u yüzeye çıkarır.

---

## 2. RELATION SYNC ZİNCİRLERİ (CREATE vs UPDATE ASİMETRİSİ)

### 2.1 4 Relation tablosu

| Tablo | Master | Relation kolonu | Create helper | Update helper |
|---|---|---|---|---|
| `villa_type_relations` | `villa_types` | `type_id` | `insertVillaTypeRelations` | RPC `replace_villa_type_relations` |
| `villa_feature_relations` | `villa_features` | `feature_id` | `insertVillaFeatureRelations` | RPC `replace_villa_feature_relations` |
| `villa_rule_relations` | `rule_items` | `rule_id` | `insertVillaRuleRelations` | RPC `replace_villa_rule_relations` |
| `villa_price_include_relations` | `price_include_items` | **`include_id`** ⚠️ | `insertVillaPriceIncludeRelations` | RPC `replace_villa_price_include_relations` |

**⚠️ KESIN KURAL — RELATION KOLON ADI ASİMETRİSİ:**
- `villa_price_include_relations.include_id` — `price_include_id` **DEĞİL**.
- Master table adı `price_include_items` ama relation kolonu sadece `include_id`.
- Helper içinde `{ villa_id, include_id }` shape kullanılıyor.
- Bu asimetri **bilinçli** ve **byte-identical** korunmalı.

### 2.2 CREATE vs UPDATE asimetrisi (ORCHESTRATION SIRA)

| Step | Create flow | Update flow |
|---|---|---|
| validate | `if (!form.title) throw "Villa adı zorunlu"` | aynı |
| slug | `await generateUniqueSlug(title)` | `await generateUniqueSlug(title, id)` |
| villa DB op | INSERT + `.select().single()` → newId | UPDATE `.eq("id", id)` |
| types | `if (selectedTypes?.length) → INSERT` | `ALWAYS replace_villa_type_relations(id, typeIds \|\| [])` |
| features | `if (selectedFeatures?.length) → INSERT` | `ALWAYS replace_villa_feature_relations(id, featureIds \|\| [])` |
| distances | `if (distances?.length) → setVillaDistances` | `ALWAYS setVillaDistances(id, sanitizeDistances(...))` |
| prices | `if (prices?.length) → setVillaPrices` | `ALWAYS setVillaPrices(id, prices ?? [])` |
| rules | `if (selectedRules?.length) → INSERT` | `if (selectedRules !== undefined) → replace_villa_rule_relations` |
| price_includes | `if (selectedPriceIncludes?.length) → INSERT` | `if (selectedPriceIncludes !== undefined) → replace_villa_price_include_relations` |
| return | `return newId` (string) | `return true` |

**⚠️ ASIMETRİ KORUNDU:**
- Create: `.length > 0` koşullu INSERT (sıfır element → call YOK)
- Update: ilk 2 (types/features) + distances/prices **ALWAYS** call (empty fallback)
- Update: rules + price_includes **CONDITIONAL** `!== undefined` (eski API geri uyumluluğu)

### 2.3 Sıra invariant'ı

Update flow'da sıra: `villa UPDATE → types → features → distances → prices → rules → price_includes`.
Bu sıra **byte-identical** dondurulmalı; AST contract testi yok (mevcut) ama refactor sırasında sıra invariant'ı korunmalı.

---

## 3. SLUG GENERATION FLOW (`_helpers/slug.ts`)

```ts
generateUniqueSlug(title, excludeId?):
  baseSlug = slugifyTr(title)
  slug = baseSlug, counter = 2
  while (true):
    query = supabase.from("villa").select("id").eq("slug", slug).limit(1)
    if (excludeId) query = query.neq("id", excludeId)
    { data } = await query
    if (!data || data.length === 0) return slug
    slug = `${baseSlug}-${counter}`
    counter++
```

### 3.1 Critical semantics

- **`slugifyTr` source-of-truth:** `lib/slug` — migration 008/009 backfill SQL'leriyle birebir aynı semantic (translate + regex).
- **Fallback chain:** baseSlug → baseSlug-2 → baseSlug-3 → ... (infinite loop, pratikte 1-2 tur)
- **`excludeId` parameter:** update flow için kendini hariç tutar (`.neq("id", excludeId)`).
- **Race window:** Concurrent create'ler aynı slug'a düşerse iki INSERT'ten ikincisi DB unique constraint'inden fail eder. Service kendi başına concurrent-safe değil; SQL-level guarantee yok. Bu mevcut davranış aynen.
- **`.limit(1)` chain:** exists query optimization.

---

## 4. STORAGE COUPLING (`_helpers/storage-cleanup.ts`)

```ts
cleanupVillaStorageForHardDelete(villaId):
  try:
    images = await supabase.from("villa_images").select("image_url").eq("villa_id", villaId)
    if (images?.length > 0):
      byBucket = Map<bucket, paths[]>
      for img of images:
        parsed = parseVillaStorageUrl(img.image_url || "")
        if (parsed): byBucket[parsed.bucket].push(parsed.path)
      for [bucket, paths] of byBucket:
        result = await removeVillaStorageFiles(bucket, paths)
        if (!result.ok):
          console.warn "[villa.hardDelete] STORAGE_ORPHAN_AFTER_RETRY"
  catch storageErr:
    console.error "[villa.hardDelete] storage cleanup exception:"
```

### 4.1 Critical semantics

- **Best-effort pattern:** Helper throw etmez; orchestrator devam eder.
- **Bucket grouping:** Bucket bazında gruplanır (defansif — şu an aynı bucket "villa-photos").
- **`removeVillaStorageFiles` retry:** `lib/villa-image.helpers.ts` içinde bulk + retry + idempotent (out-of-scope; storage abstraction cycle).
- **Orphan storage tolerance:** "orphan storage file → cost; orphan DB row → UX bozar; ikincisi öncelik" — bilinçli karar.
- **Console tag'leri:** `[villa.hardDelete] STORAGE_ORPHAN_AFTER_RETRY` + `[villa.hardDelete] storage cleanup exception:`.

---

## 5. HARD DELETE CASCADE FLOW (`hard-delete.service.ts`)

```ts
hardDeleteVilla(id):
  if (!id) return { ok: false, error: "ID gerekli" }

  /* 1) Storage cleanup — best-effort */
  await cleanupVillaStorageForHardDelete(id)

  /* 2) Promise.all parallel DELETE — 7 relation table */
  await Promise.all([
    supabase.from("villa_images").delete().eq("villa_id", id),
    supabase.from("villa_feature_relations").delete().eq("villa_id", id),
    supabase.from("villa_rule_relations").delete().eq("villa_id", id),
    supabase.from("villa_price_include_relations").delete().eq("villa_id", id),
    supabase.from("villa_type_relations").delete().eq("villa_id", id),
    supabase.from("villa_distances").delete().eq("villa_id", id),
    supabase.from("villa_prices").delete().eq("villa_id", id),
  ])

  /* 3) Final villa DELETE — FK violation handler */
  { error } = await supabase.from("villa").delete().eq("id", id)
  if (error):
    if (error.code === "23503"):
      return { ok: false, error: "Bu villaya bağlı rezervasyon geçmişi mevcut..." }
    console.error "[villa.hardDelete] FAILED"
    return { ok: false, error: error.message }
  return { ok: true }
```

### 5.1 Critical semantics

- **Atomic değil:** Storage + 7 parallel DELETE + final villa DELETE arasında transaction YOK. Partial failure window var (bilinçli).
- **FK constraint preservation:** `reservations` / `manual_reservations` tabloları DAHİL DEĞİL. SQLSTATE 23503 ile reservation history korunur → "Önce ilgili rezervasyonları yönetin." mesajı.
- **Promise.all sıra:** Array order stable tutuldu (Postgres tarafında komutatif ama application stable).
- **Reservation history preservation:** Soft delete fallback için `visibility.service.ts > softDeleteVilla`.

---

## 6. SOFT DELETE / VISIBILITY / RESTORE (`visibility.service.ts`)

| Fonksiyon | UPDATE shape | Predicate | Idempotency guard |
|---|---|---|---|
| `setVillaActive(id, isActive)` | `{ is_active: !!isActive }` | `.eq("id", id).is("deleted_at", null)` | deleted villalar dokunulmaz |
| `softDeleteVilla(id)` | `{ deleted_at: new Date().toISOString() }` | `.eq("id", id).is("deleted_at", null)` | zaten silinmiş → no-op |
| `restoreVilla(id)` | `{ deleted_at: null, is_active: true }` | `.eq("id", id).not("deleted_at", "is", null)` | silinmemiş → no-op |

Console tag'leri: `[villa.setActive] FAILED`, `[villa.softDelete] FAILED`, `[villa.restore] FAILED`.

---

## 7. PRIVATE TOKEN FLOW (`private-token.service.ts`)

```ts
generatePrivateAccessToken(villaId):
  if (!villaId) return { ok: false, error: "ID gerekli" }

  /* 1) IDEMPOTENT REUSE — mevcut token varsa onu dön */
  { data: existing } = await supabase
    .from("villa")
    .select("id, private_access_token, deleted_at")
    .eq("id", villaId)
    .maybeSingle()

  if (selErr) return { ok: false, error: selErr.message }
  if (!existing) return { ok: false, error: "Villa bulunamadı" }
  if (existing.deleted_at) return { ok: false, error: "Silinmiş villalar için bağlantı üretilemez" }
  if (existing.private_access_token?.trim()) return { ok: true, token: existing.private_access_token }

  /* 2) ATTEMPT — yeni token + UPDATE + 1x retry on 23505 */
  attempt = async () => {
    token = generatePrivateTokenString()
    { error } = await supabase
      .from("villa")
      .update({ private_access_token: token })
      .eq("id", villaId)
      .is("deleted_at", null)
    if (error?.code === "23505") return { ok: false, error: "COLLISION" }
    if (error) return { ok: false, error: error.message }
    return { ok: true, token }
  }

  first = await attempt()
  if (first.ok) return first
  if (first.error === "COLLISION"):
    retry = await attempt()
    if (retry.ok) return retry
    return { ok: false, error: "Token üretimi başarısız (collision)" }
  return first
```

### 7.1 Critical semantics

- **Idempotent reuse:** Mevcut token varsa **aynı** token döner (admin defalarca tıklayabilir, link değişmez).
- **20-char hex token (~80 bit entropi)** — `generatePrivateTokenString` pure helper.
- **SQLSTATE 23505 → 1x retry** (collision tolerance).
- **`deleted_at IS NULL` check** her aşamada.
- **`is_active` filter UYGULANMAZ** — pasif villalar da token alabilir (off-market preview).
- **Token leak / regenerate akışı YOK** — scope dışı.

---

## 8. DISTANCE/PRICE WRITE FLOW (standalone services)

### 8.1 `villa-distance.service.ts > setVillaDistances`

```ts
setVillaDistances(villaId, distances[]):
  if (!villaId) return false

  payload = (distances || []).map(d => {
    title = String(d?.title || "").trim()
    if (d?.unit === "m" || "km"):
      parsed = parseDistance(d.distance)
      if (parsed.isLegacy): distance = String(d.distance).trim()
      else: distance = parsed.value ? `${parsed.value} ${d.unit}` : ""
    else:
      distance = normalizeDistanceValue(d?.distance)
    return { title, distance }
  })
  .filter(d => d.title.length > 0 || d.distance.length > 0)

  { error } = await supabase.rpc("replace_villa_distances", {
    p_villa_id: villaId,
    p_distances: payload,
  })

  if (error) return false
  return true
```

**Critical:**
- Unit explicit verilirse value parse + re-serialize (`{value} {unit}`).
- Legacy free-text passthrough.
- `title` veya `distance` ikisi de boşsa row drop.
- Console tag: `❌ replace distances:`.

### 8.2 `villa-price.service.ts > setVillaPrices`

```ts
setVillaPrices(villaId, prices[]):
  payload = prices.map(p => ({
    start_date: p.start_date instanceof Date ? formatDate(p.start_date) : p.start_date,
    end_date: p.end_date instanceof Date ? formatDate(p.end_date) : p.end_date,
    price: p.price,
    currency: p.currency || "TRY",
  }))
  { error } = await supabase.rpc("replace_villa_prices", { p_villa_id: villaId, p_prices: payload })
  if (error) console.error "setVillaPrices:"
```

**Critical:**
- Date instance → `toLocaleDateString("sv-SE")` ("YYYY-MM-DD").
- `currency` fallback "TRY".
- `pg_advisory_xact_lock` ile concurrent admin replace serileştirilir (DB-level).
- Console tag: `setVillaPrices:`.
- **No return value** — void; caller assumption: success unless explicit fail logged.

### 8.3 Read tarafları (out-of-FAZ-0, FAZ 1'de ele alınacak)

- `getVillaDistances`: SELECT `villa_distances` order created_at ASC
- `getVillaPrices`: SELECT `villa_prices` order start_date ASC

---

## 9. CONSOLE.ERROR TAG ENVANTERİ (TAM LİSTE)

| Tag | Konum |
|---|---|
| `❌ Villa create error:` | `create.service.ts` |
| `❌ Villa update error:` | `update.service.ts` |
| `[villa.hardDelete] FAILED` | `hard-delete.service.ts` |
| `[villa.hardDelete] STORAGE_ORPHAN_AFTER_RETRY` | `_helpers/storage-cleanup.ts` |
| `[villa.hardDelete] storage cleanup exception:` | `_helpers/storage-cleanup.ts` |
| `[villa.setActive] FAILED` | `visibility.service.ts` |
| `[villa.softDelete] FAILED` | `visibility.service.ts` |
| `[villa.restore] FAILED` | `visibility.service.ts` |
| `[villa.setSortOrders] FAILED` | `sort.service.ts` |
| `[villa.privateToken] select FAILED` | `private-token.service.ts` |
| `[villa.privateToken] update FAILED` | `private-token.service.ts` |
| `❌ getVillaDistances:` | `villa-distance.service.ts` |
| `❌ replace distances:` | `villa-distance.service.ts` |
| `getVillaPrices:` | `villa-price.service.ts` |
| `setVillaPrices:` | `villa-price.service.ts` |

**Toplam: 15 unique tag.** Tüm tag'ler **service/helper edge'de** kalır; repository sessiz.

---

## 10. TR THROW MESAJLARI

| Mesaj | Konum |
|---|---|
| `"Villa adı zorunlu"` | create + update |
| `"ID gerekli"` | hardDelete + visibility (3) + sort + privateToken (early guard) |
| `"Villa bulunamadı"` | privateToken |
| `"Silinmiş villalar için bağlantı üretilemez"` | privateToken |
| `"Token üretimi başarısız (collision)"` | privateToken (retry exhaust) |
| `"Bu villaya bağlı rezervasyon geçmişi mevcut; geçmiş korunduğu için kalıcı olarak silinemez. Önce ilgili rezervasyonları yönetin."` | hardDelete (FK SQLSTATE 23503) |
| `COLLISION` (internal signal — not user-facing) | privateToken |

---

## 11. SQLSTATE HANDLING

| SQLSTATE | Konum | Davranış |
|---|---|---|
| `23503` | hardDelete final DELETE | "Bu villaya bağlı rezervasyon geçmişi mevcut..." (FK preservation) |
| `23505` | privateToken UPDATE | 1x retry; tükenirse "Token üretimi başarısız (collision)" |

---

## 12. AUDIT/LOG SIDE-EFFECT'LERI

**Villa-admin write-side'da `logActivity` çağrısı YOK** (admin caller pages tarafında olabilir; service'lerden bağımsız). Service-level audit log mevcut değil — refactor kapsamında **EKLENMEZ** (no cleanup rewrite).

---

## 13. RACE WINDOW'LARI

| Race | Konum | Mitigasyon (mevcut) |
|---|---|---|
| Concurrent slug create | `slug.ts > generateUniqueSlug` while-loop | YOK (DB unique constraint başarısızlıkta caller fail) |
| Concurrent hardDelete + reservation create | hard-delete + reservation INSERT | FK 23503 guard (reservation history preserved) |
| Concurrent setActive + softDelete | visibility.service.ts | `.is("deleted_at", null)` predicate her ikisinde |
| Concurrent restore + softDelete | visibility.service.ts | `.not("deleted_at", "is", null)` restore predicate |
| Concurrent token generation | privateToken | Idempotent reuse + 1x retry |
| Concurrent replace_villa_prices | villa-price.service.ts | `pg_advisory_xact_lock` (DB-level) |
| Concurrent replace_villa_* relations | _helpers/relations.ts | RPC tek tx (DELETE+INSERT atomic) |
| Storage cleanup + DELETE villa | hard-delete.service.ts | Best-effort; partial fail toleransı |

**Mevcut race window'ları AYNEN korunur.** Yeni mitigasyon eklenmez.

---

## 14. EXCLUDE / FK COUPLING

| Constraint | Tablo | Etki |
|---|---|---|
| `villa.slug` UNIQUE | `villa` | Slug collision → INSERT/UPDATE error |
| `villa.private_access_token` UNIQUE (partial NOT NULL) | `villa` | SQLSTATE 23505 → 1x retry |
| `reservations.villa_id` FK | `reservations → villa` | Hard delete'i 23503 ile bloklar |
| `manual_reservations.villa_id` FK | `manual_reservations → villa` | Aynı (cascade YOK) |
| `villa_images.villa_id` FK | `villa_images → villa` | hardDelete parallel cleanup |
| `villa_*_relations.villa_id` FK | 4 relation tablo | hardDelete parallel cleanup |
| `villa_distances.villa_id` FK | `villa_distances → villa` | hardDelete parallel cleanup |
| `villa_prices.villa_id` FK | `villa_prices → villa` | hardDelete parallel cleanup |

**Hard delete:** 7 relation table önce DELETE → final villa DELETE. Postgres FK kaskad YAPILMAZ; application-level cleanup.

---

## 15. COMPONENT-DIRECT BYPASS / SERVICE-ROLE / STORAGE COUPLING

| Concern | Durum |
|---|:---:|
| Villa-admin write-side component-direct supabase | ❌ YOK (admin pages service'ten tüketir) |
| Villa-admin service-role dependency | ❌ YOK (anon client + RLS) |
| Villa-admin storage coupling | ⚠️ VAR — `cleanupVillaStorageForHardDelete` via `villa-image.helpers > removeVillaStorageFiles` |

Storage abstraction **out-of-scope** (sonraki cycle). Bu refactor'da `storage-cleanup.ts` `supabase.from("villa_images").select(...)` repo'ya delege edilir; `removeVillaStorageFiles` çağrısı helper'a dokunulmaz.

---

## 16. REPOSITORY BOUNDARY KARARI

### 16.1 Villa repository genişlemesi

Mevcut `lib/db/villa.repository.ts` 6 metod (read-only). Bu refactor'da:

```ts
// READ (mevcut 6 metod KORUNUR)
listPublic, listForAdmin, listTrashed, findById, findBySlug, findByPrivateToken, findByIds

// READ — yeni (FAZ 1)
findSlugCollision(slug: string, excludeId?: string)        // slug uniqueness check
findForPrivateTokenLookup(id: string)                       // private_access_token + deleted_at guard
findImageUrlsByVillaId(id: string)                          // storage cleanup için

// WRITE — core (FAZ 6, en son — orchestration)
insertVilla(payload): Promise<{ data, error }>              // INSERT + .select().single()
updateVillaById(id, payload)                                // UPDATE villa.eq("id", id)
updateVillaActiveById(id, isActive)                         // .eq("id").is("deleted_at", null) guard
softDeleteVillaById(id)                                     // deleted_at = now()
restoreVillaById(id)                                        // deleted_at = null, is_active = true
hardDeleteVillaById(id)                                     // final DELETE (FK check)
updatePrivateTokenById(id, token)                           // private_access_token update + deleted_at guard

// RELATION INSERT (FAZ 2, create flow)
insertVillaTypeRelationRows(rows[])                         // { villa_id, type_id }[]
insertVillaFeatureRelationRows(rows[])                      // { villa_id, feature_id }[]
insertVillaRuleRelationRows(rows[])                         // { villa_id, rule_id }[]
insertVillaPriceIncludeRelationRows(rows[])                 // { villa_id, include_id }[] ⚠️ include_id

// RELATION REPLACE — RPC delegation (FAZ 2, update flow)
rpcReplaceVillaTypeRelations(villaId, typeIds)
rpcReplaceVillaFeatureRelations(villaId, featureIds)
rpcReplaceVillaRuleRelations(villaId, ruleIds)
rpcReplaceVillaPriceIncludeRelations(villaId, includeIds)

// RELATION DELETE — hard delete (FAZ 4)
deleteVillaImagesByVillaId(id)
deleteVillaFeatureRelationsByVillaId(id)
deleteVillaRuleRelationsByVillaId(id)
deleteVillaPriceIncludeRelationsByVillaId(id)
deleteVillaTypeRelationsByVillaId(id)
deleteVillaDistancesByVillaId(id)
deleteVillaPricesByVillaId(id)

// DISTANCE/PRICE (FAZ 3)
findVillaDistances(villaId)                                 // SELECT order created_at ASC
findVillaPrices(villaId)                                    // SELECT order start_date ASC
rpcReplaceVillaDistances(villaId, payload)                  // jsonb
rpcReplaceVillaPrices(villaId, payload)                     // jsonb

// SORT (FAZ 3)
rpcSetVillaSortOrders(payload)                              // jsonb
```

**Toplam: 6 mevcut + 24 yeni = 30 metod** villa repository'de.

### 16.2 Boundary tablosu

| Concern | Service/Helper | Repository |
|---|:---:|:---:|
| Input validation (`"Villa adı zorunlu"`, `"ID gerekli"`) | ✅ | ❌ |
| Slug policy (slugifyTr, increment loop, excludeId) | ✅ | ❌ (sadece collision query) |
| Payload build (`buildVillaCorePayload`, normalizers, sanitizeDistances) | ✅ | ❌ |
| Token generation (`generatePrivateTokenString`) | ✅ | ❌ |
| Storage URL parse (`parseVillaStorageUrl`) | ✅ helper | ❌ |
| Storage file removal (`removeVillaStorageFiles`) | ✅ helper | ❌ |
| Bucket grouping | ✅ helper | ❌ |
| `is_active` toggle policy | ✅ | ❌ |
| `deleted_at` predicate logic | ✅ orchestration | ✅ predicate uygular |
| FK 23503 → TR mesaj | ✅ service edge | ❌ ham error döner |
| Token collision 23505 → retry | ✅ service edge | ❌ |
| Idempotent token reuse | ✅ service edge | ❌ |
| Console tag emission (15 tag) | ✅ | ❌ |
| Throw mesajları (TR) | ✅ | ❌ |
| Date format ("sv-SE" → "YYYY-MM-DD") | ✅ service edge | ❌ |
| Currency fallback ("TRY") | ✅ service edge | ❌ |
| Distance unit re-serialization (`{value} {unit}`) | ✅ service edge | ❌ |
| `pg_advisory_xact_lock` (replace_villa_prices) | ❌ | ✅ DB-level (RPC içinde) |
| RPC parameter shape | indirect | ✅ uygular |
| `.eq("villa_id", id)` predicate | ❌ | ✅ |
| `.is("deleted_at", null)` / `.not("deleted_at", "is", null)` | indirect (metod) | ✅ |
| Embed select / order chain | ❌ | ✅ |
| Supabase client tüketimi | ❌ | ✅ TEK TÜKETICI |

---

## 17. RİSK ANALİZİ

| Risk | Olasılık | Etki | Mitigasyon |
|---|:---:|:---:|---|
| RPC parameter shape drift (7 RPC) | 🟢 DÜŞÜK | 🔴 KRİTİK (DB function signature) | Repository inline aynen; helper'da call site dokunulmaz |
| Relation kolon adı drift (`include_id` vs `price_include_id`) | 🟢 DÜŞÜK | 🔴 KRİTİK | Yorum + test |
| Create vs Update asimetrisi (`.length > 0` vs ALWAYS) | 🟡 ORTA | 🔴 KRİTİK | Orchestrator helper signature aynen |
| Update CONDITIONAL `!== undefined` (rules/includes) | 🟡 ORTA | 🟠 ORTA | Orchestrator branch aynen |
| Slug fallback drift (increment loop, excludeId) | 🟢 DÜŞÜK | 🟠 ORTA | Helper içinde aynen; repo `findSlugCollision` ile delege |
| `slugifyTr` source-of-truth (lib/slug) | 🟢 DÜŞÜK | 🔴 KRİTİK | DOKUNULMAZ (out-of-scope) |
| Hard delete cascade ordering | 🟢 DÜŞÜK | 🟠 ORTA | Promise.all array order aynen |
| Storage cleanup best-effort + console.warn pattern | 🟢 DÜŞÜK | 🟠 ORTA | Helper aynen |
| FK 23503 TR mesajı | 🟢 DÜŞÜK | 🔴 KRİTİK (UX) | Service edge aynen |
| Token reuse idempotency | 🟢 DÜŞÜK | 🟠 ORTA | Service edge aynen |
| Token 23505 retry semantic | 🟢 DÜŞÜK | 🟠 ORTA | Service edge aynen |
| `pg_advisory_xact_lock` (replace_villa_prices) | ✅ | — | DB-level; etkilenmez |
| Date format ("sv-SE") drift | 🟢 DÜŞÜK | 🟠 ORTA | Service edge aynen |
| Distance unit serialize drift | 🟢 DÜŞÜK | 🟠 ORTA | Service edge aynen |
| Race window'lar (concurrent ops) | 🟢 DÜŞÜK | varyans | Mevcut davranış aynen; yeni mitigasyon YOK |
| Audit/log eksikliği | — | — | Mevcut davranış aynen (eklenmez) |
| Caller migration | 🟢 DÜŞÜK | 🟢 DÜŞÜK | Pages facade'dan tüketir; service public API değişmez |
| TS variance / over-engineering | 🟡 ORTA | 🟢 DÜŞÜK | Generic abstraction YAPILMAZ |

---

## 18. EXTRACTION PLANI

### FAZ 1 — READ/lookup extraction
**Repo metodları:**
- `findSlugCollision(slug, excludeId?)` — slug.ts içindeki SELECT loop body
- `findForPrivateTokenLookup(id)` — privateToken first SELECT
- `findImageUrlsByVillaId(id)` — storage cleanup içindeki SELECT
- `findVillaDistances(villaId)` — villa-distance read
- `findVillaPrices(villaId)` — villa-price read

**Service delegation:**
- `slug.ts > generateUniqueSlug` while-loop'taki SELECT → repo call
- `private-token.service.ts` first SELECT → repo call
- `storage-cleanup.ts` SELECT → repo call
- `villa-distance.service.ts > getVillaDistances` → repo call
- `villa-price.service.ts > getVillaPrices` → repo call

### FAZ 2 — Relation mutation extraction
**Repo metodları:**
- INSERT: 4 yeni metod (`insertVillaTypeRelationRows` etc.)
- RPC: 4 yeni metod (`rpcReplaceVillaTypeRelations` etc.)

**Service delegation:**
- `_helpers/relations.ts` — 8 helper'ın iç supabase çağrısı repo'ya

### FAZ 3 — Distance/price write extraction + sort RPC
**Repo metodları:**
- `rpcReplaceVillaDistances(villaId, payload)`
- `rpcReplaceVillaPrices(villaId, payload)`
- `rpcSetVillaSortOrders(payload)`

**Service delegation:**
- `villa-distance.service.ts > setVillaDistances` RPC çağrısı → repo call (payload build service'te kalır)
- `villa-price.service.ts > setVillaPrices` RPC çağrısı → repo call (date format + currency fallback service'te)
- `sort.service.ts > setVillaSortOrders` RPC çağrısı → repo call

### FAZ 4 — Hard delete + cleanup extraction
**Repo metodları:**
- 7 yeni DELETE metod (`deleteVillaImagesByVillaId` etc.)
- `hardDeleteVillaById(id)` — final villa DELETE

**Service delegation:**
- `hard-delete.service.ts` orchestrator → Promise.all içindeki 7 supabase call repo'ya, final DELETE repo'ya
- Storage cleanup helper SELECT zaten FAZ 1'de

### FAZ 5 — RPC/storage delegation
**Bu fazda yeni iş yok** — RPC delegation FAZ 2/3'te, storage cleanup SELECT FAZ 1/4'te yapıldı. **FAZ 5 boş geçilir veya RPC parameter shape testleri eklenir.**

### FAZ 6 — Orchestration cleanup
**Repo metodları:**
- `insertVilla(payload)` (create INSERT + `.select().single()` chain)
- `updateVillaById(id, payload)` (update UPDATE)
- `updateVillaActiveById(id, isActive)` (visibility setActive)
- `softDeleteVillaById(id)` (visibility softDelete)
- `restoreVillaById(id)` (visibility restore)
- `updatePrivateTokenById(id, token)` (privateToken UPDATE attempt)

**Service delegation:**
- `create.service.ts` INSERT → repo
- `update.service.ts` UPDATE → repo
- `visibility.service.ts` 3 UPDATE → repo (predicate'ler farklı)
- `private-token.service.ts` UPDATE → repo

### FAZ 7 — Final
- tsc + eslint
- Villa-admin 0 supabase doğrulama
- Codebase audit
- Final rapor

---

## 19. NIHAİ KARARLAR

1. ✅ Repository genişlemesi: **`lib/db/villa.repository.ts`**'e ~24 yeni metod (6 mevcut + 24 = 30).
2. ✅ 7 RPC inline wrapper'lar repository içinde — parameter shape AYNEN.
3. ✅ Create vs Update asimetrisi orchestrator tarafında AYNEN.
4. ✅ Slug policy + idempotent token reuse + collision retry **service edge'de** kalır.
5. ✅ FK 23503 + 23505 SQLSTATE handling service edge'de aynen.
6. ✅ Storage cleanup helper'ı (`villa-image.helpers > removeVillaStorageFiles`) DOKUNULMAZ.
7. ✅ Hard delete cascade order (Promise.all array) aynen.
8. ✅ Date format ("sv-SE") + currency fallback ("TRY") + distance unit serialize service edge'de.
9. ✅ 15 console tag + 7 TR throw mesajı route/service edge'de aynen.
10. ✅ Caller migration minimum (pages facade'dan tüketir; service public API değişmez).
11. ❌ Generic transaction abstraction yapılmaz.
12. ❌ Generic relation engine yapılmaz.
13. ❌ ORM migration yapılmaz.
14. ❌ `slugifyTr` + `generatePrivateTokenString` + `parseVillaStorageUrl` + `removeVillaStorageFiles` DOKUNULMAZ.
15. ❌ Audit log eklenmez.

---

**FAZ 0 sonu. Doğrudan FAZ 1'e geçiyorum.**
