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
   🛡️ HERO — CINEMATIC DUOTONE (yeniden tasarım — brand refresh)
   ===============================================================
   Tasarım yönü (klasik "üstte görsel + ortada metin" kalıbından
   bilinçli çıkış):
     - Full-bleed villa görseli ÜZERİNDE koyu, alttan-yukarı sinematik
       gradient (siyah) — okunabilirlik + "gece / golden hour" luxury
       atmosferi. Metin artık BEYAZ (önceki versiyon koyu metin +
       beyaz overlay kullanıyordu — bilinçli tam ters çevirme).
     - Marka renkleri (#ED7926 turuncu / #0973BA mavi) SADECE vurgu
       katmanlarında: köşe glow'ları, başlık ikinci satırı (gradient
       text-clip), CTA gradient + breathing glow, arama panelindeki
       ikon/hover/odak vurguları. Başka hiçbir ana tema rengi YOK.
     - Floating glass badge (eski turkuaz ping-dot yerine turuncu→mavi
       gradient dot).
     - Arama paneli artık koyu görsel üzerinde yüzen premium glass
       kart — turkuaz yerine turuncu/mavi ring + çok-katmanlı shadow.
     - Hafif, yavaş, rahatsız etmeyen animasyonlar: arka plan görselinde
       çok yavaş "Ken Burns" zoom + dekoratif floating glow orb +
       CTA'larda breathing glow (TopBar shimmer'ıyla AYNI DEĞİL — o
       ışık bandı kullanır, bu `animate-pulse` tabanlı nefes alan
       glow kullanır). Tüm custom keyframe'ler bu component içinde
       local `<style>` ile tanımlanır — globals.css'e DOKUNULMADI.
       `prefers-reduced-motion` için tüm custom animasyonlar kapanır.

   DOKUNULMAYAN İŞ MANTIĞI (AYNEN):
     - HeroSearchPanel state/URL push/datepicker portal AYNEN
       (yalnızca kendi içindeki className/style — bkz. o dosyanın
       başlığı — hiçbir state/handler/effect değişmedi)
     - hero.helpers HeroContent shape AYNEN (badge/title/subtitle/
       backgroundImage/overlayOpacity/primaryCta/secondaryCta)
     - resolveHeroContent default fallback chain AYNEN
     - HeroReviewStats type contract caller'a (page.tsx) AYNEN;
       reviewStats önceki versiyonda da render edilmiyordu (void) —
       bu davranış AYNEN korundu, yeni bir görsel blok icat edilmedi
     - HeroCta akıllı href yönlendirme mantığı (#anchor / http / mailto
       / tel / internal route) BYTE-IDENTICAL
     - `hero.overlayOpacity` (0..1, admin ayarı) artık yeni overlay
       katmanlarının opacity çarpanı olarak KULLANILIYOR — önceki
       "full-bleed premium" revizyonunda bu alan hesaplanıp hiç
       uygulanmıyordu (bkz. lib/hero.helpers.ts yorum satırı); bu,
       zaten var olan admin kontrolünü canlandıran ek bir düzeltme,
       hiçbir mevcut davranışı BOZMUYOR (önceden hiçbir görsel etkisi
       yoktu, şimdi belgelenen amacına kavuşuyor).

   PERFORMANS:
     - <Image priority + fill + sizes="100vw"> LCP optimize (AYNEN)
     - min-h-[60svh] lg:min-h-[78svh] → mount anında sabit ölçü →
       CLS=0 (AYNEN prensip, yalnızca lg değeri büyütüldü — "büyük,
       güçlü Hero" hedefi)
     - Tek hero image fetch (AYNEN)
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
   BU FONKSİYON DEĞİŞMEDİ — yalnızca çağıran yerdeki className/children
   (görsel katman) güncellendi. =============================== */
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

  /* reviewStats render edilmiyor (önceki versiyonda da öyleydi —
     HeroReviewCard kaldırılmıştı) — ama prop type contract caller'a
     (page.tsx) BOZULMASIN diye signature aynen tutuluyor. void to
     silence unused warning. */
  void reviewStats;

  return (
    <>
    <section
      className="
        relative z-20
        min-h-[60svh] lg:min-h-[78svh]
        w-full
        bg-[var(--color-stone-900)]
        overflow-hidden
      "
    >
      {/* 🛡️ Local, component-scoped animasyon tanımları — globals.css'e
         DOKUNULMADI. Yalnızca bu Hero içinde kullanılır: çok yavaş
         "Ken Burns" görsel zoom + dekoratif floating glow orb.
         TopBar'daki `@keyframes shimmer` (ışık bandı) ile AYNI DEĞİL;
         burada ışık bandı/sweep efekti YOK. prefers-reduced-motion'da
         tamamen kapanır. */}
      <style>{`
        @keyframes heroKenBurns {
          0% { transform: scale(1); }
          100% { transform: scale(1.06); }
        }
        @keyframes heroOrbFloat {
          0%, 100% { transform: translateY(0) translateX(0); }
          50% { transform: translateY(-16px) translateX(-6px); }
        }
        .hero-kenburns { animation: heroKenBurns 28s ease-in-out infinite alternate; }
        .hero-orb-float { animation: heroOrbFloat 10s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .hero-kenburns, .hero-orb-float { animation: none; }
        }
      `}</style>

      {/* ═══════════════════════════════════════════════════════════
          FULL-BLEED BACKGROUND IMAGE — admin source-of-truth
          sizes="100vw" → CDN responsive srcset (WebP/AVIF auto)
          priority + fill → LCP optimize; Next preload hint otomatik.
          Çok yavaş, sürekli Ken Burns zoom (28s) — sinematik derinlik,
          rahatsız etmeyen hız.
          ═══════════════════════════════════════════════════════════ */}
      {hero.backgroundImage && (
        <div className="absolute inset-0">
          <Image
            src={hero.backgroundImage}
            alt={hero.title || "Akdeniz villası"}
            fill
            priority
            sizes="100vw"
            className="hero-kenburns object-cover object-center"
          />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          CİNEMATİC BASE OVERLAY — alttan yukarı siyah gradient.
          Önceki versiyon beyaz overlay + koyu metin kullanıyordu;
          bilinçli tersine çevirme: koyu overlay + beyaz metin, daha
          "gece / golden hour luxury" his, rakip sitelerin klasik
          "beyaz fade" kalıbından uzaklaşır. `hero.overlayOpacity`
          (admin ayarı, 0..1) artık gerçekten uygulanıyor — önceki
          revizyonda hesaplanıp hiç kullanılmıyordu.
          ═══════════════════════════════════════════════════════════ */}
      <div
        aria-hidden="true"
        className="
          absolute inset-0 pointer-events-none
          bg-gradient-to-t from-black/92 via-black/45 to-black/5
        "
        style={{ opacity: hero.overlayOpacity }}
      />

      {/* BRAND DUOTONE GLOW — köşelerde çok düşük opacity'li marka
          renk radial glow'ları. Ana vurgu renkleri SADECE burada:
          sağ-üst mavi (#0973BA), sol-alt turuncu (#ED7926). */}
      <div
        aria-hidden="true"
        className="
          absolute inset-0 pointer-events-none
          bg-[radial-gradient(58%_48%_at_100%_0%,rgba(9,115,186,0.35),transparent_62%)]
        "
        style={{ opacity: hero.overlayOpacity }}
      />
      <div
        aria-hidden="true"
        className="
          absolute inset-0 pointer-events-none
          bg-[radial-gradient(52%_42%_at_0%_100%,rgba(237,121,38,0.28),transparent_60%)]
        "
        style={{ opacity: hero.overlayOpacity }}
      />

      {/* Dekoratif floating glow orb — derinlik/hiyerarşi için, saf
         dekoratif (yalnız masaüstünde, mobilde gizli). */}
      <div
        aria-hidden="true"
        className="
          hero-orb-float
          hidden md:block
          pointer-events-none absolute -top-16 right-[10%]
          w-72 h-72 rounded-full blur-3xl
          bg-gradient-to-br from-[#ED7926]/20 to-[#0973BA]/20
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
          min-h-[60svh] lg:min-h-[78svh]
          flex flex-col justify-end
          pt-24 md:pt-24 lg:pt-28
          pb-5 md:pb-12
        "
      >
        {/* ─── COPY BLOCK ───────────────────────────────────────── */}
        <div className="max-w-3xl lg:max-w-4xl">
          {/* Eyebrow — floating glass badge, turuncu→mavi gradient dot */}
          <p
            className="
              inline-flex items-center gap-2.5
              rounded-full border border-white/25 bg-white/10 backdrop-blur-md
              px-4 py-2
              text-[11px] tracking-[0.28em] uppercase font-medium
              text-white
              shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)]
            "
          >
            <span
              aria-hidden="true"
              className="relative inline-flex w-1.5 h-1.5 rounded-full bg-gradient-to-r from-[#ED7926] to-[#0973BA]"
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-[#ED7926] animate-ping opacity-60"
              />
            </span>
            {hero.badge}
          </p>

          {/* Editorial title — beyaz ilk satır, turuncu→mavi gradient
             (bg-clip-text) ikinci satır — dramatic scale */}
          <h1
            className="
              font-display
              text-[34px] sm:text-[42px] md:text-[54px] lg:text-[66px]
              leading-[0.98] tracking-[-0.03em]
              text-white
              mt-6 md:mt-7
            "
          >
            {titleLines.map((line, i) => (
              <span
                key={i}
                className={
                  i === 0
                    ? "block"
                    : "block bg-gradient-to-r from-[#ED7926] to-[#0973BA] bg-clip-text text-transparent"
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
                text-white/80
                mt-6 md:mt-8
                max-w-xl whitespace-pre-line
              "
            >
              {hero.subtitle}
            </p>
          )}

          {/* CTA row — admin-driven (hero.primaryCta / secondaryCta).
             Text + link admin settings'ten; href tipine göre akıllı
             yönlendirme (HeroCta: #anchor smooth scroll / dahili route /
             harici yeni sekme). Admin boşsa yeni scroll-CTA fallback'leri.
             Primary: turuncu→mavi gradient + breathing/pulse glow (Header
             CTA ile AYNI teknik — TopBar shimmer DEĞİL). Secondary: glass
             outline. */}
          <div className="mt-8 md:mt-10 flex flex-wrap items-center gap-3">
            <HeroCta
              href={hero.primaryCta?.href || HERO_CTA_DEFAULTS.primary.href}
              className="
                group relative inline-flex items-center
                px-6 py-3 rounded-full
                text-white text-[13.5px] font-medium tracking-[0.02em]
                bg-gradient-to-r from-[#ED7926] to-[#0973BA]
                shadow-[0_18px_36px_-14px_rgba(237,121,38,0.5),0_10px_26px_-10px_rgba(9,115,186,0.45)]
                hover:shadow-[0_22px_44px_-14px_rgba(237,121,38,0.6),0_12px_30px_-10px_rgba(9,115,186,0.55)]
                hover:-translate-y-[1px]
                transition-[transform,box-shadow] duration-300
                motion-reduce:transition-none motion-reduce:hover:translate-y-0
                focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-stone-900)]
              "
            >
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
              <span className="relative z-10 inline-flex items-center gap-2">
                {hero.primaryCta?.text || HERO_CTA_DEFAULTS.primary.text}
                <ArrowUpRight
                  size={15}
                  className="transition-transform duration-300 motion-reduce:transition-none group-hover:translate-x-[1px] group-hover:-translate-y-[1px]"
                  aria-hidden
                />
              </span>
            </HeroCta>
            <HeroCta
              href={hero.secondaryCta?.href || HERO_CTA_DEFAULTS.secondary.href}
              className="
                group inline-flex items-center gap-2
                px-5 py-3 rounded-full
                border border-white/30 bg-white/10 backdrop-blur-md
                text-white
                text-[13.5px] font-medium tracking-[0.02em]
                hover:bg-white/[0.18] hover:border-white/45
                hover:-translate-y-[1px]
                transition-[transform,border-color,background-color] duration-300
                motion-reduce:transition-none motion-reduce:hover:translate-y-0
                focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40
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
