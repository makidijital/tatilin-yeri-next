"use client";

import { useState, type ReactNode } from "react";

/* ===============================================================
   🛡️ VillaDetailTabs — tab-content switching (scroll/anchor DEĞİL)
   ===============================================================
   Açıklama altında tab band. Tek aktif panel: tıklanan tab'ın
   content'i görünür, diğerleri DOM'dan kalkar. Default: Fiyatlar.

   ⚠️ Section'lar PROP olarak gelir (page'de zaten mevcut JSX taşındı —
   duplicate render yok). Bu component yalnız UI + görünürlük yönetir;
   pricing / calendar / map / distances logic'ine HİÇ dokunmaz.
   =============================================================== */

type Props = {
  fiyatlar: ReactNode;
  musaitlik: ReactNode;
  /** Konum paneli — harita + Mesafeler (Yakındaki Noktalar) birlikte. */
  konum: ReactNode;
  ozellikler: ReactNode;
  havuz: ReactNode;
};

export default function VillaDetailTabs({
  fiyatlar,
  musaitlik,
  konum,
  ozellikler,
  havuz,
}: Props) {
  const tabs: { id: string; label: string; content: ReactNode }[] = [
    { id: "fiyatlar", label: "Fiyatlar", content: fiyatlar },
    { id: "musaitlik", label: "Müsaitlik", content: musaitlik },
    { id: "konum", label: "Konum & Mesafeler", content: konum },
    { id: "ozellikler", label: "Özellikler", content: ozellikler },
    { id: "havuz", label: "Havuz Bilgileri", content: havuz },
  ];

  /* Default: Fiyatlar (Option A). */
  const [active, setActive] = useState(tabs[0].id);
  const activeContent =
    tabs.find((t) => t.id === active)?.content ?? null;

  return (
    <div>
      {/* TAB BAND — premium pill bar */}
      <nav aria-label="Villa detay sekmeleri">
        <div className="rounded-2xl border border-[var(--color-stone-100)] bg-white/85 backdrop-blur-md shadow-[0_12px_30px_-18px_rgba(11,31,58,0.22)] p-1.5 overflow-x-auto">
          <ul className="flex items-center gap-1 min-w-max md:min-w-0 md:w-full">
            {tabs.map((t) => {
              const isActive = active === t.id;
              return (
                <li key={t.id} className="md:flex-1">
                  <button
                    type="button"
                    onClick={() => setActive(t.id)}
                    aria-current={isActive ? "true" : undefined}
                    className={
                      "inline-flex items-center md:w-full md:justify-center px-4 py-2 rounded-xl text-[13px] font-medium tracking-[0.01em] transition-colors duration-200 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-coral)]/40 " +
                      (isActive
                        ? "bg-[var(--color-stone-900)] text-white shadow-[0_8px_18px_-10px_rgba(11,31,58,0.4)]"
                        : "text-[var(--color-stone-600)] hover:text-[var(--color-stone-900)] hover:bg-[var(--color-stone-50)]")
                    }
                  >
                    {t.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* CONTENT PANEL — yalnız aktif tab; key ile smooth fade. */}
      <div key={active} className="fade-in mt-6 md:mt-7">
        {activeContent}
      </div>
    </div>
  );
}
