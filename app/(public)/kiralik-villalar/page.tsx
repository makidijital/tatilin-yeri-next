import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  getCachedSettings,
  getCachedVillas,
  getCachedVillaLocations,
  getCachedVillaTypes,
} from "@/lib/cache.helpers";
import type { VillaDTO } from "@/app/services/villa.service";

import VillaCard from "@/app/components/villa/VillaCard";
import FilterSidebar from "@/app/(public)/arama/FilterSidebar";
import PageHero from "@/app/components/ui/PageHero";

import {
  JsonLd,
  buildBreadcrumb,
  buildItemList,
} from "@/app/components/seo/StructuredData";

/* 🛡️ Public pagination helpers — default 12 (URL'e yazılmaz), allowed
   [12,30,50,100]. Repository/service/cache katmanı etkilenmez. */
import {
  ALLOWED_PUBLIC_PAGE_SIZES,
  ALLOWED_PUBLIC_SORTS,
  DEFAULT_PUBLIC_PAGE_SIZE,
  DEFAULT_PUBLIC_SORT,
  PUBLIC_SORT_LABELS,
  applyPublicSort,
  computePageWindow,
  parsePublicPage,
  parsePublicPageSize,
  parsePublicSort,
  type PublicSort,
} from "@/lib/pagination";

/* ===============================================================
   🛡️ /kiralik-villalar — PUBLIC ARCHIVE / DISCOVERY PAGE
   ===============================================================
   Bu sayfa GERÇEK SEARCH RESULT sayfası DEĞİL — archive + discovery
   entry point. /arama gerçek filtering engine; bu sayfa ise:
     - Editorial hero section
     - /arama ile birebir aynı 2-col layout (sticky sidebar + grid)
     - Tüm aktif villaları listeler (visibility filter dahil)
     - Sidebar mode="redirect" → filtre seçimleri /arama?...&... URL'ine
       push'lar; kullanıcı /kiralik-villalar'dan ayrılır. Bu sayfa
       hiçbir filtering execution yapmaz.

   REUSE:
     - getVillas() (public visibility built-in: is_active=true,
       deleted_at IS NULL)
     - VillaCard (kart UI, fiyat, currency davranışı AYNEN)
     - FilterSidebar (TEK source-of-truth filter UI; mode prop ile
       redirect davranışı)
     - villa_locations / villa_types (sidebar opsiyonları için
       read-only fetch)
     - JSON-LD helpers (CollectionPage + BreadcrumbList + ItemList)

   YOK:
     - Yeni filter state / yeni Supabase query mantığı
     - Duplicate sidebar logic
     - Availability/reservation/pricing/calendar logic'e dokunma
     - Yeni dependency / globals.css değişikliği
   =============================================================== */

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_VERCEL_URL ||
  ""
).replace(/\/+$/, "");

const PAGE_PATH = "/kiralik-villalar";
const PAGE_URL = SITE_URL ? `${SITE_URL}${PAGE_PATH}` : PAGE_PATH;

/* ---------------- METADATA ---------------- */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getCachedSettings().catch(() => null);
  const brand = settings?.site_name?.trim() || "Villa Kiralama";
  const title = `Kiralık Villalar — ${brand}`;
  const description =
    "Akdeniz'in seçkin koleksiyonu. Özel havuz, deniz manzarası ve butik konforla tasarlanmış kiralık villaları keşfedin.";

  return {
    title,
    description,
    alternates: { canonical: PAGE_PATH },
    openGraph: {
      title,
      description,
      type: "website",
      url: PAGE_URL,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

/* 🛡️ Public pagination — URL state source-of-truth.
     `?page=N`     → 1-based; default 1 (URL'e yazılmaz)
     `?pageSize=M` → allowed [12,30,50,100]; default 12 (URL'e yazılmaz)
   getCachedVillas() tam liste cache; server-side slice. */
type PageProps = {
  /* Next.js 15: searchParams artık Promise. */
  searchParams: Promise<{
    page?: string | string[];
    pageSize?: string | string[];
    /* 🛡️ Public sort — allow-list:
     *   smart (default, URL'e yazılmaz) | price-asc | price-desc
     *   | capacity-asc | capacity-desc
     * helpers: lib/pagination.ts (parsePublicSort + applyPublicSort). */
    sort?: string | string[];
  }>;
};

/* ===============================================================
   🔥 PAGE — server component, SSR-first
   =============================================================== */
export default async function KiralikVillalarPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  /* 🛡️ Cached fetches — Promise.all ile paralel:
     - getCachedVillas: tag "villas", TTL 10dk; villa mutations invalidate
     - getCachedVillaLocations / getCachedVillaTypes: tag "taxonomy",
       TTL 1 saat; mutation invalidation yok (rare changes, TTL OK) */
  const [villas, regionOptions, categoryOptions] = await Promise.all([
    getCachedVillas(),
    getCachedVillaLocations(),
    getCachedVillaTypes(),
  ]);

  const totalCount = villas.length;

  /* 🛡️ PAGINATION — `?page=N` + `?pageSize=M` (allowed [12,30,50,100]).
     Server-side dilim → client'a yalnız mevcut sayfa kartları iner.
     Helpers: lib/pagination.ts. */
  const pageSize = parsePublicPageSize(sp.pageSize);
  const pageRaw = parsePublicPage(sp.page);

  /* 🛡️ SORT — URL state ile JS-side sıralama.
     `smart` (default) → mevcut sıra (sort_order ASC, created_at DESC)
     getCachedVillas'tan AYNEN gelir (no-op shortcut).
     Diğer modlar yeni array döndürür (input mutate edilmez) → cache
     payload'u dokunulmaz; sadece UI render sırası değişir.
     Repository/service/cache/availability'e SIFIR dokunma. */
  const sort: PublicSort = parsePublicSort(sp.sort);
  const sortedVillas = applyPublicSort(villas, sort);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(1, pageRaw), totalPages);
  const sliceStart = (currentPage - 1) * pageSize;
  const villasOnPage = sortedVillas.slice(sliceStart, sliceStart + pageSize);

  /* Sidebar initial state — /kiralik-villalar'da filtre yok
     (archive page; URL query'siz). Kullanıcı seçim yapana kadar
     boş başlar; "Villa Bul" CTA'sı /arama?... push'lar. */
  const sidebarInitial = {
    regions: [] as string[],
    categories: [] as string[],
    start: null as string | null,
    end: null as string | null,
    guests: 0,
  };

  /* ---------------- JSON-LD ---------------- */
  const breadcrumbLd = buildBreadcrumb([
    { name: "Ana sayfa", url: "/" },
    { name: "Kiralık Villalar" },
  ]);

  const collectionPageLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": PAGE_URL,
    url: PAGE_URL,
    name: "Kiralık Villalar",
    description:
      "Akdeniz'in seçkin kiralık villa koleksiyonu — özel havuz, deniz manzarası, butik konfor.",
    isPartOf: SITE_URL ? { "@type": "WebSite", url: SITE_URL } : undefined,
    inLanguage: "tr-TR",
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: totalCount,
    },
  };

  const itemListLd =
    totalCount > 0
      ? buildItemList(
          /* 🛡️ Faz 9 hardening: `(v: any)` → `VillaDTO`. */
          villas.map((v: VillaDTO) => ({
            slug: String(v.slug || ""),
            title: String(v.title || ""),
            image: Array.isArray(v.images) ? v.images[0] : undefined,
          }))
        )
      : null;

  return (
    <>
      <JsonLd data={collectionPageLd} />
      <JsonLd data={breadcrumbLd} />
      {itemListLd ? <JsonLd data={itemListLd} /> : null}

      <main>
        {/* =======================================================
            1) EDITORIAL HERO — kompakt PageHero (eski dev blok yerine).
            Breadcrumb / başlık / açıklama / SEO KORUNDU; sadece UI.
            ======================================================= */}
        <PageHero
          breadcrumb={[
            { name: "Ana sayfa", href: "/" },
            { name: "Kiralık Villalar" },
          ]}
          eyebrow="Akdeniz Collection"
          title={
            <>
              Kiralık villalar.{" "}
              <span className="text-[var(--color-stone-400)]">
                Tek bir koleksiyon.
              </span>
            </>
          }
          description="Özel havuz, deniz manzarası ve butik konfor. Akdeniz'in seçkin köşelerinde, her detayı sessizce tasarlanmış kiralık villaların tam listesi."
          stat={{ value: totalCount, label: "Aktif Villa" }}
        />

        {/* =======================================================
            2) SEARCH-STYLE LAYOUT — /arama ile birebir aynı UX
               Sol: sticky FilterSidebar (mode="redirect")
               Sağ: VillaCard grid (tam arşiv)
               Mobile: filter trigger → bottom slide-over (sidebar
                 zaten kendi içinde drawer'ı render eder)
            ======================================================= */}
        <section className="px-5 md:px-10 lg:px-16 pt-8 md:pt-12 pb-24 md:pb-32">
          <div className="max-w-[1280px] mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] lg:grid-cols-[300px_1fr] gap-x-8 lg:gap-x-12">
              {/* SIDEBAR — redirect mode */}
              <FilterSidebar
                regionOptions={regionOptions}
                categoryOptions={categoryOptions}
                initial={sidebarInitial}
                mode="redirect"
              />

              {/* RESULTS COLUMN — tüm aktif villalar (archive) */}
              <div>
                {totalCount === 0 ? (
                  <div className="px-2 md:px-6">
                    <div className="rounded-2xl border border-[var(--color-stone-100)] bg-white/60 backdrop-blur-[2px] px-6 py-16 md:px-12 md:py-24 max-w-2xl mx-auto text-center">
                      <p className="text-[11px] tracking-[0.24em] uppercase font-medium text-[var(--color-stone-500)]">
                        <span className="inline-block w-6 h-px bg-[var(--color-stone-300)] align-middle mr-2" />
                        Koleksiyon
                      </p>
                      <h2 className="font-display text-[34px] md:text-[48px] text-[var(--color-stone-900)] mt-4 tracking-[-0.03em] leading-[1.02]">
                        Yakında burada.
                      </h2>
                      <p className="text-[var(--color-stone-500)] mt-6 leading-relaxed text-[14.5px] max-w-md mx-auto">
                        Koleksiyon henüz oluşturuluyor. Yakında keşfedilmeyi
                        bekleyecek.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* 🛡️ TOOLBAR — sort + page size selector (grid üstü).
                       Kart boyut/yerleşim/grid sınıfları DEĞİŞMEZ.
                       Mobile: stacked; desktop: yan yana sağa yaslı. */}
                    <div className="mb-6 md:mb-8 flex flex-col items-end gap-3 md:flex-row md:items-center md:justify-end md:gap-6">
                      <SortSelector pageSize={pageSize} sort={sort} />
                      <PageSizeSelector pageSize={pageSize} sort={sort} />
                    </div>
                    {/* 🛡️ Sort artık <details>+<Link> — JS-less, race-condition
                       free. Buraya script render etmeye gerek yok. */}

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 md:gap-x-8 gap-y-12 md:gap-y-16">
                      {/* 🛡️ Faz 9 hardening: `(villa: any)` → `VillaDTO`.
                         🛡️ SCALE HARDENING: `villas` yerine `villasOnPage`
                         (PAGE_SIZE'la dilimlenmiş). Tüm 1500 villa
                         hâlâ getCachedVillas'tan server'a iniyor (ISR
                         cache); sadece client HTML payload'unda 1 sayfa
                         render. */}
                      {villasOnPage.map((villa: VillaDTO) => (
                        <VillaCard
                          key={villa.slug || villa.id}
                          /* 🛡️ FAZ 36 — favorites identity. */
                          id={villa.id}
                          slug={villa.slug}
                          title={villa.title}
                          location={villa.location}
                          price={villa.price}
                          currency={villa.currency || "TRY"}
                          images={villa.images}
                          badge={villa.badge}
                          bedrooms={villa.bedrooms || 1}
                          bathrooms={villa.bathrooms || 1}
                          guests={villa.guests || 2}
                          /* 🛡️ FAZ 35 — review trust meta passthrough. */
                          reviewAverage={villa.review_average}
                          reviewCount={villa.review_count}
                        />
                      ))}
                    </div>

                    {/* 🛡️ Numbered pagination — admin paterni (lib/pagination
                       computePageWindow). pageSize URL'de korunur; sayfa
                       linklerinde page güncellenir, default değer (12)
                       URL'e yazılmaz. */}
                    {totalPages > 1 && (
                      <PaginationNav
                        currentPage={currentPage}
                        totalPages={totalPages}
                        pageSize={pageSize}
                        sort={sort}
                      />
                    )}
                  </>
                )}

                {/* 🛡️ SEO HAKKINDA — results column içinde inline.
                   Eski ayrı <section> sticky sidebar'ın grid row'unu
                   bitirip aşağıda kendi `lg:grid-cols-12` mizanpajında
                   açılıyordu. İki ayrı grid track aynı sol kolonda
                   buluşunca: scroll boundary'sinde unstick sidebar +
                   heading'in `col-span-5` (sol 5 sütun) yerleşimi
                   görsel olarak çakışıyordu (heading "sidebar'ın
                   üstüne biniyormuş gibi" algı).

                   Şimdi: section 3 silindi, içeriği results column'un
                   doğal flow'una alındı. Sidebar grid track'i kendi
                   başına; results column track'i villa grid +
                   pagination + bu SEO bloğu hep aşağı yönde. Sticky
                   sidebar uzatılmış row boyunca pinli kalır → filtre
                   her zaman elin altında. Görsel ayrım için sand
                   tinted card wrapper + border korundu.

                   Heading typografi `lg:col-span-5` full container
                   yerine results column içinde (`xl:grid-cols-5`'in
                   2/5'ine) düştüğü için font-size küçültüldü:
                   36/56 → 30/40/44 px. Wrap güvenli, premium hissi
                   korunur. */}
                <div className="mt-16 md:mt-20 rounded-2xl bg-[var(--color-sand-50)]/60 border border-[var(--color-stone-100)] px-6 py-10 md:px-10 md:py-14">
                  <div className="grid grid-cols-1 xl:grid-cols-5 gap-8 md:gap-10">
                    <div className="xl:col-span-2">
                      <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)]">
                        <span className="inline-block w-8 h-px bg-[var(--color-stone-300)] align-middle mr-3" />
                        Hakkında
                      </p>
                      <h2
                        id="kv-about-heading"
                        className="font-display text-[30px] md:text-[40px] xl:text-[44px] text-[var(--color-stone-900)] mt-5 leading-[1.05] tracking-[-0.025em]"
                      >
                        Bir konaklamadan
                        <br />
                        <span className="text-[var(--color-stone-400)]">
                          fazlası.
                        </span>
                      </h2>
                    </div>

                    <div className="xl:col-span-3 space-y-5 text-[15px] leading-[1.7] text-[var(--color-stone-600)]">
                      <p>
                        Bu koleksiyon, Akdeniz&apos;in en seçkin köşelerinde,
                        bir konaklamadan fazlasını sunmak için tasarlanan
                        kiralık villalardan oluşur. Her villa; özel havuzu,
                        manzarası, mahremiyeti ve iç mimarisiyle bağımsız
                        olarak seçilir.
                      </p>
                      <p>
                        Karakter; bir kart üzerinde değil, oda oda
                        hissedilir. Seçkin kiralık villa deneyimi arayanlar
                        için bu koleksiyon, hızlı bir liste değil, sessizce
                        gezilecek bir arşivdir.
                      </p>
                      <p>
                        Solda yer alan filtreleri kullanarak bölge, tip,
                        tarih ve kişi sayısına göre seçim yapabilir;{" "}
                        <Link
                          href="/arama"
                          className="text-[var(--color-stone-900)] underline decoration-[var(--color-champagne-500)] decoration-1 underline-offset-4 hover:decoration-[var(--color-champagne-700)] transition-colors motion-reduce:transition-none"
                        >
                          arama sayfasından
                        </Link>{" "}
                        sonuçları görüntüleyebilirsiniz.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

/* ===============================================================
   🛡️ URL BUILDER — archive (/kiralik-villalar) için pagination
   ===============================================================
   `/kiralik-villalar` archive page — filter parametresi YOK
   (sidebar redirect mode → /arama'ya gönderir). Bu yüzden
   build helper sadece page + pageSize alır. Default değerler
   URL'e yazılmaz (clean). */
function buildArchiveHref(next: {
  page?: number;
  pageSize?: number;
  sort?: PublicSort;
}): string {
  const usp = new URLSearchParams();
  if (next.page !== undefined && next.page > 1) {
    usp.set("page", String(next.page));
  }
  if (
    next.pageSize !== undefined &&
    next.pageSize !== DEFAULT_PUBLIC_PAGE_SIZE
  ) {
    usp.set("pageSize", String(next.pageSize));
  }
  /* 🛡️ sort: default ("smart") URL'e yazılmaz (clean URL).
     Diğer modlar yazılır → pagination + pageSize linkleri sort'u
     korur (caller her zaman geçer); SortSelector page=1 reset
     ile yeni sort'u set eder. */
  if (
    next.sort !== undefined &&
    next.sort !== DEFAULT_PUBLIC_SORT
  ) {
    usp.set("sort", next.sort);
  }
  const qs = usp.toString();
  return qs ? `${PAGE_PATH}?${qs}` : PAGE_PATH;
}

/* ===============================================================
   🛡️ PAGE SIZE SELECTOR — pill grup; Link-based (server-safe)
   ===============================================================
   pageSize değişiminde page=1'e döner (default URL'e yazılmaz). */
function PageSizeSelector({
  pageSize,
  sort,
}: {
  pageSize: number;
  sort: PublicSort;
}) {
  return (
    <div className="flex items-center gap-2 text-[12.5px] text-[var(--color-stone-500)]">
      <span>Sayfa başına</span>
      <div
        role="group"
        aria-label="Sayfa başına villa sayısı"
        className="inline-flex items-center gap-1 rounded-full border border-[var(--color-stone-200)] bg-white p-1"
      >
        {ALLOWED_PUBLIC_PAGE_SIZES.map((sz) => {
          const active = sz === pageSize;
          /* sort PRESERVE: pageSize değişiminde kullanıcının seçtiği
             sıralama korunur (caller her zaman `sort` geçer). */
          const href = buildArchiveHref({ pageSize: sz, page: 1, sort });
          return (
            <Link
              key={sz}
              href={href}
              aria-current={active ? "page" : undefined}
              className={
                "inline-flex items-center justify-center min-w-[36px] " +
                "px-2.5 py-1 rounded-full " +
                "text-[12.5px] font-medium tabular-nums " +
                "transition-colors motion-reduce:transition-none " +
                (active
                  ? "bg-[var(--color-stone-900)] text-white"
                  : "text-[var(--color-stone-600)] hover:bg-[var(--color-sand-50)]")
              }
            >
              {sz}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ===============================================================
   🛡️ PAGINATION NAV — numbered window (admin paterni)
   ===============================================================
   `computePageWindow` (lib/pagination) ile aynı algoritma admin'le.
   pageSize URL'de korunur; sayfa linklerinde page güncellenir. */
function PaginationNav({
  currentPage,
  totalPages,
  pageSize,
  sort,
}: {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  sort: PublicSort;
}) {
  const pages = computePageWindow(currentPage, totalPages);
  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  return (
    <nav
      aria-label="Sayfalar"
      className="mt-16 md:mt-20 flex flex-wrap items-center justify-center gap-1.5 text-[13px] text-[var(--color-stone-600)]"
    >
      {prevDisabled ? (
        <span
          aria-disabled="true"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] font-medium text-[var(--color-stone-300)] cursor-not-allowed"
        >
          <ChevronLeft size={14} />
          Önceki
        </span>
      ) : (
        <Link
          href={buildArchiveHref({ page: currentPage - 1, pageSize, sort })}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] font-medium text-[var(--color-stone-600)] hover:text-[var(--color-stone-900)] hover:bg-[var(--color-sand-50)] transition-colors motion-reduce:transition-none"
        >
          <ChevronLeft size={14} />
          Önceki
        </Link>
      )}

      {pages.map((p, idx) =>
        p === "…" ? (
          <span
            key={`gap-${idx}`}
            className="px-2 py-1.5 text-[12.5px] text-[var(--color-stone-400)]"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <Link
            key={p}
            href={buildArchiveHref({ page: p, pageSize, sort })}
            aria-current={p === currentPage ? "page" : undefined}
            className={
              "inline-flex items-center justify-center min-w-[32px] " +
              "px-2.5 py-1.5 rounded-full " +
              "text-[12.5px] font-medium tabular-nums " +
              "transition-colors motion-reduce:transition-none " +
              (p === currentPage
                ? "bg-[var(--color-stone-900)] text-white"
                : "text-[var(--color-stone-600)] hover:text-[var(--color-stone-900)] hover:bg-[var(--color-sand-50)]")
            }
          >
            {p}
          </Link>
        )
      )}

      {nextDisabled ? (
        <span
          aria-disabled="true"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] font-medium text-[var(--color-stone-300)] cursor-not-allowed"
        >
          Sonraki
          <ChevronRight size={14} />
        </span>
      ) : (
        <Link
          href={buildArchiveHref({ page: currentPage + 1, pageSize, sort })}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] font-medium text-[var(--color-stone-600)] hover:text-[var(--color-stone-900)] hover:bg-[var(--color-sand-50)] transition-colors motion-reduce:transition-none"
        >
          Sonraki
          <ChevronRight size={14} />
        </Link>
      )}
    </nav>
  );
}

/* ===============================================================
   🛡️ SORT SELECTOR — Link/details dropdown (server-safe, JS-less)
   ===============================================================
   /arama ile birebir aynı pattern. URL inşası TEK source-of-truth:
   buildArchiveHref({ sort, page: 1, pageSize }) → pageSize KORUNUR,
   page=1 reset. Hard navigation YOK; soft navigation (<Link>) ile
   React state korunur, race condition yok. */
function SortSelector({
  pageSize,
  sort,
}: {
  pageSize: number;
  sort: PublicSort;
}) {
  const currentLabel = PUBLIC_SORT_LABELS[sort];
  return (
    <details className="relative group/sort">
      <summary
        className={
          "list-none cursor-pointer select-none " +
          "inline-flex items-center gap-2 px-3 py-1 rounded-full " +
          "border border-[var(--color-stone-200)] bg-white " +
          "text-[12.5px] font-medium text-[var(--color-stone-700)] " +
          "hover:border-[var(--color-stone-300)] " +
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40 " +
          "transition-colors motion-reduce:transition-none"
        }
        aria-label="Villa sıralaması"
      >
        <span className="text-[var(--color-stone-500)]">Sırala</span>
        <span>{currentLabel}</span>
        <span
          aria-hidden="true"
          className="text-[var(--color-stone-400)] transition-transform group-open/sort:rotate-180"
        >
          ▾
        </span>
      </summary>
      <div
        role="menu"
        className={
          "absolute right-0 top-full mt-2 z-20 " +
          "min-w-[220px] rounded-xl border border-[var(--color-stone-200)] " +
          "bg-white shadow-lg p-1"
        }
      >
        {ALLOWED_PUBLIC_SORTS.map((s) => {
          const active = s === sort;
          /* pageSize PRESERVE + page=1 reset. */
          const href = buildArchiveHref({ sort: s, page: 1, pageSize });
          return (
            <Link
              key={s}
              href={href}
              role="menuitemradio"
              aria-checked={active}
              className={
                "block px-3 py-2 rounded-lg " +
                "text-[12.5px] font-medium " +
                "transition-colors motion-reduce:transition-none " +
                (active
                  ? "bg-[var(--color-stone-900)] text-white"
                  : "text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)]")
              }
            >
              {PUBLIC_SORT_LABELS[s]}
            </Link>
          );
        })}
      </div>
    </details>
  );
}
