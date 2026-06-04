"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Menu, X, Search, ChevronDown, Heart, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";
import TopBar from "./TopBar";
/* 🛡️ EXIT HARDENING — canlı arama sorgusu inline `supabase.from()`
   yerine villaRepository.searchByTitle. `db` barrel client-safe;
   aynı anon RLS + birebir aynı SELECT/filter/ilike/limit. */
import { villaRepository } from "@/lib/db/villa.repository";
import { resolveVillaImageUrl } from "@/lib/storage.helpers";
/* 🛡️ FAZ 36 — Favorites shortcut (localStorage badge counter) */
import HeaderFavoritesLink from "@/app/components/favorites/HeaderFavoritesLink";

/* ===============================================================
   🛡️ FAZ 39C — HEADER CSS CLEANUP
   ===============================================================
   ÖNCE (FAZ 38 ardından):
     - `transparent` boolean dead constant'tı (always false)
     - Tüm `transparent ? "white..." : "stone..."` ternary'leri
       her zaman ikinci branch'a düşüyordu → dead code + okuma yükü
     - `useMemo` import edilmişti ama kullanılmıyordu
     - Logo span'ı `text-[var(--color-champagne-500)]` (cyan) →
       yeni coral brand identity ile çelişiyordu
     - Mobile favorites pill `hover:border-champagne-500` (cyan) →
       coral brand ile çelişiyordu
     - Desktop & mobile CTAs `bg-stone-900` + `text-white` ham black
       pill → coral luxury button system ile çelişiyordu
     - Search spinner `border-champagne-500` (cyan) → coral aksenti
       eksikti

   SONRA (FAZ 39C):
     - `transparent` kaldırıldı; tüm ternary'ler kaldırıldı
     - useMemo import kaldırıldı
     - Logo accent → coral
     - Mobile favorites hover → coral
     - Desktop CTA → `.btn-primary` (luxury coral system)
     - Mobile CTA → `.btn-primary` (zaten kullanılıyordu; ✔)
     - Search spinner → coral

   KORUNAN BEHAVIOR (zero touch):
     - State hooks: open, search, results, loading, openSearch, scrolled
     - useEffect: pathname reset, scroll watch, live search debounce
       + memory-leak guard, outside-click
     - getImage helper
     - Live search query (visibility filter ile)
     - Logo (settings.site_logo) + wordmark fallback
     - Mobile menu open/close
     - HeaderFavoritesLink (artık `variant="default"` sabiti)
   =============================================================== */

type MenuItem = {
  id?: string;
  name: string;
  href: string;
  children?: MenuItem[];
};

export default function Header({
  menu = [],
  siteLogo = null,
}: {
  menu?: MenuItem[];
  /* settings.site_logo — boşsa text wordmark fallback */
  siteLogo?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [openSearch, setOpenSearch] = useState(false);

  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const getImage = (villa: any) => {
    if (!villa.villa_images?.length) return "/placeholder.jpg";
    const sorted = villa.villa_images.sort((a: any, b: any) => {
      if (a.is_cover) return -1;
      if (b.is_cover) return 1;
      return a.sort_order - b.sort_order;
    });
    /* 🛡️ Bucket-fix — resolveVillaImageUrl: villa-images bucket'ından
       URL üretir; legacy FULL URL pass-through, Phase B path → URL.
       Hiçbiri yoksa placeholder. */
    return resolveVillaImageUrl(sorted[0]?.image_url) || "/placeholder.jpg";
  };

  /* 🛡️ LIVE SEARCH — debounce + memory-leak guard (FAZ 2A).
     `cancelled` flag, debounce timer'ın geç tetiklemesi veya
     Supabase response'unun gelmesinden önce component unmount
     olursa setState çağrılmaması için. Davranış: AYNEN korundu. */
  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      if (cancelled) return;
      setLoading(true);
      /* 🛡️ EXIT HARDENING — repository delege; SELECT/filter/ilike/
         limit birebir aynı. Visibility filtresi (is_active +
         deleted_at) repo içinde korunur. */
      const data = await villaRepository.searchByTitle(search, 5);
      if (cancelled) return;
      setResults(data || []);
      setLoading(false);
      setOpenSearch(true);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [search]);

  useEffect(() => {
    const handleClick = () => setOpenSearch(false);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  /* Subtle scroll-state shadow: scrolled iken hairline shadow ekle.
     Tek kompozit class — eski ternary çağrısı kaldırıldı. */
  const headerShellClass =
    "transition-shadow duration-300 motion-reduce:transition-none " +
    "bg-white/92 backdrop-blur-xl backdrop-saturate-150 " +
    "border-b border-[var(--color-stone-100)] " +
    (scrolled
      ? "shadow-[0_8px_24px_-12px_rgba(27,26,23,0.08)]"
      : "shadow-none");

  return (
    <>
      <header className="w-full fixed top-0 z-50">
        <TopBar />

        <div className={headerShellClass}>
          <div className="max-w-[1280px] mx-auto px-5 md:px-10 lg:px-16 h-[72px] md:h-[80px] flex items-center justify-between">
            {/* LOGO */}
            <Link
              href="/"
              className="
                font-display text-2xl tracking-tight
                flex items-center
                text-[var(--color-stone-900)]
                hover:text-[var(--color-stone-700)]
                transition-colors motion-reduce:transition-none
              "
            >
              {siteLogo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={siteLogo}
                  alt="Site logosu"
                  className="h-14 w-auto object-contain"
                />
              ) : (
                <>
                  Villa
                  {/* 🛡️ FAZ 39C — Coral brand accent (was cyan champagne). */}
                  <span className="text-[var(--brand-coral)]">Kiralama</span>
                </>
              )}
            </Link>

            {/* MENU — ultra clean, premium spacing */}
            <nav
              className="
                hidden md:flex gap-8 lg:gap-10
                text-[13px] font-medium tracking-[0.01em]
                text-[var(--color-stone-700)]
              "
            >
              {menu.map((item) => {
                const isActive = pathname === item.href;
                const hasChildren = item.children && item.children.length > 0;

                return (
                  <div
                    key={item.id || item.name}
                    className="relative group py-5"
                  >
                    <Link
                      href={item.href}
                      className={
                        "flex items-center gap-1 transition-colors motion-reduce:transition-none " +
                        (isActive
                          ? "text-[var(--color-stone-900)]"
                          : "hover:text-[var(--color-stone-900)]")
                      }
                    >
                      {item.name}
                      {hasChildren && (
                        <ChevronDown size={14} className="opacity-70" />
                      )}
                    </Link>

                    {/* Coral underline accent (FAZ 38) */}
                    <span
                      aria-hidden="true"
                      className={
                        "absolute left-0 right-0 -bottom-px mx-auto h-[2px] w-6 rounded-full transition-opacity duration-300 motion-reduce:transition-none " +
                        "bg-[var(--brand-coral)] " +
                        (isActive
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100")
                      }
                    />

                    {hasChildren && (
                      <div className="absolute left-1/2 -translate-x-1/2 top-full pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[999]">
                        <div className="w-56 bg-white rounded-2xl shadow-[0_24px_48px_-16px_rgb(27_26_23/0.18)] border border-[var(--color-stone-100)] overflow-hidden">
                          {item.children!.map((child) => (
                            <Link
                              key={child.id}
                              href={child.href}
                              className="block px-5 py-3 text-[13.5px] text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)] hover:text-[var(--color-stone-900)] transition"
                            >
                              {child.name}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* RIGHT — search + favorites + CTA */}
            <div className="hidden md:flex items-center gap-3">
              {/* SEARCH PILL */}
              <div
                className="
                  relative flex items-center rounded-full border
                  bg-[var(--color-sand-50)] border-[var(--color-stone-100)]
                  text-[var(--color-stone-700)]
                  px-4 py-2
                  transition-colors duration-300 motion-reduce:transition-none
                "
                onClick={(e) => e.stopPropagation()}
              >
                <Search
                  size={15}
                  className="text-[var(--color-stone-400)]"
                />

                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => setOpenSearch(true)}
                  placeholder="Villa ara..."
                  className="
                    !bg-transparent !border-0 !shadow-none
                    outline-none text-[13.5px] px-2 w-32 focus:w-48 transition-all
                    !text-[var(--color-stone-900)]
                    placeholder-[var(--color-stone-400)]
                  "
                />

                {/* DROPDOWN */}
                {openSearch && search && (
                  <div className="absolute top-full mt-3 left-0 w-96 bg-white shadow-[0_24px_48px_-16px_rgb(27_26_23/0.22)] rounded-2xl border border-[var(--color-stone-100)] z-50 overflow-hidden">
                    {loading && (
                      <div className="p-4 text-sm text-[var(--color-stone-500)] flex items-center gap-2">
                        {/* 🛡️ FAZ 39C — Coral spinner (was cyan champagne). */}
                        <span className="w-3 h-3 border-2 border-[var(--brand-coral)] border-t-transparent rounded-full animate-spin" />
                        Aranıyor...
                      </div>
                    )}

                    {!loading && results.length === 0 && (
                      <div className="p-5 text-center text-sm text-[var(--color-stone-400)]">
                        <p className="font-medium text-[var(--color-stone-600)]">
                          Sonuç bulunamadı
                        </p>
                        <p className="text-xs mt-1">
                          Farklı bir arama denemeye ne dersin?
                        </p>
                      </div>
                    )}

                    {!loading &&
                      results.map((villa) => (
                        <Link
                          key={villa.id}
                          href={`/kiralik-villa/${villa.slug}`}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-sand-50)] transition border-b border-[var(--color-stone-100)] last:border-b-0"
                          onClick={() => {
                            setOpenSearch(false);
                            setSearch("");
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={getImage(villa)}
                            alt=""
                            className="w-14 h-12 object-cover rounded-lg ring-1 ring-[var(--color-stone-100)]"
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="text-[13.5px] font-medium text-[var(--color-stone-900)] truncate">
                              {villa.title}
                            </span>
                            <span className="text-[11px] text-[var(--color-stone-400)] tracking-[0.05em] uppercase">
                              Villayı görüntüle →
                            </span>
                          </div>
                        </Link>
                      ))}
                  </div>
                )}
              </div>

              {/* Favorites shortcut (FAZ 36).
                 🛡️ FAZ 39C: variant prop kaldırıldı (dead). */}
              <HeaderFavoritesLink />

              {/* 🛡️ FAZ 39C — Desktop CTA unified to .btn-primary
                 (luxury coral system). Padding override `!py-2.5`
                 ile header height'a hizalı; aksi takdirde default
                 12px padding header bar yüksekliğini değiştirirdi.
                 🛡️ FAZ 40 — CTA "Villaları keşfet" → "Teklif Al"
                 (concierge focus); href /arama → /teklif-al; Sparkles
                 icon eklendi (luxury danışman hissi). */}
              <Link
                href="/teklif-al"
                className="btn-primary !py-2.5 text-[13px]"
              >
                <Sparkles size={14} aria-hidden strokeWidth={1.75} />
                Teklif Al
              </Link>
            </div>

            {/* 🛡️ MOBILE ACTIONS — search input + hamburger toggle.
               Yerleşim: [ Villa ara... ] [ ☰ ]
               Eski mobil arama drawer içindeydi (kullanıcı hamburger
               açmadan göremiyordu); kullanılabilirlik için header
               strip'e taşındı. State (search/openSearch/results/loading)
               + debounce + outside-click handler değişmedi — input
               sadece DOM konumu değiştirdi. Desktop branch'e dokunulmadı
               (`md:hidden` mobil-only). */}
            <div className="md:hidden flex items-center gap-2">
              {/* MOBILE SEARCH — inline, header strip içinde.
                 Dropdown: input'un altında absolute; sağa hizalı
                 (right-0) — input dar viewport'un sağında olduğu
                 için sol tarafa açılır. */}
              <div
                className="relative flex items-center bg-[var(--color-sand-50)] border border-[var(--color-stone-100)] rounded-full px-3 py-1.5 flex-1 min-w-0 max-w-[200px]"
                onClick={(e) => e.stopPropagation()}
              >
                <Search
                  size={14}
                  className="text-[var(--color-stone-400)] shrink-0"
                  aria-hidden
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => setOpenSearch(true)}
                  placeholder="Villa ara..."
                  className="!bg-transparent !border-0 !shadow-none outline-none text-[13px] pl-2 w-full min-w-0"
                />

                {/* DROPDOWN — desktop dropdown JSX (L272-321) mirror.
                   State/effect/repository/debounce/outside-click
                   handler AYNEN paylaşılıyor; tek farklar:
                     - Container right-0 + w-[260px] sm:w-[300px]
                       (dar input'tan sağa hizalı pop-up)
                     - Link onClick → setOpenSearch + setSearch + setOpen
                       (sonuç tıklanırsa drawer açıkken kapansın —
                       drawer kapalıysa no-op; ekstra güvenlik). */}
                {openSearch && search && (
                  <div className="absolute top-full mt-2 right-0 w-[260px] sm:w-[300px] bg-white shadow-[0_24px_48px_-16px_rgb(27_26_23/0.22)] rounded-2xl border border-[var(--color-stone-100)] z-50 overflow-hidden">
                    {loading && (
                      <div className="p-4 text-sm text-[var(--color-stone-500)] flex items-center gap-2">
                        <span className="w-3 h-3 border-2 border-[var(--brand-coral)] border-t-transparent rounded-full animate-spin" />
                        Aranıyor...
                      </div>
                    )}

                    {!loading && results.length === 0 && (
                      <div className="p-5 text-center text-sm text-[var(--color-stone-400)]">
                        <p className="font-medium text-[var(--color-stone-600)]">
                          Sonuç bulunamadı
                        </p>
                        <p className="text-xs mt-1">
                          Farklı bir arama denemeye ne dersin?
                        </p>
                      </div>
                    )}

                    {!loading &&
                      results.map((villa) => (
                        <Link
                          key={villa.id}
                          href={`/kiralik-villa/${villa.slug}`}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-sand-50)] transition border-b border-[var(--color-stone-100)] last:border-b-0"
                          onClick={() => {
                            setOpenSearch(false);
                            setSearch("");
                            setOpen(false);
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={getImage(villa)}
                            alt=""
                            className="w-14 h-12 object-cover rounded-lg ring-1 ring-[var(--color-stone-100)]"
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="text-[13.5px] font-medium text-[var(--color-stone-900)] truncate">
                              {villa.title}
                            </span>
                            <span className="text-[11px] text-[var(--color-stone-400)] tracking-[0.05em] uppercase">
                              Villayı görüntüle →
                            </span>
                          </div>
                        </Link>
                      ))}
                  </div>
                )}
              </div>

              {/* HAMBURGER — davranış birebir korundu. */}
              <button
                onClick={() => setOpen(!open)}
                aria-label="Menüyü aç"
                className="
                  p-2 rounded-full shrink-0
                  text-[var(--color-stone-900)]
                  hover:bg-[var(--color-sand-50)]
                  transition-colors motion-reduce:transition-none
                "
              >
                {open ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>
        </div>

        {/* MOBILE MENU */}
        <div
          className={
            "md:hidden bg-white border-t border-[var(--color-stone-100)] shadow-lg " +
            "transition-all duration-300 origin-top " +
            (open
              ? "opacity-100 max-h-[80vh]"
              : "opacity-0 max-h-0 overflow-hidden")
          }
        >
          <div className="flex flex-col p-5 gap-4">
            {/* 🛡️ MOBILE SEARCH header strip'e taşındı (kullanıcı
               hamburger açmadan görebilsin). Drawer artık yalnızca
               navigasyon menüsü ve CTA içerir. Aynı state hâlâ
               geçerli — sadece drawer içindeki render kaldırıldı. */}
            {menu.map((item) => (
              <div
                key={item.id || item.name}
                className="border-b border-[var(--color-stone-100)] pb-3 last:border-b-0"
              >
                <Link
                  href={item.href}
                  className="block font-medium text-[var(--color-stone-900)]"
                >
                  {item.name}
                </Link>
                {item.children && item.children.length > 0 && (
                  <div className="ml-3 mt-2 space-y-2">
                    {item.children.map((child) => (
                      <Link
                        key={child.id}
                        href={child.href}
                        className="block text-sm text-[var(--color-stone-500)] hover:text-[var(--color-stone-900)] transition"
                      >
                        {child.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* 🛡️ FAZ 36 — Mobile favorites entry.
               🛡️ FAZ 39C — Coral hover (was cyan champagne). */}
            <Link
              href="/favoriler"
              className="
                inline-flex items-center justify-center gap-2
                w-full !py-3 rounded-full
                border border-[var(--color-stone-200)]
                text-[13px] font-medium text-[var(--color-stone-700)]
                hover:border-[var(--brand-coral)]
                hover:text-[var(--color-stone-900)]
                hover:bg-[var(--brand-coral-tint)]
                transition-colors motion-reduce:transition-none
              "
            >
              <Heart size={15} aria-hidden />
              Favorilerim
            </Link>

            {/* 🛡️ FAZ 40 — Mobile CTA: concierge focus (Teklif Al). */}
            <Link
              href="/teklif-al"
              className="btn-primary w-full !py-3 mt-2"
            >
              <Sparkles size={15} aria-hidden strokeWidth={1.75} />
              Teklif Al
            </Link>
          </div>
        </div>
      </header>

      {/* Spacer — header opak; her sayfada koşulsuz boşluk. */}
      <div className="h-[108px]" />
    </>
  );
}
