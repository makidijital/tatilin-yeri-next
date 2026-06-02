import { formatHeroDate } from "./format-date";

import type { FilterOption } from "../_types/hero";

/* ===============================================================
   🛡️ FAZ 2 — buildHeroSearchParams (PURE)
   ===============================================================
   Eski Hero.tsx içinde `handleSearch` içinde inline yazılı
   URLSearchParams build mantığının BYTE-IDENTICAL kopyası.
   `router.push` çağrısı caller'da kalır; helper sadece query
   string'i üretir.

   ⚠️ KESIN KURAL — canonical param adları:
     - "villa-turleri"  (categories tokens)
     - "bolgeler"       (regions tokens)
     - "start"          (start_date)
     - "end"            (end_date)
     - "guests"         (guests count)

   ⚠️ KESIN KURAL — slug-preferred fallback chain:
     tokens = ids.map(id => {
       const opt = options.find(o => o.id === id);
       return (opt?.slug && String(opt.slug).trim()) || id;
     });
   Sıra: opt.slug → trim non-empty → fallback id. Eski davranış aynen.

   PURE: input alır, URLSearchParams'ın toString() çıktısı döner.
   `router.push(\`/arama?${result}\`)` caller'da.
=============================================================== */

export type BuildHeroSearchParamsInput = {
  categories: string[];
  regions: string[];
  startDate: Date | null;
  endDate: Date | null;
  guests: number;
  categoryOptions: FilterOption[];
  regionOptions: FilterOption[];
};

export function buildHeroSearchParams(
  input: BuildHeroSearchParamsInput
): string {
  const {
    categories,
    regions,
    startDate,
    endDate,
    guests,
    categoryOptions,
    regionOptions,
  } = input;

  const params = new URLSearchParams();
  if (categories.length) {
    const tokens = categories.map((id) => {
      const opt = categoryOptions.find((o) => o.id === id);
      return (opt?.slug && String(opt.slug).trim()) || id;
    });
    params.set("villa-turleri", tokens.join(","));
  }
  if (regions.length) {
    const tokens = regions.map((id) => {
      const opt = regionOptions.find((o) => o.id === id);
      return (opt?.slug && String(opt.slug).trim()) || id;
    });
    params.set("bolgeler", tokens.join(","));
  }
  if (startDate) params.set("start", formatHeroDate(startDate));
  if (endDate) params.set("end", formatHeroDate(endDate));
  if (guests) params.set("guests", guests.toString());

  return params.toString();
}
