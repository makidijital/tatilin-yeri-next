import VillaCard from "@/app/components/villa/VillaCard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveVillaImageUrl } from "@/lib/storage.helpers";
import { getStartingPrice } from "@/lib/price.engine";

/* ===============================================================
   🛡️ BENZER VİLLALAR — full-width section (kompakt)
   ===============================================================
   Villa detayında, Misafir Yorumları'ndan SONRA, footer'dan ÖNCE.
   Tamamen additive; mevcut VillaCard olduğu gibi kullanılır.

   VERİ KURALLARI (DEĞİŞMEDİ):
     1) Aynı location_id öncelikli · 2) Mevcut villa hariç ·
     3) Aktif + silinmemiş · 4) <3 ise diğer aktiflerle 3'e tamamla.
   QUERY: MAX 2 (location_id prop'tan; lookup query YOK).

   💰 FİYAT: Normal listeleme (mapVilla) gibi `villa_prices`'tan üretilir
   → getStartingPrice (price.engine, min pozitif gecelik). villa.price
   kolonu boş olsa bile gerçek fiyat gösterilir; gereksiz "Fiyat sorunuz"
   önlenir. (mapVilla `villa_prices[0]` kullanır; burada min-pozitif daha
   sağlam ama AYNI veri kaynağı + AYNI engine.)
   =============================================================== */

const CARD_SELECT = `
  *,
  location:villa_locations(name),
  villa_images ( image_url, is_cover, sort_order ),
  villa_prices ( price, currency, start_date, end_date )
` as const;

type VillaImageEmbed = {
  image_url: string | null;
  is_cover: boolean | null;
  sort_order: number | null;
};
type VillaPriceEmbed = {
  price: number | null;
  currency: string | null;
  start_date: string | null;
  end_date: string | null;
};
type SimilarRow = {
  id: string;
  slug: string | null;
  title: string | null;
  badge: string | null;
  currency: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  guests: number | null;
  location: { name: string } | null;
  villa_images: VillaImageEmbed[] | null;
  villa_prices: VillaPriceEmbed[] | null;
};

type Props = {
  villaId: string;
  locationId: string | null;
};

async function fetchCardVillas(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  opts: { locationId: string | null; excludeIds: string[]; limit: number }
): Promise<SimilarRow[]> {
  if (opts.limit <= 0) return [];
  let q = supabase
    .from("villa")
    .select(CARD_SELECT)
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
  const { data } = await q;
  return Array.isArray(data) ? (data as SimilarRow[]) : [];
}

export default async function SimilarVillasSection({
  villaId,
  locationId,
}: Props) {
  const supabase = await createSupabaseServerClient();

  /* Query 1 — aynı bölge (location_id varsa). */
  const primary = locationId
    ? await fetchCardVillas(supabase, {
        locationId,
        excludeIds: [villaId],
        limit: 3,
      })
    : [];

  let rows: SimilarRow[] = primary;

  /* Query 2 — yalnız 3'e ulaşılmadıysa fallback dolum. */
  if (rows.length < 3) {
    const exclude = [villaId, ...rows.map((r) => r.id)];
    const fill = await fetchCardVillas(supabase, {
      locationId: null,
      excludeIds: exclude,
      limit: 3 - rows.length,
    });
    rows = [...rows, ...fill];
  }

  if (rows.length === 0) return null;

  const villas = rows.map((v) => {
    let images: string[] = [];
    const raw: VillaImageEmbed[] = Array.isArray(v.villa_images)
      ? v.villa_images
      : [];
    if (raw.length > 0) {
      const sorted = [...raw].sort((a, b) => {
        if (a?.is_cover) return -1;
        if (b?.is_cover) return 1;
        return (a?.sort_order ?? 0) - (b?.sort_order ?? 0);
      });
      images = sorted
        .map((i) => resolveVillaImageUrl(i?.image_url))
        .filter(
          (u): u is string => typeof u === "string" && u.trim().length > 0
        );
    }
    /* Fiyat — listeleme ile aynı kaynak (villa_prices) + aynı engine. */
    const sp = getStartingPrice(v.villa_prices ?? []);
    return {
      id: v.id,
      slug: v.slug ?? "",
      title: v.title ?? "",
      location: v.location?.name ?? "",
      price: sp?.price,
      currency: sp?.currency || v.currency || "TRY",
      images,
      badge: v.badge ?? undefined,
      bedrooms: v.bedrooms || 1,
      bathrooms: v.bathrooms || 1,
      guests: v.guests || 2,
    };
  });

  return (
    <section className="w-full -mt-10 md:-mt-14">
      <div className="max-w-[1280px] mx-auto px-5 md:px-10 lg:px-16 pt-2 md:pt-4 pb-10 md:pb-14">
        <h2 className="font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] tracking-[-0.02em] mb-6 md:mb-8">
          Benzer Villalar
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {villas.map((villa) => (
            <VillaCard
              key={villa.id}
              id={villa.id}
              slug={villa.slug}
              title={villa.title}
              location={villa.location}
              price={villa.price}
              currency={villa.currency}
              images={villa.images}
              badge={villa.badge}
              bedrooms={villa.bedrooms}
              bathrooms={villa.bathrooms}
              guests={villa.guests}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
