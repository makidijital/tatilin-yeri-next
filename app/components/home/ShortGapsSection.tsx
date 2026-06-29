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
    <section id="kisa-sureli-firsatlar" className="scroll-mt-24 md:scroll-mt-28 px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-14 md:pb-20 bg-gradient-to-b from-[#f5f7fa] to-[#e8eef6]">
      <div className="max-w-[1280px] mx-auto">
        <div className="text-center mb-8 md:mb-12">
          <h2 className="font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] leading-tight tracking-[-0.02em]">
            Kısa Süreli Fırsatlar
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {months.map((m) => (
            <div
              key={m.bucketMonth}
              className="rounded-2xl border border-white/10 p-5 bg-gradient-to-br from-[#0B1F3A] to-[#132A46] shadow-[0_18px_40px_-22px_rgba(11,31,58,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] hover:shadow-[0_26px_52px_-22px_rgba(11,31,58,0.65),0_0_0_1px_rgba(2, 170, 229,0.25),0_12px_30px_-12px_rgba(2, 170, 229,0.22)] hover:-translate-y-[3px] hover:border-[var(--brand-coral)]/30 transition-[transform,box-shadow,border-color] duration-300 motion-reduce:transition-none"
            >
              <div className="flex items-center gap-2.5 mb-4">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--brand-coral)] to-[var(--brand-coral-deep)] text-white shadow-[0_6px_16px_-6px_rgba(2, 170, 229,0.5)] shrink-0">
                  <CalendarRange className="w-4 h-4" />
                </span>
                <h3 className="font-display font-medium text-[16px] text-white tracking-[-0.01em]">
                  {m.label}
                </h3>
              </div>
              <ul className="flex flex-col gap-0.5">
                {SHORT_GAP_NIGHTS.map((nights) => {
                  const count = m.counts.get(nights) ?? 0;
                  if (count <= 0) return null;
                  return (
                    <li key={nights}>
                      <Link
                        href={`/kisa-sureli-tarihler/${m.slug}/${nights}`}
                        className="group flex items-center justify-between rounded-xl px-3 py-2.5 -mx-1 hover:bg-white/[0.06] transition-colors"
                      >
                        <span className="text-[13.5px] text-white/75 group-hover:text-white transition-colors">
                          {nights} gecelik villalar
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium tabular-nums">
                          <span className="px-1.5 py-0.5 rounded-md bg-[var(--brand-coral)]/15 text-[var(--brand-coral)] leading-none">
                            {count}
                          </span>
                          <ArrowUpRight className="w-3.5 h-3.5 text-white/40 group-hover:text-[var(--brand-coral)] transition-colors" />
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
