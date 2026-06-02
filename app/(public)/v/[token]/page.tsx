import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  MapPin,
  /* Users / Bed / Bath import'ları artık VillaInfoBar içinde
     kullanılıyor; eski duplicate header silindiği için bu sayfada
     gerek kalmadı. */
  Wallet,
  Map,
  Waves,
  Check,
  ExternalLink,
  /* 🛡️ FAZ 19 — distance icon mapping */
  UtensilsCrossed,
  ShoppingBag,
  Plane,
  Bus,
  Building2,
  Cross,
  Fuel,
  GraduationCap,
  /* 🛡️ FAZ 24 — tourism document trust badge */
  ShieldCheck,
  /* 🛡️ FAZ 31 — off-market badge */
  EyeOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  getDistanceIconKey,
  DISTANCE_TONE_MAP,
  type DistanceIconKey,
} from "@/lib/distance.helper";

import PriceList from "@/app/components/villa/PriceList";
import Gallery from "@/app/components/villa/Gallery";
import VillaInfoBar from "@/app/components/villa/VillaInfoBar";
import {
  normalizeYouTubeVideos,
  type VillaYouTubeVideo,
} from "@/lib/youtube.helper";
import BookingSidebar from "@/app/components/villa/BookingSidebar";
import AvailabilityInlineCalendar from "@/app/components/villa/AvailabilityInlineCalendar";

import { getVillaByPrivateToken } from "@/app/services/villa.service";
import { getVillaImages } from "@/app/services/villa-image.service";
import { getVillaPrices } from "@/app/services/villa-price.service";
import { getVillaDistances } from "@/app/services/villa-distance.service";
import { getVillaFeaturesByVilla } from "@/app/services/villa-feature.service";
import { getRuleItemsByVilla } from "@/app/services/rule-item.service";
import { getPriceIncludeItemsByVilla } from "@/app/services/price-include-item.service";
import { getPublicSettings } from "@/app/services/settings.service";

import { isValidYmd } from "@/lib/availability.helper";
import { formatPoolDimension } from "@/lib/dimension.helper";

/* ===============================================================
   🛡️ FAZ 31 — PRIVATE / TEMPORARY VILLA URL ROUTE
   ===============================================================
   `/v/[token]` — off-market preview route.

   ⚠️ ROUTE PATH KARARI:
     Spec'te `/p/[token]` istenmişti; ancak `app/p/[slug]/page.tsx`
     mevcut CMS sayfaları için zaten ALAN bir dynamic segment.
     Next.js aynı path'te iki dinamik segment'a build-time hata verir.
     Bu yüzden `/v/[token]` ("v" = villa) kullanıldı:
       - Premium / kısa (Bitly hissi)
       - CMS slug sistemini DOKUNULMAZ bırakır
       - Pattern: domain.com/v/8fK29QaLm2Px91AbCdE

   AMAÇ:
     - Pasif (is_active=false) villalar dahil, secret token bilen
       herkesin villayı görüntüleyebilmesi.
     - Public listelerde (homepage, /arama, kategori, sitemap, search)
       ASLA görünmez — bu route ayrı bir erişim katmanı.

   SEO:
     - robots: { index: false, follow: false } (metadata)
     - JSON-LD structured data render edilmez (SEO yüzeyi yok)
     - breadcrumb SEO yok
     - canonical yok
     - sitemap'e eklenmez

   CACHE:
     - export const dynamic = "force-dynamic"
       → token rotasyonu / revoke senaryosunda anlık yansıma
       → kullanıcı paylaşılan link açtığında her zaman fresh state

   REUSE:
     - Aynı Gallery / BookingSidebar / AvailabilityInlineCalendar /
       PriceList component'leri
     - Aynı service helper'ları
     - JSON-LD enjekte EDİLMEZ (off-market kayıt SEO'ya girmesin)

   DOKUNULMAYAN:
     - reservation engine, pricing engine, availability, BookingSidebar
       logic, gallery, image upload, slug sistemi (villa + CMS), sort,
       permissions, cache, FAQ, tourism doc, minimum stay, map picker,
       search.
     - /kiralik-villa/[slug] route TAMAMEN dokunulmadı.
     - /p/[slug] CMS route TAMAMEN dokunulmadı.
   =============================================================== */

/* 🛡️ Force-dynamic: token-based access; route segment cache YOK.
   Admin pasif→aktif veya token revoke senaryosunda link davranışı
   anında değişmeli. Stale render önlenir. */
export const dynamic = "force-dynamic";

/* 🛡️ FAZ 19 — Distance icon map (kiralik-villa/[slug] sayfası ile
   birebir aynı). Bundle açısından page-local; tree-shake friendly. */
const DISTANCE_ICON_MAP: Record<DistanceIconKey, LucideIcon> = {
  restaurant: UtensilsCrossed,
  store: ShoppingBag,
  waves: Waves,
  plane: Plane,
  bus: Bus,
  building: Building2,
  cross: Cross,
  fuel: Fuel,
  school: GraduationCap,
  pin: MapPin,
};

type Feature = {
  id: string;
  name: string;
};

/* ============================================================
   🛡️ FAZ 31 — METADATA: noindex / nofollow
   ============================================================
   Critical SEO gate. Token URL'i ASLA index'lenmemeli.
   - robots: noindex/nofollow → arama motorları crawl etmez
   - canonical YOK → arama motoru başka bir URL'i kanonik sanmasın
   - OpenGraph kasıtla minimum (paylaşımda hâlâ preview gelir)
   - JSON-LD render edilmez (page body içinde de yok)
   ============================================================ */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const villa = await getVillaByPrivateToken(token);

  if (!villa) {
    return {
      title: "Bağlantı geçersiz",
      robots: { index: false, follow: false },
    };
  }

  const title = villa.title || "Özel Bağlantı";
  /* Description premium hidden-inventory hissi:
     "Özel paylaşım bağlantısı" → debug/admin hissi vermiyor. */
  const description =
    "Özel paylaşım bağlantısı — sadece bağlantıya sahip kişilere açık villa.";

  const cover =
    villa.images && villa.images.length > 0 ? villa.images[0] : undefined;

  return {
    title,
    description,
    /* 🛡️ CRITICAL — kesin noindex/nofollow.
       Eksik index field, "ALL" varsayılanına dönebilir; ikisi de
       explicit false. */
    robots: {
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    },
    openGraph: {
      title,
      description,
      type: "website",
      ...(cover ? { images: [{ url: cover }] } : {}),
    },
    twitter: {
      card: cover ? "summary_large_image" : "summary",
      title,
      description,
      ...(cover ? { images: [cover] } : {}),
    },
  };
}

export default async function PrivateVillaDetail({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{
    start?: string | string[];
    end?: string | string[];
  }>;
}) {
  const { token } = await params;

  /* /arama'dan değil ama token URL'ine eklenmiş tarihleri de tolere
     ederiz — kullanıcı linki bir öneri ile paylaşmak isteyebilir. */
  const sp = searchParams ? await searchParams : {};
  const rawStart = Array.isArray(sp?.start) ? sp.start[0] : sp?.start;
  const rawEnd = Array.isArray(sp?.end) ? sp.end[0] : sp?.end;
  const initialStart = isValidYmd(rawStart) ? rawStart : null;
  const initialEnd = isValidYmd(rawEnd) ? rawEnd : null;
  const hasInitialRange =
    !!initialStart && !!initialEnd && initialStart < initialEnd;

  /* 🛡️ Token ile villa fetch. is_active filter YOK; deleted_at IS NULL
     korunur. Yoksa 404 (notFound). */
  const villa = await getVillaByPrivateToken(token);
  if (!villa) {
    notFound();
  }

  /* Paralel veri yükleme — kiralik-villa/[slug] sayfası ile birebir
     aynı pattern. Mevcut servisler reuse edilir; yeni servis YOK. */
  const [images, prices, distances, features, rules, priceIncludes, settings] =
    await Promise.all([
      getVillaImages(villa.id),
      getVillaPrices(villa.id),
      getVillaDistances(villa.id),
      getVillaFeaturesByVilla(villa.id) as Promise<Feature[]>,
      getRuleItemsByVilla(villa.id),
      getPriceIncludeItemsByVilla(villa.id),
      getPublicSettings(),
    ]);

  /* 🛡️ YouTube videos — VillaDTO.youtube_videos zaten normalize edilmiş
     (villa.service > mapVilla). Defansif olarak parent component-side
     bir kez daha normalize edilir. */
  const youtubeVideos: VillaYouTubeVideo[] = normalizeYouTubeVideos(
    villa.youtube_videos
  );

  const watermark = {
    logo: settings?.watermark_logo ?? null,
    enabled: settings?.watermark_enabled ?? false,
    opacity: settings?.watermark_opacity ?? 0.15,
    position: settings?.watermark_position ?? "center",
    size: settings?.watermark_size ?? 25,
  } as const;

  const imageUrls = images.map((img) => img.image_url);

  const isOffMarket = villa.is_active === false;

  return (
    <div className="px-5 md:px-10 lg:px-16 pt-28 md:pt-40 pb-24 md:pb-32">
      <div className="max-w-[1280px] mx-auto">
        {/* 🛡️ FAZ 31 — OFF-MARKET PREMIUM BADGE
            ─────────────────────────────────────────────────────
            "VIP / hidden luxury inventory" hissi; debug görünmemeli.
            Conditional: pasif villalar için göster (aktif villaya da
            aynı token URL'i ile erişilebilir; o durumda badge gizli).
            ───────────────────────────────────────────────────── */}
        {isOffMarket && (
          <div className="mb-8 md:mb-10">
            <div
              className="
                inline-flex items-center gap-2.5
                rounded-full
                px-4 py-2
                bg-white/80 backdrop-blur
                border border-[var(--color-stone-200)]
                text-[11px] tracking-[0.18em] uppercase font-medium
                text-[var(--color-stone-700)]
                shadow-[0_8px_20px_-12px_rgb(27_26_23/0.08)]
              "
            >
              <span
                className="
                  w-6 h-6 rounded-full
                  bg-[var(--color-sand-100)]
                  flex items-center justify-center
                  text-[var(--color-champagne-700)]
                "
                aria-hidden
              >
                <EyeOff size={12} />
              </span>
              <span>Özel Paylaşım</span>
              <span
                className="
                  text-[var(--color-stone-400)] normal-case tracking-normal
                  text-[11.5px] font-normal
                "
              >
                · Sadece bağlantıyı bilen kişilere açık
              </span>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            🛡️ EDITORIAL HEADER kaldırıldı — duplicate cleanup.
            ════════════════════════════════════════════════════
            Villa adı + lokasyon + guests/bedrooms/bathrooms info'ları
            artık `VillaInfoBar` içinde (Gallery üstünde). Private rota
            FavoriteButton içermez; actions slot kullanılmadı.
            ──────────────────────────────────────────────────── */}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
          {/* LEFT */}
          <div className="lg:col-span-2 space-y-12">
            {/* HERO: InfoBar (üstte) + Gallery (altta).
                Private rota parity — public detail page'i ile aynı UX. */}
            <section className="space-y-4">
              <VillaInfoBar
                villaTitle={villa.title}
                location={villa.location}
                guests={villa.guests}
                bedrooms={villa.bedrooms}
                bathrooms={villa.bathrooms}
                videos={youtubeVideos}
              />

              <div className="rounded-3xl overflow-hidden ring-1 ring-[var(--color-stone-100)]">
                <Gallery
                  images={imageUrls}
                  watermark={watermark}
                  villaTitle={villa.title}
                />
              </div>
            </section>

            {/* DESCRIPTION */}
            <section>
              <p className="eyebrow mb-3">Detaylar</p>
              <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
                Villa hakkında
              </h2>
              <div className="card-premium mt-5 p-6 md:p-7 text-[var(--color-stone-600)] leading-[1.75] text-[15px]">
                {villa.description || (
                  <span className="italic text-[var(--color-stone-400)]">
                    Açıklama bulunmuyor
                  </span>
                )}
              </div>
            </section>

            {/* POOL */}
            {(villa.pool_type !== "yok" || villa.indoor_pool || villa.child_pool) &&
              (() => {
                type PoolCard = {
                  key: string;
                  label: string;
                  width: string | null | undefined;
                  length: string | null | undefined;
                  depth: string | null | undefined;
                };
                const cards: PoolCard[] = [];
                if (villa.pool_type && villa.pool_type !== "yok") {
                  cards.push({
                    key: "main",
                    label:
                      villa.pool_type === "ozel" ? "Özel Havuz" : "Ortak Havuz",
                    width: villa.pool_width,
                    length: villa.pool_length,
                    depth: villa.pool_depth,
                  });
                }
                if (villa.indoor_pool) {
                  cards.push({
                    key: "indoor",
                    label: "Kapalı Havuz",
                    width: villa.indoor_pool_width,
                    length: villa.indoor_pool_length,
                    depth: villa.indoor_pool_depth,
                  });
                }
                if (villa.child_pool) {
                  cards.push({
                    key: "child",
                    label: "Çocuk Havuzu",
                    width: villa.child_pool_width,
                    length: villa.child_pool_length,
                    depth: villa.child_pool_depth,
                  });
                }
                if (cards.length === 0) return null;

                return (
                  <section>
                    <p className="eyebrow mb-4 flex items-center gap-2">
                      <Waves size={11} /> Havuz Bilgileri
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                      {cards.map((c) => {
                        const hasDims = !!(c.width || c.length || c.depth);
                        return (
                          <div
                            key={c.key}
                            className="
                              rounded-2xl border border-[var(--color-stone-100)] bg-white
                              px-4 py-3.5 md:px-5 md:py-4
                              hover:border-[var(--color-champagne-300)]
                              hover:shadow-[0_8px_20px_-12px_rgb(27_26_23/0.08)]
                              transition-colors motion-reduce:transition-none
                            "
                          >
                            <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] flex items-center gap-1.5">
                              <span
                                className="inline-block w-1 h-1 rounded-full bg-[var(--color-champagne-500)]"
                                aria-hidden
                              />
                              {c.label}
                            </p>
                            {hasDims ? (
                              <>
                                <p
                                  className="font-display text-[18px] md:text-[20px] text-[var(--color-stone-900)] mt-2 tracking-[-0.01em]"
                                  style={{
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                >
                                  {formatPoolDimension(c.width)} ×{" "}
                                  {formatPoolDimension(c.length)} ×{" "}
                                  {formatPoolDimension(c.depth)}
                                </p>
                                <p
                                  className="text-[9px] tracking-[0.18em] uppercase text-[var(--color-stone-300)] font-medium mt-1"
                                  aria-hidden
                                >
                                  Genişlik × Uzunluk × Derinlik
                                </p>
                              </>
                            ) : (
                              <p className="text-[var(--color-stone-400)] text-sm italic mt-2">
                                Ölçü bilgisi yok
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })()}

            {/* PRICES */}
            <section>
              <p className="eyebrow mb-4 flex items-center gap-2">
                <Wallet size={11} /> Sezon Fiyatları
              </p>
              {prices.length === 0 ? (
                <p className="text-[var(--color-stone-400)] text-sm italic">
                  Fiyat bilgisi yok
                </p>
              ) : (
                <PriceList
                  prices={prices}
                  minimumStayNights={villa.minimum_stay_nights ?? null}
                />
              )}
            </section>

            {/* CALENDAR */}
            <section>
              <p className="eyebrow mb-3">Müsaitlik</p>
              <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
                Takvim
              </h2>
              <div className="card-premium mt-5 overflow-x-auto">
                <AvailabilityInlineCalendar villaId={villa.id} prices={prices} />
              </div>
            </section>

            {/* DISTANCES */}
            <section>
              <p className="eyebrow mb-4 flex items-center gap-2">
                <Map size={11} /> Yakındaki Noktalar
              </p>
              {distances.length === 0 ? (
                <p className="text-[var(--color-stone-400)] text-sm italic">
                  Bilgi yok
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {distances.map((d, i) => {
                    const iconKey: DistanceIconKey = getDistanceIconKey(d.title);
                    const IconCmp: LucideIcon = DISTANCE_ICON_MAP[iconKey];
                    /* Tone palette: DISTANCE_TONE_MAP'ten kategori bazlı
                       soft pastel set; kiralik-villa/[slug] ile aynı. */
                    const tone = DISTANCE_TONE_MAP[iconKey];
                    return (
                      <div
                        key={i}
                        className={
                          "rounded-2xl border " +
                          tone.cardBorder +
                          " " +
                          tone.cardBg +
                          " px-4 py-3.5 md:px-5 md:py-4 " +
                          tone.cardHoverBorder +
                          " hover:shadow-[0_8px_20px_-12px_rgb(27_26_23/0.08)] " +
                          "transition-colors motion-reduce:transition-none " +
                          "flex items-center gap-3"
                        }
                      >
                        <span
                          className={
                            "w-9 h-9 shrink-0 rounded-xl border " +
                            tone.iconBorder +
                            " " +
                            tone.iconBg +
                            " " +
                            tone.iconText +
                            " flex items-center justify-center"
                          }
                        >
                          <IconCmp size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] truncate">
                            {d.title}
                          </p>
                          <p
                            className="font-display text-[16px] md:text-[18px] text-[var(--color-stone-900)] mt-0.5 tracking-[-0.01em]"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {d.distance}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* FEATURES */}
            <section>
              <p className="eyebrow mb-3">Özellikler</p>
              <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
                Ne sunuyor?
              </h2>

              {features.length === 0 ? (
                <div className="card-premium mt-5 p-6 text-sm text-[var(--color-stone-400)] italic">
                  Özellik bilgisi bulunmuyor
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-5">
                  {features.map((f) => (
                    <div
                      key={f.id}
                      className="
                        flex items-center gap-2.5
                        text-[var(--color-stone-700)]
                        bg-white border border-[var(--color-stone-100)]
                        rounded-xl px-4 py-3 text-sm
                        hover:border-[var(--color-champagne-300)] hover:shadow-soft
                        transition
                      "
                    >
                      <span className="w-5 h-5 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center shrink-0">
                        <Check size={12} className="text-[var(--color-champagne-600)]" />
                      </span>
                      {f.name}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* INCLUDES + RULES — desktop 2-kolon side-by-side card pair.
                Aynı pattern kiralik-villa/[slug] sayfasıyla birebir
                korunur (kart toneları, breakpoint'ler, içerik). */}
            {(priceIncludes.length > 0 || rules.length > 0) && (
              <div
                className={
                  "grid grid-cols-1 gap-4 md:gap-5 " +
                  (priceIncludes.length > 0 && rules.length > 0
                    ? "lg:grid-cols-2 lg:items-start"
                    : "")
                }
              >
                {/* PRICE INCLUDES — emerald positive tone card */}
                {priceIncludes.length > 0 && (
                  <section
                    className="
                      rounded-3xl border border-emerald-100
                      bg-emerald-50/60
                      p-6 md:p-7
                    "
                  >
                    <p className="eyebrow mb-3 text-emerald-700">Fiyata Dahil</p>
                    <h2 className="font-display text-2xl md:text-3xl text-emerald-900 tracking-[-0.015em]">
                      Konaklama ücretine dahil
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
                      {priceIncludes.map((p) => (
                        <div
                          key={p.id}
                          className="
                            flex items-center gap-2.5
                            text-[var(--color-stone-700)]
                            bg-white border border-emerald-100
                            rounded-xl px-4 py-3 text-sm
                            hover:border-emerald-300 hover:shadow-soft
                            transition
                          "
                        >
                          <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                            <Check size={12} className="text-emerald-600" />
                          </span>
                          {p.title}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* RULES — rose warm caution tone card */}
                {rules.length > 0 && (
                  <section
                    className="
                      rounded-3xl border border-rose-100
                      bg-rose-50/60
                      p-6 md:p-7
                    "
                  >
                    <p className="eyebrow mb-3 text-rose-700">Kurallar</p>
                    <h2 className="font-display text-2xl md:text-3xl text-rose-900 tracking-[-0.015em]">
                      Konaklama kuralları
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
                      {rules.map((r) => (
                        <div
                          key={r.id}
                          className="
                            flex items-center gap-2.5
                            text-[var(--color-stone-700)]
                            bg-white border border-rose-100
                            rounded-xl px-4 py-3 text-sm
                            hover:border-rose-300 hover:shadow-soft
                            transition
                          "
                        >
                          <span className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                            <Check size={12} className="text-rose-600" />
                          </span>
                          {r.title}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            {/* MAP */}
            <section>
              <p className="eyebrow mb-3 flex items-center gap-2">
                <MapPin size={11} /> Konum
              </p>
              <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
                Nerede?
              </h2>

              <div className="card-premium mt-5 overflow-hidden">
                {villa.map_type === "coords" &&
                  villa.latitude &&
                  villa.longitude && (
                    <>
                      <iframe
                        src={`https://www.google.com/maps?q=${villa.latitude},${villa.longitude}&hl=tr&z=14&output=embed`}
                        className="w-full h-[400px] border-0"
                        loading="lazy"
                      />
                      <div className="p-4 md:px-5 border-t border-[var(--color-stone-100)] flex justify-between items-center text-sm">
                        <span className="text-[var(--color-stone-500)]">
                          Yaklaşık konum gösterilmektedir
                        </span>
                        <a
                          href={`https://www.google.com/maps?q=${villa.latitude},${villa.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--color-champagne-700)] font-medium hover:underline inline-flex items-center gap-1"
                        >
                          Google Maps&apos;te aç
                          <ExternalLink size={13} />
                        </a>
                      </div>
                    </>
                  )}

                {villa.map_type === "iframe" && villa.map_embed && (
                  <>
                    <div
                      className="w-full h-[400px]"
                      dangerouslySetInnerHTML={{ __html: villa.map_embed }}
                    />
                    <div className="p-4 md:px-5 border-t border-[var(--color-stone-100)] text-sm text-[var(--color-stone-500)]">
                      Harita Google Maps üzerinden sağlanmaktadır
                    </div>
                  </>
                )}

                {(!villa.map_type ||
                  (villa.map_type === "coords" &&
                    (!villa.latitude || !villa.longitude)) ||
                  (villa.map_type === "iframe" && !villa.map_embed)) && (
                  <div className="h-[200px] flex items-center justify-center text-[var(--color-stone-400)] italic">
                    Konum bilgisi bulunamadı
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* RIGHT (sidebar) */}
          <aside className="lg:col-span-1">
            <div className="lg:sticky lg:top-32">
              <BookingSidebar
                villaSlug={villa.slug}
                villaId={villa.id}
                prices={prices}
                deposit={villa.deposit}
                cleaning_fee={villa.cleaning_fee}
                cleaning_currency={villa.cleaning_currency}
                cleaning_limit={villa.cleaning_limit}
                custom_prepayment_rate={villa.custom_prepayment_rate ?? null}
                minimum_stay_nights={villa.minimum_stay_nights ?? null}
                initialStart={hasInitialRange ? initialStart : undefined}
                initialEnd={hasInitialRange ? initialEnd : undefined}
              />

              {/* TOURISM DOCUMENT TRUST CARD (Faz 24) — aynı semantic */}
              {villa.tourism_document_number && (
                <div
                  className="
                    mt-4 rounded-2xl border border-[var(--color-stone-100)] bg-white
                    px-4 py-3.5 md:px-5 md:py-4
                    hover:border-[var(--color-champagne-300)]
                    hover:shadow-[0_8px_20px_-12px_rgb(27_26_23/0.08)]
                    transition-colors motion-reduce:transition-none
                  "
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="
                        w-9 h-9 shrink-0 rounded-xl
                        bg-[var(--color-sand-50)] border border-[var(--color-stone-100)]
                        flex items-center justify-center
                        text-[var(--color-champagne-600)]
                      "
                      aria-hidden
                    >
                      <ShieldCheck size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)]">
                        T.C. Kültür ve Turizm Bakanlığı
                      </p>
                      <p
                        className="
                          font-display text-[15px] md:text-[16px]
                          text-[var(--color-stone-900)] mt-1 tracking-[-0.01em]
                          select-all break-all
                        "
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        <span className="text-[var(--color-stone-500)] font-sans text-[12px] tracking-normal mr-1.5">
                          Belge No:
                        </span>
                        {villa.tourism_document_number}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
