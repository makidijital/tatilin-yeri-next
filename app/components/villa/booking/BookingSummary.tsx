"use client";

/* ===============================================================
   🛡️ BookingSummary — fiyat özet kartı
   ===============================================================
   PURE UI: BookingSidebar'daki "SUMMARY" bloğunun birebir karşılığı.
   Sidebar ve modal AYNI bu component'i kullanır.

   KONTRAT (yalnız UI/metin/sıralama/renk):
     - formatCurrency çağrı semantic'i DEĞİŞMEZ (tüm değerler aynı).
     - Conditional render kuralları DEĞİŞMEZ (result.cleaning > 0; deposit > 0).
     - Row order (UI): Konaklama Tutarı (N Gece) → Temizlik Ücreti →
       [ayraç] Toplam Tutar (yeşil) → Ön ödeme (mor) → Girişte ödenecek
       (turuncu) → [ayraç] Hasar Depozitosu (ayrı blok + açıklama).
     - Hasar depozitosu görsel olarak ayrı; toplama EKLENMEZ (hesap aynı).
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
      {/* Konaklama Tutarı — gece sayısı dinamik (Gece satırı kaldırıldı) */}
      <Row
        label={`Konaklama Tutarı (${result.nights} Gece)`}
        value={formatCurrency(result.stay, currency)}
      />
      {result.cleaning > 0 && (
        <Row
          label="Temizlik Ücreti"
          value={formatCurrency(result.cleaning, currency)}
        />
      )}

      {/* TOPLAM TUTAR — yeşil */}
      <div className="border-t border-[var(--color-sand-100)] pt-3 flex justify-between font-semibold text-base text-green-700">
        <span>Toplam Tutar</span>
        <span className="font-display text-lg">
          {formatCurrency(result.total, currency)}
        </span>
      </div>

      {/* ÖN ÖDEME — mor */}
      <div className="flex justify-between text-purple-700 font-semibold">
        <span>Ön ödeme (%{prepaymentRate})</span>
        <span>{formatCurrency(prepayment, currency)}</span>
      </div>

      {/* GİRİŞTE ÖDENECEK — turuncu */}
      <div className="flex justify-between text-orange-600 text-xs">
        <span>Girişte ödenecek</span>
        <span>
          {formatCurrency(result.total - prepayment, currency)}
        </span>
      </div>

      {/* HASAR DEPOZİTOSU — ayrı blok (toplama dahil değil, hesap aynı) */}
      {deposit > 0 && (
        <div className="border-t border-[var(--color-sand-100)] pt-3">
          <div className="flex justify-between text-[var(--color-stone-900)] font-medium">
            <span>Hasar Depozitosu</span>
            <span>{formatCurrency(convertedDeposit, currency)}</span>
          </div>
          <p className="mt-1.5 text-xs text-[var(--color-stone-500)] leading-relaxed">
            Girişte hasar depozitosu ek olarak alınır. Villada herhangi bir
            hasar oluşmaması durumunda çıkışta eksiksiz olarak iade edilir.
          </p>
        </div>
      )}
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
