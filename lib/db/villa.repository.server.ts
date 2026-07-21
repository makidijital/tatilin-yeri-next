import "server-only";

/* 🛡️ NATIVE CUTOVER — native provider (parity doğrulandı: or/is/not,
   single→PGRST116, bulk insert, rpc void [replace_villa_* + set_villa_sort_
   orders], jsonb encoder [youtube_videos/bedroom_layout/bathroom_layout →
   JSON + jsonb cast; villa'da gerçek array kolonu yok], numeric/date/
   timestamptz/uuid parser, SQLSTATE). Servisler repo'yu doğrudan çağırır →
   type bridge GEREKMEZ (discriminated-union data narrowing). Method yüzeyi +
   dönüş şekli aynen. Runtime testi yeşil olmadan production'a deploy
   edilmemeli. */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

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
     READ — active villa location_id list (NATIVE twin, Migration S2)
     ===============================================================
     Anon `villaRepository.findActiveLocationIds` (Supabase) karşılığı.
     BYTE-IDENTICAL sorgu — tek fark `db` (anon) → `dbAdmin` (native):
       .from("villa").select("location_id")
         .eq("is_active", true).is("deleted_at", null)
     ⚠️ SONUÇ KÜMESİ PARITY: filtre `is_active=true AND deleted_at IS
        NULL` = villa public-görünür kümesi. Anon path'te RLS de aynı
        kümeyi döndürür → dbAdmin (RLS bypass) ile satır kümesi BİREBİR
        (RLS bypass etkisiz; filtre zaten kısıtlıyor).
     Return shape native `{ data, error }`; caller (cache.helpers >
     getCachedLocationVillaCounts) JS-side aggregate (Record<lid,count>)
     AYNEN. `location_id` uuid → string (pg-type-parsers) — anon ile
     field parity.
  =============================================================== */
  async findActiveLocationIds() {
    return await dbAdmin
      .from("villa")
      .select("location_id")
      .eq("is_active", true)
      .is("deleted_at", null);
  },

  /* ===============================================================
     READ — public availability config by id (NATIVE twin, Migration S3)
     ===============================================================
     Anon `villaRepository.findAvailabilityConfigById` (Supabase) karşılığı.
     BYTE-IDENTICAL — tek fark `db` (anon) → `dbAdmin` (native):
       .select("deposit, cleaning_fee, cleaning_currency, cleaning_limit,
                custom_prepayment_rate, minimum_stay_nights")
       .eq("id", id).maybeSingle()
     ⚠️ PARITY: villa BASE tablosunda restrictive RLS YOK (mig 019: anon
        role villa'ya blanket SELECT; görünürlük filtresi app-query
        katmanında). Bu method yalnız `.eq("id")` filtreler → anon (blanket
        SELECT) ve dbAdmin (RLS bypass) ANY villa için AYNI satırı döndürür
        (is_active/deleted_at'ten bağımsız) → RLS bypass inert, sapma yok.
     ⚠️ maybeSingle parity: 0 satır → { data: null, error: null }; 1 satır
        → { data: row, error: null }; >1 → error. Native queryMaybeOne
        BİREBİR. Alan tipleri: deposit/cleaning_fee/cleaning_limit/
        custom_prepayment_rate/minimum_stay_nights numeric→number,
        cleaning_currency text→string (pg-type-parsers) → anon ile field
        parity. Mapping/fallback caller'da (route) AYNEN.
  =============================================================== */
  async findAvailabilityConfigById(id: string) {
    return await dbAdmin
      .from("villa")
      .select(
        "deposit, cleaning_fee, cleaning_currency, cleaning_limit, custom_prepayment_rate, minimum_stay_nights"
      )
      .eq("id", id)
      .maybeSingle();
  },

  /* ===============================================================
     READ — public detail by slug (NATIVE EMBED twin, Migration S4A)
     ===============================================================
     Anon `villaRepository.findBySlug` karşılığı — İLK native embed.
     BYTE-IDENTICAL embed-select + filtre + maybeSingle; tek fark
     `db` (anon) → `dbAdmin` (native). KONTRAT da birebir: unwrap +
     error→null + `Record<string,unknown> | null` (caller `getVillaBySlug`
     call-site'ı DEĞİŞMEZ).

     EMBED'LER (yalnız 2; referencedTable/limit YOK — detail path TÜM
     image array'i):
       location:villa_locations(name)   [cardinality one]
       villa_images (image_url, is_cover, sort_order)  [cardinality many]
     relation-metadata (villa.location / villa.villa_images) native JSON
     korelasyon-subquery'ye çevirir; villa_images json_agg ORDER BY
     is_cover DESC + sort_order ASC (metadata default). ⚠️ Anon sorgu bu
     order'ı vermez ama `mapVilla` (villa.service) villa_images'ı AYNI
     kanona (is_cover önce, sort_order asc) JS-side re-sort eder → çıktı
     PARITY (dizi sırası maskeleniyor).

     PARITY (RLS): villa base'de restrictive RLS YOK (mig 019) + sorgu
     `is_active=true AND deleted_at IS NULL` explicit → dbAdmin bypass
     inert; anon (blanket SELECT + filtre) ile satır kümesi birebir.
     maybeSingle: 0→null, 1→row, >1→error (native queryMaybeOne = Supabase).
  =============================================================== */
  async findBySlug(slug: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await dbAdmin
      .from("villa")
      .select(
        `
        *,
        location:villa_locations(name),
        villa_images (
          image_url,
          is_cover,
          sort_order
        )
      `
      )
      .eq("slug", slug)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.error("[villa.repo.server.findBySlug] FAILED", error.message);
      return null;
    }
    return (data as Record<string, unknown> | null) || null;
  },

  /* ===============================================================
     READ — admin edit by id (NATIVE EMBED twin, Migration S4B)
     ===============================================================
     Anon `villaRepository.findById` karşılığı. BYTE-IDENTICAL embed-
     select (SELECT_BASIC: location + villa_images) + filtre + maybeSingle;
     tek fark `db` → `dbAdmin`. Kontrat birebir: unwrap + error→null +
     `Record<string,unknown> | null` (caller call-site DEĞİŞMEZ).

     ⚠️ findBySlug'dan TEK FARK: `is_active` filtresi YOK (admin pasif
     villayı da edit edebilmeli); `deleted_at IS NULL` KORUNUR. Embed'ler
     AYNI 2 (location one / villa_images many); referencedTable/limit/
     villa_prices YOK. mapVilla villa_images re-sort → array parity.
     PARITY (RLS): villa base restrictive RLS yok → anon (blanket SELECT)
     ve dbAdmin (bypass) aynı satırı döndürür; is_active filtresizliği
     iki tarafta da AYNI (bypass inert). maybeSingle: 0→null,1→row,>1→error.
  =============================================================== */
  async findById(id: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await dbAdmin
      .from("villa")
      .select(
        `
        *,
        location:villa_locations(name),
        villa_images (
          image_url,
          is_cover,
          sort_order
        )
      `
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.error("[villa.repo.server.findById] FAILED", error.message);
      return null;
    }
    return (data as Record<string, unknown> | null) || null;
  },

  /* ===============================================================
     READ — private/off-market by token (NATIVE EMBED twin, Migration S4B)
     ===============================================================
     Anon `villaRepository.findByPrivateToken` karşılığı. BYTE-IDENTICAL:
     boş/whitespace token guard → null; SELECT_BASIC embed (location +
     villa_images) + `.eq("private_access_token")` + `.is("deleted_at",null)`
     + maybeSingle; tek fark `db` → `dbAdmin`. Kontrat birebir (unwrap +
     error→null + `Record<string,unknown> | null`) → caller call-site DEĞİŞMEZ.

     ⚠️ is_active filtresi YOK (off-market/VIP preview esası — pasif villa
     token ile görünür); `deleted_at IS NULL` KORUNUR. Embed'ler AYNI 2;
     referencedTable/limit/villa_prices YOK. mapVilla villa_images re-sort
     → array parity. PARITY (RLS): villa base restrictive RLS yok → anon
     zaten is_active=false satırları token ile okuyabiliyor (bu method'un
     tasarım kanıtı); dbAdmin bypass ile satır kümesi birebir.
  =============================================================== */
  async findByPrivateToken(
    token: string
  ): Promise<Record<string, unknown> | null> {
    if (typeof token !== "string" || token.trim().length === 0) {
      return null;
    }
    const { data, error } = await dbAdmin
      .from("villa")
      .select(
        `
        *,
        location:villa_locations(name),
        villa_images (
          image_url,
          is_cover,
          sort_order
        )
      `
      )
      .eq("private_access_token", token)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.error(
        "[villa.repo.server.findByPrivateToken] FAILED",
        error.message
      );
      return null;
    }
    return (data as Record<string, unknown> | null) || null;
  },

  /* ===============================================================
     READ — trash list (NATIVE EMBED twin, Migration S4B.3)
     ===============================================================
     Anon `villaRepository.listTrashed` karşılığı. BYTE-IDENTICAL:
     SELECT_BASIC embed (location + villa_images) + `.not("deleted_at",
     "is", null)` + `.order("deleted_at", { ascending:false })`; tek fark
     `db` → `dbAdmin`. Kontrat birebir: LIST (array) — unwrap + error→[] +
     `Record<string,unknown>[]` (caller call-site DEĞİŞMEZ).

     ⚠️ LIST davranışı (maybeSingle YOK): yalnız soft-deleted satırlar
     (`deleted_at IS NOT NULL` → compiler negated-is, query-compiler:221)
     `deleted_at` DESC TOP-LEVEL order (referencedTable DEĞİL). Embed'ler
     AYNI 2; referencedTable/limit/villa_prices YOK. Trash kümesi küçük →
     per-row embed subquery maliyeti ihmal. mapVilla villa_images re-sort
     → array parity. PARITY (RLS): villa base restrictive RLS yok → anon
     zaten silinmiş satırları okuyabiliyor (trash bugün çalışıyor); dbAdmin
     bypass ile satır kümesi birebir.
  =============================================================== */
  async listTrashed(): Promise<Record<string, unknown>[]> {
    const { data, error } = await dbAdmin
      .from("villa")
      .select(
        `
        *,
        location:villa_locations(name),
        villa_images (
          image_url,
          is_cover,
          sort_order
        )
      `
      )
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (error) {
      console.error("[villa.repo.server.listTrashed] FAILED", error.message);
      return [];
    }
    return (data || []) as Record<string, unknown>[];
  },

  /* ===============================================================
     READ — public list + COVER-SLIM (NATIVE EMBED twin, Migration S5A)
     ===============================================================
     Anon `villaRepository.listPublic` karşılığı — İLK büyük LIST + ilk
     cover-slim (per-parent LIMIT 1) native embed. BYTE-IDENTICAL sorgu
     (SELECT_WITH_PRICES + filtre + referencedTable order + limit1 +
     top-level order); tek fark `db` → `dbAdmin`. Kontrat birebir: LIST
     (array) — unwrap + error→[] + `Record<string,unknown>[]` (caller
     call-site DEĞİŞMEZ).

     EMBED (3):
       location:villa_locations(name)             [one]
       villa_images(image_url,is_cover,sort_order) [many · COVER-SLIM]
       villa_prices(price,currency,start_date)     [many]

     ⚠️ COVER-SLIM byte-identical: `.order(is_cover desc/sort_order asc,
        {referencedTable:"villa_images"})` QueryBuilder:208 ile top-level'a
        EKLENMEZ; embed order relation-metadata'dan gelir ve villa_images
        metadata orderBy = `[is_cover desc, sort_order asc]` = bu order'la
        BİREBİR. `.limit(1,{referencedTable})` → embedLimits → compiler
        derived-table `... ORDER BY is_cover DESC, sort_order ASC LIMIT 1`
        + json_agg → per-villa TEK cover (1-elemanlı array). Anon ile aynı.
     ⚠️ villa_prices: order/limit yok → json_agg tüm satırlar (unordered);
        mapVilla getStartingPrice sıradan bağımsız min alır → parity.
     ⚠️ Top-level order: sort_order ASC, created_at DESC (drag-drop kontratı).
        Filtre is_active=true + deleted_at IS NULL → dbAdmin bypass inert.
     ⚠️ PERF (WARNING): N villa × 3 korelasyon-subquery; villa_images/
        villa_prices `.villa_id` FK index'i CI'de doğrulanmalı (ölçek).
  =============================================================== */
  async listPublic(): Promise<Record<string, unknown>[]> {
    const { data, error } = await dbAdmin
      .from("villa")
      .select(
        `
        *,
        location:villa_locations(name),
        villa_images (
          image_url,
          is_cover,
          sort_order
        ),
        villa_prices (
          price,
          currency,
          start_date
        )
      `
      )
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("is_cover", {
        referencedTable: "villa_images",
        ascending: false,
      })
      .order("sort_order", {
        referencedTable: "villa_images",
        ascending: true,
      })
      .limit(1, { referencedTable: "villa_images" })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[villa.repo.server.listPublic] FAILED", error.message);
      return [];
    }
    return (data || []) as Record<string, unknown>[];
  },

  /* ===============================================================
     READ — public /arama results (NATIVE EMBED twin, Migration S5B)
     ===============================================================
     Anon `villaRepository.findSearchResults` karşılığı. BYTE-IDENTICAL:
     CARD-style embed (villa_prices'ta `end_date` DAHİL) + cover-slim
     (villa_images is_cover desc/sort_order asc + limit1) + koşullu
     filtreler AYNI SIRAYLA + top-level order; tek fark `db` → `dbAdmin`.

     ⚠️ KONTRAT: `return await q` — HAM `{ data, error }` (unwrap YOK;
        caller `arama/page.tsx` `const { data, error } = villaRes` ile
        destructure eder). Bu yüzden listPublic'ten FARKLI: burada zarf
        ham döner.
     ⚠️ SEARCH: `.or()`/`.ilike()` YOK — arama caller'da hesaplanan
        `categoryVillaIds` + `expandedRegions` + `guests` üzerinden
        `.in("id")` / `.in("location_id")` / `.gte("guests")` (koşullu).
     ⚠️ COVER-SLIM listPublic ile aynı mekanizma (embedLimits + metadata
        orderBy `[is_cover desc, sort_order asc]`); top-level limit YOK.
        Filtre is_active=true + deleted_at IS NULL → dbAdmin bypass inert.
  =============================================================== */
  async findSearchResults(opts: {
    categoryVillaIds: string[] | null;
    expandedRegions: string[];
    guests: number | null;
  }) {
    let q = dbAdmin
      .from("villa")
      .select(
        `
        *,
        location:villa_locations(name),
        villa_images (
          image_url,
          is_cover,
          sort_order
        ),
        villa_prices (
          price,
          currency,
          start_date,
          end_date
        )
      `
      )
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("is_cover", {
        referencedTable: "villa_images",
        ascending: false,
      })
      .order("sort_order", {
        referencedTable: "villa_images",
        ascending: true,
      })
      .limit(1, { referencedTable: "villa_images" });
    if (opts.categoryVillaIds && opts.categoryVillaIds.length > 0) {
      q = q.in("id", opts.categoryVillaIds);
    }
    if (opts.expandedRegions.length) {
      q = q.in("location_id", opts.expandedRegions);
    }
    if (opts.guests) {
      q = q.gte("guests", opts.guests);
    }
    q = q
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    return await q;
  },

  /* ===============================================================
     READ — cards by ids / shared-list (NATIVE EMBED twin, Migration S5C)
     ===============================================================
     Anon `villaRepository.findCardsByIds` karşılığı (/liste/[token]).
     BYTE-IDENTICAL: card embed (villa_prices `end_date` dahil) + `.in("id")`
     + is_active/deleted_at + cover-slim (villa_images referencedTable order
     + limit1); tek fark `db` → `dbAdmin`.

     ⚠️ findSearchResults / listPublic'ten FARK: **top-level order YOK**
        (snapshot-order re-sort caller'da /liste sayfası). Native'de de
        top-level order eklenmez → array DB sırasında döner, caller
        yeniden sıralar → parity.
     ⚠️ Boş `ids`: method guard YOK; native `.in("id",[])` compiler'da
        `FALSE` emit eder (query-compiler:211-213) → boş sonuç, SQL hatası
        YOK → PostgREST empty-in ile PARITY.
     ⚠️ KONTRAT: `return await q` — ham `{ data, error }` (caller `rawErr`
        ile destructure). COVER-SLIM listPublic ile birebir (embedLimits +
        metadata orderBy). Filtre is_active+deleted_at → dbAdmin bypass inert.
  =============================================================== */
  async findCardsByIds(ids: string[]) {
    return await dbAdmin
      .from("villa")
      .select(
        `
      *,
      location:villa_locations(name),
      villa_images (image_url, is_cover, sort_order),
      villa_prices (price, currency, start_date, end_date)
    `
      )
      .in("id", ids)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("is_cover", {
        referencedTable: "villa_images",
        ascending: false,
      })
      .order("sort_order", {
        referencedTable: "villa_images",
        ascending: true,
      })
      .limit(1, { referencedTable: "villa_images" });
  },

  /* ===============================================================
     READ — similar villa cards (NATIVE EMBED twin, Migration S5D)
     ===============================================================
     Anon `villaRepository.findSimilarCards` karşılığı (villa detay
     "Benzer Villalar"). BYTE-IDENTICAL: card embed + cover-slim + koşullu
     `.eq("location_id")` + koşullu `.not("id","in","(...)")` (exclude) +
     top-level `.limit(opts.limit)`; tek fark `db` → `dbAdmin`.

     ⚠️ YENİ ELEMANLAR (önceki LIST sprintlerinde yoktu):
       • `.not("id","in","(id1,id2,…)")` → QueryBuilder (QB:188-192)
         `parseTupleValues` ile `[id1,id2]`'e ayrıştırıp `{not:{in}}`
         üretir; compiler `NOT (id IN ($n,…))` (query-compiler:223-224).
         Boş excludeIds'te caller `.not` çağırmaz (guard). PARITY.
       • Top-level `.limit(opts.limit)` → `limitValue` (QB:223) → `LIMIT n`.
     ⚠️ TOP-LEVEL ORDER YOK: `.limit(n)` ama `ORDER BY` yok → dönen ALT
        KÜME (aday > limit ise) DB-plan'a bağlı arbitrary. Bu non-determinism
        anon (PostgREST) tarafında da AYNI ŞEKİLDE var (regresyon DEĞİL);
        yalnız aday>limit uçlarında iki taraf FARKLI arbitrary alt küme
        döndürebilir → görsel CI doğrulaması önerilir. Filtre/kontrat birebir.
     ⚠️ COVER-SLIM listPublic ile byte-identical (embedLimits + metadata
        orderBy). KONTRAT: `return await q` ham `{data,error}` (caller
        `const { data } = ...`). Filtre is_active+deleted_at → bypass inert.
  =============================================================== */
  async findSimilarCards(opts: {
    locationId: string | null;
    excludeIds: string[];
    limit: number;
  }) {
    let q = dbAdmin
      .from("villa")
      .select(
        `
  *,
  location:villa_locations(name),
  villa_images ( image_url, is_cover, sort_order ),
  villa_prices ( price, currency, start_date, end_date )
`
      )
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("is_cover", { referencedTable: "villa_images", ascending: false })
      .order("sort_order", { referencedTable: "villa_images", ascending: true })
      .limit(1, { referencedTable: "villa_images" })
      .limit(opts.limit);
    if (opts.locationId) q = q.eq("location_id", opts.locationId);
    if (opts.excludeIds.length > 0) {
      q = q.not("id", "in", `(${opts.excludeIds.join(",")})`);
    }
    return await q;
  },

  /* ===============================================================
     READ — short-gap villa cards (NATIVE EMBED twin, Migration S5E)
     ===============================================================
     Anon `villaRepository.findShortGapVillas` karşılığı (/kisa-sureli-
     tarihler/[ay]/[gece]). BYTE-IDENTICAL: card embed + cover-slim + base
     `.in("id", gapVillaIds)` + koşullu region/type/guests; tek fark `db` →
     `dbAdmin`.

     ⚠️ TARİH/GAP filtresi bu method'da YOK: gap havuzu (`gapVillaIds`)
        caller'da availability'den hesaplanıp geçilir. RPC YOK, JOIN YOK
        (embed'ler korelasyon-subquery). Top-level order/limit YOK.
     ⚠️ İKİ `.in("id",…)` (base gapVillaIds + koşullu typeIdFilter) → her
        `.in` ayrı condition; compiler hepsini AND'ler (compileWhere) →
        `id IN(gap) AND id IN(type)` = KESİŞİM → PostgREST iki-`.in` AND
        semantiğiyle PARITY. Boş `.in([])` → compiler `FALSE` (empty-in
        guard) → boş sonuç, SQL hatası yok → parity.
     ⚠️ COVER-SLIM listPublic ile byte-identical. KONTRAT: `return await q`
        ham `{data,error}` (caller `const { data } = …`). Filtre is_active+
        deleted_at → dbAdmin bypass inert.
  =============================================================== */
  async findShortGapVillas(opts: {
    gapVillaIds: string[];
    expandedRegions: string[];
    typeIdFilter: string[] | null;
    guests: number;
  }) {
    let q = dbAdmin
      .from("villa")
      .select(
        `
      *,
      location:villa_locations(name),
      villa_images (image_url, is_cover, sort_order),
      villa_prices (price, currency, start_date, end_date)
    `
      )
      .eq("is_active", true)
      .is("deleted_at", null)
      .in("id", opts.gapVillaIds)
      .order("is_cover", {
        referencedTable: "villa_images",
        ascending: false,
      })
      .order("sort_order", {
        referencedTable: "villa_images",
        ascending: true,
      })
      .limit(1, { referencedTable: "villa_images" });
    if (opts.expandedRegions.length) {
      q = q.in("location_id", opts.expandedRegions);
    }
    if (opts.typeIdFilter) {
      q = q.in("id", opts.typeIdFilter);
    }
    if (opts.guests > 0) {
      q = q.gte("guests", opts.guests);
    }
    return await q;
  },

  /* ===============================================================
     READ — admin curator cards (NATIVE EMBED twin, Migration S5F)
     ===============================================================
     Anon `villaRepository.findActiveCuratorCards` karşılığı (/maki-admin/
     villa-listesi). BYTE-IDENTICAL: SLIM kolon projeksiyonu + card embed +
     cover-slim + top-level order; tek fark `db` → `dbAdmin`.

     ⚠️ YENİ ELEMAN: top-level **SLIM kolon listesi** (`*` DEĞİL) — id, slug,
        title, location_id, badge, guests, bedrooms, bathrooms, cleaning_fee,
        cleaning_currency, cleaning_limit. compiler `compileColumns` her
        kolonu quote'lar (query-compiler:257); FROM villa tek tablo + embed
        subquery → qualification/ambiguity yok. PostgREST slim select ile
        aynı key kümesi → field parity.
     ⚠️ AKTİF CURATOR filtresi: yalnız `is_active=true AND deleted_at IS NULL`
        (özel curator filtresi yok). id filtresi/limit/count/range YOK.
        Top-level order: sort_order ASC, created_at DESC (listPublic ile aynı).
     ⚠️ COVER-SLIM listPublic ile byte-identical. villa_prices `end_date`
        dahil (card). KONTRAT: `return await q` ham `{data,error}` (caller
        `villasRes.error`). Filtre → dbAdmin bypass inert.
  =============================================================== */
  async findActiveCuratorCards() {
    return await dbAdmin
      .from("villa")
      .select(
        `
        id, slug, title, location_id, badge,
        guests, bedrooms, bathrooms,
        cleaning_fee, cleaning_currency, cleaning_limit,
        location:villa_locations(name),
        villa_images (image_url, is_cover, sort_order),
        villa_prices (price, currency, start_date, end_date)
      `
      )
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("is_cover", {
        referencedTable: "villa_images",
        ascending: false,
      })
      .order("sort_order", {
        referencedTable: "villa_images",
        ascending: true,
      })
      .limit(1, { referencedTable: "villa_images" })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
  },

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
