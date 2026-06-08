"use client";

import { useEffect, useState } from "react";
import { Phone, Mail } from "lucide-react";

import { getPublicSettings, type Settings } from "@/app/services/settings.service";
import { useCurrency } from "@/app/context/CurrencyContext";

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
        <div className="relative">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="
              !bg-transparent !border-0
              !text-[var(--color-stone-700)]
              text-[12px] font-medium
              cursor-pointer pr-5 pl-0 py-0
              focus:!shadow-none focus:!border-0
              hover:!text-[var(--color-stone-900)]
              transition appearance-none
            "
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%237a7163' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right center",
              backgroundSize: "10px",
            }}
          >
            <option value="TRY">🇹🇷 TRY</option>
            <option value="USD">🇺🇸 USD</option>
            <option value="EUR">🇪🇺 EUR</option>
            <option value="GBP">🇬🇧 GBP</option>
          </select>
        </div>
      </div>
    </div>
  );
}
