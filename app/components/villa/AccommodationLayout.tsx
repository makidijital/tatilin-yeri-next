import { BedDouble, Bath } from "lucide-react";

import {
  bedLabel,
  bathroomLabel,
  type BedroomLayoutItem,
  type BathroomLayoutItem,
} from "@/lib/villa-layout.helper";

/* ===============================================================
   🛡️ AccommodationLayout — public "Konaklama Düzeni" (mig 047)
   ===============================================================
   PURE PRESENTATIONAL (PriceList / VillaInfoBar paterni):
     - Server component'ten normalize edilmiş layout alır.
     - Airbnb tarzı kart grid; mevcut detay design dili (eyebrow +
       responsive grid + soft border kart).
     - Veri yoksa NULL render (caller zaten boş diziyse section
       çizmez; bu component ekstra guard).
   =============================================================== */

type Props = {
  bedrooms: BedroomLayoutItem[];
  bathrooms: BathroomLayoutItem[];
};

export default function AccommodationLayout({
  bedrooms,
  bathrooms,
}: Props) {
  const hasBedrooms = bedrooms.length > 0;
  const hasBathrooms = bathrooms.length > 0;
  if (!hasBedrooms && !hasBathrooms) return null;

  return (
    <section>
      <p className="eyebrow mb-4 flex items-center gap-2">
        <BedDouble size={11} /> Konaklama Düzeni
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {/* YATAK ODALARI */}
        {bedrooms.map((room, i) => {
          const bedSummary = room.beds
            .map((b) => `${bedLabel(b.type)} × ${b.count}`)
            .join(" · ");
          return (
            <div
              key={`bed-${i}`}
              className="rounded-2xl border border-[var(--color-stone-100)] bg-white px-4 py-3.5 md:px-5 md:py-4 hover:border-[var(--color-stone-200)] hover:shadow-[0_8px_20px_-12px_rgb(27_26_23/0.08)] transition-colors motion-reduce:transition-none flex items-start gap-3"
            >
              <span className="w-9 h-9 shrink-0 rounded-xl border border-[var(--color-stone-100)] bg-[var(--color-sand-50)] text-[var(--color-stone-700)] flex items-center justify-center">
                <BedDouble size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[15px] md:text-[16px] text-[var(--color-stone-900)] tracking-[-0.01em] truncate">
                  {room.name || `${i + 1}. Yatak Odası`}
                </p>
                <p className="text-[12.5px] text-[var(--color-stone-500)] mt-0.5 leading-relaxed">
                  {bedSummary || "Detay belirtilmedi"}
                </p>
              </div>
            </div>
          );
        })}

        {/* BANYOLAR */}
        {bathrooms.map((b, i) => (
          <div
            key={`bath-${i}`}
            className="rounded-2xl border border-[var(--color-stone-100)] bg-white px-4 py-3.5 md:px-5 md:py-4 hover:border-[var(--color-stone-200)] hover:shadow-[0_8px_20px_-12px_rgb(27_26_23/0.08)] transition-colors motion-reduce:transition-none flex items-start gap-3"
          >
            <span className="w-9 h-9 shrink-0 rounded-xl border border-[var(--color-stone-100)] bg-[var(--color-sand-50)] text-[var(--color-stone-700)] flex items-center justify-center">
              <Bath size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[15px] md:text-[16px] text-[var(--color-stone-900)] tracking-[-0.01em] truncate">
                {b.name || `${i + 1}. Banyo`}
              </p>
              <p className="text-[12.5px] text-[var(--color-stone-500)] mt-0.5 leading-relaxed">
                {bathroomLabel(b.type)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
