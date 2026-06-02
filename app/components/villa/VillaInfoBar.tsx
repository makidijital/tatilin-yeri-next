"use client";

/* ===============================================================
   🛡️ VillaInfoBar — gallery üstü premium başlık şeridi
   ===============================================================
   AMAÇ:
     Villa detay sayfasında Gallery'nin ÜSTÜNDE, AYRI bir
     container içinde temiz premium info bar.

   LAYOUT:
     ┌──────────────────────────────────────────────────────┐
     │ [Villa Adı]                  [Kişi] [Yatak] [Banyo] │
     │ 📍 Lokasyon                  [Villa Videosu]        │
     └──────────────────────────────────────────────────────┘

   - Sol: villa adı + lokasyon
   - Sağ: bilgi pill'leri + video CTA (en sağ)
   - Mobile: wrap (sol blok üstte, sağ blok altta)

   ŞERİT TASARIMI:
     - rounded-3xl
     - bg-white
     - border border-stone-100
     - subtle shadow
     - padding responsive (px-5 py-4 mobile, px-6 py-5 desktop)
     - flex layout, mobile wrap

   FOTOĞRAFIN ÜZERİNE ASLA binmez (gallery üstünde ayrı block).
   Gallery DOM/click/lightbox davranışı SIFIR etkilenir.

   VIDEO MODAL:
     - VillaVideoModal (mevcut, dokunulmadı) trigger button burada
     - Local useState modal open/close
     - Video yoksa CTA görünmez (videos=[] → hasVideo=false)

   ASLA dokunulmadı:
     - VillaVideoModal logic (sadece tüketici)
     - Gallery component
     - Booking sidebar / pricing / availability / reservation flow
     - YouTube helper
   =============================================================== */

import { useState, type ReactNode } from "react";
import { MapPin, Users, BedDouble, Bath, Play } from "lucide-react";

import VillaVideoModal from "./VillaVideoModal";
import type { VillaYouTubeVideo } from "@/lib/youtube.helper";

type Props = {
  villaTitle: string;
  location: string;
  guests: number;
  bedrooms: number;
  bathrooms: number;
  /* Video listesi — boş array veya undefined → CTA görünmez. */
  videos?: VillaYouTubeVideo[] | null;
  /* 🛡️ Action slot — Favori/Paylaş gibi caller-controlled aksiyonlar.
     Sağ blokta pill'lerin yanına, video CTA'dan ÖNCE render edilir.
     Caller logic'e bu component'in zerre etkisi yok (sadece slot).
     Opsiyonel — verilmezse hiçbir aksiyon görünmez. */
  actions?: ReactNode;
};

export default function VillaInfoBar({
  villaTitle,
  location,
  guests,
  bedrooms,
  bathrooms,
  videos,
  actions,
}: Props) {
  const [videoOpen, setVideoOpen] = useState(false);
  const safeVideos = videos ?? [];
  const hasVideo = safeVideos.length > 0;

  return (
    <>
      <div
        className="
          rounded-3xl bg-white
          border border-[var(--color-stone-100)]
          shadow-[0_8px_24px_-12px_rgb(27_26_23/0.08)]
          px-5 py-4 md:px-6 md:py-5
        "
      >
        {/* 3-BÖLME EDITORIAL LAYOUT
            ────────────────────────────────────────────────
            Desktop: SOL (villa info) │ ORTA (info pills) │ SAĞ (actions)
            Mobile : column stack — her bölme tam genişlik satır

            Pill'ler ve action'lar görsel olarak ayrılır:
            actions area kendi flex container'ında, desktop'ta sol
            kenarda hairline border + padding-left "premium controls"
            hissi verir. */}
        <div
          className="
            flex flex-col gap-4
            md:flex-row md:items-center md:justify-between md:gap-6
          "
        >
          {/* SOL — villa adı + lokasyon */}
          <div className="min-w-0 md:flex-1">
            <h1
              className="
                font-display text-2xl md:text-3xl font-bold
                text-[var(--color-stone-900)]
                tracking-[-0.02em]
                line-clamp-2
              "
            >
              {villaTitle}
            </h1>
            {location && (
              <p
                className="
                  mt-1 inline-flex items-center gap-1.5
                  text-sm text-[var(--color-stone-500)]
                "
              >
                <MapPin
                  size={13}
                  strokeWidth={1.8}
                  className="text-[var(--color-stone-400)] shrink-0"
                  aria-hidden
                />
                <span className="truncate">{location}</span>
              </p>
            )}
          </div>

          {/* ORTA — info pills (equal-height) */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {guests > 0 && (
              <InfoPill icon={<Users size={13} strokeWidth={1.8} />}>
                {guests} Kişi
              </InfoPill>
            )}
            {bedrooms > 0 && (
              <InfoPill icon={<BedDouble size={13} strokeWidth={1.8} />}>
                {bedrooms} Yatak Odası
              </InfoPill>
            )}
            {bathrooms > 0 && (
              <InfoPill icon={<Bath size={13} strokeWidth={1.8} />}>
                {bathrooms} Banyo
              </InfoPill>
            )}
          </div>

          {/* SAĞ — actions area (favori + video CTA).
              Desktop: sol kenarda subtle hairline border + pl-5
                       → "premium controls" görsel ayrımı.
              Mobile: tam genişlik satır, border yok (kalabalık olmasın). */}
          {(actions || hasVideo) && (
            <div
              className="
                flex items-center gap-3 shrink-0
                md:pl-5 md:border-l md:border-[var(--color-stone-200)]/70
              "
            >
              {/* 🛡️ Action slot — caller-controlled (FavoriteButton).
                  Secondary/glass görünüm caller'ın variant kontrolünde
                  (FavoriteButton variant="detail"). InfoBar logic'e ASLA
                  dokunmaz; sadece DOM konum. */}
              {actions}

              {hasVideo && (
                <button
                  type="button"
                  onClick={() => setVideoOpen(true)}
                  aria-label={
                    villaTitle
                      ? `${villaTitle} villa videosunu oynat`
                      : "Villa videosunu oynat"
                  }
                  className="
                    group/video
                    inline-flex items-center gap-2.5
                    pl-2 pr-5 py-2
                    rounded-full
                    bg-[var(--color-stone-900)] hover:bg-[var(--color-stone-800)]
                    text-white text-[13px] font-semibold tracking-wide
                    shadow-[0_10px_24px_-8px_rgb(27_26_23/0.5)]
                    hover:shadow-[0_14px_28px_-8px_rgb(27_26_23/0.55)]
                    transition-all duration-200 motion-reduce:transition-none
                    hover:-translate-y-[1px] motion-reduce:hover:translate-y-0
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40
                  "
                >
                  <span
                    aria-hidden
                    className="
                      relative inline-flex items-center justify-center
                      w-7 h-7 rounded-full
                      bg-white text-[var(--color-stone-900)]
                      shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]
                    "
                  >
                    <Play
                      size={12}
                      strokeWidth={1.8}
                      fill="currentColor"
                      className="ml-0.5"
                    />
                  </span>
                  <span className="whitespace-nowrap">Villa Videosu</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* VIDEO MODAL — local state. isOpen=false iken iframe yok. */}
      {hasVideo && (
        <VillaVideoModal
          isOpen={videoOpen}
          onClose={() => setVideoOpen(false)}
          videos={safeVideos}
          villaTitle={villaTitle}
        />
      )}
    </>
  );
}

/* ───────────────────────────────────────────────────────────────
   InfoPill — temiz light pill (sand/stone tonu)
   Tasarım: bg-stone-50/sand, border-stone-100, text-stone-700,
   rounded-full, küçük icon + label.
─────────────────────────────────────────────────────────────── */
function InfoPill({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className="
        inline-flex items-center gap-1.5
        h-8 px-3
        rounded-full
        bg-[var(--color-sand-50)]
        border border-[var(--color-stone-100)]
        text-[var(--color-stone-700)]
        text-[12.5px] font-medium tracking-wide
        leading-none
      "
    >
      <span
        aria-hidden
        className="text-[var(--color-champagne-600)] inline-flex items-center"
      >
        {icon}
      </span>
      <span className="whitespace-nowrap">{children}</span>
    </span>
  );
}
