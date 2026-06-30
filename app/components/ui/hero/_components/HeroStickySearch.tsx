"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";

import VillaSearchBox from "@/app/components/layout/VillaSearchBox";

/* ===============================================================
   🛡️ HERO STICKY SEARCH — homepage scroll-aware compact bar
   ===============================================================
   UX:
     - Sayfa açılışı → görünmez (Hero search panel olduğu gibi).
     - Hero search alanı TÜM header'ın (TopBar + navbar) ALTINA kayınca
       → sticky bar belirir.
     - Yukarı geri scroll → kaybolur.

   YAPI (NO scroll listener):
     - `sentinel`: HeroSearchPanel'in HEMEN ALTINA, akış içinde 0-yükseklik
       işaretçi.
     - IntersectionObserver: sentinel header çizgisinin üstüne çıkınca
       (scroll geçildi) `stuck=true`. Sayfa tepesinde sentinel viewport
       ALTINDA olduğundan (top >= headerH) stuck=false → erken görünme YOK.
     - Sticky bar `position: fixed` (akış DIŞI) → CLS = 0; HeroSearchPanel
       hiç oynamaz. Fixed → viewport'a göre konumlanır; ancestor
       overflow-hidden tarafından KLİPLENMEZ (fixed overflow'dan kaçar).

   ⚠️ HEADER YÜKSEKLİĞİ — runtime'da ölçülür.
     Header = `<header fixed>` içinde TopBar + navbar (app spacer h-[108px]).
     Sabit 80px varsayımı YANLIŞ'tı (bar TopBar+navbar arkasında kalıyordu).
     Çözüm: `header.getBoundingClientRect().height` ile gerçek yükseklik
     (TopBar dahil, responsive) ölçülür; hem bar `top`'u hem IO eşiği buna
     bağlanır. Default = 108 (app spacer) → ölçümden önce sane fallback.

   Z-INDEX: bar z-40 (Header z-50 ALTINDA, içerik ÜSTÜNDE); kendi
            autocomplete dropdown'ı z-[60] (sticky variant).

   ⚠️ PORTAL — fixed bar `document.body`'ye render edilir (createPortal).
     Hero `<section className="relative z-20">` bir STACKING CONTEXT kurar;
     içindeki `position: fixed` bar (z-40) bu context'ten KAÇAMAZ → Header
     (fixed z-50) altında kalmasına rağmen daima section z-20 düzleminde
     paint olur, yani Header'ın ALTINA gizlenir. Çözüm: bar'ı body'ye
     portal'la → artık Header ile KARDEŞ; z-40 < z-50 → bar Header'ın hemen
     altında, sayfa içeriğinin üstünde doğru paint olur.
     SENTINEL portal'lanmaz — akışta kalır ki IntersectionObserver onu
     Hero içindeki gerçek konumunda gözlemlesin. SSR guard: `mounted`
     false iken portal render edilmez (server'da document yok).
   ============================================================= */

const DEFAULT_HEADER_H = 108;

export default function HeroStickySearch() {
  const router = useRouter();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(DEFAULT_HEADER_H);
  const [stuck, setStuck] = useState(false);
  const [mounted, setMounted] = useState(false);

  /* SSR guard — portal yalnız client mount sonrası (document.body var). */
  useEffect(() => {
    setMounted(true);
  }, []);

  /* Gerçek header yüksekliğini ölç (TopBar + navbar) + resize'da güncelle. */
  useEffect(() => {
    const measure = () => {
      const h = document
        .querySelector("header")
        ?.getBoundingClientRect().height;
      if (h && Number.isFinite(h) && h > 0) setHeaderH(Math.round(h));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  /* IO eşiği headerH'e bağlı → değişince observer yeniden kurulur. */
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const next =
          !entry.isIntersecting &&
          entry.boundingClientRect.top < headerH;
        setStuck(next);
      },
      { rootMargin: `-${headerH}px 0px 0px 0px`, threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [headerH]);

  /* STICKY BAR — fixed, TAM header altı (top runtime ölçülen headerH).
     Gizliyken pointer-events yok. body'ye portal'lanır (stacking-context
     trap'ten kaçış). */
  const stickyBar = (
    <div
      aria-hidden={!stuck}
      style={{ top: headerH }}
      className={
        "fixed inset-x-0 z-40 px-3 md:px-6 print:hidden " +
        "transition-[opacity,transform] duration-300 motion-reduce:transition-none " +
        (stuck
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-2 pointer-events-none")
      }
    >
      <div className="mx-auto max-w-[1100px]">
        <div className="flex items-center gap-2 md:gap-3 rounded-2xl border border-[var(--color-stone-100)] bg-white/85 backdrop-blur-md shadow-[0_14px_34px_-16px_rgba(11,31,58,0.28)] px-3 md:px-4 py-2 md:py-2.5">
          {/* LEFT — villa-adı canlı arama (mevcut VillaSearchBox reuse) */}
          <VillaSearchBox variant="sticky" placeholder="Villa adı ile ara..." />

          {/* RIGHT — Filtrele → /arama */}
          <button
            type="button"
            onClick={() => router.push("/arama")}
            className="
              inline-flex items-center gap-1.5 shrink-0
              rounded-xl px-3 md:px-4 py-2
              bg-[var(--color-stone-900)] text-white
              text-[12.5px] md:text-[13px] font-medium tracking-[0.01em]
              hover:bg-[var(--color-stone-800)]
              transition-colors motion-reduce:transition-none
              focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-coral)]/40
            "
          >
            <SlidersHorizontal size={15} aria-hidden />
            <span>Filtrele</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* SENTINEL — akış içinde, HeroSearchPanel'in hemen altı. 0 yükseklik.
         PORTAL'LANMAZ → IntersectionObserver onu Hero içindeki gerçek
         konumunda gözlemler. */}
      <div ref={sentinelRef} aria-hidden className="h-px w-full" />

      {/* STICKY BAR → document.body portal (Hero z-20 stacking-context'ten
         kaçar; Header z-50 ile kardeş olur). SSR'da render YOK. */}
      {mounted ? createPortal(stickyBar, document.body) : null}
    </>
  );
}
