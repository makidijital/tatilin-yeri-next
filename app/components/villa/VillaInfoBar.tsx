"use client";

/* ===============================================================
   🛡️ VillaInfoBar — full-width editorial villa başlığı
   ===============================================================
   AMAÇ:
     Villa detay sayfasının EN ÜSTÜNDE (Gallery + Booking grid'inin
     ÜSTÜNDE, sayfanın tüm content genişliğini kullanan) premium,
     editorial bir başlık. Klasik beyaz kart/border/shadow/mini-kutu
     stat card'lar YOK — villa adı en güçlü tipografik eleman, bölge
     ikinci seviye, kişi/oda/banyo/belge no ise tek satırlık yatay
     bir "metadata rail".

   LAYOUT:
     VİLLA DETAYLARI                              [Video CTA] [♡]
     Villa Adı (büyük, güçlü tipografi)
     📍 Bölge / Konum
     8 KİŞİ  ·  4 YATAK ODASI  ·  3 BANYO  ·  TURİZM BELGESİ XXXXX

   - Üst satır: micro-label (sol) │ aksiyonlar (sağ) — video CTA + actions slot
   - Villa adı + lokasyon + metadata rail altında akar (kart YOK)
   - Mobile: aksiyonlar villa adının üstünde wrap eder

   Konum: parent (`page.tsx`) tarafından artık Gallery/Booking grid'inin
   ÜSTÜNE, full-width olarak yerleştiriliyor. Bu component'in kendisi
   layout konumundan bağımsız — sadece kendi iç tasarımından sorumlu.

   FOTOĞRAFIN ÜZERİNE ASLA binmez (gallery'den tamamen ayrı, üstte block).
   Gallery DOM/click/lightbox davranışı SIFIR etkilenir.

   VIDEO MODAL:
     - VillaVideoModal (mevcut, dokunulmadı) trigger button burada
     - Local useState modal open/close
     - Video yoksa CTA görünmez (videos=[] → hasVideo=false)

   VERİ KONTRATI (DEĞİŞMEDİ):
     - Props aynı: villaTitle, location, guests, bedrooms, bathrooms,
       tourismDocumentNumber, videos, actions.
     - Yeni API/DB sorgusu YOK, fake veri YOK — yalnız mevcut prop'ların
       sunum biçimi (yatay rail) değişti.

   ASLA dokunulmadı:
     - VillaVideoModal logic (sadece tüketici)
     - Gallery component
     - Booking sidebar / pricing / availability / reservation flow
     - YouTube helper
     - FavoriteButton / actions slot logic (yalnız DOM konum)
   =============================================================== */

import { useState, type ReactNode } from "react";
import { MapPin, Play } from "lucide-react";

import VillaVideoModal from "./VillaVideoModal";
import type { VillaYouTubeVideo } from "@/lib/youtube.helper";

type Props = {
  villaTitle: string;
  location: string;
  guests: number;
  bedrooms: number;
  bathrooms: number;
  /* T.C. Kültür ve Turizm Bakanlığı belge no — opsiyonel ham text.
     null/boş → rail'de render edilmez. */
  tourismDocumentNumber?: string | null;
  /* Video listesi — boş array veya undefined → CTA görünmez. */
  videos?: VillaYouTubeVideo[] | null;
  /* 🛡️ Action slot — Favori/Paylaş gibi caller-controlled aksiyonlar.
     Sağ blokta video CTA'dan SONRA render edilir. Caller logic'e bu
     component'in zerre etkisi yok (sadece slot). Opsiyonel — verilmezse
     hiçbir aksiyon görünmez. */
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

  /* 🛡️ PURE UI — mevcut primitive prop'ların (guests/bedrooms/bathrooms/
     certificateNo) yatay rail için metin haline getirilmesi. Hesaplama /
     API / fake veri YOK; yalnız >0 olanlar dahil edilir (eski StatCard
     conditional'larıyla BİREBİR aynı koşul). */
  const metaItems: string[] = [];
  if (guests > 0) metaItems.push(`${guests} Kişi`);
  if (bedrooms > 0) metaItems.push(`${bedrooms} Yatak Odası`);
  if (bathrooms > 0) metaItems.push(`${bathrooms} Banyo`);
  if (hasCertificate) metaItems.push(`Turizm Belgesi ${certificateNo}`);

  return (
    <>
      <div>
        {/* ─────────────────────────────────────────────
            ÜST SATIR — micro-label (sol) │ aksiyonlar (sağ)
            ───────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <span className="inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.22em] text-[var(--color-stone-400)]">
            <span
              aria-hidden="true"
              className="inline-block w-3.5 h-px bg-gradient-to-r from-[#ED7926] to-[#0973BA]"
            />
            Villa Detayları
          </span>

          {/* Aksiyonlar (video CTA + favori floating).
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
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/40
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

        {/* VİLLA ADI — en güçlü tipografik eleman */}
        <h1
          className="
            mt-3 md:mt-4
            font-display font-bold
            text-[32px] sm:text-[38px] md:text-[46px] lg:text-[52px]
            leading-[1.05] tracking-[-0.02em]
            text-[var(--color-stone-900)]
          "
        >
          {villaTitle}
        </h1>

        {/* BÖLGE / KONUM — ikinci seviye */}
        {location && (
          <p className="mt-2.5 md:mt-3 inline-flex items-center gap-1.5 text-[15px] md:text-[16px] text-[var(--color-stone-500)]">
            <MapPin
              size={14}
              strokeWidth={1.8}
              className="text-[#ED7926] shrink-0"
              aria-hidden
            />
            <span>{location}</span>
          </p>
        )}

        {/* KİŞİ / ODA / BANYO / BELGE NO — yatay metadata rail (kutu YOK) */}
        {metaItems.length > 0 && (
          <div className="mt-5 md:mt-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {metaItems.map((item, idx) => (
              <span
                key={item}
                className="inline-flex items-center gap-3 text-[12.5px] md:text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--color-stone-600)]"
              >
                {idx > 0 && (
                  <span aria-hidden="true" className="text-[var(--color-stone-300)]">
                    ·
                  </span>
                )}
                {item}
              </span>
            ))}
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
