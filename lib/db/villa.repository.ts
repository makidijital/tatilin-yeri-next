import { db } from "@/lib/db";
import { normalizeSearchText, escapeLikePattern } from "@/lib/search";

/* ===============================================================
   🛡️ FAZ 32 — VILLA REPOSITORY (Data Access Layer)
   ===============================================================
   AMAÇ:
     Direct `db.from("villa")` çağrılarını üst katmandan
     soyutla. Service katmanı (app/services/villa.service.ts) artık
     Supabase'i değil bu repository'yi import eder.

   PRODUCTION-SAFE YAKLAŞIM:
     - Query'ler BİREBİR aynı (filter chain, order chain, select string)
     - Return shape: raw Supabase row dizisi/objesi — service layer
       mapVilla ile DTO'ya çevirir (mevcut davranış aynen)
     - Yeni hata handling YOK; console.error semantic'i korundu
     - Yeni cache layer YOK; mevcut getCachedVillas tag sistemi
       service üstünde duruyor
     - is_active / deleted_at / sort_order kuralları AYNI
     - getVillaByPrivateToken kuralları AYNI (is_active filter YOK,
       deleted_at IS NULL var)

   GELECEK MIGRATION ZEMINI:
     Bu interface stabil; ileride Supabase yerine başka bir client
     (Drizzle, Prisma, direct pg) takılırsa sadece bu dosya değişir.
     Service ve route katmanları dokunulmaz.

   DOKUNULMAYAN:
     - VillaDTO shape (service'te)
     - mapVilla (service'te)
     - Cache architecture (lib/cache.helpers.ts)
     - revalidate.actions.ts
     - Tüm admin mutation servisleri
     - Tüm route'lar
   =============================================================== */

/* ---------------------------------------------------------------
   🛡️ RAW ROW SHAPE
   ---------------------------------------------------------------
   Service tarafındaki `Villa` raw tipi ile birebir aynı yapı.
   Tipi service tarafında tutmaya devam ediyoruz (mevcut import
   path'leri dokunulmasın); repository içinde generic kullanım için
   loose record shape yeterli.
=============================================================== */
export type VillaRawRow = Record<string, unknown>;

/* ---------------------------------------------------------------
   🛡️ SELECT CLAUSE'LARI (mevcut davranışla birebir)
   ---------------------------------------------------------------
   İki ayrı pattern var ve TÜM mevcut fonksiyonlar bu patternleri
   kullanıyor — birebir koruyoruz:

     SELECT_WITH_PRICES → getVillas, getVillasForAdmin (liste sayfaları)
     SELECT_BASIC       → getVillaById, getVillaBySlug,
                          getVillaByPrivateToken, getTrashedVillas
=============================================================== */
/* 🛡️ SCALE HARDENING — `villa_images` embed slim'i.
   Hot list path'lerinde (listPublic / listForAdmin / findByIds —
   VillaCard'a beslenen) embed `villa_images` artık YALNIZ COVER
   image'ı çeker. VillaCard ham `images[]` array'inden `.find(...)`
   ile ilk geçerli URL'i kullanıyor; eski multi-row payload (10-30
   image/villa) liste/kart ekranında bütünüyle israftı.

   1500 villa × 10-30 image (eski) → 15-45k row JSON
   1500 villa × 1 image  (yeni)    → 1.5k row JSON
   ~80% payload azalması; runtime davranış AYNEN (VillaCard
   .find() ilk URL'i seçiyor).

   ⚠️ VillaCard cover seçim heuristic'i (is_cover) AYNEN korunur —
   embed ordering ile `is_cover` öncelikli + sort_order tie-break;
   böylece dönen 1 row hep doğru cover. Caller .find loop'u yine
   defansif çalışır (1-row array'de match ilk satır). */
const SELECT_WITH_PRICES = `
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
`;

/* SELECT_BASIC: detail/trash/find* yollarında kullanılır. Detail
   sayfası (`/kiralik-villa/[slug]`) Gallery component'ine TÜM
   image array'ini gönderir; bu yüzden BURADA slim YOK — detail
   path'leri tek-villa, payload zaten küçük. */
const SELECT_BASIC = `
  *,
  location:villa_locations(name),
  villa_images (
    image_url,
    is_cover,
    sort_order
  )
`;

/* ===============================================================
   🛡️ READ-SIDE REPOSITORY
   ===============================================================
   Tüm fonksiyonlar:
     - Sıfır business logic (mapping, filtering hesabı yok)
     - Pure DB read
     - Hata durumunda console.error + null/[] döner (mevcut semantic)
   =============================================================== */

/* ===============================================================
   🛡️ SEARCH SANITIZE — PostgREST .or() güvenli quoting
   ===============================================================
   AMAÇ:
     `listForAdmin` ve `countForAdmin` aynı q escape mantığını
     paylaşır → tek helper. Mevcut "yalnız ILIKE wildcard escape"
     (`%` `_`) yetersiz: `,` `(` `)` `"` `\` karakterleri PostgREST
     `.or()` parser'ı tarafından syntax olarak yorumlanır → query
     başarısız → boş liste + FAILED log.

   POSTGREST RESMİ ÇÖZÜM:
     Value içeriği "double quotes" ile sarılır; içerideki `\` ve `"`
     backslash ile escape edilir.
     Örnek: or=(search_title.ilike."%deniz kalkan%",slug.ilike."%O'Brien%")

   AKIŞ (her value için):
     1. Backslash önce escape (sıralama kritik — sonra eklenen
        escape'leri çift escape etmemek için)
     2. ILIKE wildcard escape (% ve _ → \% \_) — mevcut davranış
     3. Çift tırnak escape (" → \")
     4. Değeri çift tırnak içine al

   ⚠️ TÜRKÇE TOLERANS (migration 065):
     Başlık tarafı artık ham `title` yerine normalize edilmiş
     `search_title` kolonu üzerinde aranır. Sorgu `normalizeSearchText`
     ile AYNI kanona (TR-fold + lower + whitespace) indirgenir → "ırmak"
     ↔ "Irmak" eşleşir. SLUG tarafı DEĞİŞMEZ: slug zaten `slugifyTr` ile
     ascii-normalize edilmiş olduğundan HAM q ile aranır (eski davranış
     birebir korunur). Helper hem `listForAdmin` hem `countForAdmin`'de
     kullanıldığı için filter parity → pagination + count DEĞİŞMEZ.

   `'` (tek tırnak) — Supabase JS HTTP query string'inde URL-encode
     edilir; SQL parametrize binding yok ama PostgREST katmanı tek
     tırnağı value içinde güvenli işler. Defansif escape gerekmez.
=============================================================== */
function buildVillaSearchOrClause(q: string): string {
  /* PostgREST .or() güvenli quoting — value başına uygulanır. */
  const escapeOrValue = (v: string) =>
    v
      .replace(/\\/g, "\\\\") // 1) backslash → \\
      .replace(/[%_]/g, (m) => `\\${m}`) // 2) ILIKE wildcard escape
      .replace(/"/g, '\\"'); // 3) çift tırnak → \"
  /* 4) Değeri çift tırnak içine al — virgül/parantez/nokta gibi
     PostgREST operator karakterlerini izole eder.
     Başlık: normalize edilmiş q → search_title (TR-tolerant).
     Slug: HAM q → slug (davranış değişmez). */
  const titleQuoted = `"%${escapeOrValue(normalizeSearchText(q))}%"`;
  const slugQuoted = `"%${escapeOrValue(q)}%"`;
  return `search_title.ilike.${titleQuoted},slug.ilike.${slugQuoted}`;
}

export const villaRepository = {
  /* PUBLIC LIST — homepage / homepage collections fallback / kategori
     pages tarafından kullanılır.
       - is_active = true  → pasif villalar gizli
       - deleted_at IS NULL → soft-deleted gizli
       - order: sort_order ASC, created_at DESC (drag-drop kontratı) */
  async listPublic(): Promise<VillaRawRow[]> {
    const { data, error } = await db
      .from("villa")
      .select(SELECT_WITH_PRICES)
      .eq("is_active", true)
      .is("deleted_at", null)
      /* 🛡️ SCALE HARDENING — `villa_images` embed per-villa slim:
         is_cover öncelikli + sort_order tie-break ile sıralayıp tek
         row alıyoruz. VillaCard cover-only kullanıyor; runtime
         davranış aynen. */
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
      console.error("[villa.repo.listPublic] FAILED", error.message);
      return [];
    }
    return (data || []) as VillaRawRow[];
  },

  /* ADMIN CURATOR CARDS — /maki-admin/villa-listesi (concierge seçki).
     Active villalar (is_active + deleted_at null), SLIM projeksiyon —
     render'da tüketilen kolonlar + embed'ler. ⚠️ listPublic DEĞİL:
     (1) `SELECT_WITH_PRICES` (`*`, villa_prices end_date YOK) yerine slim
     kolon listesi + villa_prices'ta `end_date` DAHİL; (2) listPublic hatayı
     yutup `[]` döner — burada caller kendi `if (res.error)` log'unu yapar,
     bu yüzden NATIVE `{ data, error }` döner. Filter + villa_images cover-
     slim + top-level order (sort_order asc → created_at desc) BİREBİR. */
  async findActiveCuratorCards() {
    return await db
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

  /* ADMIN LIST — pasif villalar dahil; soft-deleted hariç.
     Frontend public list ile birebir order; admin drag-drop sırası.

     🛡️ OPT-IN PAGINATION + SEARCH (backward-compat):
       opts UNDEFINED → eski davranış: tam liste, LIMIT/OFFSET yok.
       Sıralama paneli (VillaSortPanel) bu path'i kullanır — global
       sort_order semantiği gerektirir.

       opts VERILDIYSE:
         - limit + offset: PostgREST `.range(from, to)` half-open
         - q (search): title VEYA slug üzerinde ILIKE (case-insensitive).
           `%` ve `_` user input sanitize edilir (wildcard injection
           önlemi).

     ⚠️ Sözleşme: opts undefined = byte-identical eski davranış. */
  async listForAdmin(opts?: {
    limit?: number;
    offset?: number;
    q?: string;
    active?: boolean;
    document?: "licensed" | "unlicensed";
  }): Promise<VillaRawRow[]> {
    let query = db
      .from("villa")
      .select(SELECT_WITH_PRICES)
      .is("deleted_at", null);

    /* OPSIYONEL: aktif/pasif filtresi (operasyon ekranı status filtresi).
       active undefined → filtre YOK (tüm villalar; eski davranış birebir).
       active=true → yalnız aktif, active=false → yalnız pasif.
       ⚠️ countForAdmin ile BİREBİR aynı olmalı (count parity). */
    if (opts?.active !== undefined) {
      query = query.eq("is_active", opts.active);
    }

    /* OPSIYONEL: belge (T.C. Kültür ve Turizm Bakanlığı belge no) filtresi.
       document undefined → filtre YOK (eski davranış birebir).
       ⚠️ countForAdmin ile BİREBİR aynı olmalı (count parity). */
    if (opts?.document === "licensed") {
      query = query.not("tourism_document_number", "is", null);
    } else if (opts?.document === "unlicensed") {
      query = query.is("tourism_document_number", null);
    }

    /* OPSIYONEL: server-side search (operasyon ekranı pagination yolu).
       q sanitize: PostgREST .or() güvenli quoting + ILIKE wildcard
       escape — buildVillaSearchOrClause helper'ı (üstte). */
    if (opts?.q && opts.q.trim().length > 0) {
      query = query.or(buildVillaSearchOrClause(opts.q.trim()));
    }

    query = query
      /* 🛡️ SCALE HARDENING — embed slim (admin VillaCard cover-only). */
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

    /* OPSIYONEL: pagination. opts undefined → range çağrılmaz →
       PostgREST tam liste döner (eski davranış BYTE-IDENTICAL). */
    if (
      typeof opts?.limit === "number" &&
      typeof opts?.offset === "number" &&
      opts.limit > 0
    ) {
      query = query.range(opts.offset, opts.offset + opts.limit - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[villa.repo.listForAdmin] FAILED", error.message);
      return [];
    }
    return (data || []) as VillaRawRow[];
  },

  /* ADMIN COUNT — pagination toplam sayfa hesabı için.
     `count: "exact" + head: true` → satır dönmez, yalnız count.
     `q` filtresi listForAdmin ile birebir aynı semantik (filtered total).
     Sıralama paneli bu method'u ASLA çağırmaz; yalnız operasyon
     ekranı pagination için. */
  async countForAdmin(opts?: {
    q?: string;
    active?: boolean;
    document?: "licensed" | "unlicensed";
  }): Promise<number> {
    let query = db
      .from("villa")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);

    /* Aktif/pasif filtresi — listForAdmin ile BİREBİR aynı (count parity).
       active undefined → filtre YOK (eski davranış). */
    if (opts?.active !== undefined) {
      query = query.eq("is_active", opts.active);
    }

    /* Belge filtresi — listForAdmin ile BİREBİR aynı (count parity).
       document undefined → filtre YOK (eski davranış). */
    if (opts?.document === "licensed") {
      query = query.not("tourism_document_number", "is", null);
    } else if (opts?.document === "unlicensed") {
      query = query.is("tourism_document_number", null);
    }

    if (opts?.q && opts.q.trim().length > 0) {
      /* Aynı helper — listForAdmin ile filter parity garantisi
         (count ≠ items uyumsuzluğu önlenir). */
      query = query.or(buildVillaSearchOrClause(opts.q.trim()));
    }

    const { count, error } = await query;
    if (error) {
      console.error("[villa.repo.countForAdmin] FAILED", error.message);
      return 0;
    }
    return count || 0;
  },

  /* TRASH — yalnız soft-deleted (deleted_at IS NOT NULL).
     En son silinen üstte. SELECT_BASIC (price ilişkisi gerekmez). */
  async listTrashed(): Promise<VillaRawRow[]> {
    const { data, error } = await db
      .from("villa")
      .select(SELECT_BASIC)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (error) {
      console.error("[villa.repo.listTrashed] FAILED", error.message);
      return [];
    }
    return (data || []) as VillaRawRow[];
  },

  /* ADMIN EDIT YOLU — id ile, soft-deleted hariç. is_active filter
     YOK (admin pasif villayı edit edebilmeli). */
  async findById(id: string): Promise<VillaRawRow | null> {
    const { data, error } = await db
      .from("villa")
      .select(SELECT_BASIC)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.error("[villa.repo.findById] FAILED", error.message);
      return null;
    }
    return (data as VillaRawRow | null) || null;
  },

  /* PUBLIC DETAIL YOLU — slug ile, is_active + deleted_at filtreli.
     Bulunamazsa null → caller 404 renderlar. */
  async findBySlug(slug: string): Promise<VillaRawRow | null> {
    const { data, error } = await db
      .from("villa")
      .select(SELECT_BASIC)
      .eq("slug", slug)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.error("[villa.repo.findBySlug] FAILED", error.message);
      return null;
    }
    return (data as VillaRawRow | null) || null;
  },

  /* ADMIN EDIT HYDRATE — raw full row (`select("*")`) by id, `.single()`.
     Admin villa edit page (client) form hydrate. ⚠️ findById/findBySlug
     (SELECT_BASIC embed + maybeSingle + mapped null) REUSE EDİLMEZ — bu
     ham `*` + `.single()` (satır yoksa error) native `{ data, error }`
     döner; hydrate helper'ları caller'da. Anon `db` (client-safe). */
  async findRawByIdSingle(id: string) {
    return await db
      .from("villa")
      .select("*")
      .eq("id", id)
      .single();
  },

  /* PUBLIC AVAILABILITY CONFIG — /api/public/villas/[id]/availability.
     Booking modal config alanları (deposit, cleaning_*, prepayment,
     min stay). Anon `db` (villa public_read RLS). Select field order +
     .maybeSingle() BİREBİR; mapping/fallback caller'da (route). */
  async findAvailabilityConfigById(id: string) {
    return await db
      .from("villa")
      .select(
        "deposit, cleaning_fee, cleaning_currency, cleaning_limit, custom_prepayment_rate, minimum_stay_nights"
      )
      .eq("id", id)
      .maybeSingle();
  },

  /* ALL id/title/slug — order YOK. Manual reservation "ekle" sayfası villa
     dropdown'ı. 🐛 FIX: çöp kutusundaki (deleted_at != null) villalar seçim
     listesinde görünmemeli → `.is("deleted_at", null)`. is_active filtresi
     YOK (pasif villalar seçilebilir kalır — davranış korunur). Anon `db`. */
  async findAllIdTitleSlug() {
    return await db
      .from("villa")
      .select("id, title, slug")
      .is("deleted_at", null);
  },

  /* SLUG BY ID — admin galeri sayfası (storage human-readable folder).
     `select("slug").eq("id").maybeSingle()` BİREBİR; fail-soft (data?.slug
     ?? null) caller'da. Anon `db` (client-safe). */
  async findSlugById(id: string) {
    return await db
      .from("villa")
      .select("slug")
      .eq("id", id)
      .maybeSingle();
  },

  /* ID/TITLE/CURRENCY BY ID — admin pricing calendar canvas (EDIT mode).
     `select("id, title, currency").eq("id").maybeSingle()` BİREBİR;
     guard + fallback caller'da. Anon `db` (client-safe). */
  async findIdTitleCurrencyById(villaId: string) {
    return await db
      .from("villa")
      .select("id, title, currency")
      .eq("id", villaId)
      .maybeSingle();
  },

  /* SEARCH RESULTS — public /arama villa listesi (conditional builder).
     CARD-style embed (`villa_prices` içinde `end_date` DAHİL) + is_active +
     deleted_at null + villa_images cover-slim (is_cover desc + sort_order
     asc + limit 1). Opsiyonel filtreler SIRASI BİREBİR: id → location_id →
     guests, ardından top-level order (sort_order ASC, created_at DESC).
     ⚠️ Top-level limit YOK. Filter değerleri (categoryVillaIds/
     expandedRegions/guests) caller'da hesaplanır. Anon `db` (public_read). */
  async findSearchResults(opts: {
    categoryVillaIds: string[] | null;
    expandedRegions: string[];
    guests: number | null;
  }) {
    let q = db
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

  /* CARDS BY IDS — public shared-list (/liste/[token]) landing. CARD-style
     embed (`villa_prices` içinde `end_date` DAHİL) + `.in("id", ids)` +
     is_active + deleted_at null + villa_images cover-slim (is_cover desc +
     sort_order asc + limit 1). ⚠️ findByIds DEĞİL: top-level limit YOK,
     created_at order YOK, dedup guard YOK. Snapshot-order re-sort caller'da.
     Anon `db` (public_read). Select + order chain BİREBİR. */
  async findCardsByIds(ids: string[]) {
    return await db
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

  /* SHORT-GAP VILLAS — /kisa-sureli-tarihler/[ay]/[gece] kısa-gap kartları.
     CARD-style embed (`villa_prices` içinde `end_date` DAHİL) + is_active +
     deleted_at null + `.in("id", gapVillaIds)` (gap havuzu) + villa_images
     cover-slim (is_cover desc + sort_order asc + limit 1). Sonra opsiyonel
     filtreler AYNI SIRAYLA: location_id (bölge) → id (tip kesişimi; caller
     dummy-uuid guard'ı hazırlar) → guests gte.
     ⚠️ findSearchResults DEĞİL: top-level sort_order/created_at order YOK;
     base `.in("id")` UNCONDITIONAL + ikinci opsiyonel `.in("id")` (tip).
     Anon `db` (public_read). Select + filter chain BİREBİR. */
  async findShortGapVillas(opts: {
    gapVillaIds: string[];
    expandedRegions: string[];
    typeIdFilter: string[] | null;
    guests: number;
  }) {
    let q = db
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

  /* SIMILAR VILLAS CARDS — villa detail "Benzer Villalar" section.
     Public villa cards (is_active + deleted_at null). CARD_SELECT embed
     (`villa_prices` içinde `end_date` DAHİL — SELECT_WITH_PRICES'ten farklı),
     villa_images cover-slim (is_cover desc + sort_order asc + limit 1),
     top-level limit, opsiyonel location_id + excludeIds(.not id in).
     Select string + order chain + conditional builder BİREBİR; mapping
     (getStartingPrice / image sort) caller'da. Anon `db` (public_read). */
  async findSimilarCards(opts: {
    locationId: string | null;
    excludeIds: string[];
    limit: number;
  }) {
    let q = db
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

  /* 🛡️ FAZ 36 — BY IDS (guest favorites support).
     /favoriler client component'i localStorage'dan villa.id dizisi
     okur ve bu yol ile data fetch eder.
       - `.in("id", ids)` ile tek round-trip
       - visibility filter: is_active=true + deleted_at IS NULL
         → silinmiş/pasif villalar listede görünmez (mevcut public
           visibility kontratı parity)
       - SELECT_WITH_PRICES → VillaCard prop'ları (price/currency)
         direkt mapVilla ile beslenir
       - Empty input → tek query bile yapma; instant [].
       - Sıralama: created_at DESC (en yeni favori en üstte; gelecek
         davranış: localStorage insertion order ile re-sort) */
  async findByIds(ids: string[]): Promise<VillaRawRow[]> {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    /* Defansif: yalnız string + non-empty entry. */
    const cleaned = Array.from(
      new Set(
        ids.filter(
          (x): x is string => typeof x === "string" && x.length > 0
        )
      )
    );
    if (cleaned.length === 0) return [];

    const { data, error } = await db
      .from("villa")
      .select(SELECT_WITH_PRICES)
      .in("id", cleaned)
      .eq("is_active", true)
      .is("deleted_at", null)
      /* 🛡️ SCALE HARDENING — embed slim (favorites VillaCard cover-only). */
      .order("is_cover", {
        referencedTable: "villa_images",
        ascending: false,
      })
      .order("sort_order", {
        referencedTable: "villa_images",
        ascending: true,
      })
      .limit(1, { referencedTable: "villa_images" })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[villa.repo.findByIds] FAILED", error.message);
      return [];
    }
    return (data || []) as VillaRawRow[];
  },

  /* PRIVATE / TEMPORARY TOKEN YOLU — token ile.
       - is_active filter UYGULANMAZ (off-market preview esası)
       - deleted_at IS NULL korunur (silinmiş villaya erişim yok)
     Caller'da token validity guard zaten var; defansif olarak burada
     da empty/whitespace token → null. */
  async findByPrivateToken(token: string): Promise<VillaRawRow | null> {
    if (typeof token !== "string" || token.trim().length === 0) {
      return null;
    }
    const { data, error } = await db
      .from("villa")
      .select(SELECT_BASIC)
      .eq("private_access_token", token)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.error("[villa.repo.findByPrivateToken] FAILED", error.message);
      return null;
    }
    return (data as VillaRawRow | null) || null;
  },

  /* SITEMAP SLIM — yalnız slug + created_at (public görünür villalar).
     Exit hardening: sitemap.ts'in inline `supabase.from("villa")
     .select("slug, created_at")` sorgusunun birebir karşılığı.
     Filtre + fail-soft ([] on error) AYNEN. Embed/order YOK (sitemap
     sıralama yapmaz).

     🛡️ SCALE HARDENING — CHUNKED FETCH:
     Supabase PostgREST varsayılan `max-rows` = 1000. `.range` yokken
     1000'inci satırdan sonrası sessizce kesilir → sitemap eksik
     üretilir (SEO kaybı, log yok). Çözüm: sayfalı `.range(start,
     start+pageSize-1)` döngüsü. pageSize=1000, dönen satır <
     pageSize ise döngü biter. Defansif guard MAX_PAGES=200 (200×1000
     = 200k villa; bu sınırın üstünde sitemap-index'e geçmek gerekir).

     Public sözleşme (signature + return type + fail-soft) BYTE-
     IDENTICAL — sitemap.ts call site dokunulmaz. */
  async listPublicSlugs(): Promise<
    { slug: string | null; created_at: string | null }[]
  > {
    const PAGE_SIZE = 1000;
    const MAX_PAGES = 200;

    const out: { slug: string | null; created_at: string | null }[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await db
        .from("villa")
        .select("slug, created_at")
        .eq("is_active", true)
        .is("deleted_at", null)
        .range(from, to);

      if (error) {
        console.error("[villa.repo.listPublicSlugs] FAILED", error.message);
        return [];
      }
      const batch = (data || []) as {
        slug: string | null;
        created_at: string | null;
      }[];
      out.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }
    return out;
  },

  /* HEADER SEARCH — Türkçe-aware villa adı araması (header + hero).
     ⚠️ ESKİ: `.ilike("title", %t%)` — Postgres ILIKE Türkçe noktalı/
     noktasız i (i/ı/İ/I) çiftini AYNI kabul etmediği için "ırmak" →
     "Villa Irmak" eşleşmiyordu (0 sonuç).
     YENİ (DB-LEVEL, JS full-fetch YOK): migration 065 ile eklenen
     GENERATED STORED `search_title` kolonu (translate TR-fold + lower +
     whitespace normalize) üzerinde ILIKE. Sorgu tarafı aynı kanona
     `normalizeSearchText` ile indirgenir + `escapeLikePattern` ile
     wildcard escape edilir. Infix eşleşme pg_trgm GIN indexinden
     (villa_search_title_trgm_idx) faydalanır. Dönen shape (id, title,
     slug, villa_images[]) + is_active/deleted_at filtresi + limit KORUNUR. */
  async searchByTitle(
    term: string,
    limit = 5
  ): Promise<
    {
      id: string;
      title: string | null;
      slug: string | null;
      villa_images: {
        image_url: string | null;
        is_cover: boolean | null;
        sort_order: number | null;
      }[];
    }[]
  > {
    const needle = normalizeSearchText(term);
    if (needle.length === 0) return [];
    const pattern = `%${escapeLikePattern(needle)}%`;
    const { data, error } = await db
      .from("villa")
      .select(
        `id, title, slug, villa_images (image_url, is_cover, sort_order)`
      )
      .eq("is_active", true)
      .is("deleted_at", null)
      .ilike("search_title", pattern)
      .limit(limit);

    if (error) {
      console.error("[villa.repo.searchByTitle] FAILED", error.message);
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []) as any[];
  },

  /* ===============================================================
     READ — active villa location_id list (cache.helpers >
     getCachedLocationVillaCounts delege)
     ===============================================================
     Orijinal (cache.helpers inline):
       supabase.from("villa").select("location_id")
         .eq("is_active", true).is("deleted_at", null)
     ⚠️ Slim projeksiyon (yalnız location_id); order YOK. JS-side
        aggregate (Record<locationId, count>) caller'da KALIR.
     Native `{ data, error }` döner (cache.helpers fallback `{}` branch'i
     error/data null durumunu kendisi ele alır). */
  async findActiveLocationIds() {
    return await db
      .from("villa")
      .select("location_id")
      .eq("is_active", true)
      .is("deleted_at", null);
  },

  /* ===============================================================
     READ — active villas (id + images) by id list (cache.helpers >
     getCachedCategoryCovers 2-step join'inin 2. adımı)
     ===============================================================
     Orijinal (cache.helpers inline):
       supabase.from("villa")
         .select(`id, villa_images ( image_url, is_cover, sort_order )`)
         .in("id", villaIds).eq("is_active", true).is("deleted_at", null)
     ⚠️ Slim embed (id + villa_images); villa_prices/location YOK,
        order YOK (caller cover heuristic'i JS-side sort eder).
        Empty-id guard caller'da (villaIds.length === 0 → erken return).
     Native `{ data, error }` döner; aggregate caller'da KALIR. */
  async findActiveImagesByIds(ids: string[]) {
    return await db
      .from("villa")
      .select(
        `
        id,
        villa_images (
          image_url,
          is_cover,
          sort_order
        )
      `
      )
      .in("id", ids)
      .eq("is_active", true)
      .is("deleted_at", null);
  },
};

/* ===============================================================
   🛡️ FAZ 37 — VILLA-ADMIN WRITE-SIDE EXTENSION
   ===============================================================
   24 yeni metod villa repository'ye eklendi: write-side cycle
   (create + update + visibility + sort + private-token + hard-delete +
   relation INSERT/RPC replace + distance/price RPC + storage cleanup
   READ + slug collision check).

   ⚠️ KESIN KURAL — 7 RPC PARAMETER SHAPE BYTE-IDENTICAL:
     replace_villa_type_relations(p_villa_id, p_type_ids)
     replace_villa_feature_relations(p_villa_id, p_feature_ids)
     replace_villa_rule_relations(p_villa_id, p_rule_ids)
     replace_villa_price_include_relations(p_villa_id, p_include_ids)
        ⚠️ Kolon adı `include_id` (price_include_id DEĞİL); RPC
           parameter `p_include_ids`.
     replace_villa_distances(p_villa_id, p_distances jsonb)
     replace_villa_prices(p_villa_id, p_prices jsonb)
        ⚠️ pg_advisory_xact_lock DB-level concurrent serileştirme.
     set_villa_sort_orders(p_updates jsonb)

   ⚠️ KESIN KURAL — Repository sessiz:
     - Throw YOK; console YOK; SQLSTATE parse YOK.
     - Service edge'de business decisions (FK 23503 mesajı, token
       collision 23505 retry, idempotent token reuse, slug fallback
       loop, hard delete cascade order, storage best-effort, distance
       unit serialize, currency fallback, date format).
=============================================================== */

export const villaAdminRepository = {
  /* ===============================================================
     READ — slug collision query (generateUniqueSlug helper delege)
     ===============================================================
     Orijinal (_helpers/slug.ts > generateUniqueSlug):
       db.from("villa").select("id").eq("slug", slug).limit(1)
                .neq("id", excludeId)?
  =============================================================== */
  async findSlugCollision(slug: string, excludeId?: string) {
    let query = db
      .from("villa")
      .select("id")
      .eq("slug", slug)
      .limit(1);
    if (excludeId) {
      query = query.neq("id", excludeId);
    }
    return await query;
  },

  /* ===============================================================
     READ — private token lookup (idempotent reuse + deleted_at guard)
     ===============================================================
     Orijinal (private-token.service.ts L48-52):
       db.from("villa")
         .select("id, private_access_token, deleted_at")
         .eq("id", villaId)
         .maybeSingle()
  =============================================================== */
  async findForPrivateTokenLookup(id: string) {
    return await db
      .from("villa")
      .select("id, private_access_token, deleted_at")
      .eq("id", id)
      .maybeSingle();
  },

  /* ===============================================================
     READ — image URLs (storage cleanup helper için)
     ===============================================================
     Orijinal (_helpers/storage-cleanup.ts L32-35):
       db.from("villa_images").select("image_url").eq("villa_id", id)
  =============================================================== */
  async findImageUrlsByVillaId(villaId: string) {
    return await db
      .from("villa_images")
      .select("image_url")
      .eq("villa_id", villaId);
  },

  /* ===============================================================
     READ — villa distances (getVillaDistances delege)
     ===============================================================
     Orijinal (villa-distance.service.ts > getVillaDistances):
       db.from("villa_distances").select("*")
         .eq("villa_id", villaId)
         .order("created_at", { ascending: true })
  =============================================================== */
  async findVillaDistances(villaId: string) {
    return await db
      .from("villa_distances")
      .select("*")
      .eq("villa_id", villaId)
      .order("created_at", { ascending: true });
  },

  /* ===============================================================
     READ — villa prices (getVillaPrices delege)
     ===============================================================
     Orijinal (villa-price.service.ts > getVillaPrices):
       db.from("villa_prices").select("*")
         .eq("villa_id", villaId)
         .order("start_date", { ascending: true })
  =============================================================== */
  async findVillaPrices(villaId: string) {
    return await db
      .from("villa_prices")
      .select("*")
      .eq("villa_id", villaId)
      .order("start_date", { ascending: true });
  },

  /* ===============================================================
     WRITE — INSERT villa (create.service.ts delege)
     ===============================================================
     Orijinal: .insert(payload).select().single()
     ⚠️ `.select().single()` chain caller `newId` için kritik.
  =============================================================== */
  async insertVilla(payload: Record<string, unknown>) {
    return await db
      .from("villa")
      .insert(payload)
      .select()
      .single();
  },

  /* ===============================================================
     WRITE — UPDATE villa (update.service.ts delege)
     ===============================================================
     Orijinal: .update(payload).eq("id", id)
     ⚠️ `.select()` chain YOK; service `return true`.
  =============================================================== */
  async updateVillaById(id: string, payload: Record<string, unknown>) {
    return await db
      .from("villa")
      .update(payload)
      .eq("id", id);
  },

  /* ===============================================================
     WRITE — UPDATE is_active (visibility.setActive delege)
     ===============================================================
     Orijinal:
       .update({ is_active: !!isActive })
       .eq("id", id)
       .is("deleted_at", null)
     ⚠️ deleted_at IS NULL predicate — deleted villalar dokunulmaz.
  =============================================================== */
  async updateVillaActiveById(id: string, isActive: boolean) {
    return await db
      .from("villa")
      .update({ is_active: !!isActive })
      .eq("id", id)
      .is("deleted_at", null);
  },

  /* ===============================================================
     WRITE — soft delete (visibility.softDeleteVilla delege)
     ===============================================================
     Orijinal:
       .update({ deleted_at: new Date().toISOString() })
       .eq("id", id)
       .is("deleted_at", null)
     ⚠️ ISO timestamp service edge'de generate edilir
        (caller `new Date().toISOString()` geçer). Repository inline
        generate ETMEZ — semantic clean (service decides "now").
  =============================================================== */
  async softDeleteVillaById(id: string, deletedAt: string) {
    return await db
      .from("villa")
      .update({ deleted_at: deletedAt })
      .eq("id", id)
      .is("deleted_at", null);
  },

  /* ===============================================================
     WRITE — restore (visibility.restoreVilla delege)
     ===============================================================
     Orijinal:
       .update({ deleted_at: null, is_active: true })
       .eq("id", id)
       .not("deleted_at", "is", null)
     ⚠️ Idempotent predicate: yalnız silinmiş villalara uygulanır.
  =============================================================== */
  async restoreVillaById(id: string) {
    return await db
      .from("villa")
      .update({ deleted_at: null, is_active: true })
      .eq("id", id)
      .not("deleted_at", "is", null);
  },

  /* ===============================================================
     WRITE — final villa DELETE (hard-delete.service.ts delege)
     ===============================================================
     Orijinal: .from("villa").delete().eq("id", id)
     ⚠️ FK SQLSTATE 23503 service edge'de "Bu villaya bağlı..."
        mesajına çevrilir; repository ham error döner.
  =============================================================== */
  async hardDeleteVillaById(id: string) {
    return await db
      .from("villa")
      .delete()
      .eq("id", id);
  },

  /* ===============================================================
     WRITE — private_access_token UPDATE (private-token.service.ts delege)
     ===============================================================
     Orijinal:
       .update({ private_access_token: token })
       .eq("id", villaId)
       .is("deleted_at", null)
     ⚠️ SQLSTATE 23505 (unique constraint) service edge'de 1x retry.
  =============================================================== */
  async updatePrivateTokenById(villaId: string, token: string) {
    return await db
      .from("villa")
      .update({ private_access_token: token })
      .eq("id", villaId)
      .is("deleted_at", null);
  },

  /* ===============================================================
     RELATION INSERT — TYPES (create flow)
     ===============================================================
     Orijinal: .from("villa_type_relations").insert(rows)
     rows shape: { villa_id, type_id }[]
  =============================================================== */
  async insertVillaTypeRelationRows(
    rows: Array<{ villa_id: string; type_id: string }>
  ) {
    return await db.from("villa_type_relations").insert(rows);
  },

  /* ===============================================================
     RELATION INSERT — FEATURES (create flow)
     ===============================================================
     rows shape: { villa_id, feature_id }[]
  =============================================================== */
  async insertVillaFeatureRelationRows(
    rows: Array<{ villa_id: string; feature_id: string }>
  ) {
    return await db.from("villa_feature_relations").insert(rows);
  },

  /* ===============================================================
     RELATION INSERT — RULES (create flow)
     ===============================================================
     rows shape: { villa_id, rule_id }[]
  =============================================================== */
  async insertVillaRuleRelationRows(
    rows: Array<{ villa_id: string; rule_id: string }>
  ) {
    return await db.from("villa_rule_relations").insert(rows);
  },

  /* ===============================================================
     RELATION INSERT — PRICE INCLUDES (create flow)
     ===============================================================
     ⚠️ Relation kolonu `include_id` — `price_include_id` DEĞİL.
     rows shape: { villa_id, include_id }[]
  =============================================================== */
  async insertVillaPriceIncludeRelationRows(
    rows: Array<{ villa_id: string; include_id: string }>
  ) {
    return await db
      .from("villa_price_include_relations")
      .insert(rows);
  },

  /* ===============================================================
     RPC — TYPES atomic replace (update flow)
     ===============================================================
     ⚠️ RPC parameter shape AYNEN: { p_villa_id, p_type_ids }
     DB-level DELETE+INSERT tek transaction'da.
  =============================================================== */
  async rpcReplaceVillaTypeRelations(
    villaId: string,
    typeIds: string[]
  ) {
    return await db.rpc("replace_villa_type_relations", {
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
    return await db.rpc("replace_villa_feature_relations", {
      p_villa_id: villaId,
      p_feature_ids: featureIds,
    });
  },

  /* ===============================================================
     RPC — RULES atomic replace
  =============================================================== */
  async rpcReplaceVillaRuleRelations(villaId: string, ruleIds: string[]) {
    return await db.rpc("replace_villa_rule_relations", {
      p_villa_id: villaId,
      p_rule_ids: ruleIds,
    });
  },

  /* ===============================================================
     RPC — PRICE INCLUDES atomic replace
     ===============================================================
     ⚠️ RPC parameter adı `p_include_ids` (price_include_id DEĞİL).
  =============================================================== */
  async rpcReplaceVillaPriceIncludeRelations(
    villaId: string,
    includeIds: string[]
  ) {
    return await db.rpc(
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
     Array order STABLE — caller orchestrator aynı sırayla geçer.
     Repository sıralama YAPMAZ; sadece tek-tablo DELETE.
  =============================================================== */
  async deleteVillaImagesByVillaId(villaId: string) {
    return await db
      .from("villa_images")
      .delete()
      .eq("villa_id", villaId);
  },
  async deleteVillaFeatureRelationsByVillaId(villaId: string) {
    return await db
      .from("villa_feature_relations")
      .delete()
      .eq("villa_id", villaId);
  },
  async deleteVillaRuleRelationsByVillaId(villaId: string) {
    return await db
      .from("villa_rule_relations")
      .delete()
      .eq("villa_id", villaId);
  },
  async deleteVillaPriceIncludeRelationsByVillaId(villaId: string) {
    return await db
      .from("villa_price_include_relations")
      .delete()
      .eq("villa_id", villaId);
  },
  async deleteVillaTypeRelationsByVillaId(villaId: string) {
    return await db
      .from("villa_type_relations")
      .delete()
      .eq("villa_id", villaId);
  },
  async deleteVillaDistancesByVillaId(villaId: string) {
    return await db
      .from("villa_distances")
      .delete()
      .eq("villa_id", villaId);
  },
  async deleteVillaPricesByVillaId(villaId: string) {
    return await db
      .from("villa_prices")
      .delete()
      .eq("villa_id", villaId);
  },

  /* ===============================================================
     RPC — DISTANCES atomic replace (villa-distance.service.ts delege)
     ===============================================================
     ⚠️ RPC parameter shape: { p_villa_id, p_distances jsonb }
     ⚠️ Payload normalize (unit re-serialize, title trim, drop empty)
        service edge'de yapılır; repository payload'a müdahil olmaz.
  =============================================================== */
  async rpcReplaceVillaDistances(
    villaId: string,
    payload: Array<{ title: string; distance: string }>
  ) {
    return await db.rpc("replace_villa_distances", {
      p_villa_id: villaId,
      p_distances: payload,
    });
  },

  /* ===============================================================
     RPC — PRICES atomic replace (villa-price.service.ts delege)
     ===============================================================
     ⚠️ RPC parameter shape: { p_villa_id, p_prices jsonb }
     ⚠️ pg_advisory_xact_lock DB-level concurrent admin replace
        serileştirir — değiştirilmez.
     ⚠️ Date format ("sv-SE") + currency fallback ("TRY") service
        edge'de.
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
    return await db.rpc("replace_villa_prices", {
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
    return await db.rpc("set_villa_sort_orders", {
      p_updates: payload,
    });
  },
};

/* ---------------------------------------------------------------
   🛡️ DEFAULT EXPORT (tercih edilen named import zaten yukarıda).
   ---------------------------------------------------------------
   Named export pattern'i istisna olmadığında tercih edilir; default
   export YOK — accidentally type-import drift'i önler. */
