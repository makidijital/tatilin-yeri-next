"use client";

/* ===============================================================
   🛡️ BookingSummary — fiyat özet kartı
   ===============================================================
   PURE UI: BookingSidebar'daki "SUMMARY" bloğunun birebir karşılığı.
   Sidebar ve modal AYNI bu component'i kullanır.

   KONTRAT (yalnız UI/metin/sıralama/renk):
     - formatCurrency çağrı semantic'i DEĞİŞMEZ (tüm değerler aynı).
     - Conditional render kuralları DEĞİŞMEZ (result.cleaning > 0; deposit > 0).
     - Row order (UI): Konaklama Tutarı (N Gece) → Kısa Süreli Konaklama
       Ücreti → [ayraç] Toplam Tutar (yeşil, vurgulu) → Ön ödeme (mor) /
       Girişte ödenecek (turuncu) — iki ayrı vurgu kutusu → Hasar
       Depozitosu (ayrı, soft bilgi kutusu + açıklama).
     - Hasar depozitosu görsel olarak ayrı; toplama EKLENMEZ (hesap aynı).
     - "Temizlik Ücreti" label'ı "Kısa Süreli Konaklama Ücreti" oldu —
       yalnız görünen metin; `result.cleaning` DEĞİŞMEDİ.

   🛡️ HAVUZ ISITMA — yerleşim turu (yalnız bu tur — data/state/handler/
   hesap DEĞİŞMEDİ):
     - Havuz Isıtma satırı artık BURADA (Kısa Süreli Konaklama Ücreti'nin
       hemen altında, Toplam Tutar'ın hemen üstünde) — daha önce
       BookingSidebar/VillaCardBookingModal'da SUMMARY'nin DIŞINDA, ayrı
       büyük bordered bir kart olarak duruyordu (Misafir alanının altında).
       O kart tamamen kaldırıldı; checkbox + tutar artık normal bir fiyat
       satırı deseninde (Row ile aynı hizada, sol=checkbox+label, sağ=
       seçiliyse toplam).
     - Görünürlük koşulu AYNEN (yalnız taşındı): `poolHeatingFee` sayı ve
       >0. Eskiden ayrıca `startDate&&endDate&&selectedNights>0` de
       kontrol ediliyordu — bu component zaten yalnız `result` mevcutken
       (yani tarih seçili + gece>0) render edildiği için `result.nights>0`
       ile AYNI garantiyi taşır; caller'daki dış koşul DEĞİŞMEDİ.
     - Checked/unchecked state, handler (`onPoolHeatingChange` →
       `setPoolHeatingSelected`), toplam (`poolHeatingTotal` — engine'den,
       YENİDEN hesaplanmadı) BİREBİR aynı; yalnız JSX konumu/görünümü
       değişti.
     - Gecelik oran villa'nın KENDİ para biriminde (`poolHeatingCurrency`)
       gösterilir — eski "Gece başına X" metniyle AYNI kaynak/format.

   🛡️ HAVUZ ISITMA — metin standardizasyonu turu (yalnız bu tur — data/
   state/handler/hesap DEĞİŞMEDİ):
     - Checkbox label'ı "Havuz Isıtma" → "Havuz Isıtma Ücreti" oldu (satır
       hem toplam tutarı hem gecelik oranı gösterdiği için ücret ifade
       eden bir satır — repo genelinde aynı standarda çekildi). Teknik
       prop/field isimleri (`poolHeatingFee`, `poolHeatingSelected`,
       `poolHeatingTotal`, `pool_heating_fee` vb.) DEĞİŞMEDİ.

   🛡️ GÖRSEL REVİZYON (yalnız bu tur — data/state/handler/hesap DEĞİŞMEDİ):
     - Kart üstünde ince turuncu→mavi (#ED7926 → #0973BA) accent çizgisi
       — PriceList.tsx / ShortStayFeeNotice.tsx'teki aynı marka imzası.
     - Toplam Tutar artık yumuşak yeşil zeminli, vurgulu bir satır
       (aynı yeşil semantik renk — yalnız daha belirgin).
     - Ön ödeme / Girişte ödenecek iki ayrı, kendi soft zeminli kutuda
       yan yana (mor / turuncu semantiği AYNEN korunuyor) — "şimdi
       ödenecek" ile "girişte ödenecek" ilk bakışta net ayrışıyor.
     - Hasar Depozitosu artık mavi tonlu, soft bordürlü ayrı bir bilgi
       kutusu + küçük ShieldCheck rozet ikonu (marka mavisi #0973BA).
       Açıklama METNİ BİREBİR AYNI.
     - Tüm değişiklik yalnız JSX/Tailwind class'ları; padding'ler
       mütevazı tutuldu (büyük kart/aşırı boşluk yok), sidebar genişliği
       ve responsive davranış etkilenmedi (dış container aynı).
   =============================================================== */

import { ShieldCheck, Tag } from "lucide-react";

import { formatCurrency } from "@/lib/currency";
import { useCurrency } from "@/app/context/CurrencyContext";
import { formatDateTr } from "@/lib/date-format";

import type { BookingResult, ActiveStayDiscount } from "./useBookingEngine";

type Props = {
  result: BookingResult;
  /* 🛡️ villa_discounts — GÖRSEL GÖSTERİM (UI-only, bkz. useBookingEngine.ts
     doc-comment). null/undefined → seçili aralıkta aktif indirim yok,
     satır AYNEN eskisi gibi (BYTE-IDENTICAL) render edilir. */
  activeStayDiscount?: ActiveStayDiscount | null;
  prepayment: number;
  prepaymentRate: number;
  convertedDeposit: number;
  deposit: number;
  /* 🛡️ HAVUZ ISITMA — yerleşim turu. Hepsi caller'ın zaten sahip olduğu
     engine değerleri (useBookingEngine) — burada YENİ bir hesaplama
     YAPILMAZ, yalnız render edilir. `poolHeatingFee`/`poolHeatingCurrency`
     villa'nın KENDİ (orijinal) gecelik ücreti/para birimi; `poolHeatingTotal`
     engine'in zaten display currency'ye çevirdiği çalışma toplamı. */
  poolHeatingFee?: number | null;
  poolHeatingCurrency?: string | null;
  poolHeatingSelected?: boolean;
  onPoolHeatingChange?: (checked: boolean) => void;
  poolHeatingTotal?: number;
  /* 🛡️ Migration 076 — sezonluk ay kısıtı. Villanın gerçek
     pool_heating_months'una göre rezervasyon tarih aralığı sezon
     dışındaysa checkbox HİÇ GÖSTERİLMEZ. Default true — eski
     caller'lar (varsa) bu prop'u geçmeden BYTE-IDENTICAL davranır
     (checkbox eskisi gibi yalnız fee>0'a bakarak görünür). */
  poolHeatingActiveForRange?: boolean;
};

export default function BookingSummary({
  result,
  activeStayDiscount = null,
  prepayment,
  prepaymentRate,
  convertedDeposit,
  deposit,
  poolHeatingFee = null,
  poolHeatingCurrency = "TRY",
  poolHeatingSelected = false,
  onPoolHeatingChange,
  poolHeatingTotal = 0,
  poolHeatingActiveForRange = true,
}: Props) {
  const { currency } = useCurrency();

  return (
    <div className="relative bg-[var(--color-sand-50)] border border-[var(--color-sand-100)] rounded-2xl p-4 space-y-2.5 text-sm">
      {/* İnce üst accent çizgisi — turuncu → mavi (marka imzası, PriceList
          ile aynı desen). Salt dekoratif; layout/ölçüye etkisi yok. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-4 top-0 h-[2.5px] rounded-full bg-gradient-to-r from-[#ED7926] via-[#ED7926]/50 to-[#0973BA]"
      />

      {/* Konaklama Tutarı — gece sayısı dinamik (Gece satırı kaldırıldı).
          🛡️ villa_discounts — GÖRSEL GÖSTERİM (UI-only). activeStayDiscount
          null ise (indirim yok / veri geçilmedi) satır AYNEN eskisi
          (BYTE-IDENTICAL) — `result.stay` DEĞİŞMEDİ, yalnız render dalı
          değişti. Değerler (originalStay/discountedStay) YENİDEN
          hesaplanmıyor — activeStayDiscount zaten price.engine çıktısı
          (bkz. useBookingEngine.ts). */}
      {activeStayDiscount ? (
        <div className="flex items-start justify-between gap-3">
          <span className="text-[var(--color-stone-600)]">
            {`Konaklama Tutarı (${result.nights} Gece)`}
          </span>
          <div className="text-right">
            <div className="flex items-center justify-end gap-2">
              <span className="text-[11px] text-[var(--color-stone-400)] line-through tabular-nums">
                {formatCurrency(activeStayDiscount.originalStay, currency)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#ED7926]/10 px-2 py-0.5 text-[10px] font-semibold text-[#ED7926] tracking-wide whitespace-nowrap">
                <Tag size={9} strokeWidth={2.2} aria-hidden />
                {activeStayDiscount.discount.discount_type === "percent"
                  ? `%${activeStayDiscount.discount.discount_value} İNDİRİM`
                  : "ÖZEL FİYAT"}
              </span>
            </div>
            <span className="text-[var(--color-stone-900)] font-medium tabular-nums">
              {formatCurrency(activeStayDiscount.discountedStay, currency)}
            </span>
          </div>
        </div>
      ) : (
        <Row
          label={`Konaklama Tutarı (${result.nights} Gece)`}
          value={formatCurrency(result.stay, currency)}
        />
      )}

      {/* İndirim tarih kapsamı — kullanıcı indirimin GERÇEKTEN hangi
          tarih aralığında geçerli olduğunu görsün (yalnız bilgi metni;
          hesaplamaya dahil DEĞİL). */}
      {activeStayDiscount && (
        <p className="-mt-1.5 text-[11px] text-[#0973BA]">
          {formatDateTr(activeStayDiscount.discount.start_date)} –{" "}
          {formatDateTr(activeStayDiscount.discount.end_date)} arası geçerli
          indirim · {formatCurrency(
            activeStayDiscount.originalStay - activeStayDiscount.discountedStay,
            currency
          )}{" "}
          tasarruf
        </p>
      )}
      {result.cleaning > 0 && (
        <Row
          label="Kısa Süreli Konaklama Ücreti"
          value={formatCurrency(result.cleaning, currency)}
        />
      )}

      {/* HAVUZ ISITMA — normal fiyat satırı (Row ile aynı hizada);
          ayrı bordered kart YOK. Checkbox solda label ile birlikte;
          sağda yalnız SEÇİLİYSE toplam görünür. Görünürlük: fee sayı
          ve >0 (result mevcut olduğu için nights>0 zaten garanti). */}
      {typeof poolHeatingFee === "number" &&
        poolHeatingFee > 0 &&
        poolHeatingActiveForRange && (
        <div>
          <label className="flex items-center justify-between gap-3 cursor-pointer group">
            <span className="flex items-center gap-2.5 min-w-0">
              <input
                type="checkbox"
                checked={poolHeatingSelected}
                onChange={(e) => onPoolHeatingChange?.(e.target.checked)}
                className="!w-4 !h-4 shrink-0 accent-[var(--color-champagne-500)] !rounded"
              />
              <span className="text-[var(--color-stone-600)] group-hover:text-[var(--color-stone-900)] transition-colors">
                Havuz Isıtma Ücreti
              </span>
            </span>
            {poolHeatingSelected && (
              <span className="text-[var(--color-stone-900)] font-medium tabular-nums">
                {formatCurrency(poolHeatingTotal, currency)}
              </span>
            )}
          </label>
          <p className="pl-[26px] mt-0.5 text-[11px] text-[var(--color-stone-400)]">
            {formatCurrency(poolHeatingFee, poolHeatingCurrency || "TRY")} / gece
            {poolHeatingSelected && ` × ${result.nights} gece`}
          </p>
        </div>
      )}

      {/* TOPLAM TUTAR — yeşil, yumuşak zeminle vurgulu */}
      <div className="border-t border-[var(--color-sand-100)] pt-3">
        <div className="flex items-center justify-between rounded-xl bg-green-50/70 px-3 py-2.5">
          <span className="font-semibold text-green-800">Toplam Tutar</span>
          <span className="font-display text-lg font-bold text-green-700 tabular-nums">
            {formatCurrency(result.total, currency)}
          </span>
        </div>
      </div>

      {/* ÖN ÖDEME (mor) + GİRİŞTE ÖDENECEK (turuncu) — iki ayrı vurgu
          kutusu, yan yana: "şimdi" ile "girişte" ilk bakışta ayrışsın. */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-purple-100 bg-purple-50/60 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-500">
            Ön ödeme (%{prepaymentRate})
          </p>
          <p className="mt-0.5 font-display text-base font-bold text-purple-700 tabular-nums">
            {formatCurrency(prepayment, currency)}
          </p>
        </div>
        <div className="rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500">
            Girişte ödenecek
          </p>
          <p className="mt-0.5 font-display text-base font-bold text-orange-600 tabular-nums">
            {formatCurrency(result.total - prepayment, currency)}
          </p>
        </div>
      </div>

      {/* HASAR DEPOZİTOSU — ayrı, soft mavi tonlu bilgi kutusu (toplama
          dahil değil, hesap aynı). Açıklama metni BİREBİR AYNI. */}
      {deposit > 0 && (
        <div className="rounded-xl border border-[#0973BA]/15 bg-[#0973BA]/[0.04] p-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-stone-900)]">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#0973BA]/10 text-[#0973BA]">
                <ShieldCheck size={11} strokeWidth={2} aria-hidden />
              </span>
              Hasar Depozitosu
            </span>
            <span className="font-semibold text-[var(--color-stone-900)] tabular-nums">
              {formatCurrency(convertedDeposit, currency)}
            </span>
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
      <span className="text-[var(--color-stone-900)] font-medium tabular-nums">
        {value}
      </span>
    </div>
  );
}
