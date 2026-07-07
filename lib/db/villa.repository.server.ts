import "server-only";

import { dbAdmin } from "@/lib/db/server";

/* ===============================================================
   🛡️ FAZ 2 STABILIZATION — VILLA ADMIN REPOSITORY (SERVER-ROLE)
   ===============================================================
   AMAÇ:
     Server-side mutation route'larında RLS bypass ile çalışan
     `villaAdminRepository`'in **service-role** versiyonu.

   ROOT CAUSE ARKAPLANI:
     Migration 037 (RLS Phase 1) villa + relation table'larına
     `<t>_admin_write` policy kurdu:
       for all to authenticated
       using  (public.is_active_admin())
       with check (public.is_active_admin())
     `is_active_admin()` `auth.uid()`'i admin_users.auth_user_id ile
     matchler.

     ESKİ DAVRANIŞ — browser context:
       Client component → @/lib/supabase (anon JS client, browser)
       → LocalStorage'dan admin session JWT → auth.uid() set
       → is_active_admin() = true → RLS PASS.

     YENİ DAVRANIŞ — server route context:
       API route → service → @/lib/db (anon supabase singleton, Node)
       → JWT bağlamı YOK → auth.uid() = NULL
       → is_active_admin() = false → RLS RESEKT.

     PostgREST UPDATE/DELETE için RLS reject davranışı **401 değil,
     sessizce 0 etkilenen satır + error: null**. Service `error null`
     görüp `{ ok: true }` döndüğü için client success toast gösterir
     ama DB'de hiçbir şey değişmez. Bu **silent admin mutation bug**.

   ÇÖZÜM (kullanıcı kuralı: "Service AST aynı kalsın. Sadece
   execution context düzelsin."):
     - Bu dosya `lib/db/villa.repository.ts`'in mutation method
       SET'inin BYTE-IDENTICAL kopyasıdır.
     - Tek fark: `db` (anon, RLS-aware) yerine `dbAdmin` (service-
       role, RLS bypass) kullanılır.
     - Function body / arg shape / return shape / error shape AYNEN.
     - Symbol adı: `villaAdminRepository` — mutation service'ler
       import path'ini bu dosyaya çevirerek (mevcut çağrı yapısını
       değiştirmeden) execution context'i swap eder.

   KAPSAM — mutation service'lerin kullandığı method'lar:
     READ (mutation flow içinde):
       - findSlugCollision         (create/update slug guard)
       - findForPrivateTokenLookup (private-token reuse check)
       - findImageUrlsByVillaId    (hard-delete storage cleanup)
     WRITE:
       - insertVilla                                    (create)
       - updateVillaById                                (update)
       - updateVillaActiveById                          (visibility)
       - softDeleteVillaById                            (visibility)
       - restoreVillaById                               (visibility)
       - hardDeleteVillaById                            (hard-delete)
       - updatePrivateTokenById                         (private-token)
       - insertVillaTypeRelationRows                    (create)
       - insertVillaFeatureRelationRows                 (create)
       - insertVillaRuleRelationRows                    (create)
       - insertVillaPriceIncludeRelationRows            (create)
       - rpcReplaceVillaTypeRelations                   (update)
       - rpcReplaceVillaFeatureRelations                (update)
       - rpcReplaceVillaRuleRelations                   (update)
       - rpcReplaceVillaPriceIncludeRelations           (update)
       - deleteVillaImagesByVillaId                     (hard-delete)
       - deleteVillaFeatureRelationsByVillaId           (hard-delete)
       - deleteVillaRuleRelationsByVillaId              (hard-delete)
       - deleteVillaPriceIncludeRelationsByVillaId      (hard-delete)
       - deleteVillaTypeRelationsByVillaId              (hard-delete)
       - deleteVillaDistancesByVillaId                  (hard-delete)
       - deleteVillaPricesByVillaId                     (hard-delete)
       - rpcReplaceVillaDistances                       (villa-distance — KAPSAM DIŞI bu turda)
       - rpcReplaceVillaPrices                          (villa-price    — KAPSAM DIŞI bu turda)
       - rpcSetVillaSortOrders                          (sort)

   ⚠️ Public-read / list helpers (listPublic, listForAdmin, findById,
     findBySlug, ...) BU DOSYAYA DAHIL DEĞİLDİR. Onlar anon RLS
     public_read policy ile zaten çalışıyor (server-side okuma anon
     ile sorunsuz). Mutation flow harici client-side caller'lar
     etkilenmesin diye dahil edilmedi.
   =============================================================== */

export const villaAdminRepository = {
  /* ===============================================================
     READ — slug collision (create/update slug guard)
     ===============================================================
     Orijinal (anon repo):
       .select("id, slug")
       .or(`slug.eq.${slug},slug.ilike.${slug}-%`)
       [+ optional .neq("id", excludeId)]
  =============================================================== */
  async findSlugCollision(slug: string, excludeId?: string) {
    let q = dbAdmin
      .from("villa")
      .select("id, slug")
      .or(`slug.eq.${slug},slug.ilike.${slug}-%`);
    if (excludeId) {
      q = q.neq("id", excludeId);
    }
    return await q;
  },

  /* ===============================================================
     READ — private token reuse lookup
     ===============================================================
     Orijinal:
       .select("id, private_access_token, is_active, deleted_at")
       .eq("id", id)
       .maybeSingle()
  =============================================================== */
  async findForPrivateTokenLookup(id: string) {
    return await dbAdmin
      .from("villa")
      .select("id, private_access_token, is_active, deleted_at")
      .eq("id", id)
      .maybeSingle();
  },

  /* ===============================================================
     READ — image urls for storage cleanup
     ===============================================================
     Orijinal: .from("villa_images").select("image_url").eq("villa_id", id)
  =============================================================== */
  async findImageUrlsByVillaId(villaId: string) {
    return await dbAdmin
      .from("villa_images")
      .select("image_url")
      .eq("villa_id", villaId);
  },

  /* ===============================================================
     READ — villa title by id (audit entity_title enrichment)
     ===============================================================
     Orijinal (external-calendar deactivate + sync route, inline):
       dbAdmin.from("villa").select("title").eq("id", id).maybeSingle()
     Service-role; fail-soft audit kozmetiği (caller try/catch'ler).
  =============================================================== */
  async findTitleById(id: string) {
    return await dbAdmin
      .from("villa")
      .select("title")
      .eq("id", id)
      .maybeSingle();
  },

  /* ===============================================================
     READ — CLONE flow source fetches (clone.service.ts delege)
     ===============================================================
     Orijinal (clone.service Promise.all): 7 paralel service-role read.
     ⚠️ Select string'leri BİREBİR — özellikle villa `select("*")` (embed
        YOK; corePayload spread'i temiz) ve villa_distances
        `select("title, distance")` (unit sütunu YOK fix). */

  /** Master villa ham satırı — `select("*")` (embed YOK), .maybeSingle(). */
  async findRawById(id: string) {
    return await dbAdmin
      .from("villa")
      .select("*")
      .eq("id", id)
      .maybeSingle();
  },

  /** villa_type_relations → type_id list (villa_id ile). */
  async findTypeRelationIds(villaId: string) {
    return await dbAdmin
      .from("villa_type_relations")
      .select("type_id")
      .eq("villa_id", villaId);
  },

  /** villa_feature_relations → feature_id list (villa_id ile). */
  async findFeatureRelationIds(villaId: string) {
    return await dbAdmin
      .from("villa_feature_relations")
      .select("feature_id")
      .eq("villa_id", villaId);
  },

  /** villa_rule_relations → rule_id list (villa_id ile). */
  async findRuleRelationIds(villaId: string) {
    return await dbAdmin
      .from("villa_rule_relations")
      .select("rule_id")
      .eq("villa_id", villaId);
  },

  /** villa_price_include_relations → include_id list (villa_id ile). */
  async findPriceIncludeRelationIds(villaId: string) {
    return await dbAdmin
      .from("villa_price_include_relations")
      .select("include_id")
      .eq("villa_id", villaId);
  },

  /** villa_prices → start_date/end_date/price/currency (villa_id ile). */
  async findPricesForClone(villaId: string) {
    return await dbAdmin
      .from("villa_prices")
      .select("start_date, end_date, price, currency")
      .eq("villa_id", villaId);
  },

  /** villa_distances → title/distance (villa_id ile). ⚠️ `unit` sütunu
   *  YOK — select yalnız title+distance (distance metni serialized
   *  unit'i taşır). */
  async findDistancesForClone(villaId: string) {
    return await dbAdmin
      .from("villa_distances")
      .select("title, distance")
      .eq("villa_id", villaId);
  },

  /* ===============================================================
     READ — admin select list (/api/admin/villas GET delege)
     ===============================================================
     Slim projeksiyon (id, title, slug, is_active, deleted_at). Conditional:
       activeOnly → .eq("is_active", true).is("deleted_at", null)
                    .order("title", asc)   (homepage-collection consumer)
       default    → .is("deleted_at", null), order YOK (reservation form
                    consumer'ları). 🐛 FIX: çöp kutusundaki (deleted_at != null)
                    villalar rezervasyon seçim listelerinde görünmemeli; is_active
                    filtresi YOK → pasif villalar seçilebilir kalır (davranış aynı).
     ⚠️ Conditional chain + select string BİREBİR. activeOnly parse
        caller (route) tarafında. */
  async findAdminSelectList(activeOnly: boolean) {
    const baseQuery = dbAdmin
      .from("villa")
      .select("id, title, slug, is_active, deleted_at");
    return await (activeOnly
      ? baseQuery
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("title", { ascending: true })
      : baseQuery.is("deleted_at", null));
  },

  /* ===============================================================
     READ — villa context by id (/api/admin/villas/[id] GET delege)
     ===============================================================
     Reservation detail page için slim context fields; `.single()`
     resolver (satır yoksa error — maybeSingle DEĞİL). Select string
     BİREBİR. */
  async findContextById(id: string) {
    return await dbAdmin
      .from("villa")
      .select(
        "id, title, cleaning_fee, cleaning_currency, cleaning_limit, custom_prepayment_rate, deposit"
      )
      .eq("id", id)
      .single();
  },

  /* ===============================================================
     READ — villa_prices by villa_id (/api/admin/villas/[id]/prices GET)
     ===============================================================
     `select("*")` (tüm kolonlar), order YOK — route ham satırları döner
     (pricing transform/hesaplama route/consumer'da). BİREBİR. */
  async findPricesByVillaId(villaId: string) {
    return await dbAdmin
      .from("villa_prices")
      .select("*")
      .eq("villa_id", villaId);
  },

  /* ===============================================================
     READ — villa-zip download flow (/api/villa-zip/[token] GET delege)
     ===============================================================
     ZIP dosya adı + görsel listesi için 2 service-role read. Select
     string + order BİREBİR. */

  /** Villa slug/title — ZIP filename için, .maybeSingle(). */
  async findSlugTitleById(id: string) {
    return await dbAdmin
      .from("villa")
      .select("slug, title")
      .eq("id", id)
      .maybeSingle();
  },

  /** villa_images (image_url, sort_order) — sort_order ASC. ZIP entry
   *  sırası. */
  async findImagesForZip(villaId: string) {
    return await dbAdmin
      .from("villa_images")
      .select("image_url, sort_order")
      .eq("villa_id", villaId)
      .order("sort_order", { ascending: true });
  },

  /* ===============================================================
     WRITE — INSERT villa
     ===============================================================
     Orijinal: .insert(payload).select().single()
     ⚠️ `.select().single()` chain caller `newId` için kritik.
  =============================================================== */
  async insertVilla(payload: Record<string, unknown>) {
    return await dbAdmin
      .from("villa")
      .insert(payload)
      .select()
      .single();
  },

  /* ===============================================================
     WRITE — UPDATE villa
     ===============================================================
     Orijinal: .update(payload).eq("id", id)
     ⚠️ `.select()` chain YOK; service `return true`.
  =============================================================== */
  async updateVillaById(id: string, payload: Record<string, unknown>) {
    return await dbAdmin
      .from("villa")
      .update(payload)
      .eq("id", id);
  },

  /* ===============================================================
     WRITE — UPDATE is_active
     ===============================================================
     Orijinal:
       .update({ is_active: !!isActive })
       .eq("id", id)
       .is("deleted_at", null)
     ⚠️ deleted_at IS NULL predicate korunur.
  =============================================================== */
  async updateVillaActiveById(id: string, isActive: boolean) {
    return await dbAdmin
      .from("villa")
      .update({ is_active: !!isActive })
      .eq("id", id)
      .is("deleted_at", null);
  },

  /* ===============================================================
     WRITE — soft delete
     ===============================================================
     Orijinal:
       .update({ deleted_at: deletedAt })
       .eq("id", id)
       .is("deleted_at", null)
  =============================================================== */
  async softDeleteVillaById(id: string, deletedAt: string) {
    return await dbAdmin
      .from("villa")
      .update({ deleted_at: deletedAt })
      .eq("id", id)
      .is("deleted_at", null);
  },

  /* ===============================================================
     WRITE — restore (trash recovery)
     ===============================================================
     Orijinal:
       .update({ deleted_at: null, is_active: true })
       .eq("id", id)
       .not("deleted_at", "is", null)
  =============================================================== */
  async restoreVillaById(id: string) {
    return await dbAdmin
      .from("villa")
      .update({ deleted_at: null, is_active: true })
      .eq("id", id)
      .not("deleted_at", "is", null);
  },

  /* ===============================================================
     WRITE — final villa DELETE
     ===============================================================
     Orijinal: .delete().eq("id", id)
     ⚠️ FK SQLSTATE 23503 service edge'de TR mesajına çevrilir.
  =============================================================== */
  async hardDeleteVillaById(id: string) {
    return await dbAdmin
      .from("villa")
      .delete()
      .eq("id", id);
  },

  /* ===============================================================
     WRITE — private_access_token UPDATE
     ===============================================================
     Orijinal:
       .update({ private_access_token: token })
       .eq("id", villaId)
       .is("deleted_at", null)
     ⚠️ SQLSTATE 23505 service edge'de 1x retry.
  =============================================================== */
  async updatePrivateTokenById(villaId: string, token: string) {
    return await dbAdmin
      .from("villa")
      .update({ private_access_token: token })
      .eq("id", villaId)
      .is("deleted_at", null);
  },

  /* ===============================================================
     RELATION INSERT — TYPES (create flow)
  =============================================================== */
  async insertVillaTypeRelationRows(
    rows: Array<{ villa_id: string; type_id: string }>
  ) {
    return await dbAdmin.from("villa_type_relations").insert(rows);
  },

  /* ===============================================================
     RELATION INSERT — FEATURES (create flow)
  =============================================================== */
  async insertVillaFeatureRelationRows(
    rows: Array<{ villa_id: string; feature_id: string }>
  ) {
    return await dbAdmin.from("villa_feature_relations").insert(rows);
  },

  /* ===============================================================
     RELATION INSERT — RULES (create flow)
  =============================================================== */
  async insertVillaRuleRelationRows(
    rows: Array<{ villa_id: string; rule_id: string }>
  ) {
    return await dbAdmin.from("villa_rule_relations").insert(rows);
  },

  /* ===============================================================
     RELATION INSERT — PRICE INCLUDES (create flow)
     ⚠️ Relation kolonu `include_id` — `price_include_id` DEĞİL.
  =============================================================== */
  async insertVillaPriceIncludeRelationRows(
    rows: Array<{ villa_id: string; include_id: string }>
  ) {
    return await dbAdmin
      .from("villa_price_include_relations")
      .insert(rows);
  },

  /* ===============================================================
     RPC — TYPES atomic replace (update flow)
     ⚠️ RPC parameter shape AYNEN: { p_villa_id, p_type_ids }
  =============================================================== */
  async rpcReplaceVillaTypeRelations(
    villaId: string,
    typeIds: string[]
  ) {
    return await dbAdmin.rpc("replace_villa_type_relations", {
      p_villa_id: villaId,
      p_type_ids: typeIds,
    });
  },

  /* ===============================================================
     RPC — FEATURES atomic replace
  =============================================================== */
  async rpcReplaceVillaFeatureRelations(
    villaId: string,
    featureIds: string[]
  ) {
    return await dbAdmin.rpc("replace_villa_feature_relations", {
      p_villa_id: villaId,
      p_feature_ids: featureIds,
    });
  },

  /* ===============================================================
     RPC — RULES atomic replace
  =============================================================== */
  async rpcReplaceVillaRuleRelations(villaId: string, ruleIds: string[]) {
    return await dbAdmin.rpc("replace_villa_rule_relations", {
      p_villa_id: villaId,
      p_rule_ids: ruleIds,
    });
  },

  /* ===============================================================
     RPC — PRICE INCLUDES atomic replace
     ⚠️ RPC parameter adı `p_include_ids`.
  =============================================================== */
  async rpcReplaceVillaPriceIncludeRelations(
    villaId: string,
    includeIds: string[]
  ) {
    return await dbAdmin.rpc(
      "replace_villa_price_include_relations",
      {
        p_villa_id: villaId,
        p_include_ids: includeIds,
      }
    );
  },

  /* ===============================================================
     RELATION DELETE — hard delete cascade (7 metod)
     ===============================================================
     hard-delete.service.ts > Promise.all içindeki 7 DELETE.
     Array order STABLE (orchestrator çağrı sırası repository'i
     bağlamaz; sıralama service tarafında).
  =============================================================== */
  async deleteVillaImagesByVillaId(villaId: string) {
    return await dbAdmin
      .from("villa_images")
      .delete()
      .eq("villa_id", villaId);
  },
  async deleteVillaFeatureRelationsByVillaId(villaId: string) {
    return await dbAdmin
      .from("villa_feature_relations")
      .delete()
      .eq("villa_id", villaId);
  },
  async deleteVillaRuleRelationsByVillaId(villaId: string) {
    return await dbAdmin
      .from("villa_rule_relations")
      .delete()
      .eq("villa_id", villaId);
  },
  async deleteVillaPriceIncludeRelationsByVillaId(villaId: string) {
    return await dbAdmin
      .from("villa_price_include_relations")
      .delete()
      .eq("villa_id", villaId);
  },
  async deleteVillaTypeRelationsByVillaId(villaId: string) {
    return await dbAdmin
      .from("villa_type_relations")
      .delete()
      .eq("villa_id", villaId);
  },
  async deleteVillaDistancesByVillaId(villaId: string) {
    return await dbAdmin
      .from("villa_distances")
      .delete()
      .eq("villa_id", villaId);
  },
  async deleteVillaPricesByVillaId(villaId: string) {
    return await dbAdmin
      .from("villa_prices")
      .delete()
      .eq("villa_id", villaId);
  },

  /* ===============================================================
     RPC — DISTANCES atomic replace (villa-distance.service.ts delege)
     ===============================================================
     ⚠️ KAPSAM DIŞI BU TURDA: villa-distance.service.ts client'tan
       (villas/[id]/page.tsx) READ amaçlı import ediliyor; o yüzden
       service'in WRITE çağrısını burada bırakıp service tarafında
       ek bir routing eklemek SONRAKİ TURDA yapılacak.
     ⚠️ RPC parameter shape: { p_villa_id, p_distances jsonb }
  =============================================================== */
  async rpcReplaceVillaDistances(
    villaId: string,
    payload: Array<{ title: string; distance: string }>
  ) {
    return await dbAdmin.rpc("replace_villa_distances", {
      p_villa_id: villaId,
      p_distances: payload,
    });
  },

  /* ===============================================================
     RPC — PRICES atomic replace (villa-price.service.ts delege)
     ===============================================================
     ⚠️ KAPSAM DIŞI BU TURDA — yukarıdaki uyarı geçerli.
     ⚠️ RPC parameter shape: { p_villa_id, p_prices jsonb }
     ⚠️ pg_advisory_xact_lock DB-level concurrent admin replace
       serileştirir — değiştirilmez.
  =============================================================== */
  async rpcReplaceVillaPrices(
    villaId: string,
    payload: Array<{
      start_date: string;
      end_date: string;
      price: number;
      currency: string;
    }>
  ) {
    return await dbAdmin.rpc("replace_villa_prices", {
      p_villa_id: villaId,
      p_prices: payload,
    });
  },

  /* ===============================================================
     RPC — SORT ORDERS (sort.service.ts delege)
     ===============================================================
     ⚠️ RPC parameter shape: { p_updates jsonb }
     ⚠️ Boş array early return service edge'de.
  =============================================================== */
  async rpcSetVillaSortOrders(
    payload: Array<{ id: string; sort_order: number }>
  ) {
    return await dbAdmin.rpc("set_villa_sort_orders", {
      p_updates: payload,
    });
  },
};
