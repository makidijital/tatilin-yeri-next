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
  /* T.C. Kültür ve Turizm Bakanlığı belge no — opsiyonel ham text.
     null/boş → certificate card render edilmez. */
  tourismDocumentNumber?: string | null;
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
  tourismDocumentNumber,
  videos,
  actions,
}: Props) {
  const [videoOpen, setVideoOpen] = useState(false);
  const safeVideos = videos ?? [];
  const hasVideo = safeVideos.length > 0;
  const certificateNo = tourismDocumentNumber?.trim() || "";
  const hasCertificate = certificateNo.length > 0;

  return (
    <>
      <div
        className="
          rounded-3xl ring-2 ring-[#1fb2ec]/30
          border border-[var(--color-stone-100)]
          bg-gradient-to-br from-white via-white to-[var(--color-sand-50)]/55
          shadow-[0_12px_34px_-18px_rgba(11,31,58,0.16),0_16px_38px_-16px_rgba(2,170,229,0.38)]
          px-5 py-5 md:px-7 md:py-6
        "
      >
        {/* ─────────────────────────────────────────────
            ÜST SATIR — villa adı + bölge (sol) │ aksiyonlar (sağ)
            ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          {/* SOL — villa adı + lokasyon */}
          <div className="min-w-0 flex-1">
            <h1
              className="
                font-display text-2xl md:text-[32px] font-bold
                text-[var(--color-stone-900)]
                tracking-[-0.025em] leading-[1.1]
                line-clamp-2
              "
            >
              {villaTitle}
            </h1>
            {location && (
              <p
                className="
                  mt-2 inline-flex items-center gap-1.5
                  text-sm text-[var(--color-stone-500)]
                "
              >
                <MapPin
                  size={13}
                  strokeWidth={1.8}
                  className="text-[var(--color-champagne-600)] shrink-0"
                  aria-hidden
                />
                <span className="truncate">{location}</span>
              </p>
            )}
          </div>

          {/* SAĞ — aksiyonlar (video CTA + favori floating).
              Action slot caller-controlled (FavoriteButton); logic'e
              ASLA dokunulmaz, yalnız DOM konum. */}
          {(actions || hasVideo) && (
            <div className="flex items-center gap-2.5 shrink-0">
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
              {actions}
            </div>
          )}
        </div>

        {/* ─────────────────────────────────────────────
            ALT SATIR — 3 stat mini-card (Kişi / Yatak / Banyo)
            flex-1 ile eşit genişlik; >0 olmayan render edilmez.
            ───────────────────────────────────────────── */}
        {(guests > 0 || bedrooms > 0 || bathrooms > 0 || hasCertificate) && (
          <div className="mt-5 md:mt-6 flex flex-wrap gap-2.5 md:gap-3">
            {guests > 0 && (
              <StatCard
                icon={<Users size={16} strokeWidth={1.8} />}
                value={guests}
                label="Kişi"
              />
            )}
            {bedrooms > 0 && (
              <StatCard
                icon={<BedDouble size={16} strokeWidth={1.8} />}
                value={bedrooms}
                label="Yatak Odası"
              />
            )}
            {bathrooms > 0 && (
              <StatCard
                icon={<Bath size={16} strokeWidth={1.8} />}
                value={bathrooms}
                label="Banyo"
              />
            )}
            {hasCertificate && (
              <CertificateCard documentNumber={certificateNo} />
            )}
          </div>
        )}
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
   StatCard — premium mini stat kart (Kişi / Yatak Odası / Banyo)
   Tasarım: rounded-2xl, soft border, glass beyaz zemin, subtle
   shadow; sol champagne-accent ikon, sağ value (bold) + label (muted).
   flex-1 → satırda eşit genişlik dağılımı.
─────────────────────────────────────────────────────────────── */
function StatCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div
      className="
        flex-1 basis-[8rem]
        flex items-center gap-2.5 md:gap-3
        rounded-2xl
        border border-[var(--color-stone-100)]
        bg-white/70 backdrop-blur-sm
        shadow-[0_4px_14px_-10px_rgba(11,31,58,0.18)]
        px-3 py-3 md:px-4 md:py-3.5
      "
    >
      <span
        aria-hidden
        className="
          w-9 h-9 shrink-0 rounded-xl
          bg-[var(--color-sand-50)] border border-[var(--color-stone-100)]
          text-[var(--color-champagne-600)]
          inline-flex items-center justify-center
        "
      >
        {icon}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="font-display text-[17px] md:text-[18px] text-[var(--color-stone-900)] tracking-[-0.01em] tabular-nums">
          {value}
        </p>
        <p className="text-[11.5px] text-[var(--color-stone-500)] leading-snug">
          {label}
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
   CertificateCard — T.C. Kültür ve Turizm Bakanlığı belge kartı.
   StatCard ile aynı görsel dil; ayırt edici soft-green shield accent.
   Belge no varsa muted subtext olarak gösterilir.
─────────────────────────────────────────────────────────────── */
function CertificateCard({
  documentNumber,
}: {
  documentNumber?: string | null;
}) {
  const num = documentNumber?.trim() || "";
  return (
    <div
      className="
        flex-1 basis-[8rem]
        flex items-center gap-2.5 md:gap-3
        rounded-2xl
        border border-[var(--color-stone-100)]
        bg-white/70 backdrop-blur-sm
        shadow-[0_4px_14px_-10px_rgba(11,31,58,0.18)]
        px-3 py-3 md:px-4 md:py-3.5
      "
    >
      <span
        aria-hidden
        className="
          w-9 h-9 shrink-0 rounded-xl
          bg-[var(--color-sand-50)] border border-[var(--color-stone-100)]
          inline-flex items-center justify-center overflow-hidden
        "
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/trust/turizm-bakanligi.svg"
          alt=""
          aria-hidden
          className="w-6 h-6 object-contain"
        />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="font-display text-[14px] md:text-[15px] text-[var(--color-stone-900)] tracking-[-0.01em]">
          Bakanlık Belgeli
        </p>
        {num && (
          <p className="text-[11.5px] text-[var(--color-stone-500)] leading-snug truncate">
            Belge No: {num}
          </p>
        )}
      </div>
    </div>
  );
}
