import Link from "next/link";
import { CalendarRange, ArrowUpRight } from "lucide-react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SHORT_GAP_NIGHTS,
  bucketMonthLabelTr,
  bucketMonthToSlug,
} from "@/lib/short-gaps.helpers";

/* ===============================================================
   🛡️ KISA SÜRELİ TARİHLER — ANA SAYFA SECTION (server component)
   ===============================================================
   Mevcut homepage section paterni (CategoryCollection/LocationCollection):
     - Server-only render, kendi verisini çeker (get_short_gap_counts RPC).
     - Veri yoksa null döner → layout sessizce gizlenir (CLS yok).
     - Hiçbir mevcut sistemi etkilemez; salt-okuma.

   SAYI = DISTINCT villa sayısı (RPC count(DISTINCT villa_id)).
   minimum_stay_nights KULLANILMAZ.
   =============================================================== */

type GapCountRow = {
  bucket_month: string;
  gap_nights: number;
  villa_count: number;
};

type MonthGroup = {
  bucketMonth: string;
  label: string;
  slug: string;
  counts: Map<number, number>; // gap_nights → villa_count
};

export default async function ShortGapsSection() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_short_gap_counts");
  if (error || !Array.isArray(data) || data.length === 0) return null;

  /* Ay bazında grupla (RPC zaten bucket_month, gap_nights sıralı döner). */
  const byMonth = new Map<string, MonthGroup>();
  for (const row of data as GapCountRow[]) {
    const bm = String(row.bucket_month);
    const nights = Number(row.gap_nights);
    const count = Number(row.villa_count);
    if (!bm || count <= 0) continue;

    let group = byMonth.get(bm);
    if (!group) {
      group = {
        bucketMonth: bm,
        label: bucketMonthLabelTr(bm),
        slug: bucketMonthToSlug(bm),
        counts: new Map(),
      };
      byMonth.set(bm, group);
    }
    group.counts.set(nights, count);
  }

  const months = Array.from(byMonth.values()).filter(
    (m) => m.label && m.slug && m.counts.size > 0
  );
  if (months.length === 0) return null;

  return (
    <section className="px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-4 md:pb-10">
      <div className="max-w-[1280px] mx-auto">
        <div className="max-w-xl mb-8 md:mb-12">
          <p className="text-[10.5px] tracking-[0.28em] uppercase font-medium inline-flex items-center text-[var(--brand-coral)]">
            <span className="inline-block w-6 h-px align-middle mr-3 bg-[var(--brand-coral)]/60" />
            Kısa Süreli Tarihler
          </p>
          <h2 className="font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] mt-3 leading-tight tracking-[-0.02em]">
            Takvimdeki kısa boşluklar
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-stone-500)] max-w-md">
            Dolu tarihler arasında kalan 2–6 gecelik fırsatlar. Aradığınız
            kısa kaçamak için uygun villaları keşfedin.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          {months.map((m) => (
            <div
              key={m.bucketMonth}
              className="rounded-2xl border border-[var(--color-stone-200)] bg-white p-5 md:p-6"
            >
              <div className="flex items-center gap-2 mb-4">
                <CalendarRange className="w-4 h-4 text-[var(--brand-coral)]" />
                <h3 className="font-display font-medium text-[17px] text-[var(--color-stone-900)]">
                  {m.label}
                </h3>
              </div>
              <ul className="flex flex-col gap-1">
                {SHORT_GAP_NIGHTS.map((nights) => {
                  const count = m.counts.get(nights) ?? 0;
                  if (count <= 0) return null;
                  return (
                    <li key={nights}>
                      <Link
                        href={`/kisa-sureli-tarihler/${m.slug}/${nights}`}
                        className="group flex items-center justify-between rounded-lg px-3 py-2 -mx-1 hover:bg-[var(--color-stone-50)] transition-colors"
                      >
                        <span className="text-[14px] text-[var(--color-stone-700)]">
                          {nights} gecelik villalar
                        </span>
                        <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--color-stone-900)]">
                          ({count})
                          <ArrowUpRight className="w-3.5 h-3.5 text-[var(--color-stone-400)] group-hover:text-[var(--brand-coral)] transition-colors" />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
