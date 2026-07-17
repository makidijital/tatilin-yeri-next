import Link from "next/link";
import Image from "next/image";
import {
  Mail,
  Phone,
  MapPin,
  ArrowRight,
} from "lucide-react";

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
        border border-white/12 bg-white/[0.05]
        text-white/75
        hover:border-[var(--color-champagne-500)]/55 hover:bg-[var(--color-champagne-500)]/15
        hover:text-white
        transition-[color,background-color,border-color,transform]
        duration-300 motion-reduce:transition-none
        hover:scale-[1.05]
        focus:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--color-champagne-500)]/40
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
        text-[14px] text-white/60
        hover:text-white
        hover:translate-x-[2px]
        transition-[color,transform] duration-300
        motion-reduce:transition-none motion-reduce:hover:translate-x-0
      "
    >
      {children}
    </Link>
  );
}

function ColumnTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4
      className="
        text-[11px] tracking-[0.22em] uppercase
        font-medium text-white/90
        flex items-center gap-2 mb-5
      "
    >
      <span
        aria-hidden
        className="inline-block w-5 h-px bg-[var(--color-champagne-500)]/70"
      />
      {children}
    </h4>
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
      className="relative mt-20 md:mt-28 overflow-hidden text-white"
      /* 🌊 REBRAND — deep brand navy gradient (layered; flat değil).
         Turkuaz + amber accent ayrı glow katmanlarında. */
      style={{
        background:
          "linear-gradient(180deg, #0b1f3a 0%, #081a30 55%, #050f1c 100%)",
      }}
    >
      {/* Turkuaz ambient glow — sağ üst (derinlik). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 right-[-140px] w-[620px] h-[420px] blur-3xl opacity-50"
        style={{
          background:
            "radial-gradient(circle at center, rgba(2, 170, 229,0.20), transparent 70%)",
        }}
      />
      {/* Amber glow — sol alt, subtle highlight. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 left-[-120px] w-[520px] h-[360px] blur-3xl opacity-40"
        style={{
          background:
            "radial-gradient(circle at center, rgba(2, 170, 229,0.16), transparent 70%)",
        }}
      />
      {/* Ultra-hafif grain/noise — feTurbulence SVG data-uri; asset
         yok, glassmorphism yok. opacity 0.04 ile sadece premium
         doku hissi. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-soft-light"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-5 md:px-10 lg:px-16 pb-10">
        {/* ═══════════ SECTION 1 — TOP CTA BAND (footer'dan ayrı) ═══════════ */}
        <div className="pt-14 md:pt-20">
          <div className="relative overflow-hidden rounded-[28px] border border-white/12 bg-gradient-to-br from-white/[0.08] via-white/[0.035] to-transparent px-6 py-8 md:px-12 md:py-11 shadow-[0_30px_80px_-44px_rgba(0,0,0,0.75)]">
            {/* iç turkuaz glow */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 left-1/3 w-80 h-56 blur-3xl opacity-40"
              style={{
                background:
                  "radial-gradient(circle at center, rgba(2, 170, 229,0.22), transparent 70%)",
              }}
            />
            <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-7">
              <div className="max-w-xl">
                <h2 className="font-display text-[26px] md:text-[34px] leading-[1.1] tracking-[-0.02em] text-white">
                  Hayalinizdeki villayı birlikte bulalım
                </h2>
                <p className="mt-3 text-[14.5px] text-white/60 leading-relaxed">
                  Tarih, bölge ve bütçenize en uygun seçkiyi uzman ekibimizle
                  dakikalar içinde oluşturalım.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                {phoneDigits && (
                  <a
                    href={`https://wa.me/${phoneDigits}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-[var(--color-champagne-500)] text-[#04231f] font-medium text-[13.5px] hover:bg-[var(--color-champagne-400)] transition-colors duration-300 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-300)]/50"
                  >
                    <WhatsappIcon width={16} height={16} aria-hidden />
                    WhatsApp&apos;tan Yazın
                  </a>
                )}
                <Link
                  href="/teklif-al"
                  className="group inline-flex items-center gap-2 h-12 px-6 rounded-full bg-[var(--brand-coral)] text-white font-medium text-[13.5px] hover:bg-[var(--brand-coral-deep)] transition-colors duration-300 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-coral)]/50"
                >
                  Teklif Al
                  <ArrowRight
                    size={15}
                    strokeWidth={1.75}
                    aria-hidden
                    className="transition-transform duration-300 motion-reduce:transition-none group-hover:translate-x-[2px]"
                  />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════ SECTION 2 — MAIN FOOTER (asymmetric) ═══════════
            LEFT (dominant): logo + brand statement + sosyal
            RIGHT: grouped navigation (Kurumsal · Villalar · Bölgeler ·
            Destek & İletişim). 4/8 split → klasik eşit kolonlardan farklı. */}
        <div className="pt-14 md:pt-20 grid grid-cols-1 lg:grid-cols-12 gap-10 md:gap-12">
          {/* LEFT — dominant brand block */}
          <div className="lg:col-span-4 space-y-6">
            <Link
              href="/"
              className="font-display text-[24px] tracking-tight inline-flex items-center text-white"
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
                  <span className="text-[var(--brand-coral)] ml-1">Gel</span>
                </>
              )}
            </Link>
            <p className="text-[14.5px] text-white/60 leading-relaxed max-w-sm">
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

          {/* RIGHT — grouped navigation */}
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
            {/* KURUMSAL (CMS-driven, dynamic) */}
            <nav aria-label="Kurumsal">
              <ColumnTitle>Kurumsal</ColumnTitle>
              {corporatePages.length > 0 ? (
                <ul className="space-y-2.5">
                  {corporatePages.map((p) => (
                    <li key={p.id}>
                      <FooterLink href={`/p/${p.slug}`}>{p.title}</FooterLink>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-white/40 italic">Yakında.</p>
              )}
            </nav>

            {/* VİLLA KATEGORİLERİ (dynamic villa_types) */}
            <nav aria-label="Villa kategorileri">
              <ColumnTitle>Villalar</ColumnTitle>
              {villaTypes.length > 0 ? (
                <ul className="space-y-2.5">
                  {villaTypes.map((t) => (
                    <li key={t.id}>
                      <FooterLink href={taxonomyHref("villa-turleri", t)}>
                        {t.name}
                      </FooterLink>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="space-y-2.5">
                  <li>
                    <FooterLink href="/arama">Tüm kategoriler</FooterLink>
                  </li>
                </ul>
              )}
            </nav>

            {/* POPÜLER BÖLGELER (dynamic villa_locations) */}
            <nav aria-label="Popüler bölgeler">
              <ColumnTitle>Bölgeler</ColumnTitle>
              {locations.length > 0 ? (
                <ul className="space-y-2.5">
                  {locations.map((loc) => (
                    <li key={loc.id}>
                      <FooterLink href={taxonomyHref("bolgeler", loc)}>
                        {loc.name}
                      </FooterLink>
                    </li>
                  ))}
                  <li className="pt-2">
                    <FooterLink href="/arama">
                      <span className="text-[13px] text-[var(--color-champagne-300)] inline-flex items-center gap-1">
                        Tüm bölgeler
                        <ArrowRight size={12} strokeWidth={1.75} aria-hidden />
                      </span>
                    </FooterLink>
                  </li>
                </ul>
              ) : (
                <ul className="space-y-2.5">
                  <li>
                    <FooterLink href="/arama">Tüm bölgeleri keşfet</FooterLink>
                  </li>
                </ul>
              )}
            </nav>

            {/* DESTEK & İLETİŞİM — phone/email/address (settings) */}
            <div>
              <ColumnTitle>Destek &amp; İletişim</ColumnTitle>
              <ul className="space-y-3 text-[13.5px] text-white/65">
                {settings?.phone && (
                  <li className="flex items-center gap-2.5">
                    <Phone
                      size={14}
                      strokeWidth={1.75}
                      aria-hidden
                      className="text-[var(--color-champagne-400)] shrink-0"
                    />
                    <a
                      href={`tel:${settings.phone}`}
                      className="hover:text-white transition-colors motion-reduce:transition-none"
                    >
                      {settings.phone}
                    </a>
                  </li>
                )}
                {settings?.email && (
                  <li className="flex items-center gap-2.5">
                    <Mail
                      size={14}
                      strokeWidth={1.75}
                      aria-hidden
                      className="text-[var(--color-champagne-400)] shrink-0"
                    />
                    <a
                      href={`mailto:${settings.email}`}
                      className="hover:text-white transition-colors motion-reduce:transition-none break-all"
                    >
                      {settings.email}
                    </a>
                  </li>
                )}
                {settings?.address && (
                  <li className="flex items-start gap-2.5">
                    <MapPin
                      size={14}
                      strokeWidth={1.75}
                      aria-hidden
                      className="text-[var(--color-champagne-400)] mt-0.5 shrink-0"
                    />
                    <span className="leading-relaxed">{settings.address}</span>
                  </li>
                )}
              </ul>

              {/* MÜŞTERİ İŞLEMLERİ — rezervasyon durum sorgulama */}
              <ul className="space-y-2.5 mt-6 pt-6 border-t border-white/10">
                <li>
                  <FooterLink href="/rezervasyon-kontrol">
                    Rezervasyon Sorgula
                  </FooterLink>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* ═══════════ SECTION 3 — MINIMAL BOTTOM BAR ═══════════ */}
        <div className="mt-14 md:mt-16 pt-7 border-t border-white/10">
          {/* trust + payment badges */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-7">
            <span className="inline-flex items-center px-3 py-1.5 bg-white/[0.05] rounded-xl">
              <Image
                src="/brand/trust/tursab.png"
                alt="TÜRSAB üyesi"
                width={290}
                height={132}
                className="h-9 w-auto object-contain opacity-90"
              />
            </span>
            <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-white/[0.05] border border-white/10 shrink-0">
              <Image
                src="/brand/trust/payment-methods.png"
                alt="Visa, Mastercard ve Troy ödeme yöntemleri"
                width={1400}
                height={400}
                className="h-9 w-auto object-contain"
              />
            </span>
          </div>

          {/* copyright (sol) + lokasyon + developer credit */}
          <div className="pt-6 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4 text-[12px] text-white/50">
            <p>
              {settings?.footer_copyright
                ? settings.footer_copyright
                    .replace(/\{year\}/g, String(year))
                    .replace(/\{site_name\}/g, siteName)
                : `© ${year} ${siteName} · Tüm hakları saklıdır`}
            </p>

            {/* Lokasyon bilgisi — settings.address echo (varsa). */}
            {settings?.address && (
              <span className="inline-flex items-center gap-1.5 text-white/45">
                <MapPin size={12} strokeWidth={1.75} aria-hidden />
                <span className="truncate max-w-[280px]">
                  {settings.address}
                </span>
              </span>
            )}

            {/* 🛡️ Maki Dijital — ajans imzası (logo asset). */}
            <a
              href="https://makidijital.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Web geliştirme: Maki Dijital"
              className="
                group inline-flex items-center gap-2
                text-[11.5px] tracking-[0.04em]
                text-white/45 hover:text-white/80
                transition-colors duration-300 motion-reduce:transition-none
                focus:outline-none focus-visible:ring-2
                focus-visible:ring-white/30 rounded-full px-1
              "
            >
              <span>Web Geliştirme</span>
              <span aria-hidden="true" className="text-white/25">
                :
              </span>
              <Image
                src="/brand/logos/Developer-Credit.png"
                alt="Maki Dijital"
                width={1254}
                height={1254}
                className="h-10 md:h-11 w-auto object-contain opacity-75 group-hover:opacity-100 transition-opacity duration-300 motion-reduce:transition-none"
              />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
