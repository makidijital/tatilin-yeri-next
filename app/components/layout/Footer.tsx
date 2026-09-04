import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

import {
  getPublicSettings,
} from "@/app/services/settings.service";
import type { Settings } from "@/app/services/settings.types";
import { menuRepository } from "@/lib/db/menu.repository";
import { pagesRepository } from "@/lib/db/pages.repository";
import { resolveAssetUrlVersioned } from "@/lib/storage.helpers";

/* ---------------- INLINE SOCIAL ICONS (stroke=currentColor) ---------------- */

const InstagramIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const FacebookIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

const YoutubeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
  </svg>
);

const TiktokIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
  </svg>
);

const WhatsappIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
  </svg>
);

/* ---------------- DRY HELPERS (dark-theme-aware) ---------------- */

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="
        group inline-flex items-center justify-center
        w-10 h-10 rounded-full
        border border-[var(--color-stone-200)] bg-white
        text-[var(--color-stone-500)]
        hover:border-[#ED7926]/45 hover:bg-gradient-to-br hover:from-[#ED7926]/10 hover:to-[#0973BA]/10
        hover:text-[#ED7926]
        transition-[color,background-color,border-color,transform]
        duration-300 motion-reduce:transition-none
        hover:scale-[1.05]
        focus:outline-none focus-visible:ring-2
        focus-visible:ring-[#0973BA]/40
      "
    >
      {children}
    </a>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="
        inline-flex items-center
        text-[14px] text-[var(--color-stone-500)]
        hover:text-[#ED7926]
        hover:translate-x-[2px]
        transition-[color,transform] duration-300
        motion-reduce:transition-none motion-reduce:hover:translate-x-0
      "
    >
      {children}
    </Link>
  );
}

/* ---------------- DYNAMIC TAXONOMY ITEMS ---------------- */

type TaxonomyItem = { id: string; name: string; slug: string | null };

/* Slug/id fallback — `/arama` resolver UUID + slug ikisini de
   accept ediyor (LocationCollection.tsx pattern referansı). */
function taxonomyHref(prefix: string, item: TaxonomyItem): string {
  const token = item.slug?.trim() || item.id;
  return `/arama?${prefix}=${encodeURIComponent(token)}`;
}

/* ---------------- KURUMSAL — CMS-DRIVEN ----------------
   Veri kaynağı: `pagesRepository.findActivePages()` (slim).
   Header (`getMenu()`) ile AYRI kanal:
     • Header  : is_active=true VE show_in_menu=true (mevcut)
     • Footer  : is_active=true (show_in_menu YOK)
   Admin "Menüde Göster" sadece header navigation'ı kontrol eder.
   Yayında olan her sayfa otomatik footer Kurumsal'da görünür.
   Sıralama: menu_order ASC nulls-last, sonra created_at ASC.
---------------------------------------------------------- */
type CorporatePage = {
  id: string;
  title: string;
  slug: string;
  menu_order?: number | null;
  created_at?: string | null;
};

/* =================================================================
   ROOT COMPONENT — async server
=================================================================== */

export default async function Footer() {
  /* Dört paralel fetch — biri fail olursa diğeri etkilenmez.
     Promise.allSettled tüm sonuçları döner; reject olanlar null. */
  const [settingsRes, locsRes, typesRes, corpPagesRes] =
    await Promise.allSettled([
      getPublicSettings(),
      menuRepository.findAllVillaLocations(),
      menuRepository.findAllVillaTypes(),
      /* Footer'a özel slim helper — `findActivePages` (show_in_menu
         filtresi YOK). Header'ın `findActivePagesForMenu` helper'ı
         DOKUNULMADI; iki kanal birbirinden bağımsız. */
      pagesRepository.findActivePages(),
    ]);

  const settings: Settings | null =
    settingsRes.status === "fulfilled" ? settingsRes.value : null;

  const locations: TaxonomyItem[] =
    locsRes.status === "fulfilled" && Array.isArray(locsRes.value?.data)
      ? (locsRes.value.data as TaxonomyItem[])
          .filter((l) => l?.name)
          .slice(0, 7)
      : [];

  const villaTypes: TaxonomyItem[] =
    typesRes.status === "fulfilled" && Array.isArray(typesRes.value?.data)
      ? (typesRes.value.data as TaxonomyItem[])
          .filter((t) => t?.name)
          .slice(0, 7)
      : [];

  /* Kurumsal CMS pages — filter + sort.
     Repo `is_active=true` filtreli; show_in_menu KASTEN filtrelenmez
     (footer header'dan ayrı kanal). slug + title sanity check.
     Sıralama: menu_order ASC nulls-last, sonra created_at ASC
     (deterministic tie-break). */
  const corporatePages: CorporatePage[] =
    corpPagesRes.status === "fulfilled" &&
    Array.isArray(corpPagesRes.value?.data)
      ? (corpPagesRes.value.data as CorporatePage[])
          .filter(
            (p) =>
              typeof p?.slug === "string" &&
              p.slug.trim().length > 0 &&
              typeof p?.title === "string" &&
              p.title.trim().length > 0
          )
          .sort((a, b) => {
            const ao =
              typeof a.menu_order === "number"
                ? a.menu_order
                : Number.MAX_SAFE_INTEGER;
            const bo =
              typeof b.menu_order === "number"
                ? b.menu_order
                : Number.MAX_SAFE_INTEGER;
            if (ao !== bo) return ao - bo;
            const ac = a.created_at || "";
            const bc = b.created_at || "";
            return ac.localeCompare(bc);
          })
      : [];

  const year = new Date().getFullYear();
  const siteName = settings?.site_name || "VillayaGel";
  const phoneDigits = settings?.phone?.replace(/[^\d]/g, "") || "";

  return (
    <footer
      aria-label="Site altbilgisi"
      className="relative mt-20 md:mt-28 overflow-hidden text-[var(--color-stone-700)]"
      /* ☀️ Soft, ferah zemin — koyu lacivert kaldırıldı. Sıcak kırık beyaz
         yüzey; turuncu/mavi yalnızca çok hafif, ayrı glow katmanlarında
         atmosferik bir iz olarak kullanılıyor (ağır gradient yok). */
      style={{
        background:
          "linear-gradient(180deg, #fdfaf5 0%, #faf5ec 55%, #f6efe2 100%)",
      }}
    >
      {/* Turuncu ambient iz — sağ üst, çok hafif. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 right-[-140px] w-[620px] h-[420px] blur-3xl opacity-[0.10]"
        style={{
          background:
            "radial-gradient(circle at center, rgba(237,121,38,0.35), transparent 70%)",
        }}
      />
      {/* Mavi ambient iz — sol alt, çok hafif. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 left-[-120px] w-[520px] h-[360px] blur-3xl opacity-[0.09]"
        style={{
          background:
            "radial-gradient(circle at center, rgba(9,115,186,0.32), transparent 70%)",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-5 md:px-10 lg:px-16 pb-10">
        {/* ═════════════ SECTION 2 — MARKA + KEŞFET (asimetrik, kolon-kartı yok) ═════════════
            LEFT (dominant): logo + marka açıklaması + sosyal — mantık AYNEN.
            RIGHT: tek "Keşfet" başlığı altında iki minimal alt-grup (Villalar,
            Bölgeler); veri/link kaynakları BİREBİR aynı, yalnızca renk/zemin
            açık temaya göre revize edildi. */}
        <div className="pt-14 md:pt-20 grid grid-cols-1 lg:grid-cols-12 gap-12 md:gap-16">
          {/* LEFT — dominant brand block */}
          <div className="lg:col-span-5 space-y-7">
            <Link
              href="/"
              className="font-display text-[24px] tracking-tight inline-flex items-center text-[var(--color-stone-900)]"
            >
              {settings?.footer_logo || settings?.site_logo ? (
                /* 🛡️ mig 048 — footer_logo varsa onu, yoksa site_logo'ya
                   fallback. resolveAssetUrlVersioned normalize. */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={
                    resolveAssetUrlVersioned(
                      settings.footer_logo,
                      settings.updated_at
                    ) ||
                    resolveAssetUrlVersioned(
                      settings.site_logo,
                      settings.updated_at
                    ) ||
                    ""
                  }
                  alt={`${siteName} logosu`}
                  className="h-10 w-auto object-contain"
                />
              ) : (
                <>
                  Villaya
                  <span className="text-[#ED7926] ml-1">Gel</span>
                </>
              )}
            </Link>
            <p className="text-[14.5px] text-[var(--color-stone-500)] leading-relaxed max-w-sm">
              Akdeniz&apos;in seçkin villalarını premium bir deneyimle
              keşfedin. Özel havuz, deniz manzarası ve butik konfor — tek bir
              platformda.
            </p>

            {/* Sosyal — settings'ten dinamik (mevcut API aynen) */}
            <div className="flex items-center gap-2.5">
              {settings?.instagram && (
                <SocialLink href={settings.instagram} label="Instagram">
                  <InstagramIcon width={15} height={15} aria-hidden />
                </SocialLink>
              )}
              {settings?.facebook && (
                <SocialLink href={settings.facebook} label="Facebook">
                  <FacebookIcon width={15} height={15} aria-hidden />
                </SocialLink>
              )}
              {settings?.youtube && (
                <SocialLink href={settings.youtube} label="YouTube">
                  <YoutubeIcon width={15} height={15} aria-hidden />
                </SocialLink>
              )}
              {settings?.tiktok && (
                <SocialLink href={settings.tiktok} label="TikTok">
                  <TiktokIcon width={15} height={15} aria-hidden />
                </SocialLink>
              )}
              {phoneDigits && (
                <SocialLink
                  href={`https://wa.me/${phoneDigits}`}
                  label="WhatsApp"
                >
                  <WhatsappIcon width={15} height={15} aria-hidden />
                </SocialLink>
              )}
            </div>
          </div>

          {/* RIGHT — "Keşfet" minimal link kümesi (villa_types + villa_locations) */}
          <div className="lg:col-span-7 lg:pl-6">
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-stone-400)]">
              <span
                aria-hidden="true"
                className="inline-block w-4 h-px bg-gradient-to-r from-[#ED7926] to-[#0973BA]"
              />
              Keşfet
            </span>

            <div className="mt-6 grid grid-cols-2 gap-x-10 gap-y-8">
              {/* VİLLA KATEGORİLERİ (dynamic villa_types) */}
              <nav aria-label="Villa kategorileri">
                <p className="text-[13px] font-medium text-[var(--color-stone-800)] mb-4">
                  Villalar
                </p>
                {villaTypes.length > 0 ? (
                  <ul className="space-y-3">
                    {villaTypes.map((t) => (
                      <li key={t.id}>
                        <FooterLink href={taxonomyHref("villa-turleri", t)}>
                          {t.name}
                        </FooterLink>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="space-y-3">
                    <li>
                      <FooterLink href="/arama">Tüm kategoriler</FooterLink>
                    </li>
                  </ul>
                )}
              </nav>

              {/* POPÜLER BÖLGELER (dynamic villa_locations) */}
              <nav aria-label="Popüler bölgeler">
                <p className="text-[13px] font-medium text-[var(--color-stone-800)] mb-4">
                  Bölgeler
                </p>
                {locations.length > 0 ? (
                  <ul className="space-y-3">
                    {locations.map((loc) => (
                      <li key={loc.id}>
                        <FooterLink href={taxonomyHref("bolgeler", loc)}>
                          {loc.name}
                        </FooterLink>
                      </li>
                    ))}
                    <li className="pt-1">
                      <FooterLink href="/arama">
                        <span className="text-[13px] text-[#ED7926] inline-flex items-center gap-1">
                          Tüm bölgeler
                          <ArrowRight size={12} strokeWidth={1.75} aria-hidden />
                        </span>
                      </FooterLink>
                    </li>
                  </ul>
                ) : (
                  <ul className="space-y-3">
                    <li>
                      <FooterLink href="/arama">Tüm bölgeleri keşfet</FooterLink>
                    </li>
                  </ul>
                )}
              </nav>
            </div>
          </div>
        </div>

        {/* ═════════════ SECTION 3 — CONTACT STRIP ═════════════
            Telefon/e-posta/adres artık ikon+liste değil, büyük tipografili
            bir "iletişim şeridi"; telefon en belirgin (birincil hover
            #ED7926), e-posta ikincil hover #0973BA. Rezervasyon Sorgula
            linki (mevcut href) burada, destek eylemine en yakın yerde. */}
        <div className="mt-16 md:mt-20 pt-10 md:pt-12 border-t border-[var(--color-stone-200)]">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
            <div className="flex flex-wrap items-baseline gap-x-10 gap-y-5">
              {settings?.phone && (
                <a href={`tel:${settings.phone}`} className="group">
                  <span className="block text-[11px] uppercase tracking-[0.18em] text-[var(--color-stone-400)] mb-1.5">
                    Telefon
                  </span>
                  <span className="font-display text-[26px] md:text-[32px] tracking-[-0.01em] text-[var(--color-stone-900)] group-hover:text-[#ED7926] transition-colors duration-300 motion-reduce:transition-none">
                    {settings.phone}
                  </span>
                </a>
              )}
              {settings?.email && (
                <a href={`mailto:${settings.email}`} className="group">
                  <span className="block text-[11px] uppercase tracking-[0.18em] text-[var(--color-stone-400)] mb-1.5">
                    E-posta
                  </span>
                  <span className="text-[16px] md:text-[18px] text-[var(--color-stone-700)] group-hover:text-[#0973BA] transition-colors duration-300 motion-reduce:transition-none break-all">
                    {settings.email}
                  </span>
                </a>
              )}
              {settings?.address && (
                <div className="max-w-xs">
                  <span className="block text-[11px] uppercase tracking-[0.18em] text-[var(--color-stone-400)] mb-1.5">
                    Adres
                  </span>
                  <span className="text-[13.5px] text-[var(--color-stone-500)] leading-relaxed">
                    {settings.address}
                  </span>
                </div>
              )}
            </div>

            {/* MÜŞTERİ İŞLEMLERİ — rezervasyon durum sorgulama (mevcut href AYNEN) */}
            <FooterLink href="/rezervasyon-kontrol">
              <span className="inline-flex items-center gap-1.5 text-[13.5px]">
                Rezervasyon Sorgula
                <ArrowRight size={12} strokeWidth={1.75} aria-hidden />
              </span>
            </FooterLink>
          </div>
        </div>

        {/* ═════════════ SECTION 4 — MİNİMAL ALT BAR ═════════════
            Sıra: copyright + kurumsal linkler → trust/ödeme rozetleri →
            (ince separator) → Maki Dijital, ayrı ve tam ortalanmış, en son
            satır. `corporatePages` veri kaynağı BİREBİR aynı, yalnızca
            konum/sıra ve renkler değişti. */}
        <div className="mt-14 md:mt-16 pt-8 border-t border-[var(--color-stone-200)]">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5 text-[12px] text-[var(--color-stone-500)]">
            <p>
              {settings?.footer_copyright
                ? settings.footer_copyright
                    .replace(/\{year\}/g, String(year))
                    .replace(/\{site_name\}/g, siteName)
                : `© ${year} ${siteName} · Tüm hakları saklıdır`}
            </p>

            {corporatePages.length > 0 && (
              <nav
                aria-label="Kurumsal"
                className="flex flex-wrap items-center gap-x-5 gap-y-2"
              >
                {corporatePages.map((p) => (
                  <Link
                    key={p.id}
                    href={`/p/${p.slug}`}
                    className="hover:text-[#ED7926] transition-colors duration-300 motion-reduce:transition-none"
                  >
                    {p.title}
                  </Link>
                ))}
              </nav>
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-[var(--color-stone-200)] flex flex-wrap items-center gap-6">
            <Image
              src="/brand/trust/tursab.png"
              alt="TÜRSAB üyesi"
              width={290}
              height={132}
              className="h-8 w-auto object-contain opacity-80"
            />
            <Image
              src="/brand/trust/payment-methods.png"
              alt="Visa, Mastercard ve Troy ödeme yöntemleri"
              width={1400}
              height={400}
              className="h-8 w-auto object-contain opacity-90"
            />
          </div>

          {/* 🛡️ Maki Dijital — ajans imzası (logo asset, href AYNEN).
              Ayrı ve tam ortalanmış, footer'ın SON içeriği. */}
          <div className="mt-8 pt-6 border-t border-[var(--color-stone-200)] text-center">
            <a
              href="https://makidijital.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Web geliştirme: Maki Dijital"
              className="
                group inline-flex items-center justify-center gap-2
                text-[11.5px] tracking-[0.04em]
                text-[var(--color-stone-500)] hover:text-[#ED7926]
                transition-colors duration-300 motion-reduce:transition-none
                focus:outline-none focus-visible:ring-2
                focus-visible:ring-[#0973BA]/40 rounded-full px-1
              "
            >
              <span>Web Geliştirme</span>
              <span aria-hidden="true" className="text-[var(--color-stone-300)]">
                :
              </span>
              <Image
                src="/brand/logos/Developer-Credit.png"
                alt="Maki Dijital"
                width={1254}
                height={1254}
                className="h-9 md:h-10 w-auto object-contain opacity-75 group-hover:opacity-100 transition-opacity duration-300 motion-reduce:transition-none"
              />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
