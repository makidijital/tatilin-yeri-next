import { supabase } from "@/lib/supabase";

import VillaListesiClient, {
  type VillaListesiRow,
  type LocationOption,
  type CategoryOption,
} from "./_components/VillaListesiClient";

/* ===============================================================
   🏛️ ADMIN — VILLA LISTESİ (concierge curator)
   ===============================================================
   Admin: müşteriye özel villa seçkisi hazırlar.
   Public hero search mantığıyla filtre uygular, sonuçlardan
   manuel villa seçer, "Listeyi Paylaş" → kısa token URL üretir.
   Müşteri /liste/[token] sayfasında aynı premium UX'le görür.

   Server bileşeni: read-only data fetch (active villas + locations).
   Filter / select / share UX'i `VillaListesiClient`'a (client) devreder.

   PRICING:
     Caller (client) tarih girdiğinde VillaCard `calculateGrandTotal`
     ile total + gece + temizlik dahil bilgisini render eder; tarih
     girmediyse `getStartingPrice` fallback'i devreye girer. Aynı
     /arama sayfası pattern'i.

   ZERO-IMPACT:
     - Booking engine, availability merge, reservation create,
       pricing engine, currency conversion DOKUNULMAZ.
     - Mevcut /arama page query'si bağımsız; bu sayfa kendi
       hafif Supabase fetch'ini yapar (admin scope ~ az villa).
   =============================================================== */

export const dynamic = "force-dynamic";

/* Raw row shape — slim payload optimizasyonu sonrası villa kolonları
   render'da gerçekten tüketilen 13 alana indirildi (description,
   pool_*, indoor_pool_*, child_pool_*, bedroom_layout, bathroom_layout,
   youtube_videos, tourism_document_number, owner_id, commission_rate,
   deposit, rules, included_items, address, vb. — VillaCard'da
   kullanılmayan ~45 kolon artık çekilmez). villa_images embed cover-
   only (lib/db/villa.repository.ts:120-134 slim-embed pattern). */
type RawVilla = {
  id: string;
  slug: string | null;
  title: string | null;
  location_id: string | null;
  badge: string | null;
  guests: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  price: number | null;
  currency: string | null;
  cleaning_fee: number | null;
  cleaning_currency: string | null;
  cleaning_limit: number | null;
  location: { name: string | null } | { name: string | null }[] | null;
  villa_images:
    | {
        image_url: string | null;
        is_cover: boolean | null;
        sort_order: number | null;
      }[]
    | null;
  villa_prices:
    | {
        price: number | null;
        currency: string | null;
        start_date: string;
        end_date: string;
      }[]
    | null;
};

export default async function VillaListesiPage() {
  /* Active villas + locations + categories + type relations paralel
     fetch. SELECT pattern /arama ve villaRepository.listPublic ile
     birebir aynı (yıldız + embed). */
  const [villasRes, locationsRes, typesRes, relationsRes] = await Promise.all([
    supabase
      .from("villa")
      .select(
        `
        id, slug, title, location_id, badge,
        guests, bedrooms, bathrooms,
        price, currency,
        cleaning_fee, cleaning_currency, cleaning_limit,
        location:villa_locations(name),
        villa_images (image_url, is_cover, sort_order),
        villa_prices (price, currency, start_date, end_date)
      `
      )
      .eq("is_active", true)
      .is("deleted_at", null)
      /* 🛡️ SLIM-EMBED villa_images — cover-only (lib/db/villa.repository.ts
         listForAdmin paterni). is_cover öncelikli + sort_order tie-break
         ile sıralayıp limit(1, referencedTable) → 10-25 satır/villa yerine
         1 satır. VillaCard zaten yalnız images[0]'ı kullanıyor; davranış
         birebir korunur. */
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
      .order("created_at", { ascending: false }),
    supabase
      .from("villa_locations")
      .select("id, name, filter_group_name")
      .order("name", { ascending: true }),
    supabase
      .from("villa_types")
      .select("id, name")
      .order("name", { ascending: true }),
    /* villa_type_relations: M:N junction. Tüm satırları çekiyoruz —
       admin scope (varsayım: <500 villa × birkaç kategori). Client
       tarafı bunu villa.id → categoryId[] map'ine dönüştürür ve
       in-memory filter uygular. Public /arama page'i URL-driven SSR
       round-trip yapıyor; admin client-side flow için bu yeterli. */
    supabase
      .from("villa_type_relations")
      .select("villa_id, type_id"),
  ]);

  /* Silent failure → console'a yansıt (server log). UI tarafı boş
     state ile çökmez; ama operasyon ekibi neden boş geldiğini görür. */
  if (villasRes.error) {
    console.error(
      "[villa-listesi.fetch] villas FAILED",
      villasRes.error.message
    );
  }
  if (locationsRes.error) {
    console.error(
      "[villa-listesi.fetch] locations FAILED",
      locationsRes.error.message
    );
  }
  if (typesRes.error) {
    console.error(
      "[villa-listesi.fetch] types FAILED",
      typesRes.error.message
    );
  }
  if (relationsRes.error) {
    console.error(
      "[villa-listesi.fetch] type_relations FAILED",
      relationsRes.error.message
    );
  }

  const rawVillas: RawVilla[] = (villasRes.data || []) as RawVilla[];

  /* Normalize — VillaCard prop shape + curator selection için. */
  const villas: VillaListesiRow[] = rawVillas.map((v) => {
    /* Image cover-first sort. */
    const imgs = Array.isArray(v.villa_images) ? v.villa_images : [];
    const sortedImgs = [...imgs].sort((a, b) => {
      if (a?.is_cover) return -1;
      if (b?.is_cover) return 1;
      return (a?.sort_order ?? 0) - (b?.sort_order ?? 0);
    });
    const images = sortedImgs
      .map((i) => i?.image_url)
      .filter(
        (u): u is string => typeof u === "string" && u.trim().length > 0
      );

    /* Location name embed (object | array | null). */
    const locName = (() => {
      const l = v.location;
      if (!l) return "";
      if (Array.isArray(l)) return l[0]?.name || "";
      return l.name || "";
    })();

    /* Stay prices — VillaCard `calculateGrandTotal` için. */
    const rawPrices = Array.isArray(v.villa_prices) ? v.villa_prices : [];
    const prices = rawPrices
      .filter(
        (p) =>
          !!p &&
          typeof p.start_date === "string" &&
          typeof p.end_date === "string" &&
          p.start_date.length > 0 &&
          p.end_date.length > 0
      )
      .map((p) => ({
        price: Number(p.price || 0),
        currency: p.currency || "TRY",
        start_date: p.start_date,
        end_date: p.end_date,
      }));

    return {
      id: v.id,
      slug: v.slug || "",
      title: v.title || "",
      location_id: v.location_id || "",
      location: locName,
      price: v.price,
      currency: v.currency,
      images,
      badge: v.badge,
      guests: v.guests,
      bedrooms: v.bedrooms,
      bathrooms: v.bathrooms,
      cleaning_fee: Number(v.cleaning_fee || 0),
      cleaning_currency: v.cleaning_currency || "TRY",
      cleaning_limit: Number(v.cleaning_limit || 0),
      prices,
    };
  });

  const locations: LocationOption[] = ((locationsRes.data || []) as Array<{
    id: string;
    name: string | null;
    filter_group_name?: string | null;
  }>).map((l) => ({
    id: l.id,
    name: l.name || "",
    filter_group_name: l.filter_group_name ?? null,
  }));

  const categories: CategoryOption[] = ((typesRes.data || []) as Array<{
    id: string;
    name: string | null;
  }>).map((t) => ({ id: t.id, name: t.name || "" }));

  /* villa.id → categoryIds[] map. Client filter O(1) lookup. */
  const rawRelations = (relationsRes.data || []) as Array<{
    villa_id: string;
    type_id: string;
  }>;
  const villaCategoryMap: Record<string, string[]> = {};
  for (const r of rawRelations) {
    if (!r?.villa_id || !r?.type_id) continue;
    (villaCategoryMap[r.villa_id] ??= []).push(r.type_id);
  }

  return (
    <div className="space-y-8">
      <header className="admin-page-header">
        <div>
          <p className="admin-page-eyebrow">Pazarlama</p>
          <h1 className="admin-page-header__title">Villa Listesi</h1>
          <p className="admin-page-header__sub">
            Müşteriye özel bir villa seçkisi hazırla. Filtre uygula,
            beğendiklerini seç, &ldquo;Listeyi Paylaş&rdquo; ile
            paylaşılabilir bağlantı oluştur.
          </p>
        </div>
      </header>

      <VillaListesiClient
        villas={villas}
        locations={locations}
        categories={categories}
        villaCategoryMap={villaCategoryMap}
      />
    </div>
  );
}
