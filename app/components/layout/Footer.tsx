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
  type Settings,
} from "@/app/services/settings.service";
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
        hover:border-[var(--brand-coral)]/50 hover:bg-[var(--brand-coral)]/15
        hover:text-white
        transition-[color,background-color,border-color,transform]
        duration-300 motion-reduce:transition-none
        hover:scale-[1.05]
        focus:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--brand-coral)]/40
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
        className="inline-block w-5 h-px bg-[var(--brand-coral)]/70"
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
      /* 🛡️ PREMIUM NAVY SURFACE — marka laciverti gradient.
         Düz tek-renk yerine derinlikli 3-stop; coral accent ayrı
         glow katmanlarında. */
      style={{
        background:
          "linear-gradient(180deg, #0e2740 0%, #0a1f33 55%, #06121f 100%)",
      }}
    >
      {/* Coral ambient glow — sağ üst, çok hafif (derinlik). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 right-[-140px] w-[620px] h-[420px] blur-3xl opacity-50"
        style={{
          background:
            "radial-gradient(circle at center, rgba(255,101,63,0.20), transparent 70%)",
        }}
      />
      {/* Sakin mavi nokta — sol alt, gradient'i kırar. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 left-[-120px] w-[520px] h-[360px] blur-3xl opacity-40"
        style={{
          background:
            "radial-gradient(circle at center, rgba(70,150,210,0.18), transparent 70%)",
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

      <div className="relative max-w-7xl mx-auto px-5 md:px-10 lg:px-16 pt-16 md:pt-20 pb-8">
        {/* ════════════════════════════════════════════════════
            ÜST — MARKA SATIRI (logo + açıklama + sosyal)
            Ferah, tek satır; alt grid'den ince çizgiyle ayrı.
            ════════════════════════════════════════════════════ */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 pb-12 md:pb-14 border-b border-white/10">
          <div className="space-y-5 max-w-lg">
            <Link
              href="/"
              className="font-display text-[24px] tracking-tight inline-flex items-center text-white"
            >
              {settings?.footer_logo || settings?.site_logo ? (
                /* 🛡️ mig 048 — footer_logo varsa onu, yoksa site_logo'ya
                   fallback. Koyu zemin için ayrı negatif logo desteği.
                   🛡️ Aşama A — resolveAssetUrl normalize: FULL URL ve
                   relative path için aynı render davranışı. */
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
            <p className="text-[14.5px] text-white/60 leading-relaxed">
              Akdeniz&apos;in seçkin villalarını premium bir deneyimle
              keşfedin. Özel havuz, deniz manzarası ve butik konfor —
              tek bir platformda.
            </p>
          </div>

          {/* Sosyal — settings'ten dinamik (mevcut API aynen) */}
          <div className="flex items-center gap-2.5 shrink-0">
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

        {/* ════════════════════════════════════════════════════
            ORTA — 4 KOLONLU DENGELİ GRID
            Kurumsal · Villa Kategorileri · Popüler Bölgeler · İletişim
            ════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 md:gap-12 pt-12 md:pt-14">
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
            <ColumnTitle>Villa Kategorileri</ColumnTitle>
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
            <ColumnTitle>Popüler Bölgeler</ColumnTitle>
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
                    <span className="text-[13px] text-[var(--brand-coral)] inline-flex items-center gap-1">
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

          {/* İLETİŞİM — phone/email/address (settings) */}
          <div>
            <ColumnTitle>İletişim</ColumnTitle>
            <ul className="space-y-3 text-[13.5px] text-white/65">
              {settings?.phone && (
                <li className="flex items-center gap-2.5">
                  <Phone
                    size={14}
                    strokeWidth={1.75}
                    aria-hidden
                    className="text-[var(--brand-coral)] shrink-0"
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
                    className="text-[var(--brand-coral)] shrink-0"
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
                    className="text-[var(--brand-coral)] mt-0.5 shrink-0"
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

        {/* ════════════════════════════════════════════════════
            ALT GÜVEN ŞERİDİ — tek premium card
            TÜRSAB · Güvenli Rezervasyon · Güvenli Ödeme ·
            En İyi Fiyat Garantisi · Payment Methods görseli
            ════════════════════════════════════════════════════ */}
        <div className="mt-12 md:mt-14 rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_18px_44px_-24px_rgba(0,0,0,0.6)] px-5 py-5 md:px-7 md:py-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            {/* Güven öğeleri */}
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center px-3 py-1.5 bg-white/[0.05]">
                <Image
                  src="/brand/trust/tursab.png"
                  alt="TÜRSAB üyesi"
                  width={290}
                  height={132}
                  className="w-auto object-contain opacity-90"
                />
              </span>
            </div>

            {/* Payment methods görseli */}
            <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-white/[0.05] border border-white/10 shrink-0">
              <Image
                src="/brand/trust/payment-methods.png"
                alt="Visa, Mastercard ve Troy ödeme yöntemleri"
                width={1400}
                height={400}
                className="h-10 w-auto object-contain"
              />
            </span>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════
            EN ALT BAR — copyright + lokasyon + developer credit
            ════════════════════════════════════════════════════ */}
        <div className="mt-10 pt-6 border-t border-white/10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-[12px] text-white/50">
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
                /* 🛡️ Boyut fix: kare logo (1254×1254, içerik %92 dolu —
                   PNG boşluğu yok) eski h-[26px]'de 26×26px ile küçük
                   kalıyordu. h-10 md:h-11 (40/44px, ~%55-69 büyük) →
                   desktop premium, mobilde alt bar flex-col stack
                   olduğu için taşma yok. */
                className="h-10 md:h-11 w-auto object-contain opacity-75 group-hover:opacity-100 transition-opacity duration-300 motion-reduce:transition-none"
              />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
