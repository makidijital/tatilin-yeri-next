"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Menu, X, ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import TopBar from "./TopBar";
/* 🛡️ FAZ 36 — Favorites shortcut (localStorage badge counter) */
import HeaderFavoritesLink from "@/app/components/favorites/HeaderFavoritesLink";
/* 🛡️ Canlı arama paylaşılan component (header + hero) — duplikasyon yok.
   Arama state/debounce/dropdown mantığı VillaSearchBox'a taşındı. */
import VillaSearchBox from "@/app/components/layout/VillaSearchBox";

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
  /* 🛡️ Header search (desktop + mobile) TÜM sayfalarda gösterilir —
     anasayfa dahil (eski `!isHome` gizleme kaldırıldı). İç sayfa
     davranışı birebir aynı; paylaşılan VillaSearchBox mantığı değişmedi.
     Hero / HeroSearchPanel / HeroStickySearch AYNEN korunur. */

  const [scrolled, setScrolled] = useState(false);

  /* 🛡️ MOBILE SUBMENU ACCORDION — hangi ana menü öğelerinin alt
     menüsü açık, id/name bazlı Set ile tutuluyor. Birden fazla
     submenu bağımsız açık kalabilir (biri diğerini otomatik
     kapatmaz). Başlangıç: boş Set → tüm alt menüler kapalı.
     Yalnızca mobile hamburger drawer'ı için; desktop `group-hover`
     dropdown sistemine dokunulmadı. */
  const [openSubmenus, setOpenSubmenus] = useState<Set<string>>(
    new Set()
  );

  function toggleSubmenu(key: string) {
    setOpenSubmenus((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  /* Hamburger tamamen kapanınca submenu state'i de temizlenir —
     kullanıcı menüyü tekrar açtığında bütün alt menüler yine
     kapalı gelir. */
  function closeMobileMenu() {
    setOpen(false);
    setOpenSubmenus(new Set());
  }

  useEffect(() => {
    setOpen(false);
    setOpenSubmenus(new Set());
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
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

  /* 🛡️ TEKLİF AL (desktop) — "Villa Arama" (`/arama`) menü öğesinin
     index'i render'dan ÖNCE hesaplanır. Eşleşme hem `href` hem `name`
     ile denenir (DB içeriği güvencesi için); index bulunamazsa (-1)
     CTA nav'ın SONUNA fallback olarak eklenir — böylece buton HER
     ZAMAN görünür olur, DB menü verisine kırılgan bağımlılık yoktur. */
  const villaAramaIndex = menu.findIndex(
    (item) => item.href === "/arama" || item.name === "Villa Arama"
  );

  /* 🛡️ Teklif Al CTA — marka renkleri (#ED7926 → #0973BA). Animasyon:
     TopBar'daki ışık bandı/shimmer (`@keyframes shimmer`) KULLANILMAZ;
     onun yerine Tailwind'in HAZIR `animate-pulse` utility'si ile
     "nefes alan" (breathing) yumuşak bir glow halo uygulanır — emsal:
     `PrepaymentBadge.tsx` (-inset blur + opacity animate-pulse).
     globals.css'e dokunulmadı, yeni keyframe eklenmedi. Hover'da glow
     daha belirgin (`group-hover:opacity-70 group-hover:blur-lg`) ve
     buton kendi gölgesiyle hafifçe öne çıkar (`hover:-translate-y-[1px]`
     + `hover:shadow-*`). Desktop ve mobil CTA aynı bu fonksiyonu /
     aynı tekniği kullanır (yalnız mobilde boyut/padding farklı). */
  const renderTeklifAlDesktop = (key: string) => (
    <div key={key} className="group relative flex items-center py-5">
      <span
        aria-hidden
        className="
          pointer-events-none absolute -inset-1.5 rounded-full
          bg-gradient-to-r from-[#ED7926] to-[#0973BA]
          opacity-40 blur-md
          animate-pulse [animation-duration:2.8s]
          group-hover:opacity-70 group-hover:blur-lg
          transition-[opacity,filter] duration-300
          motion-reduce:animate-none
        "
      />
      <Link
        href="/teklif-al"
        className="
          relative inline-flex items-center justify-center
          px-4 py-[7px] rounded-full
          text-[12.5px] font-semibold tracking-[0.01em] text-white
          bg-gradient-to-r from-[#ED7926] to-[#0973BA]
          shadow-[0_6px_16px_-4px_rgba(237,121,38,0.45),0_6px_16px_-4px_rgba(9,115,186,0.35)]
          hover:shadow-[0_10px_26px_-4px_rgba(237,121,38,0.6),0_10px_26px_-4px_rgba(9,115,186,0.5)]
          hover:-translate-y-[1px]
          transition-[box-shadow,transform] duration-300
          motion-reduce:transition-none motion-reduce:hover:translate-y-0
          focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0973BA]/50
        "
      >
        Teklif Al
      </Link>
    </div>
  );

  return (
    <>
      <header className="w-full fixed top-0 z-50">
        <TopBar />

        <div className={headerShellClass}>
          <div className="max-w-[1480px] mx-auto px-5 md:px-10 lg:px-16 h-[72px] md:h-[80px] flex items-center justify-between">
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
                  className="h-12 w-auto object-contain"
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
              {menu.map((item, index) => {
                const isActive = pathname === item.href;
                const hasChildren = item.children && item.children.length > 0;
                /* 🛡️ TEKLİF AL (desktop) — DB menü ağacına DOKUNULMADI;
                   yalnızca render sırasında, villaAramaIndex'e denk gelen
                   item'ın (Villa Arama) hemen ÖNÜNE, aynı .map() içinde
                   eklenir. Menü sırası/verisi DB'de aynen kalır. */
                const isVillaAramaItem = index === villaAramaIndex;

                const menuItemNode = (
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

                if (!isVillaAramaItem) return menuItemNode;

                return [
                  renderTeklifAlDesktop(
                    `teklif-al-desktop-${item.id || item.name}`
                  ),
                  menuItemNode,
                ];
              })}
              {villaAramaIndex === -1 &&
                renderTeklifAlDesktop("teklif-al-desktop-fallback")}
            </nav>

            {/* RIGHT — search + favorites + CTA */}
            <div className="hidden md:flex items-center gap-3">
              {/* SEARCH — paylaşılan VillaSearchBox. Artık anasayfa dahil
                 tüm sayfalarda görünür. */}
              <VillaSearchBox variant="desktop" />

              {/* Favorites shortcut (FAZ 36).
                 🛡️ FAZ 39C: variant prop kaldırıldı (dead). */}
              <HeaderFavoritesLink />
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
              {/* 🛡️ MOBILE SEARCH kaldırıldı — mobilde tek villa-adı arama
                 girişi Bottom Navigation → Arama → SearchBottomSheet.
                 Çift arama olmaması için header mobil arama render EDİLMEZ.
                 Desktop arama (hidden md:flex bloğu) AYNEN korunur. */}

              {/* 🛡️ MOBILE FAVORITES — hamburger'ın solunda ikon-only
                 favori girişi. Desktop ile AYNI HeaderFavoritesLink
                 component'i (ikon + köşe badge); yalnız `md:hidden` bu
                 blokta → desktop cluster'daki kopya etkilenmez. Eski
                 drawer içi "Favorilerim" satırı kaldırıldı. */}
              <HeaderFavoritesLink />

              {/* 🛡️ MOBİL TEKLİF AL — eski görünür "Menü" yazısının
                 yerini aldı. Hamburger toggle'dan TAMAMEN bağımsız ayrı
                 bir <Link>; kendi tıklama alanı var, hamburger'ın
                 onClick'ini tetiklemez, `open` state'ine dokunmaz.
                 /teklif-al'a gider. Konum/boyut/davranış AYNEN korundu —
                 yalnızca animasyon tekniği değişti: TopBar shimmer (ışık
                 bandı) yerine, desktop CTA ile AYNI breathing/pulse glow
                 (bkz. `renderTeklifAlDesktop` yorumu). `shrink-0` artık
                 sarmalayıcı `div` üzerinde → küçük ekranlarda taşma/
                 sıkışma yok. */}
              <div className="group relative shrink-0">
                <span
                  aria-hidden
                  className="
                    pointer-events-none absolute -inset-1 rounded-full
                    bg-gradient-to-r from-[#ED7926] to-[#0973BA]
                    opacity-40 blur-md
                    animate-pulse [animation-duration:2.8s]
                    group-hover:opacity-70 group-hover:blur-lg
                    transition-[opacity,filter] duration-300
                    motion-reduce:animate-none
                  "
                />
                <Link
                  href="/teklif-al"
                  className="
                    relative inline-flex items-center justify-center
                    whitespace-nowrap
                    px-3.5 py-2 rounded-full
                    text-[12px] font-semibold text-white
                    bg-gradient-to-r from-[#ED7926] to-[#0973BA]
                    shadow-[0_4px_14px_-4px_rgba(237,121,38,0.5),0_4px_14px_-4px_rgba(9,115,186,0.4)]
                    active:scale-[0.97]
                    transition-transform duration-150 motion-reduce:transition-none
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0973BA]/50
                  "
                >
                  Teklif Al
                </Link>
              </div>

              {/* HAMBURGER — aç/kapa davranışı birebir korundu. Görünür
                 "Menü" metni kaldırıldı (yerini Teklif Al CTA'sı aldı);
                 yalnız ikon kalır, simetrik padding ile tap alanı korunur.
                 Kapanış (manuel ya da route değişimiyle) submenu state'ini
                 de temizler (closeMobileMenu → openSubmenus sıfırlanır). */}
              <button
                onClick={() => (open ? closeMobileMenu() : setOpen(true))}
                aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
                aria-expanded={open}
                className="
                  inline-flex items-center justify-center shrink-0
                  p-2.5 rounded-full
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
              ? /* 🛡️ MOBİL MENÜ SCROLL FIX — bar (h-[72px]) altından
                   viewport sonuna; dvh → iPhone Safari toolbar-safe.
                   overflow-y-auto: uzun menüde alt öğelere erişim;
                   overscroll-contain: iOS body scroll-chaining engeli. */
                "opacity-100 max-h-[calc(100dvh-72px)] overflow-y-auto overscroll-contain"
              : "opacity-0 max-h-0 overflow-hidden")
          }
        >
          <div className="flex flex-col p-5 gap-4">
            {/* 🛡️ MOBILE SEARCH header strip'e taşındı (kullanıcı
               hamburger açmadan görebilsin). Drawer artık yalnızca
               navigasyon menüsü ve CTA içerir. Aynı state hâlâ
               geçerli — sadece drawer içindeki render kaldırıldı. */}
            {menu.map((item) => {
              const itemKey = item.id || item.name;
              const hasChildren =
                item.children && item.children.length > 0;
              const isSubmenuOpen = openSubmenus.has(itemKey);

              return (
                <div
                  key={itemKey}
                  className="border-b border-[var(--color-stone-100)] pb-3 last:border-b-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={item.href}
                      className="block flex-1 font-medium text-[var(--color-stone-900)]"
                    >
                      {item.name}
                    </Link>

                    {/* 🛡️ SUBMENU TOGGLE — ayrı, bağımsız tıklama alanı.
                       Parent linkin kendi navigasyon davranışına
                       dokunmaz (yukarıdaki <Link> AYNEN çalışır);
                       yalnızca alt menüyü açar/kapatır. Birden fazla
                       submenu bağımsız açık kalabilir (openSubmenus
                       bir Set — bunu açmak diğerini kapatmaz). */}
                    {hasChildren && (
                      <button
                        type="button"
                        onClick={() => toggleSubmenu(itemKey)}
                        aria-expanded={isSubmenuOpen}
                        aria-label={
                          (isSubmenuOpen ? "Kapat: " : "Aç: ") +
                          item.name +
                          " alt menüsü"
                        }
                        className="
                          shrink-0 inline-flex items-center justify-center
                          h-7 w-7 rounded-full
                          text-[var(--color-stone-500)]
                          hover:bg-[var(--color-sand-50)] hover:text-[var(--color-stone-900)]
                          transition-colors motion-reduce:transition-none
                          focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/40
                        "
                      >
                        <ChevronDown
                          size={16}
                          className={
                            "transition-transform duration-300 motion-reduce:transition-none " +
                            (isSubmenuOpen ? "rotate-180" : "rotate-0")
                          }
                        />
                      </button>
                    )}
                  </div>

                  {/* 🛡️ SMOOTH ACCORDION — grid-rows-[0fr]→[1fr] tekniği
                     (projede FaqSection.tsx ile aynı yaklaşım); height
                     ölçme/layout-thrash yok. Başlangıçta (openSubmenus
                     boş Set) HERKES kapalı. */}
                  {hasChildren && (
                    <div
                      className={
                        "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none " +
                        (isSubmenuOpen ? "grid-rows-[1fr] mt-2" : "grid-rows-[0fr]")
                      }
                    >
                      <div className="overflow-hidden">
                        <div className="ml-3 space-y-2">
                          {item.children!.map((child) => (
                            <Link
                              key={child.id}
                              href={child.href}
                              className="block text-sm text-[var(--color-stone-500)] hover:text-[var(--color-stone-900)] transition"
                            >
                              {child.name}
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* 🛡️ Favoriler artık mobil Header strip'te (hamburger'ın
               solunda ikon-only). Drawer içindeki "Favorilerim" satırı
               kaldırıldı. */}

          </div>
        </div>
      </header>

      {/* Spacer — header opak; her sayfada koşulsuz boşluk. */}
      <div className="h-[108px]" />
    </>
  );
}
