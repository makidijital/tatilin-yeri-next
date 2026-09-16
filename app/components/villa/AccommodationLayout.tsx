import { BedDouble, Bath } from "lucide-react";

import {
  type BedroomLayoutItem,
  type BathroomLayoutItem,
} from "@/lib/villa-layout.helper";
/* 🛡️ PHASE 10E — locale-aware etiket/metin kaynakları. `lib/villa-layout.helper.ts`
   DEĞİŞTİRİLMEDİ; oradaki TR sabitleri (BED_TYPE_LABELS/BATHROOM_TYPE_LABELS) admin
   formunda aynen kullanılmaya devam ediyor. Bu component artık etiketleri dictionary
   üzerinden okuyor — TR dictionary değerleri o sabitlerle BİREBİR aynı olduğu için
   TR çıktısı DEĞİŞMEZ (tests/unit/villa-layout-label.helper.test.ts bunu kilitliyor). */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import type { Locale } from "@/lib/i18n/config";
import {
  getBedTypeLabel,
  getBathroomTypeLabel,
} from "@/lib/villa-layout-label.helper";

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
  /* 🛡️ PHASE 10E — OPSİYONEL. Verilmezse "tr" → mevcut çağrı imzası
     (TR page.tsx) HİÇ DEĞİŞMEDEN çalışmaya devam eder. */
  locale?: Locale;
  /* 🛡️ PHASE 10E — ÇAĞIRAN TARAFTA çözülmüş görünen adlar
     (VillaDistancesSection/VillaFeaturesSection'ın "caller resolves,
     component renders" deseniyle AYNI). Çözümleme/drift guard'ı
     lib/villa-layout-translation.helper.ts'te; bu component ÇÖZÜMLEME
     YAPMAZ. Verilmezse TR adlar kullanılır. */
  bedroomNames?: string[];
  bathroomNames?: string[];
};

export default function AccommodationLayout({
  bedrooms,
  bathrooms,
  locale = "tr",
  bedroomNames,
  bathroomNames,
}: Props) {
  const hasBedrooms = bedrooms.length > 0;
  const hasBathrooms = bathrooms.length > 0;
  if (!hasBedrooms && !hasBathrooms) return null;

  const dict = getDictionary(locale);

  /* 🛡️ SAVUNMACI UZUNLUK KONTROLÜ — çözülmüş dizi TR layout ile aynı
     uzunlukta değilse TAMAMEN yok sayılır ve TR'ye dönülür (Batch 1
     helper'ının "uzunluk uyuşmazlığı → tüm diziyi reddet" kuralının
     render sınırındaki aynası). Yanlış odaya çeviri bağlanamaz. */
  /* GÖRÜNEN AD ZİNCİRİ: çözülmüş çeviri → TR adı → numara fallback.
     Ortadaki TR adımı savunmacıdır: çağıran taraf bir satır için boş
     değer verirse bilgi KAYBEDİLMEZ (numara yerine TR adı gösterilir).
     TR modunda çözülmüş ad ZATEN room.name olduğu için davranış
     eskisiyle BİREBİR aynıdır. */
  const bedroomDisplayNames =
    bedroomNames && bedroomNames.length === bedrooms.length
      ? bedroomNames
      : bedrooms.map((r) => r.name);
  const bathroomDisplayNames =
    bathroomNames && bathroomNames.length === bathrooms.length
      ? bathroomNames
      : bathrooms.map((b) => b.name);

  return (
    <section>
      <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em] mb-4">
        {dict.accommodation.sectionTitle}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 md:gap-4">
        {/* YATAK ODALARI — luxury suite kartları */}
        {bedrooms.map((room, i) => {
          const bedSummary = room.beds
            .map((b) => `${getBedTypeLabel(b.type, locale)} × ${b.count}`)
            .join(" · ");
          return (
            <div
              key={`bed-${i}`}
              className="group rounded-3xl border border-[var(--color-stone-100)] bg-white px-5 py-5 md:px-6 md:py-6 shadow-[0_6px_18px_-14px_rgba(11,31,58,0.18)] hover:-translate-y-0.5 hover:border-[var(--color-champagne-300)] hover:shadow-[0_16px_34px_-18px_rgba(11,31,58,0.2)] transition-[transform,box-shadow,border-color] duration-300 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span className="w-10 h-10 rounded-2xl border border-[var(--color-stone-100)] bg-[var(--color-sand-50)] text-[var(--color-stone-600)] flex items-center justify-center">
                <BedDouble size={17} strokeWidth={1.75} />
              </span>
              <p className="font-display text-[16px] md:text-[17px] text-[var(--color-stone-900)] tracking-[-0.015em] mt-4 truncate">
                {bedroomDisplayNames[i] ||
                  room.name ||
                  formatDictionaryString(dict.accommodation.bedroomFallback, {
                    n: i + 1,
                  })}
              </p>
              <p className="text-[13px] text-[var(--color-stone-500)] mt-1.5 leading-relaxed">
                {bedSummary || dict.accommodation.noDetail}
              </p>
            </div>
          );
        })}

        {/* BANYOLAR — luxury suite kartları */}
        {bathrooms.map((b, i) => (
          <div
            key={`bath-${i}`}
            className="group rounded-3xl border border-[var(--color-stone-100)] bg-white px-5 py-5 md:px-6 md:py-6 shadow-[0_6px_18px_-14px_rgba(11,31,58,0.18)] hover:-translate-y-0.5 hover:border-[var(--color-champagne-300)] hover:shadow-[0_16px_34px_-18px_rgba(11,31,58,0.2)] transition-[transform,box-shadow,border-color] duration-300 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <span className="w-10 h-10 rounded-2xl border border-[var(--color-stone-100)] bg-[var(--color-sand-50)] text-[var(--color-stone-600)] flex items-center justify-center">
              <Bath size={17} strokeWidth={1.75} />
            </span>
            <p className="font-display text-[16px] md:text-[17px] text-[var(--color-stone-900)] tracking-[-0.015em] mt-4 truncate">
              {bathroomDisplayNames[i] ||
                b.name ||
                formatDictionaryString(dict.accommodation.bathroomFallback, {
                  n: i + 1,
                })}
            </p>
            <p className="text-[13px] text-[var(--color-stone-500)] mt-1.5 leading-relaxed">
              {getBathroomTypeLabel(b.type, locale)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
