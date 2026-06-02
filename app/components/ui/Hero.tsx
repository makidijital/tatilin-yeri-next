import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import {
  resolveHeroContent,
  type HeroContent,
} from "@/lib/hero.helpers";

import HeroSearchPanel from "./hero/_components/HeroSearchPanel";
import HeroTrustStrip from "./hero/_components/HeroTrustStrip";

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
    <section
      className="
        relative
        min-h-[72svh] lg:min-h-[85svh]
        w-full
        overflow-hidden
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
          DARK OVERLAY — okunabilirlik + premium hava
          - Alt yarıda güçlü koyu gradient (Booking.com paterni)
          - Üstte hafif vignette
          DOM sırası önemli: Image'den SONRA → image üstünde paint olur.
          ═══════════════════════════════════════════════════════════ */}
      <div
        aria-hidden="true"
        className="
          absolute inset-0 pointer-events-none
          bg-gradient-to-t from-black/70 via-black/30 to-black/10
        "
      />
      <div
        aria-hidden="true"
        className="
          absolute inset-x-0 top-0 h-40 pointer-events-none
          bg-gradient-to-b from-black/30 to-transparent
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
          min-h-[72svh] lg:min-h-[85svh]
          flex flex-col justify-end
          pt-24 md:pt-28 lg:pt-32
          pb-12 md:pb-32
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
              text-[44px] sm:text-[60px] md:text-[76px] lg:text-[88px]
              leading-[0.98] tracking-[-0.03em]
              text-white
              mt-5 md:mt-7
              drop-shadow-[0_4px_24px_rgba(0,0,0,0.35)]
            "
          >
            {titleLines.map((line, i) => (
              <span
                key={i}
                className={i === 0 ? "block" : "block text-white/70"}
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
                text-white/85
                mt-6 md:mt-8
                max-w-xl whitespace-pre-line
                drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)]
              "
            >
              {hero.subtitle}
            </p>
          )}

          {/* CTA row — primary coral + secondary glass */}
          <div className="mt-8 md:mt-10 flex flex-wrap items-center gap-3">
            <Link
              href={hero.primaryCta?.href || "/arama"}
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
              {hero.primaryCta?.text || "Villaları keşfet"}
              <ArrowUpRight
                size={15}
                className="transition-transform duration-300 motion-reduce:transition-none group-hover:translate-x-[1px] group-hover:-translate-y-[1px]"
                aria-hidden
              />
            </Link>
            <Link
              href={hero.secondaryCta?.href || "/iletisim"}
              className="
                group inline-flex items-center gap-2
                px-5 py-3 rounded-full
                border border-white/30 bg-white/10 backdrop-blur-md
                text-white
                text-[13.5px] font-medium tracking-[0.02em]
                hover:bg-white/20 hover:border-white/50
                hover:-translate-y-[1px]
                transition-[transform,border-color,background-color] duration-300
                motion-reduce:transition-none motion-reduce:hover:translate-y-0
                focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40
              "
            >
              {hero.secondaryCta?.text || "Bize ulaşın"}
            </Link>
          </div>
        </div>

        {/* ─── FLOATING SEARCH PANEL — client island, AYNEN ───── */}
        <HeroSearchPanel />

        {/* ─── TRUST STRIP — koyu BG üzerinde glass kartlar ───── */}
        <HeroTrustStrip />
      </div>

      {/* 🛡️ DATEPICKER PORTAL TARGET — HeroSearchPanel'in
         react-datepicker portalId="hero-datepicker-portal" hedefi. */}
      <div id="hero-datepicker-portal" />
    </section>
  );
}
