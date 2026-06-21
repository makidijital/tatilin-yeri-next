"use client";

import { useEffect, useRef, useState } from "react";
import { Phone, Mail, ChevronDown } from "lucide-react";

import { getPublicSettings, type Settings } from "@/app/services/settings.service";
import { useCurrency } from "@/app/context/CurrencyContext";

/* 🛡️ Para birimi seçenekleri — bayraklar LOCAL SVG asset (public/flags).
   Emoji yerine OS-bağımsız render (Windows'ta da görünür). */
const CURRENCY_OPTIONS: { code: string; flag: string }[] = [
  { code: "TRY", flag: "/flags/tr.svg" },
  { code: "USD", flag: "/flags/us.svg" },
  { code: "EUR", flag: "/flags/eu.svg" },
  { code: "GBP", flag: "/flags/gb.svg" },
];

export default function TopBar() {
  /* 🛡️ Faz 9 hardening: `useState<any>` → `Settings | null`. */
  const [settings, setSettings] = useState<Settings | null>(null);
  const { currency, setCurrency } = useCurrency();

  // 🛡️ MEMORY-LEAK HARDENING (Faz 2A):
  //   getSettings async; component hızlı unmount olursa stale
  //   setState yarış koşulu önlenir. Davranış: aynı settings
  //   yüklemesi, aynı UI; yalnız unmount sonrası setState atlanır.
  useEffect(() => {
    let cancelled = false;
    getPublicSettings().then((data) => {
      if (cancelled) return;
      setSettings(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /* 🛡️ Currency dropdown (custom — native <select> emoji bayrakları
     Windows'ta render edilmiyordu). State + dışa-tık ile kapanır. */
  const [curOpen, setCurOpen] = useState(false);
  const curRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!curOpen) return;
    const onDown = (e: MouseEvent) => {
      if (curRef.current && !curRef.current.contains(e.target as Node)) {
        setCurOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [curOpen]);

  if (!settings) return null;

  /* ═══════════════════════════════════════════════════════════
     🛡️ FAZ 39B — LIGHT LUXURY CONCIERGE STRIP
     ═══════════════════════════════════════════════════════════
     Önceki dark-stone (#1b1a17) topbar "eski otel site" hissi
     veriyordu. Yeni: ivory base (var(--color-ivory)) + ultra
     ince stone-100 border + stone-600 body text + coral
     micro-accent ikonlar. "Concierge strip" hissi: minimal,
     expensive, breathable.

     KORUNAN:
       - Settings fetch + cancellation guard
       - useCurrency context + select handler
       - Phone/Mail link semantics
       - 7/24 indicator (yeşil dot)
       - TR/Currency right side
     ═══════════════════════════════════════════════════════════ */
  return (
    <div
      className="
        flex
        justify-center md:justify-between items-center
        px-6 md:px-10 lg:px-12 py-[7px]
        text-[12px] tracking-[0.005em]
        text-[var(--color-stone-600)]
        bg-[var(--color-ivory)]
        border-b border-[var(--color-stone-100)]
      "
    >
      {/* LEFT — phone / email / 7/24 indicator
         🛡️ TÜRSAB strip eklenmesiyle outer container artık her zaman
         render ediliyor; LEFT bloğu mobile'da gizlenmek için kendi
         `hidden md:flex` flag'ini taşıyor. Md+ davranışı AYNEN. */}
      <div className="hidden md:flex items-center gap-5">
        {settings.phone && (
          <a
            href={`tel:${settings.phone}`}
            className="
              flex items-center gap-2
              text-[var(--color-stone-700)]
              hover:text-[var(--color-stone-900)]
              transition-colors motion-reduce:transition-none
            "
          >
            <Phone
              size={12.5}
              className="text-[var(--brand-coral)]"
              strokeWidth={1.75}
            />
            <span className="font-medium tabular-nums">{settings.phone}</span>
          </a>
        )}

        <span
          aria-hidden="true"
          className="w-px h-3 bg-[var(--color-stone-200)]"
        />

        {settings.email && (
          <a
            href={`mailto:${settings.email}`}
            className="
              flex items-center gap-2
              text-[var(--color-stone-700)]
              hover:text-[var(--color-stone-900)]
              transition-colors motion-reduce:transition-none
            "
          >
            <Mail
              size={12.5}
              className="text-[var(--brand-coral)]"
              strokeWidth={1.75}
            />
            <span>{settings.email}</span>
          </a>
        )}

        <span
          aria-hidden="true"
          className="w-px h-3 bg-[var(--color-stone-200)]"
        />

        {/* Live indicator — emerald dot animasyonu korundu */}
        <div className="flex items-center gap-2 text-[var(--color-stone-700)]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          <span className="font-medium tracking-[0.14em] uppercase text-[10px]">
            7/24 Destek
          </span>
        </div>
      </div>

      {/* 🛡️ TÜRSAB KURUMSAL STRIP — TÜM ekranlarda görünür.
         Mobile'da LEFT/RIGHT `hidden md:flex` olduğu için TÜRSAB tek
         başına merkezde görünür (outer `justify-center md:justify-between`).
         Md+ kırılımlarda LEFT'ten sonra, RIGHT'ten önce flex middle
         pozisyonunda yer alır.
         Fluid font `clamp(9.5px, 1.3vw, 11px)`:
           - 320-768 viewport: 9.5px (clamp min) — mobile compact
           - 768-1024 viewport: 9.5-13.3 → ~9.98px @ md → 224px free
             alana sığar (TR butonu kaldırıldıktan sonra)
           - 1024+ viewport: 11px (clamp max) — desktop konforlu
         Animasyon: globals.css `.fade-in-up` (420ms ease-out, opacity+
         translateY, both, infinite YOK). `motion-reduce:animate-none`
         erişilebilirlik. `whitespace-nowrap` ile TEK SATIR garantili. */}
      <span
        className="
          block
          fade-in-up motion-reduce:animate-none
          whitespace-nowrap
          text-[clamp(9.5px,1.3vw,11px)]
          tracking-[0.01em]
          text-[var(--color-stone-500)]
        "
      >
        Semt Turizm Seyahat Acentası • TÜRSAB 17362
      </span>

      {/* RIGHT — language / currency
         🛡️ TÜRSAB strip eklenmesiyle outer container artık her zaman
         render ediliyor; RIGHT bloğu mobile'da gizlenmek için kendi
         `hidden md:flex` flag'ini taşıyor. Md+ davranışı AYNEN. */}
      <div className="hidden md:flex items-center gap-4">
        {/* Currency select — light dilde
           🛡️ TR (Globe + "TR" + ChevronDown) butonu ve onu currency'den
           ayıran divider kaldırıldı; RIGHT bloğunda yalnız currency
           seçici kaldı. useCurrency context aynen kullanılır. */}
        {/* 🛡️ Currency seçici — custom dropdown (SVG bayrak; OS-bağımsız).
            useCurrency context (currency/setCurrency) AYNEN kullanılır;
            API değişmedi, yalnız native <select> → button+liste. */}
        <div className="relative" ref={curRef}>
          <button
            type="button"
            onClick={() => setCurOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={curOpen}
            className="
              inline-flex items-center gap-1.5
              bg-transparent border-0
              text-[var(--color-stone-700)] hover:text-[var(--color-stone-900)]
              text-[12px] font-medium cursor-pointer py-0
              transition
            "
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                CURRENCY_OPTIONS.find((c) => c.code === currency)?.flag ||
                "/flags/tr.svg"
              }
              alt=""
              className="w-4 h-3 rounded-[1px] object-cover shrink-0"
            />
            {currency}
            <ChevronDown size={11} className="text-[var(--color-stone-400)]" />
          </button>

          {curOpen && (
            <ul
              role="listbox"
              className="absolute right-0 mt-2 z-50 min-w-[100px] bg-white rounded-lg border border-[var(--color-stone-100)] shadow-[0_12px_28px_-12px_rgb(27_26_23/0.22)] overflow-hidden py-1"
            >
              {CURRENCY_OPTIONS.map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={c.code === currency}
                    onClick={() => {
                      setCurrency(c.code);
                      setCurOpen(false);
                    }}
                    className={
                      "w-full flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium text-left transition-colors " +
                      (c.code === currency
                        ? "bg-[var(--color-sand-50)] text-[var(--color-stone-900)]"
                        : "text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)]")
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.flag}
                      alt=""
                      className="w-4 h-3 rounded-[1px] object-cover shrink-0"
                    />
                    {c.code}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
