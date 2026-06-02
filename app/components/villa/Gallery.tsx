"use client";

import { useEffect, useState } from "react";
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

  if (!images || images.length === 0) {
    return (
      <div className="h-64 bg-gray-800 rounded-xl flex items-center justify-center">
        Görsel yok
      </div>
    );
  }

  return (
    <>
      {/* 🔥 GRID */}
      <div className="grid grid-cols-4 gap-2 h-[400px]">

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
          {/* içerik tıklanınca kapanmasın */}
          <div
            className="relative"
            onClick={(e) => e.stopPropagation()}
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
