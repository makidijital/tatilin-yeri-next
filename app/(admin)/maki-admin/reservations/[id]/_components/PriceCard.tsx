/* ===============================================================
   📦 Reservation Detail — PriceCard (Adım 4: Fiyat bilgisi)
   ===============================================================
   FAZ 2 refactor: JSX byte-identical _components/'a taşındı.

   ⚠️ KRİTİK BUSINESS LOGIC (page.tsx'te kalır):
     - handleCustomPriceToggle: custom_price ON/OFF + inline
       calculateGrandTotal recalc (toggle OFF branch). 130 satırlık
       complex flow — bilinçli olarak page.tsx'te tutuldu. FAZ 4'te
       _helpers/handleCustomPriceToggle.ts'e taşınacak.
     - handleCustomPriceAmountChange: total_price_try input change
       sonrası prepayment + remaining recalc. paid_amount KORUNUR.
     - handleCustomPriceNoteChange: setData functional update inline.

   Burada YOK:
     - calculateGrandTotal çağrısı
     - prepayment hesabı
     - multi-currency derivation
     - cleaning_fee resolution

   3 alt görünüm:
     1) Custom price ON  → total input + note + custom summary
     2) Custom price OFF → read-only total + price breakdown rows +
                            multi-currency cards (3-col grid)
     3) Damage deposit info (her zaman)
=============================================================== */

import {
  shouldDisplayDamageDeposit,
  formatDamageDepositTRY,
  DAMAGE_DEPOSIT_NOTE,
} from "@/lib/damage-deposit.helper";

import Section from "./Section";
import Label from "./Label";
import Row from "./Row";

export default function PriceCard({
  data,
  setData,
  priceDetail,
  paymentDisplay,
  paymentDisplayPayNowLabel,
  onCustomPriceToggle,
  onCustomPriceAmountChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setData: (updater: (prev: any) => any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  priceDetail: Record<string, any> | null;
  paymentDisplay: {
    payNow: number;
    remainingOnArrival: number;
    isFullPayment: boolean;
  };
  paymentDisplayPayNowLabel: string;
  /* Custom price toggle — 130-satır business logic page.tsx'te.
     Bu prop sadece tetikleyici; logic burada YOK. */
  onCustomPriceToggle: () => void;
  /* Custom price amount input onChange — prepayment + remaining
     recalc page.tsx'te. */
  onCustomPriceAmountChange: (newValue: number) => void;
}) {
  return (
    <Section
      eyebrow="Fiyat"
      title="Fiyat bilgisi"
      subtitle="Sezon fiyatlarına göre otomatik hesaplanır"
    >
      {/* 🔥 CUSTOM PRICE TOGGLE */}
      <div className="flex items-center justify-between bg-[var(--color-sand-50)] border border-[var(--color-sand-100)] rounded-2xl px-4 py-3 mb-4">
        <div>
          <p className="text-sm font-medium text-[var(--color-stone-900)]">
            Özel fiyat kullan
          </p>
          <p className="text-xs text-[var(--color-stone-500)] mt-0.5">
            Açıkken: tarih değişse bile yeniden hesaplama yapılmaz
          </p>
        </div>
        <button
          type="button"
          onClick={onCustomPriceToggle}
          className={`relative w-11 h-6 rounded-full transition shrink-0 ${
            data.custom_price
              ? "bg-[var(--color-champagne-500)]"
              : "bg-[var(--color-stone-200)]"
          }`}
          aria-label="Özel fiyat aç/kapa"
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
              data.custom_price ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      {/* 🔥 CUSTOM PRICE BLOCK */}
      {data.custom_price && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Özel toplam tutar (TRY)</Label>
            <input
              type="number"
              value={data.total_price_try || data.total_price || 0}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                // 🔥 Custom price recalculation:
                // total_price_try güncellenince
                // prepayment_amount + remaining_payment yenilenir.
                // paid_amount KORUNUR. (Logic page.tsx'te.)
                onCustomPriceAmountChange(v);
              }}
              className="input"
              min={0}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Özel fiyat notu</Label>
            <textarea
              value={data.custom_price_note || ""}
              onChange={(e) =>
                /* 🛡️ FUNCTIONAL UPDATE (Faz 3A) */
                setData((prev) => ({
                  ...prev,
                  custom_price_note: e.target.value,
                }))
              }
              placeholder="Bu fiyatın nedeni (opsiyonel)"
              className="input !rounded-2xl !p-4 min-h-[100px] resize-none"
            />
          </div>

          {/* CUSTOM SUMMARY */}
          <div className="bg-[var(--color-sand-50)] border border-[var(--color-sand-100)] rounded-2xl p-5 space-y-3 text-sm">
            <div className="border-t border-[var(--color-sand-100)] pt-3 flex justify-between text-[var(--color-stone-900)] font-semibold text-base">
              <span>Toplam</span>
              <span className="font-display text-lg">
                ₺
                {Number(data.total_price_try || 0).toLocaleString("tr-TR", {
                  maximumFractionDigits: 0,
                })}
              </span>
            </div>

            {/* PAY NOW — payment_preference dinamik (helper) */}
            <div className="flex justify-between text-[var(--color-champagne-700)] font-semibold">
              <span>{paymentDisplayPayNowLabel}</span>
              <span>
                ₺
                {Number(paymentDisplay.payNow).toLocaleString("tr-TR", {
                  maximumFractionDigits: 0,
                })}
              </span>
            </div>

            {/* KALAN — paid_amount bazlı accounting (DEĞİŞMEDİ) */}
            <div className="flex justify-between text-xs text-[var(--color-stone-500)]">
              <span>Kalan (toplam − ödenen)</span>
              <span>
                ₺
                {Math.max(
                  Number(data.total_price_try || 0) -
                    Number(data.paid_amount || 0),
                  0
                ).toLocaleString("tr-TR", {
                  maximumFractionDigits: 0,
                })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 🔥 NORMAL FLOW */}
      {!data.custom_price && (
        <>
          {/* 🔥 READ-ONLY TOTAL — pricing engine üretir */}
          <div className="space-y-1.5">
            <Label>Toplam tutar (TRY)</Label>
            <div className="input bg-[var(--color-sand-50)] text-[var(--color-stone-700)] flex items-center justify-between cursor-not-allowed select-none">
              <span>
                ₺
                {Number(
                  data.total_price_try || data.total_price || 0
                ).toLocaleString("tr-TR", {
                  maximumFractionDigits: 0,
                })}
              </span>
              <span className="text-[10px] tracking-[0.12em] uppercase text-[var(--color-stone-400)]">
                Otomatik
              </span>
            </div>
          </div>

          {priceDetail && (
            <div className="bg-[var(--color-sand-50)] border border-[var(--color-sand-100)] rounded-2xl p-5 space-y-3 text-sm mt-4">
              {/* EXTRA INFO */}
              {(data.exchange_rate > 1 ||
                data.original_currency !== "TRY" ||
                data.original_cleaning_currency !== "TRY") && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                  {/* ORJINAL TOPLAM */}
                  {data.original_price > 0 &&
                    data.original_currency !== "TRY" && (
                      <div className="rounded-2xl border border-[var(--color-champagne-200)] bg-[var(--color-champagne-50)] px-4 py-4 shadow-sm">
                        <div className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[var(--color-champagne-700)]">
                          Orijinal Toplam
                        </div>

                        <div className="mt-2 text-[var(--color-stone-900)] font-bold text-xl">
                          {Number(data.original_price || 0).toLocaleString(
                            "tr-TR",
                            { maximumFractionDigits: 0 }
                          )}{" "}
                          {data.original_currency}
                        </div>

                        <div className="text-xs text-[var(--color-stone-500)] mt-1">
                          Rezervasyon anındaki döviz toplamı
                        </div>
                      </div>
                    )}

                  {/* ORJINAL TEMIZLIK */}
                  {data.original_cleaning_fee > 0 &&
                    data.original_cleaning_currency !== "TRY" && (
                      <div className="rounded-2xl border border-[var(--color-sand-200)] bg-[var(--color-sand-100)] px-4 py-4 shadow-sm">
                        <div className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[var(--color-stone-600)]">
                          Orijinal Temizlik
                        </div>

                        <div className="mt-2 text-[var(--color-stone-900)] font-bold text-xl">
                          {Number(
                            data.original_cleaning_fee || 0
                          ).toLocaleString("tr-TR", {
                            maximumFractionDigits: 0,
                          })}{" "}
                          {data.original_cleaning_currency}
                        </div>

                        <div className="text-xs text-[var(--color-stone-500)] mt-1">
                          Döviz bazlı temizlik ücreti
                        </div>
                      </div>
                    )}

                  {/* KUR */}
                  {data.exchange_rate > 1 && (
                    <div className="rounded-2xl border border-[var(--color-stone-200)] bg-white px-4 py-4 shadow-sm">
                      <div className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[var(--color-stone-500)]">
                        Kur Sabitlendi
                      </div>

                      <div className="mt-2 text-[var(--color-stone-900)] font-bold text-xl">
                        {Number(data.exchange_rate || 0).toFixed(2)}
                      </div>

                      <div className="text-xs text-[var(--color-stone-500)] mt-1">
                        Rezervasyon anındaki kur
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Row label="Gece" value={`${priceDetail.nights} gece`} />

              {/* KONAKLAMA */}
              <Row
                label="Konaklama"
                value={`₺${Number(
                  (data.total_price_try || 0) - (data.cleaning_fee_try || 0)
                ).toLocaleString("tr-TR", {
                  maximumFractionDigits: 0,
                })}`}
              />

              {/* TEMİZLİK */}
              {priceDetail.cleaning > 0 && (
                <Row
                  label="Temizlik"
                  value={
                    data.original_cleaning_currency !== "TRY"
                      ? `₺${Number(data.cleaning_fee_try || 0).toLocaleString(
                          "tr-TR",
                          { maximumFractionDigits: 0 }
                        )}`
                      : `₺${Number(priceDetail.cleaning || 0).toLocaleString(
                          "tr-TR",
                          { maximumFractionDigits: 0 }
                        )}`
                  }
                />
              )}

              {/* TOTAL */}
              <div className="border-t border-[var(--color-sand-100)] pt-3 flex justify-between text-[var(--color-stone-900)] font-semibold text-base">
                <span>Toplam</span>

                <span className="font-display text-lg">
                  ₺
                  {Number(data.total_price_try || 0).toLocaleString("tr-TR", {
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>

              {/* PAY NOW — payment_preference dinamik (helper)
                  full_payment → toplam, prepayment → ön ödeme */}
              <div className="flex justify-between text-[var(--color-champagne-700)] font-semibold">
                <span>{paymentDisplayPayNowLabel}</span>
                <span>
                  ₺
                  {Number(paymentDisplay.payNow).toLocaleString("tr-TR", {
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>

              {/* REMAINING ON ARRIVAL — full_payment'ta ₺0 */}
              <div className="flex justify-between text-xs text-[var(--color-stone-500)]">
                <span>
                  {paymentDisplay.isFullPayment ? "Kalan" : "Girişte ödenecek"}
                </span>
                <span>
                  ₺
                  {Number(paymentDisplay.remainingOnArrival).toLocaleString(
                    "tr-TR",
                    { maximumFractionDigits: 0 }
                  )}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* 🔥 DAMAGE DEPOSIT — readonly info kartı; accounting'e dahil değil
          Snapshot reservations.damage_deposit'ten okunur */}
      {shouldDisplayDamageDeposit(data?.damage_deposit) && (
        <div className="mt-4 rounded-2xl border border-[var(--color-stone-100)] bg-white px-4 py-3">
          <p className="text-[11px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)]">
            Hasar Depozitosu
          </p>
          <p className="font-display text-lg text-[var(--color-stone-900)] mt-1 tabular-nums">
            {formatDamageDepositTRY(data?.damage_deposit)}
          </p>
          <p className="text-[11px] text-[var(--color-stone-500)] mt-1">
            {DAMAGE_DEPOSIT_NOTE}
          </p>
        </div>
      )}
    </Section>
  );
}
