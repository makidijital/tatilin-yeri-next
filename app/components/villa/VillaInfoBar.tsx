"use client";

/* ===============================================================
   🛡️ VillaInfoBar — full-width premium villa DETAIL CARD
   ===============================================================
   AMAÇ:
     Villa detay sayfasının EN ÜSTÜNDE (Gallery + Booking grid'inin
     ÜSTÜNDE, sayfanın tüm content genişliğini kullanan) tek büyük
     premium CARD. Önceki "düz editorial rail" versiyonu fazla sade
     kaldığı için bu revizyonda: gerçek bir card yüzeyi (soft white,
     ince border, çok hafif shadow, üstte ince turuncu→mavi gradient
     accent), kişi/yatak/banyo için İKONLU info-item'lar (Users/
     BedDouble/Bath geri geldi) ve turizm belgesi için ayrı, biraz
     daha premium bir blok (mevcut bakanlık SVG ikonu geri geldi).

   LAYOUT:
     ┌─────────────────────────────────────────────────────────┐
     │ (ince gradient accent çizgisi — üst kenar)               │
     │ VİLLA DETAYLARI                     [Video CTA] [♡]      │
     │ Villa Adı (büyük, güçlü)                                 │
     │ 📍 Bölge / Konum                                         │
     │ ┌────────┐ ┌──────────────┐ ┌────────┐ ┌──────────────┐ │
     │ │ 👥 8   │ │ 🛏 4         │ │ 🛁 3   │ │ [BELGE] XXXXX│ │
     │ │ Kişi   │ │ Yatak Odası  │ │ Banyo  │ │ Turizm Belgesi│ │
     │ └────────┘ └──────────────┘ └────────┘ └──────────────┘ │
     └─────────────────────────────────────────────────────────┘

   - Üst satır: micro-label (sol) │ aksiyonlar (sağ) — video CTA + actions slot
   - Villa adı + lokasyon card'ın ana görsel odağı
   - Info item'lar: mobilde 2x2 grid, desktop'ta tek satır (4 kolon)
   - Belge item'ı diğerlerinden hafif farklı (gradient accent) — "premium"

   Konum: parent (`page.tsx`) tarafından Gallery/Booking grid'inin
   ÜSTÜNE, full-width olarak yerleştiriliyor — bu tur DEĞİŞMEDİ, sadece
   bu component'in KENDİ iç tasarımı (card'a dönüştü) değişti.

   FOTOĞRAFIN ÜZERİNE ASLA binmez (gallery'den tamamen ayrı, üstte block).
   Gallery DOM/click/lightbox davranışı SIFIR etkilenir.

   VIDEO MODAL:
     - VillaVideoModal (mevcut, dokunulmadı) trigger button burada
     - Local useState modal open/close
     - Video yoksa CTA görünmez (videos=[] → hasVideo=false)

   VERİ KONTRATI (DEĞİŞMEDİ):
     - Props aynı: villaTitle, location, guests, bedrooms, bathrooms,
       tourismDocumentNumber, videos, actions.
     - Conditional'lar AYNEN: guests>0 / bedrooms>0 / bathrooms>0 /
       certificateNo boş değilse. Yeni API/DB sorgusu YOK, fake veri YOK.

   ANİMASYON (yalnız bu component içinde scoped, <style> ile; globals.css
   DEĞİŞMEDİ, yeni dependency YOK):
     - Card mount'ta çok hafif fade+translate (tek seferlik, ~500ms).
     - Üst accent çizgisinde çok yavaş (9s) shimmer sweep.
     - Info item hover'da hafif lift + ikon scale (Tailwind transition).
     - Tümü `@media (prefers-reduced-motion: no-preference)` guard'lı —
       reduced-motion tercihinde hiçbir animasyon çalışmaz.

   ASLA dokunulmadı:
     - VillaVideoModal logic (sadece tüketici)
     - Gallery component
     - Booking sidebar / pricing / availability / reservation flow
     - YouTube helper
     - FavoriteButton / actions slot logic (yalnız DOM konum)
   =============================================================== */

import { useState, type ReactNode } from "react";
import { MapPin, Play, Users, BedDouble, Bath } from "lucide-react";

import VillaVideoModal from "./VillaVideoModal";
import type { VillaYouTubeVideo } from "@/lib/youtube.helper";

type Props = {
  villaTitle: string;
  location: string;
  guests: number;
  bedrooms: number;
  bathrooms: number;
  /* T.C. Kültür ve Turizm Bakanlığı belge no — opsiyonel ham text.
     null/boş → belge item'ı render edilmez. */
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
  const hasAnyInfoItem =
    guests > 0 || bedrooms > 0 || bathrooms > 0 || hasCertificate;

  return (
    <>
      <div
        className="
          villa-info-card-in
          relative overflow-hidden
          rounded-[28px] md:rounded-[32px]
          border border-[var(--color-stone-100)]
          bg-gradient-to-br from-white via-white to-[var(--color-sand-50)]/60
          shadow-[0_24px_60px_-36px_rgba(11,31,58,0.22)]
          px-6 py-7 md:px-9 md:py-9
        "
      >
        <style>{`
          @media (prefers-reduced-motion: no-preference) {
            .villa-info-card-in {
              animation: villa-info-card-in-kf 550ms cubic-bezier(0.16, 1, 0.3, 1) both;
            }
            .villa-info-shimmer {
              animation: villa-info-shimmer-kf 9s ease-in-out infinite;
            }
          }
          @keyframes villa-info-card-in-kf {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes villa-info-shimmer-kf {
            0% { background-position: 160% 0; }
            100% { background-position: -60% 0; }
          }
        `}</style>

        {/* İnce üst accent çizgisi — turuncu → mavi, çok yavaş shimmer */}
        <span
          aria-hidden="true"
          className="villa-info-shimmer absolute inset-x-0 top-0 h-[3px]"
          style={{
            background:
              "linear-gradient(90deg, transparent, #ED7926, #0973BA, transparent)",
            backgroundSize: "220% 100%",
          }}
        />

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
              ASLA dokunulmaz, yalnız DOM konum/görünürlük. */}
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

        {/* VİLLA ADI — en güçlü tipografik eleman, card'ın ana odağı */}
        <h1
          className="
            mt-3 md:mt-4
            font-display font-bold
            text-[30px] sm:text-[36px] md:text-[42px] lg:text-[48px]
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
              size={15}
              strokeWidth={1.8}
              className="text-[#ED7926] shrink-0"
              aria-hidden
            />
            <span>{location}</span>
          </p>
        )}

        {/* KİŞİ / YATAK ODASI / BANYO / BELGE — ikonlu info-item grid.
            Mobilde 2x2, desktop'ta tek satır (4 kolon). Koşullar AYNEN
            (>0 / certificateNo boş değil) — eski StatCard/CertificateCard
            ile birebir aynı görünürlük mantığı. */}
        {hasAnyInfoItem && (
          <div className="mt-6 md:mt-7 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {guests > 0 && (
              <InfoItem
                icon={<Users size={17} strokeWidth={1.8} />}
                accentColor="#0973BA"
                value={guests}
                label="Kişi"
              />
            )}
            {bedrooms > 0 && (
              <InfoItem
                icon={<BedDouble size={17} strokeWidth={1.8} />}
                accentColor="#ED7926"
                value={bedrooms}
                label="Yatak Odası"
              />
            )}
            {bathrooms > 0 && (
              <InfoItem
                icon={<Bath size={17} strokeWidth={1.8} />}
                accentColor="#0973BA"
                value={bathrooms}
                label="Banyo"
              />
            )}
            {hasCertificate && <CertificateItem documentNumber={certificateNo} />}
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
   InfoItem — Kişi / Yatak Odası / Banyo için modern, ikonlu mini
   card. Eski StatCard'ın YERİNE geldi: soft background (kutu/border
   ağır değil), ikon için küçük beyaz rozet + brand accent renk,
   büyük sayı + küçük label, hover'da hafif lift + ikon scale.
─────────────────────────────────────────────────────────────── */
function InfoItem({
  icon,
  accentColor,
  value,
  label,
}: {
  icon: React.ReactNode;
  accentColor: string;
  value: number;
  label: string;
}) {
  return (
    <div
      className="
        group/item relative
        rounded-2xl
        bg-[var(--color-stone-50)]
        border border-transparent
        hover:bg-white hover:border-[var(--color-stone-100)]
        hover:shadow-[0_12px_28px_-18px_rgba(11,31,58,0.22)]
        hover:-translate-y-0.5
        transition-all duration-300 motion-reduce:transition-none motion-reduce:hover:translate-y-0
        px-4 py-4
      "
    >
      <span
        aria-hidden="true"
        className="
          inline-flex items-center justify-center w-9 h-9 rounded-xl
          bg-white shadow-[inset_0_0_0_1px_rgba(11,31,58,0.06)]
          transition-transform duration-300 motion-reduce:transition-none
          group-hover/item:scale-110
        "
        style={{ color: accentColor }}
      >
        {icon}
      </span>
      <p className="mt-3 font-display text-[20px] md:text-[22px] font-bold text-[var(--color-stone-900)] tracking-[-0.01em] tabular-nums leading-none">
        {value}
      </p>
      <p className="mt-1 text-[11.5px] md:text-[12px] font-medium text-[var(--color-stone-500)] leading-snug">
        {label}
      </p>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
   CertificateItem — T.C. Kültür ve Turizm Bakanlığı belge item'ı.
   Diğer InfoItem'lardan biraz daha premium: turuncu→mavi çok hafif
   gradient zemin + ince brand-renkli border. Mevcut bakanlık SVG
   ikonu (daha önce CertificateCard'da kullanılan gerçek asset) geri
   getirildi — yeni ikon paketi/dependency YOK. Belge no gerçek
   veriden (tourismDocumentNumber) gelir; koşul AYNEN (boş değilse).
─────────────────────────────────────────────────────────────── */
function CertificateItem({ documentNumber }: { documentNumber: string }) {
  return (
    <div
      className="
        group/cert relative overflow-hidden
        rounded-2xl
        border border-[#0973BA]/15
        bg-gradient-to-br from-[#0973BA]/[0.07] via-white to-[#ED7926]/[0.06]
        hover:shadow-[0_12px_28px_-18px_rgba(9,115,186,0.28)]
        hover:-translate-y-0.5
        transition-all duration-300 motion-reduce:transition-none motion-reduce:hover:translate-y-0
        px-4 py-4
        min-w-0
      "
    >
      <span
        aria-hidden="true"
        className="
          inline-flex items-center justify-center w-9 h-9 rounded-xl
          bg-white shadow-[inset_0_0_0_1px_rgba(11,31,58,0.06)]
          overflow-hidden
          transition-transform duration-300 motion-reduce:transition-none
          group-hover/cert:scale-110
        "
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/trust/turizm-bakanligi.svg"
          alt=""
          aria-hidden
          className="w-5 h-5 object-contain"
        />
      </span>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0973BA] leading-snug">
        Turizm Belgesi
      </p>
      <p className="mt-1 text-[12px] md:text-[12.5px] font-medium text-[var(--color-stone-700)] leading-snug truncate">
        Belge No: {documentNumber}
      </p>
    </div>
  );
}
