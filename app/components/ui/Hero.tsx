import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

import {
  resolveHeroContent,
  HERO_CTA_DEFAULTS,
  type HeroContent,
} from "@/lib/hero.helpers";

import HeroSearchPanel from "./hero/_components/HeroSearchPanel";

import type { HeroReviewStats } from "./hero/_types/hero";

/* ===============================================================
   🛡️ HERO — FULL-BLEED PREMIUM (yeniden tasarım)
   ===============================================================
   Tasarım yönü:
     - Booking.com / Aman / Six Senses standardında full-bleed hero
     - `hero.backgroundImage` (admin source-of-truth) edge-to-edge BG
     - Koyu gradient overlay (alt → üst) ile okunabilirlik
     - Beyaz tipografi (luxury minimal)
     - Content alt-sol köşede anchor
     - HeroSearchPanel "floating booking widget" olarak BG üzerinde

   DOKUNULMAYAN İŞ MANTIĞI:
     - HeroSearchPanel state/URL push/datepicker portal AYNEN
     - hero.helpers HeroContent shape AYNEN
     - resolveHeroContent default fallback chain AYNEN
     - HeroReviewStats type contract caller'a AYNEN

   PERFORMANS:
     - <Image priority + fill + sizes="100vw"> LCP optimize
     - min-h-[72svh] lg:min-h-[85svh] → mount anında sabit ölçü → CLS=0
     - Tek hero image fetch (önceki iki Image render yerine)
=============================================================== */

/** Re-export caller path stability. */
export type { HeroReviewStats };

/* ===============================================================
   HeroCta — admin-driven CTA link, akıllı href yönlendirme.
   Buton TEXT + LINK admin settings'ten gelir (hero.primaryCta /
   secondaryCta). Link tipi href'ten türetilir:
     - `#...`            → aynı sayfa smooth scroll (globals:
                            html{scroll-behavior:smooth} + section
                            scroll-mt offset). Plain <a>.
     - `http(s)://...`   → harici, yeni sekme (target=_blank).
     - `mailto:` / `tel:`→ harici protocol, plain <a>.
     - `/...` (diğer)    → dahili route, next/link <Link>.
   Stil/içerik caller'dan (className + children) gelir; bu helper
   yalnız doğru elementi seçer. Hero layout/stiline dokunmaz.
   =============================================================== */
function HeroCta({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  if (href.startsWith("#")) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  if (/^https?:\/\//i.test(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }
  if (href.startsWith("mailto:") || href.startsWith("tel:")) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export default function Hero({
  content,
  reviewStats,
}: {
  content?: HeroContent;
  reviewStats?: HeroReviewStats | null;
}) {
  /* Defensive: prop verilmediyse defaults. */
  const hero: HeroContent = content || resolveHeroContent(null);
  const titleLines = (hero.title || "").split("\n");

  /* reviewStats render edilmiyor (HeroReviewCard kaldırıldı) — ama
     prop type contract caller'a (page.tsx) BOZULMASIN diye signature
     aynen tutuluyor. void to silence unused warning. */
  void reviewStats;

  return (
    <>
    <section
      className="
        relative z-20
        min-h-[60svh] lg:min-h-[70svh]
        w-full
        bg-[var(--color-stone-900)]
      "
    >
      {/* ═══════════════════════════════════════════════════════════
          FULL-BLEED BACKGROUND IMAGE — admin source-of-truth
          sizes="100vw" → CDN responsive srcset (WebP/AVIF auto)
          priority + fill → LCP optimize; Next preload hint otomatik
          ═══════════════════════════════════════════════════════════ */}
      {hero.backgroundImage && (
        <Image
          src={hero.backgroundImage}
          alt={hero.title || "Akdeniz villası"}
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
      )}

      {/* ═══════════════════════════════════════════════════════════
          WHITE SPLIT FADE — sol okunur açık alan → sağ villa canlı
          - Horizontal: sol ~beyaz → orta yarı-saydam → sağ transparan
          - Mobile'da daha hafif (fazla beyaz kaplamasın); lg'de güçlü
          - Sağ taraf transparan → villa brightness bozulmaz
          DOM sırası: Image'den SONRA → image üstünde paint olur.
          ═══════════════════════════════════════════════════════════ */}
      <div
        aria-hidden="true"
        className="
          absolute inset-0 pointer-events-none
          bg-gradient-to-r
          from-white/78 via-white/30 to-transparent
          md:from-white/90 md:via-white/45
          lg:from-white/95 lg:via-white/55
        "
      />
      {/* RADIAL DEPTH — alt-sol köşede yumuşak beyaz yoğunluk:
          koyu metin için contrast backing + premium derinlik.
          Köşe-sınırlı → mobile'da görseli global beyazlatmaz. */}
      <div
        aria-hidden="true"
        className="
          absolute inset-0 pointer-events-none
          bg-[radial-gradient(115%_115%_at_0%_100%,rgba(255,255,255,0.55),transparent_58%)]
        "
      />

      {/* ═══════════════════════════════════════════════════════════
          CONTENT CONTAINER — alt-sol anchor (luxury booking pattern)
          ═══════════════════════════════════════════════════════════ */}
      <div
        className="
          relative
          max-w-[1480px] mx-auto
          px-5 md:px-10 lg:px-16
          min-h-[60svh] lg:min-h-[70svh]
          flex flex-col justify-end
          pt-20 md:pt-20 lg:pt-24
          pb-4 md:pb-10
        "
      >
        {/* ─── COPY BLOCK ───────────────────────────────────────── */}
        <div className="max-w-3xl lg:max-w-4xl">
          {/* Eyebrow — coral indicator + uppercase tracking */}
          <p
            className="
              text-[11px] tracking-[0.32em] uppercase font-medium
              inline-flex items-center gap-3
              text-[var(--brand-coral)]
            "
          >
            <span
              aria-hidden="true"
              className="relative inline-flex w-1.5 h-1.5 rounded-full bg-[var(--brand-coral)]"
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-[var(--brand-coral)] animate-ping opacity-60"
              />
            </span>
            {hero.badge}
          </p>

          {/* Editorial serif title — beyaz, dramatic scale */}
          <h1
            className="
              font-display
              text-[32px] sm:text-[40px] md:text-[50px] lg:text-[60px]
              leading-[0.98] tracking-[-0.03em]
              text-[var(--color-stone-900)]
              mt-5 md:mt-7
            "
          >
            {titleLines.map((line, i) => (
              <span
                key={i}
                className={
                  i === 0 ? "block" : "block text-[var(--brand-coral)]"
                }
              >
                {line}
              </span>
            ))}
          </h1>

          {/* Body subtitle */}
          {hero.subtitle && (
            <p
              className="
                text-[15px] md:text-[16.5px] leading-[1.75]
                text-[var(--color-stone-700)]
                mt-6 md:mt-8
                max-w-xl whitespace-pre-line
              "
            >
              {hero.subtitle}
            </p>
          )}

          {/* 🔎 Villa adı arama → HeroSearchPanel'in üst kenarına yarı binen
              floating input olarak taşındı (duplicate kaldırıldı). Eski
              Hero içi inline VillaSearchBox burada render edilmez. */}

          {/* CTA row — admin-driven (hero.primaryCta / secondaryCta).
             Text + link admin settings'ten; href tipine göre akıllı
             yönlendirme (HeroCta: #anchor smooth scroll / dahili route /
             harici yeni sekme). Admin boşsa yeni scroll-CTA fallback'leri. */}
          <div className="mt-8 md:mt-10 flex flex-wrap items-center gap-3">
            <HeroCta
              href={hero.primaryCta?.href || HERO_CTA_DEFAULTS.primary.href}
              className="
                group inline-flex items-center gap-2
                px-6 py-3 rounded-full
                bg-[var(--brand-coral)] text-white
                text-[13.5px] font-medium tracking-[0.02em]
                shadow-[0_18px_36px_-14px_rgba(255,101,63,0.55),0_4px_12px_-6px_rgba(255,101,63,0.35)]
                hover:bg-[var(--brand-coral-deep)]
                hover:-translate-y-[1px]
                transition-[transform,box-shadow,background-color] duration-300
                motion-reduce:transition-none motion-reduce:hover:translate-y-0
                focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-coral)]/40
              "
            >
              {hero.primaryCta?.text || HERO_CTA_DEFAULTS.primary.text}
              <ArrowUpRight
                size={15}
                className="transition-transform duration-300 motion-reduce:transition-none group-hover:translate-x-[1px] group-hover:-translate-y-[1px]"
                aria-hidden
              />
            </HeroCta>
            <HeroCta
              href={hero.secondaryCta?.href || HERO_CTA_DEFAULTS.secondary.href}
              className="
                group inline-flex items-center gap-2
                px-5 py-3 rounded-full
                border border-[var(--color-stone-300)] bg-white/70 backdrop-blur-md
                text-[var(--color-stone-900)]
                text-[13.5px] font-medium tracking-[0.02em]
                hover:bg-white hover:border-[var(--color-stone-400)]
                hover:-translate-y-[1px]
                transition-[transform,border-color,background-color] duration-300
                motion-reduce:transition-none motion-reduce:hover:translate-y-0
                focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-stone-400)]/50
              "
            >
              {hero.secondaryCta?.text || HERO_CTA_DEFAULTS.secondary.text}
            </HeroCta>
          </div>
        </div>

        {/* ─── FLOATING SEARCH PANEL — client island, AYNEN ───── */}
        <HeroSearchPanel />
      </div>

      {/* 🛡️ DATEPICKER PORTAL TARGET — HeroSearchPanel'in
         react-datepicker portalId="hero-datepicker-portal" hedefi. */}
      <div id="hero-datepicker-portal" />
    </section>
    </>
  );
}
