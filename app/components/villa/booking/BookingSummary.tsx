"use client";

/* ===============================================================
   🛡️ BookingSummary — fiyat özet kartı
   ===============================================================
   PURE UI: BookingSidebar'daki "SUMMARY" bloğunun birebir karşılığı.
   Sidebar ve modal AYNI bu component'i kullanır.

   BYTE-IDENTICAL KONTRAT (BookingSidebar pre-refactor ile):
     - className string'leri
     - Row order (Gece → Konaklama → Ekstra temizlik → Hasar depo →
       Toplam → Ön ödeme → Girişte ödenecek)
     - formatCurrency çağrı semantic'i
     - Conditional render kuralları (result.cleaning > 0; deposit > 0)
   =============================================================== */

import { formatCurrency } from "@/lib/currency";
import { useCurrency } from "@/app/context/CurrencyContext";

import type { BookingResult } from "./useBookingEngine";

type Props = {
  result: BookingResult;
  prepayment: number;
  prepaymentRate: number;
  convertedDeposit: number;
  deposit: number;
};

export default function BookingSummary({
  result,
  prepayment,
  prepaymentRate,
  convertedDeposit,
  deposit,
}: Props) {
  const { currency } = useCurrency();

  return (
    <div className="bg-[var(--color-sand-50)] border border-[var(--color-sand-100)] rounded-2xl p-4 space-y-2.5 text-sm">
      <Row label="Gece" value={`${result.nights} gece`} />
      <Row
        label="Konaklama"
        value={formatCurrency(result.stay, currency)}
      />
      {result.cleaning > 0 && (
        <Row
          label="Ekstra temizlik"
          value={formatCurrency(result.cleaning, currency)}
        />
      )}
      {deposit > 0 && (
        <Row
          label="Hasar depozitosu"
          value={formatCurrency(convertedDeposit, currency)}
        />
      )}

      <div className="border-t border-[var(--color-sand-100)] pt-3 flex justify-between text-[var(--color-stone-900)] font-semibold text-base">
        <span>Toplam</span>
        <span className="font-display text-lg">
          {formatCurrency(result.total, currency)}
        </span>
      </div>

      <div className="flex justify-between text-[var(--color-champagne-700)] font-semibold">
        <span>Ön ödeme (%{prepaymentRate})</span>
        <span>{formatCurrency(prepayment, currency)}</span>
      </div>

      <div className="flex justify-between text-[var(--color-stone-500)] text-xs">
        <span>Girişte ödenecek</span>
        <span>
          {formatCurrency(result.total - prepayment, currency)}
        </span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[var(--color-stone-600)]">
      <span>{label}</span>
      <span className="text-[var(--color-stone-900)] font-medium">
        {value}
      </span>
    </div>
  );
}
