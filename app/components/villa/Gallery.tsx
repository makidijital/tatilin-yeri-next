"use client";

import { useEffect, useRef, useState } from "react";
import WatermarkOverlay from "./WatermarkOverlay";
import type { WatermarkPosition } from "@/app/services/settings.service";

type WatermarkProps = {
  logo?: string | null;
  enabled?: boolean | null;
  opacity?: number | null;
  position?: WatermarkPosition | null;
  size?: number | null;
};

/* 🛡️ SEO + a11y ALT TEXT — villa.title + image index pattern.
   Cover (index 0) için "kapak fotoğrafı"; diğerleri için sıra numarası.
   Schema.org image SEO ve screen-reader uyumu için. DB'de alt_text
   kolonu yok; auto-generation yeterli. Custom alt_text ileride DB
   eklenirse bu helper'ı override edebilir.

   `villaTitle` opsiyonel — verilmezse generic "Villa" fallback,
   eski kullanım davranışı aynen korunur (geriye dönük uyum). */
function buildImageAlt(
  villaTitle: string | undefined | null,
  index: number,
  total: number
): string {
  const t = (villaTitle || "Villa").trim();
  if (index === 0) {
    return `${t} — kapak fotoğrafı`;
  }
  return `${t} — fotoğraf ${index + 1}${total > 1 ? `/${total}` : ""}`;
}

export default function Gallery({
  images,
  watermark,
  villaTitle,
}: {
  images: string[];
  watermark?: WatermarkProps;
  /** 🛡️ SEO + a11y: alt text auto-generation için. Opsiyonel; eski
   *  caller'lar (yoksa) "Villa" generic fallback'a düşer. */
  villaTitle?: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  /* 🛡️ MOBILE SWIPE — native touch handler (zero dependency).
     Lightbox modal içinde parmakla sağa-sola sürükleme ile prev/next.
     Masaüstü mouse/click davranışı, klavye ← → Esc, lightbox dış-tıkla
     kapatma, thumbnail tap → AYNEN korunur (touch event'leri yalnız
     touchscreen cihazlarda tetiklenir; mouse event'leriyle çakışmaz). */
  const touchStartX = useRef<number | null>(null);
  const SWIPE_THRESHOLD = 50;

  // 🔥 scroll lock
  useEffect(() => {
    if (activeIndex !== null) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
  }, [activeIndex]);

  // 🔥 keyboard controls
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActiveIndex(null);
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeIndex]);

  function next() {
    setActiveIndex((prev) =>
      prev !== null ? (prev + 1) % images.length : 0
    );
  }

  function prev() {
    setActiveIndex((prev) =>
      prev !== null ? (prev - 1 + images.length) % images.length : 0
    );
  }

  /* 🛡️ Touch handlers — lightbox swipe gesture.
     touchStart: ilk parmak teması X koordinatını sakla.
     touchEnd: bırakılan X ile delta hesapla; SWIPE_THRESHOLD aşılırsa
     yön bazında next/prev tetikle. Çoklu parmak (pinch) durumunda
     sessizce bypass. */
  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length !== 1) {
      touchStartX.current = null;
      return;
    }
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null) return;
    const endX = e.changedTouches[0]?.clientX;
    if (typeof endX !== "number") return;
    const dx = endX - startX;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (dx < 0) next();
    else prev();
  }

  if (!images || images.length === 0) {
    return (
      <div className="h-64 bg-gray-800 rounded-xl flex items-center justify-center">
        Görsel yok
      </div>
    );
  }

  return (
    <>
      {/* 🛡️ MOBILE GRID (<768px) — yeniden tasarım.
         Eski 4-sütun 400px masonry mobilde küçük kartları ~80px wide
         + dar/uzun gösteriyordu (sıkışık + premium hissi kayıp).
         Yeni hiyerarşi:
           ┌─────────────────────────────┐
           │  HERO (aspect 16/10)        │
           ├──────────────┬──────────────┤
           │  Foto 2 4/3  │ Foto 3 4/3   │
           │              │  +X overlay  │
           └──────────────┴──────────────┘
         - aspect-ratio CLS önler (img yüklenmeden alan rezerve).
         - Tüm tıklamalar mevcut lightbox'ı tetikler (setActiveIndex).
         - WatermarkOverlay her kartta — desktop parity. */}
      <div className="grid md:hidden gap-2">
        {/* HERO — 1. fotoğraf full-width, aspect 16/10 */}
        <div
          className="relative overflow-hidden rounded-xl cursor-pointer aspect-[16/10]"
          onClick={() => setActiveIndex(0)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[0]}
            alt={buildImageAlt(villaTitle, 0, images.length)}
            className="w-full h-full object-cover rounded-xl"
          />
          <WatermarkOverlay {...watermark} />
        </div>

        {/* ALT SATIR — 2 + 3. fotoğraf yan yana aynı yükseklikte.
           images.length === 1 ise hiç render edilmez. */}
        {images.length >= 2 && (
          <div className="grid grid-cols-2 gap-2">
            {/* 2. foto */}
            <div
              className="relative overflow-hidden rounded-xl cursor-pointer aspect-[4/3]"
              onClick={() => setActiveIndex(1)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[1]}
                alt={buildImageAlt(villaTitle, 1, images.length)}
                className="w-full h-full object-cover rounded-xl"
              />
              <WatermarkOverlay {...watermark} />
            </div>

            {/* 3. foto + opsiyonel +X overlay.
               images.length === 2 ise bu kart render edilmez ve
               2. foto sol sütunda kalır (sağ taraf boş — kullanım
               nadir, davranış zarif). */}
            {images.length >= 3 && (
              <div
                className="relative overflow-hidden rounded-xl cursor-pointer aspect-[4/3]"
                onClick={() => setActiveIndex(2)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={images[2]}
                  alt={buildImageAlt(villaTitle, 2, images.length)}
                  className="w-full h-full object-cover rounded-xl"
                />
                <WatermarkOverlay {...watermark} />
                {/* +X overlay — yalnız 4+ fotoğraf varsa */}
                {images.length > 3 && (
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-black/55 flex items-center justify-center rounded-xl"
                  >
                    <span className="text-white text-[15px] font-semibold tracking-[0.01em]">
                      +{images.length - 3} Fotoğraf
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 🔥 DESKTOP GRID (≥768px) — eski 4-sütun masonry AYNEN korundu.
         hidden md:grid ile mobile'da gizli; desktop davranışı byte-
         identical. */}
      <div className="hidden md:grid grid-cols-4 gap-2 h-[400px]">

        {/* büyük */}
        <div
          className="col-span-2 row-span-2 cursor-pointer relative overflow-hidden rounded-xl"
          onClick={() => setActiveIndex(0)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[0]}
            alt={buildImageAlt(villaTitle, 0, images.length)}
            className="w-full h-full object-cover rounded-xl"
          />
          <WatermarkOverlay {...watermark} />
        </div>

        {/* küçükler */}
        {images.slice(1, 5).map((img, i) => (
          <div
            key={i}
            className="relative overflow-hidden rounded-xl cursor-pointer hover:opacity-90 transition"
            onClick={() => setActiveIndex(i + 1)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img}
              alt={buildImageAlt(villaTitle, i + 1, images.length)}
              className="w-full h-full object-cover rounded-xl"
            />
            <WatermarkOverlay {...watermark} />
          </div>
        ))}
      </div>

      {/* 🔥 LIGHTBOX */}
      {activeIndex !== null && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
          onClick={() => setActiveIndex(null)} // 🔥 dışa tıklayınca kapat
        >
          {/* içerik tıklanınca kapanmasın
              🛡️ onTouchStart/onTouchEnd — mobile swipe gesture; mouse
              event'leriyle çakışmaz, masaüstü davranışı AYNEN korunur. */}
          <div
            className="relative"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* kapatma */}
            <button
              onClick={() => setActiveIndex(null)}
              className="absolute top-5 right-5 text-white text-2xl"
            >
              ✕
            </button>

            {/* önceki */}
            <button
              onClick={prev}
              className="absolute left-5 top-1/2 -translate-y-1/2 text-white text-3xl"
            >
              ‹
            </button>

            {/* görsel + watermark wrapper */}
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[activeIndex]}
                alt={buildImageAlt(villaTitle, activeIndex, images.length)}
                className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl"
              />
              <WatermarkOverlay {...watermark} />
            </div>

            {/* sonraki */}
            <button
              onClick={next}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-white text-3xl"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </>
  );
}
