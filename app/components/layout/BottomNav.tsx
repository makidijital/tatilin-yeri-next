"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Search,
  Sparkles,
  MessageCircle,
  Phone,
  type LucideIcon,
} from "lucide-react";

import SearchBottomSheet from "@/app/components/layout/SearchBottomSheet";
/* 🛡️ PHASE 11 — locale prefix'ini soymak için (Phase 7B helper'ı). */
import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";
/* 🛡️ PHASE 11 — locale, Header (9A) / Footer (9B) ile AYNI şekilde
   ZATEN VAR OLAN `pathname`'den türetilir. Layout'a (server) dokunulmadı;
   `headers()`/`cookies()` KULLANILMADI. */
import { DEFAULT_LOCALE, localeFromPathname } from "@/lib/i18n/config";
/* 🛡️ NAVIGATION LOCALE PERSISTENCE — iç link aktif locale'i taşır
   (bkz. lib/i18n/locale-href.ts). */
import { localeHref } from "@/lib/i18n/locale-href";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ BOTTOM NAVIGATION — MOBİL (iOS/Airbnb kalitesi, premium)
   ===============================================================
   Yalnız MOBİL (`md:hidden`). Desktop'ta FloatingSocial aynen kalır.
   5 eşit-genişlik item: Anasayfa · Arama · Öneri Al (/teklif-al) ·
   WhatsApp · Telefon. WhatsApp/Telefon href'leri PROP olarak gelir
   (server layout `settings`'ten türetir — YENİ business logic YOK).

   🔎 ARAMA: route'a GİTMEZ; premium `SearchBottomSheet` açar. Sheet içinde
   mevcut paylaşılan `VillaSearchBox` (Hero/Header ile AYNI canlı arama)
   compose edilir → duplicate logic YOK, mevcut davranış aynen.

   VILLA DETAY (`/kiralik-villa/<slug>`) → MobileBookingCta zaten alt barın
   sahibi; İKİ alt bar olmaması için nav TAMAMEN gizlenir (null).
   Z-INDEX z-40 (modal 1000+ > Header/Cookie 50 > BottomNav 40 >
   MobileBookingCta 30 > içerik). Arama sheet'i z-[1000] (modal katmanı).
   =============================================================== */

interface BottomNavProps {
  phoneHref: string | null;
  whatsappHref: string | null;
  /* 🔄 TR ana sayfanın yolu. Varsayılan dil EN/DE iken "/" bir
     YÖNLENDİRİCİ olduğu için public layout "/tr" geçer; aksi halde
     (ve prop hiç verilmezse) "/" → davranış BYTE-IDENTICAL. */
  trHomeHref?: string;
}

const ITEM_BASE =
  "group flex h-[70px] w-full flex-col items-center justify-center gap-1 " +
  "transition-[color,transform] duration-150 ease-out " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-coral)]/40 focus-visible:ring-inset";

const LABEL_CLASS = "text-[10.5px] font-medium leading-none tracking-tight";

export default function BottomNav({
  phoneHref,
  whatsappHref,
  trHomeHref = "/",
}: BottomNavProps) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);

  /* 🛡️ PHASE 11 — LOCALE PREFIX BUG DÜZELTMESİ.
     Önceden `pathname` HAM kullanılıyordu; `/en/kiralik-villa/x` ve
     `/de/kiralik-villa/x` `startsWith("/kiralik-villa/")` ile
     EŞLEŞMİYORDU → EN/DE villa detayında ÇİFT alt bar çıkıyordu.
     Aynı şekilde `/en` ana sayfasında "Anasayfa" sekmesi aktif
     görünmüyordu.

     Çözüm mevcut helper'la: `buildLocaleAlternates(path, "tr")`
     (Phase 7B) `/en`,`/de` prefix'ini segment-sınırlı şekilde soyup
     TR-eşdeğeri base path'i verir — `getLocaleSwitchTargets` ile AYNI
     desen. Yeni bir path/locale mantığı İCAT EDİLMEDİ. TR path'lerinde
     `basePath === pathname` olduğu için davranış BİREBİR AYNI kalır. */
  const basePath = buildLocaleAlternates(pathname || "/", "tr").languages.tr;

  /* 🛡️ PHASE 11 — locale AYRI bir türetme; yukarıdaki `basePath`
     (P0'da eklenen prefix-soyma) mantığına DOKUNULMADI. */
  const locale = localeFromPathname(pathname);
  const dict = getDictionary(locale);
  const navDict = dict.layout.bottomNav;

  // Villa detay → tek alt bar (MobileBookingCta) kalsın; nav gizle.
  if (basePath.startsWith("/kiralik-villa/")) return null;

  /* `/tr` (MOD B'deki TR ana sayfa) da "ana sayfa" sayılır —
     `stripLocalePrefix` yalnız /en,/de soyduğu için basePath "/tr"
     olarak gelir. MOD A'da `trHomeHref === "/"` → koşul BİREBİR
     eskisi gibi çalışır. */
  const isActive = (href: string) =>
    href === "/" || href === trHomeHref
      ? basePath === "/" || basePath === trHomeHref
      : basePath === href;

  return (
    <>
      {/* Spacer — içerik/footer barın arkasında kalmasın (yalnız mobil). */}
      <div
        aria-hidden
        className="md:hidden h-[calc(70px+env(safe-area-inset-bottom))]"
      />

      <nav
        aria-label={navDict.ariaLabel}
        className="
          md:hidden
          fixed inset-x-0 bottom-0 z-40
          bg-white/90 backdrop-blur-sm
          border-t border-[var(--color-stone-200)]
          shadow-[0_-8px_24px_-18px_rgba(2,6,23,0.28)]
          pb-[env(safe-area-inset-bottom)]
          print:hidden
        "
      >
        <ul className="grid grid-cols-5">
          <li>
            <InternalItem
              href={
                locale === DEFAULT_LOCALE
                  ? trHomeHref
                  : localeHref("/", locale)
              }
              label={dict.header.home}
              Icon={Home}
              active={isActive("/")}
            />
          </li>

          {/* 🔎 Arama — route DEĞİL, premium bottom sheet açar. */}
          <li>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label={navDict.searchAriaLabel}
              aria-haspopup="dialog"
              aria-expanded={searchOpen}
              className={
                ITEM_BASE +
                " " +
                (searchOpen
                  ? "text-[var(--brand-coral)]"
                  : "text-[var(--color-stone-400)] active:text-[var(--color-stone-600)]")
              }
            >
              <Search
                size={21}
                strokeWidth={searchOpen ? 2.4 : 2}
                className="transition-transform duration-150 group-active:scale-105"
                aria-hidden
              />
              <span className={LABEL_CLASS}>{navDict.search}</span>
            </button>
          </li>

          <li>
            <InternalItem
              href={localeHref("/teklif-al", locale)}
              label={navDict.offer}
              Icon={Sparkles}
              active={isActive("/teklif-al")}
            />
          </li>

          {/* WhatsApp — ikon daima yeşil; label okunabilir stone. */}
          <li>
            <ActionItem
              href={whatsappHref}
              label="WhatsApp"
              Icon={MessageCircle}
              iconClass="text-[#25D366]"
              external
            />
          </li>

          {/* Telefon — ikon daima brand; label okunabilir stone. */}
          <li>
            <ActionItem
              href={phoneHref}
              label={dict.footer.phone}
              Icon={Phone}
              iconClass="text-[var(--brand-coral)]"
            />
          </li>
        </ul>
      </nav>

      {/* Premium arama bottom-sheet — mevcut VillaSearchBox compose eder. */}
      <SearchBottomSheet
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        locale={locale}
      />
    </>
  );
}

/* İç route link'i (Anasayfa / Öneri Al) — aktifse brand rengi. */
function InternalItem({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={
        ITEM_BASE +
        " " +
        (active
          ? "text-[var(--brand-coral)]"
          : "text-[var(--color-stone-400)] active:text-[var(--color-stone-600)]")
      }
    >
      <Icon
        size={21}
        strokeWidth={active ? 2.4 : 2}
        className="transition-transform duration-150 group-active:scale-105"
        aria-hidden
      />
      <span className={LABEL_CLASS}>{label}</span>
    </Link>
  );
}

/* External aksiyon (tel: / wa.me). href yoksa inert (opacity, non-link)
   → 5 sütunlu grid bozulmaz. WCAG için label okunabilir stone; marka
   rengi ikonda taşınır. */
function ActionItem({
  href,
  label,
  Icon,
  iconClass,
  external,
}: {
  href: string | null;
  label: string;
  Icon: LucideIcon;
  iconClass: string;
  external?: boolean;
}) {
  const content = (
    <>
      <Icon
        size={21}
        strokeWidth={2}
        className={
          "transition-transform duration-150 group-active:scale-105 " + iconClass
        }
        aria-hidden
      />
      <span className={LABEL_CLASS + " text-[var(--color-stone-500)]"}>
        {label}
      </span>
    </>
  );

  if (!href) {
    return (
      <span aria-disabled="true" className={ITEM_BASE + " opacity-40"}>
        {content}
      </span>
    );
  }

  return (
    <a
      href={href}
      aria-label={label}
      className={ITEM_BASE}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {content}
    </a>
  );
}
