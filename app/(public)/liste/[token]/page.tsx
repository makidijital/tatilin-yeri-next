import { notFound } from "next/navigation";
import Link from "next/link";
import { Sparkles, Users, MapPin, CalendarRange } from "lucide-react";

/* 🛡️ FAZ 4A — SSR-AWARE client. Liste RSC public-readable villa
   tabloları okuyor; runtime davranış AYNEN. */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveVillaImageUrl } from "@/lib/storage.helpers";
import VillaCard from "@/app/components/villa/VillaCard";
import { getStartingPrice } from "@/lib/price.engine";
import { getSharedVillaListByToken } from "@/app/services/shared-villa-list.service";

/* ===============================================================
   🛡️ /liste/[token] — admin curator share landing
   ===============================================================
   Admin: /maki-admin/villa-listesi'nden filtre + curate sonucu
   üretilen kısa token URL'i bu sayfaya düşer. Müşteri normal
   /arama sayfası deneyimi gibi premium VillaCard grid görür —
   ama sadece admin'in seçtiği villalar.

   PRICING:
     - searchParams snapshot'ında start+end varsa VillaCard
       `calculateGrandTotal` ile total + gece + temizlik dahil
       gösterir (date-bound pricing context).
     - Yoksa starting price fallback (`getStartingPrice`).
     - Currency conversion `VillaCard` içinde `convertPrice` ile.

   FILTER:
     - search_params snapshot SADECE pricing context; villa
       filtreleme YAPMAZ. Liste manuel curate edilmiş ID'lerden
       oluşur — admin'in seçtiği villalar tam olarak gösterilir.

   ZERO-IMPACT:
     - Reservation/booking/pricing engine, availability merge,
       currency context — DOKUNULMAZ.
     - Favorites share (021) sistemi bağımsız kalır.
   =============================================================== */

export const dynamic = "force-dynamic";

/* Public-shareable URL → SEO crawl edilmemesi gerekir. */
export const metadata = {
  robots: { index: false, follow: false },
};

type RawVilla = {
  id: string;
  slug: string | null;
  title: string | null;
  is_active: boolean | null;
  deleted_at: string | null;
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

export default async function SharedVillaListPage({
  params,
}: {
  /* Next.js 16 async params kontratı. */
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  /* 1) Token resolve — revoke/expire guard service içinde.
        Sadece token yok / revoke / expire durumunda erkendeki
        notFound. Curated villalar boş gelebilir (hepsi pasif/
        silinmiş olabilir) — onu adım 2'den sonra değerlendiriyoruz. */
  const list = await getSharedVillaListByToken(token);
  if (!list) {
    console.warn(
      "[liste.fetch] token resolve null — token yok / revoke / expire",
      { token }
    );
    notFound();
  }

  /* 2) Villa ID'lerine göre prices + cleaning + image embed fetch.
        Service `villas: VillaDTO[]` zaten döner ama VillaDTO date-bound
        pricing için gerekli `prices[]` array'ini exposed etmiyor. Bu
        nedenle landing page kendi pricing-aware fetch'ini yapar.

        SELECT pattern: `*` + embed — admin /villa-listesi ve /arama
        ile birebir. Açık column listesi + alias embed kombinasyonu
        Supabase JS'de silent empty result yaratıyordu; FIX. */
  const snapshotIds: string[] = Array.isArray(list.villas)
    ? list.villas.map((v) => v.id).filter(Boolean)
    : [];

  /* Boş snapshot — TÜM curated villalar pasif/silinmiş veya
     getVillasByIds visibility filter ile elendi. Listede gösterilecek
     hiçbir villa kalmadı → notFound (user spec: "final villa listesi
     TAMAMEN boşsa → 404"). */
  if (snapshotIds.length === 0) {
    console.warn(
      "[liste.fetch] snapshotIds empty — tüm curated villalar pasif/silinmiş",
      { token, snapshot_count: list.snapshot_count }
    );
    notFound();
  }

  /* 🛡️ FAZ 4A — request-scoped Supabase client (cookies-aware).
     Identifier `supabase` korundu; query AYNEN. */
  const supabase = await createSupabaseServerClient();

  const { data: rawVillas, error: rawErr } = await supabase
    .from("villa")
    .select(
      `
      *,
      location:villa_locations(name),
      villa_images (image_url, is_cover, sort_order),
      villa_prices (price, currency, start_date, end_date)
    `
    )
    .in("id", snapshotIds)
    .eq("is_active", true)
    .is("deleted_at", null)
    /* 🛡️ SCALE HARDENING — villa_images embed slim (cover-only). */
    .order("is_cover", {
      referencedTable: "villa_images",
      ascending: false,
    })
    .order("sort_order", {
      referencedTable: "villa_images",
      ascending: true,
    })
    .limit(1, { referencedTable: "villa_images" });

  /* Silent failure → server log'a yansıt. UI fall-through olur:
     boş listede notFound zaten çağrılıyor, ops debug için neden
     boş geldiğini görür. */
  if (rawErr) {
    console.error("[liste.fetch] villa rows FAILED", rawErr.message);
  }

  const villaRows: RawVilla[] = (rawVillas || []) as RawVilla[];

  /* Snapshot order preserve — admin curate sırasına göre render. */
  const indexOf = new Map(snapshotIds.map((id, idx) => [id, idx]));
  const sorted = [...villaRows].sort((a, b) => {
    const ai = indexOf.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bi = indexOf.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });

  if (sorted.length === 0) {
    /* snapshotIds vardı ama enriched fetch boş döndü → SELECT veya
       RLS problemi. Yukarıdaki rawErr log ile birlikte ops debug için. */
    console.warn(
      "[liste.fetch] enriched fetch empty — snapshotIds vardı, sorted boş",
      {
        token,
        snapshot_ids_len: snapshotIds.length,
        raw_rows_len: villaRows.length,
      }
    );
    notFound();
  }

  /* 3) Pricing context — search_params snapshot'ından. */
  const sp = list.searchParams;
  const hasDateRange = !!sp?.start && !!sp?.end;
  const guestsLabel =
    sp?.guests && sp.guests > 0 ? `${sp.guests} kişi` : null;

  return (
    <div className="min-h-screen bg-[var(--color-stone-50,#fafaf9)]">
      <div className="max-w-[1280px] mx-auto px-5 md:px-10 lg:px-16 py-12 md:py-20">
        {/* ════════ HERO ════════ */}
        <header className="max-w-3xl">
          <p className="
            inline-flex items-center gap-2
            text-[11px] tracking-[0.28em] uppercase font-medium
            text-[var(--color-champagne-700,#a16207)]
          ">
            <Sparkles
              size={12}
              className="text-[var(--color-champagne-500,#eab308)]"
              aria-hidden
            />
            Sizin için özel seçildi
          </p>

          <h1 className="
            font-display
            text-[36px] md:text-[52px]
            text-[var(--color-stone-900)]
            mt-5 leading-[1.05] tracking-[-0.025em]
          ">
            {list.title || "Sizinle paylaşılan villalar"}
          </h1>

          {list.note && (
            <p className="
              text-[15px] md:text-[16px]
              text-[var(--color-stone-600)]
              mt-5 leading-relaxed
              whitespace-pre-wrap
            ">
              {list.note}
            </p>
          )}

          {/* Meta bar — pricing context + villa count */}
          <div className="
            mt-7 flex flex-wrap items-center gap-x-5 gap-y-2
            text-[13px] text-[var(--color-stone-500)]
          ">
            <span className="inline-flex items-center gap-1.5">
              <span className="
                w-1.5 h-1.5 rounded-full
                bg-[var(--color-champagne-500,#eab308)]
              " aria-hidden />
              <strong className="text-[var(--color-stone-900)]">
                {sorted.length}
              </strong>{" "}
              villa
            </span>
            {hasDateRange && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarRange size={13} aria-hidden />
                <span className="tabular-nums">
                  {sp!.start} → {sp!.end}
                </span>
              </span>
            )}
            {guestsLabel && (
              <span className="inline-flex items-center gap-1.5">
                <Users size={13} aria-hidden />
                {guestsLabel}
              </span>
            )}
          </div>
        </header>

        {/* ════════ VILLA GRID ════════ */}
        <section className="mt-12 md:mt-16">
          <div className="
            grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2
            gap-x-6 md:gap-x-8 gap-y-12 md:gap-y-16
          ">
            {sorted.map((v) => {
              /* Image cover-first sort. */
              const imgs = Array.isArray(v.villa_images) ? v.villa_images : [];
              const sortedImgs = [...imgs].sort((a, b) => {
                if (a?.is_cover) return -1;
                if (b?.is_cover) return 1;
                return (a?.sort_order ?? 0) - (b?.sort_order ?? 0);
              });
              /* 🛡️ Bucket-fix — resolveVillaImageUrl: image_url HEM FULL
                 URL (legacy) HEM relative path (Phase B) olabilir;
                 villa-images bucket'ından doğru URL üretir. */
              const images = sortedImgs
                .map((i) => resolveVillaImageUrl(i?.image_url))
                .filter(
                  (u): u is string =>
                    typeof u === "string" && u.trim().length > 0
                );

              /* Location embed (object | array | null). */
              const locName = (() => {
                const l = v.location;
                if (!l) return "";
                if (Array.isArray(l)) return l[0]?.name || "";
                return l.name || "";
              })();

              /* Stay prices for VillaCard. */
              const rawPrices = Array.isArray(v.villa_prices)
                ? v.villa_prices
                : [];
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

              /* Starting price fallback. */
              const rawPrice = Number(v.price);
              const hasRawPrice = Number.isFinite(rawPrice) && rawPrice > 0;
              const fallback = hasRawPrice
                ? { price: rawPrice, currency: v.currency || "TRY" }
                : getStartingPrice(prices);

              return (
                <VillaCard
                  key={v.id}
                  id={v.id}
                  slug={v.slug || ""}
                  title={v.title || ""}
                  location={locName}
                  price={fallback?.price ?? undefined}
                  currency={fallback?.currency || "TRY"}
                  images={images}
                  badge={v.badge ?? undefined}
                  bedrooms={v.bedrooms || 1}
                  bathrooms={v.bathrooms || 1}
                  guests={v.guests || 2}
                  stayStart={hasDateRange ? sp!.start : undefined}
                  stayEnd={hasDateRange ? sp!.end : undefined}
                  prices={hasDateRange ? prices : undefined}
                  cleaningFee={
                    hasDateRange ? Number(v.cleaning_fee || 0) : undefined
                  }
                  cleaningCurrency={
                    hasDateRange ? v.cleaning_currency || "TRY" : undefined
                  }
                  cleaningLimit={
                    hasDateRange ? Number(v.cleaning_limit || 0) : undefined
                  }
                />
              );
            })}
          </div>
        </section>

        {/* ════════ FOOTER LINK ════════ */}
        <footer className="mt-16 md:mt-24 border-t border-[var(--color-stone-200)] pt-8 text-[13px] text-[var(--color-stone-500)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>Maki Dijital — tüm villaları görmek için ana arşivimizi ziyaret edin.</p>
            <Link
              href="/arama"
              className="
                inline-flex items-center gap-1.5
                text-[var(--color-stone-700)] hover:text-[var(--color-stone-900)]
                font-medium
              "
            >
              Tüm villaları keşfet
              <span aria-hidden>→</span>
            </Link>
          </div>
        </footer>

        {/* Snapshot vs visible villa drift uyarısı (stale ID). */}
        {sorted.length < list.snapshot_count && (
          <div className="
            mt-8 rounded-xl border border-amber-100 bg-amber-50/60 p-4
            text-[12.5px] text-amber-900
          ">
            <p className="inline-flex items-center gap-1.5">
              <MapPin size={13} aria-hidden />
              Listedeki {list.snapshot_count - sorted.length} villa şu anda
              görüntülenemiyor.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
