"use client";

import { useState } from "react";
import { Plus, Minus, HelpCircle } from "lucide-react";

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
      id="sss"
      aria-labelledby="faq-heading"
      className="
        scroll-mt-24 md:scroll-mt-28
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
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgb(2 170 229 / 0.05) 0%, transparent 60%), radial-gradient(ellipse 50% 35% at 50% 100%, rgb(2 170 229 / 0.04) 0%, transparent 60%)",
        }}
      />

      {/* Basliksiz premium kompozisyon - "Tatiliniz Icin Oneriler" stray
             heading kaldirildi (section'in accessible name'i zaten
             aria-labelledby="faq-heading" uzerinden asagidaki "Sikca Sorulan
             Sorular" basligindan geliyor - SEO/a11y etkilenmez). Alttaki iki
             sutunlu grid + accordion mantigi AYNEN. */}
      <div className="relative max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* ═══ LEFT — decorative info panel (navy + turquoise) ═══ */}
        <div className="lg:col-span-4">
          <div className="relative overflow-hidden rounded-3xl p-7 md:p-9 bg-gradient-to-br from-[#0B1F3A] to-[#132A46] border border-white/10 shadow-[0_28px_64px_-32px_rgba(11,31,58,0.6)] lg:sticky lg:top-24">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-20 -right-16 w-64 h-64 blur-3xl opacity-50"
              style={{
                background:
                  "radial-gradient(circle at center, rgba(2, 170, 229,0.30), transparent 70%)",
              }}
            />
            <span className="relative inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-[#ED7926] to-[#0973BA] text-white shadow-[0_8px_20px_-6px_rgba(9,115,186,0.5)]">
              <HelpCircle size={22} strokeWidth={1.75} aria-hidden />
            </span>
            <h2
              id="faq-heading"
              className="relative mt-6 font-display font-medium text-[24px] md:text-[28px] text-white leading-tight tracking-[-0.02em]"
            >
              Sıkça Sorulan Sorular
            </h2>
            <p className="relative mt-3 text-[14.5px] leading-relaxed text-white/65">
              Misafirlerimizin en çok merak ettiği sorular.
            </p>
            <div
              aria-hidden="true"
              className="relative mt-5 h-[3px] w-14 rounded-full bg-gradient-to-r from-[#ED7926] to-[#0973BA]"
            />
          </div>
        </div>

        {/* ═══ RIGHT — accordion. Logic (openIndex state, aria, grid-rows
               collapse) BİREBİR aynı; yalnız kutu-kutu kart görünümü tek bir
               unified editorial liste (divide-y) haline getirildi — daha az
               border/box, daha "premium liste" hissi. ═══ */}
        <div className="lg:col-span-8">
          <div className="rounded-[28px] bg-white ring-1 ring-[var(--color-stone-100)] divide-y divide-[var(--color-stone-100)] overflow-hidden shadow-[0_20px_50px_-30px_rgba(11,31,58,0.22)]">
            {faqs.map((faq, idx) => {
              const isOpen = openIndex === idx;
              return (
                <article key={faq.id} className="relative">
                  {/* Açık item'da sol kenarda ince marka-gradient accent çubuğu */}
                  {isOpen && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#ED7926] to-[#0973BA]"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${idx}`}
                    id={`faq-button-${idx}`}
                    className="
                      group w-full flex items-start gap-4
                      px-5 py-4 md:px-7 md:py-5
                      text-left
                      focus:outline-none focus-visible:ring-2
                      focus-visible:ring-[#0973BA]/40 focus-visible:ring-inset
                      transition-colors duration-200 motion-reduce:transition-none
                      hover:bg-[var(--color-stone-50)]
                    "
                  >
                    <span
                      className={`
                        w-8 h-8 shrink-0 rounded-full
                        flex items-center justify-center
                        transition-[background-color,color,transform] duration-300
                        motion-reduce:transition-none group-hover:scale-110
                        ${
                          isOpen
                            ? "bg-gradient-to-br from-[#ED7926] to-[#0973BA] text-white"
                            : "bg-[var(--color-stone-50)] border border-[var(--color-stone-200)] text-[var(--color-stone-500)]"
                        }
                      `}
                      aria-hidden
                    >
                      {isOpen ? <Minus size={14} /> : <Plus size={14} />}
                    </span>
                    <span
                      className={`
                        flex-1 min-w-0 font-display text-[16px] md:text-[18px] leading-snug tracking-[-0.015em] mt-1
                        transition-colors duration-200 motion-reduce:transition-none
                        ${isOpen ? "text-[#0973BA]" : "text-[var(--color-stone-900)]"}
                      `}
                    >
                      {faq.question}
                    </span>
                  </button>

                  {/* 🛡️ Smooth height animation — CSS grid-rows trick
                         (grid-rows-[0fr]→[1fr]); layout-thrash yok. AYNEN. */}
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
                      <div className="px-5 md:px-7 pb-5 md:pb-6 pl-[68px] md:pl-[80px]">
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
      </div>
    </section>
  );
}
