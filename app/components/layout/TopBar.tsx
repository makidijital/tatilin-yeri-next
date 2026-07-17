"use client";

import {
  useEffect,
  useRef,
  useState,
  type SVGProps,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";

import {
  getPublicSettingsAction as getPublicSettings,
} from "@/app/services/settings.action";
import type { Settings } from "@/app/services/settings.types";
import { useCurrency } from "@/app/context/CurrencyContext";

/* 🛡️ Para birimi seçenekleri — bayraklar LOCAL SVG asset (public/flags).
   Emoji yerine OS-bağımsız render (Windows'ta da görünür). */
const CURRENCY_OPTIONS: { code: string; flag: string }[] = [
  { code: "TRY", flag: "/flags/tr.svg" },
  { code: "USD", flag: "/flags/us.svg" },
  { code: "EUR", flag: "/flags/eu.svg" },
  { code: "GBP", flag: "/flags/gb.svg" },
];

/* ── Inline brand SVG ikonları — lucide-react brand ikonları bu sürümde
   yok; Footer ile AYNI path verisi → tutarlı. `currentColor` ile renk
   parent'tan miras alınır (hover state tek class ile). ── */
const InstagramIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const FacebookIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

const WhatsappIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
  </svg>
);

/* Premium sosyal ikon link'i — navy zemin üzeri açık ton, turkuaz hover
   + hafif lift. Tek satır micro-interaction (motion-reduce safe). */
function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="
        inline-flex items-center justify-center
        text-white/60
        hover:text-[var(--color-champagne-300)] hover:-translate-y-[1px]
        transition-[color,transform] duration-300
        motion-reduce:transition-none motion-reduce:hover:translate-y-0
        focus:outline-none focus-visible:text-[var(--color-champagne-300)]
      "
    >
      {children}
    </a>
  );
}

export default function TopBar() {
  /* 🛡️ Faz 9 hardening: `useState<any>` → `Settings | null`. */
  const [settings, setSettings] = useState<Settings | null>(null);
  const { currency, setCurrency } = useCurrency();

  // 🛡️ MEMORY-LEAK HARDENING (Faz 2A):
  //   getSettings async; component hızlı unmount olursa stale
  //   setState yarış koşulu önlenir.
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
     🌊 REBRAND — MODERN LUXURY CONCIERGE STRIP (navy)
     ═══════════════════════════════════════════════════════════
     Eski açık "TÜRSAB + 7/24 + telefon/email" metin şeridi tamamen
     kaldırıldı. Yeni: navy zemin (premium resort), LEFT sosyal ikonlar
     (turkuaz hover), CENTER minimal micro-copy (turkuaz/amber hairline
     aksan), RIGHT yeniden-stillenmiş currency pill.

     KORUNAN FONKSİYON:
       - Settings fetch + cancellation guard
       - useCurrency context + setCurrency (site-geneli fiyatlandırma)
       - Currency custom dropdown (SVG bayrak) + dışa-tık kapanış
     Height eski py ile ~aynı; px eski ile birebir → navbar hizası korunur.
     Mobile: sosyal + currency görünür, micro-copy gizli (kompakt).
     ═══════════════════════════════════════════════════════════ */
  return (
    <div
      className="
        flex items-center justify-between gap-4
        px-6 md:px-10 lg:px-12 py-[6px]
        bg-[var(--color-stone-900)]
        text-white
      "
    >
      {/* LEFT — sosyal medya ikonları (settings-driven) */}
      <div className="flex items-center gap-3.5 shrink-0">
        {settings.instagram && (
          <SocialLink href={settings.instagram} label="Instagram">
            <InstagramIcon width={15} height={15} aria-hidden />
          </SocialLink>
        )}
        {settings.facebook && (
          <SocialLink href={settings.facebook} label="Facebook">
            <FacebookIcon width={15} height={15} aria-hidden />
          </SocialLink>
        )}
        {settings.whatsapp_link && (
          <SocialLink href={settings.whatsapp_link} label="WhatsApp">
            <WhatsappIcon width={15} height={15} aria-hidden />
          </SocialLink>
        )}
      </div>

      {/* CENTER — minimal branding micro-copy (md+; mobile gizli) */}
      <span className="hidden md:flex items-center gap-2.5 text-[10.5px] tracking-[0.26em] uppercase font-medium text-white/55">
        <span
          aria-hidden
          className="h-px w-5 bg-gradient-to-r from-transparent to-[var(--color-champagne-500)]"
        />
        Lüks Villa Kiralama Deneyimi
        <span
          aria-hidden
          className="h-px w-5 bg-gradient-to-l from-transparent to-[var(--brand-coral)]"
        />
      </span>

      {/* RIGHT — currency seçici (fonksiyonel; premium yeniden stil) */}
      <div className="relative shrink-0" ref={curRef}>
        <button
          type="button"
          onClick={() => setCurOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={curOpen}
          className="
            inline-flex items-center gap-1.5
            rounded-full px-2.5 py-[3px]
            bg-white/10 hover:bg-white/[0.16]
            text-white/90 hover:text-white
            text-[12px] font-medium cursor-pointer
            transition-colors
            focus:outline-none focus-visible:ring-2
            focus-visible:ring-[var(--color-champagne-400)]/50
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
          <ChevronDown size={11} className="text-white/55" />
        </button>

        {curOpen && (
          <ul
            role="listbox"
            className="absolute right-0 mt-2 z-50 min-w-[110px] bg-white rounded-xl border border-[var(--color-stone-100)] shadow-[0_16px_36px_-14px_rgb(11_31_58/0.35)] overflow-hidden py-1"
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
                      ? "bg-[var(--color-champagne-50)] text-[var(--color-stone-900)]"
                      : "text-[var(--color-stone-700)] hover:bg-[var(--color-champagne-50)]")
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
  );
}
