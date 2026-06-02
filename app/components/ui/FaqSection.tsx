"use client";

import { useState } from "react";
import { Plus, Minus, Sparkles } from "lucide-react";

/* ===============================================================
   🛡️ FaqSection — Luxury hospitality accordion (Faz 25)
   ===============================================================
   Anasayfa global SSS section'ı. Tek seferde 1 item açık;
   smooth height transition (grid-rows trick, layout-thrash yok).

   PALETTE: Faz 18 Mediterranean resort tokens:
     - aqua (cyan) primary accent
     - coral sunset secondary
     - champagne legacy korunmuş (cyan değerinde)
   Section bg: subtle aqua/coral ambient (existing body radial
   ile uyumlu).

   SSR-SAFE:
     - Outer section render server'da statik HTML
     - Bu component "use client" — yalnız accordion state için
     - faqs prop SSR'da gönderilir; hydration mismatch yok

   PERFORMANCE:
     - Tek useState (openIndex: number | null)
     - Smooth transition CSS grid-rows-[0fr→1fr] (height auto
       animation without measuring) → layout-thrash yok
     - JS minimal: tıklama → state toggle, sadece
   =============================================================== */

type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

export default function FaqSection({ faqs }: { faqs: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!faqs || faqs.length === 0) return null;

  return (
    <section
      aria-labelledby="faq-heading"
      className="
        relative px-5 md:px-10 lg:px-16 py-14 md:py-20
        border-t border-[var(--color-stone-100)]
      "
    >
      {/* Subtle ambient bg — Mediterranean cyan + coral */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgb(34 211 238 / 0.05) 0%, transparent 60%), radial-gradient(ellipse 50% 35% at 50% 100%, rgb(255 138 85 / 0.04) 0%, transparent 60%)",
        }}
      />

      <div className="relative max-w-3xl mx-auto">
        {/* 🛡️ FAZ 39M — Normalized section header. */}
        <div className="text-center mb-8 md:mb-12">
          <p className="text-[10.5px] tracking-[0.28em] uppercase font-medium inline-flex items-center gap-2 text-[var(--brand-coral)]">
            <Sparkles
              size={11}
              className="text-[var(--brand-coral)]"
              aria-hidden
            />
            Yardım Merkezi
          </p>
          <h2
            id="faq-heading"
            className="font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] mt-3 leading-tight tracking-[-0.02em]"
          >
            Sık sorulan sorular.
          </h2>
          <p className="text-[14px] text-[var(--color-stone-500)] mt-3 max-w-md mx-auto leading-relaxed">
            Tatil planlamadan rezervasyona, ödemeden konaklamaya — en
            çok merak edilenleri sizin için derledik.
          </p>
        </div>

        {/* ACCORDION */}
        <div className="space-y-3 md:space-y-3.5">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <article
                key={faq.id}
                className={`
                  rounded-2xl bg-white
                  transition-all duration-300 motion-reduce:transition-none
                  ${
                    isOpen
                      ? "border border-[var(--color-champagne-300)] shadow-[0_12px_32px_-16px_rgb(6_182_212_/_0.28)]"
                      : "border border-[var(--color-stone-100)] hover:border-[var(--color-champagne-300)] hover:shadow-[0_8px_20px_-12px_rgb(27_26_23/0.08)]"
                  }
                `}
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${idx}`}
                  id={`faq-button-${idx}`}
                  className="
                    w-full flex items-start gap-4
                    px-5 py-4 md:px-6 md:py-5
                    text-left
                    focus:outline-none focus-visible:ring-2
                    focus-visible:ring-[var(--color-champagne-500)]/40
                    rounded-2xl
                  "
                >
                  <span
                    className={`
                      w-8 h-8 shrink-0 rounded-full
                      flex items-center justify-center
                      transition-colors motion-reduce:transition-none
                      ${
                        isOpen
                          ? "bg-[var(--color-champagne-500)] text-white"
                          : "bg-[var(--color-sand-50)] border border-[var(--color-stone-100)] text-[var(--color-champagne-600)]"
                      }
                    `}
                    aria-hidden
                  >
                    {isOpen ? <Minus size={14} /> : <Plus size={14} />}
                  </span>
                  <span className="flex-1 min-w-0 font-display text-[16px] md:text-[18px] text-[var(--color-stone-900)] leading-snug tracking-[-0.015em] mt-1">
                    {faq.question}
                  </span>
                </button>

                {/* 🛡️ Smooth height animation — CSS grid-rows trick:
                       grid-rows-[0fr] → [1fr] auto height animate
                       without measuring (no layout-thrash).
                       Inside an overflow-hidden wrapper. */}
                <div
                  id={`faq-panel-${idx}`}
                  role="region"
                  aria-labelledby={`faq-button-${idx}`}
                  className={`
                    grid transition-[grid-template-rows] duration-300 ease-out
                    motion-reduce:transition-none
                    ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}
                  `}
                >
                  <div className="overflow-hidden">
                    <div className="px-5 md:px-6 pb-5 md:pb-6 pl-[68px] md:pl-[76px]">
                      <p className="text-[14px] md:text-[15px] text-[var(--color-stone-600)] leading-[1.75] whitespace-pre-line">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
