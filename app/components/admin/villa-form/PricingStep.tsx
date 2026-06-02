import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";

import Section from "./shared/Section";
import Label from "./shared/Label";

import type { VillaFormShape, VillaFormSetter } from "./types";

/* ===============================================================
   🔥 PricingStep — Wizard Adım 4 (Step 4).
   - Üst kısım: PricingCalendarCanvas (slot olarak prop)
   - Alt: Adım 9 → Ekstra ücretler (depozito, temizlik, custom prepayment)

   PricingCanvasSlot prop'u: page tarafında PricingCalendarCanvas
   render edilip slot olarak verilir; component buraya dokunmaz,
   sadece konumlandırır. Logic ve state akışı aynen korunur.

   showCleaningCurrency: edit page'de cleaning_currency dropdown'u
   gösterilir; create page'de henüz yok (default true → edit page
   davranışı; create page bu component'i adopt ederken false geçirir).
   =============================================================== */

export default function PricingStep({
  pricingCanvasSlot,
  form,
  setForm,
  showCleaningCurrency = true,
}: {
  pricingCanvasSlot: ReactNode;
  form: VillaFormShape;
  setForm: VillaFormSetter;
  showCleaningCurrency?: boolean;
}) {
  return (
    <>
      {/* PRICING CANVAS (slot) */}
      {pricingCanvasSlot}

      {/* EXTRA FEES — Adım 9 */}
      <Section
        eyebrow="Adım 9"
        title="Ekstra ücretler"
        subtitle="Ek maliyetleri belirle"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Depozito</Label>
            <input
              type="number"
              placeholder="₺"
              className="input"
              value={form.deposit || ""}
              onChange={(e) =>
                setForm({ ...form, deposit: Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Temizlik ücreti</Label>

            {showCleaningCurrency ? (
              <div className="grid grid-cols-[1fr_120px] gap-2">
                <input
                  type="number"
                  placeholder="Ücret"
                  className="input"
                  value={form.cleaning_fee || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      cleaning_fee: Number(e.target.value),
                    })
                  }
                />

                <select
                  value={form.cleaning_currency || "TRY"}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      cleaning_currency: e.target.value,
                    })
                  }
                  className="input"
                >
                  <option value="TRY">₺ TRY</option>
                  <option value="USD">$ USD</option>
                  <option value="EUR">€ EUR</option>
                  <option value="GBP">£ GBP</option>
                </select>
              </div>
            ) : (
              <input
                type="number"
                placeholder="₺"
                className="input"
                value={form.cleaning_fee || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    cleaning_fee: Number(e.target.value),
                  })
                }
              />
            )}
          </div>
          <div className="space-y-2">
            <Label>Temizlik sınırı</Label>
            <input
              type="number"
              placeholder="örn: 7 gece"
              className="input"
              value={form.cleaning_limit || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  cleaning_limit: Number(e.target.value),
                })
              }
            />
          </div>

          {/* 🔥 CUSTOM PREPAYMENT RATE — villa-level override.
              Aynı 3-col grid içinde; diğer alanlarla vertical
              alignment'ta. Hint metni grid hücresinin altında. */}
          <div className="space-y-2">
            <Label>Özel Ön Ödeme Oranı (%)</Label>
            <input
              type="number"
              min={0}
              max={100}
              placeholder="örn: 30"
              className="input"
              value={form.custom_prepayment_rate ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  custom_prepayment_rate: e.target.value,
                })
              }
            />
            <p className="text-[11px] text-[var(--color-stone-400)]">
              Boş bırakılırsa genel ayarlardaki oran kullanılır.
            </p>
          </div>
        </div>
        <p className="text-xs text-[var(--color-stone-400)] mt-3">
          Temizlik ücreti, belirlenen gece sayısının altındaki
          rezervasyonlarda uygulanır.
        </p>

        {/* ═══════════════════════════════════════════════════════
            🛡️ FAZ 26C — MİNİMUM KONAKLAMA
            ═══════════════════════════════════════════════════════
            Premium luxury kart; "Ekstra ücretler" Section'ı içinde,
            mevcut 3-col grid'in altında ayrı bir blok.

            Reservation/policy davranışı — pool/map/general info
            ile aynı kategori değil; ekstra ücretler ile aynı kart
            grubunda.

            STATE: form.minimum_stay_nights (number | null)
            NORMALIZE onChange:
              - "" → null  (boş = enforcement yok)
              - NaN / <=0 → null
              - >=1 → Math.floor(Math.max(1, n))
            UI: number input + "Gece" suffix
            FRONTEND ENFORCEMENT: BookingSidebar (Faz 26B).
            ═══════════════════════════════════════════════════════ */}
        <div
          className="
            mt-5 rounded-2xl border border-[var(--color-stone-200)]
            bg-white px-4 py-4 md:px-5 md:py-5
            hover:border-[var(--color-champagne-300)]
            transition-colors motion-reduce:transition-none
          "
        >
          <div className="flex items-center gap-4 flex-wrap">
            <span
              className="
                w-10 h-10 shrink-0 rounded-xl
                bg-[var(--color-sand-50)]
                border border-[var(--color-stone-100)]
                flex items-center justify-center
                text-[var(--color-champagne-600)]
              "
              aria-hidden
            >
              <CalendarDays size={17} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--color-stone-500)]">
                Minimum Konaklama
              </p>
              <p className="font-display text-[15px] md:text-[16px] text-[var(--color-stone-900)] mt-0.5 tracking-[-0.01em]">
                Minimum gece sayısı
              </p>
              <p className="text-[11.5px] text-[var(--color-stone-500)] mt-1 leading-snug">
                Misafirin seçebileceği minimum konaklama süresi.
                Boş bırakırsan sınırlama uygulanmaz.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                placeholder="3"
                aria-label="Minimum gece sayısı"
                className="input !w-20 text-center tabular-nums"
                value={
                  form.minimum_stay_nights === null ||
                  form.minimum_stay_nights === undefined
                    ? ""
                    : String(form.minimum_stay_nights)
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setForm({ ...form, minimum_stay_nights: null });
                    return;
                  }
                  const n = Number(raw);
                  if (!Number.isFinite(n) || n <= 0) {
                    setForm({ ...form, minimum_stay_nights: null });
                    return;
                  }
                  setForm({
                    ...form,
                    minimum_stay_nights: Math.max(1, Math.floor(n)),
                  });
                }}
              />
              <span className="text-[12px] tracking-[0.14em] uppercase font-medium text-[var(--color-stone-500)]">
                Gece
              </span>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
