"use client";

/* ===============================================================
   🛡️ VillaViewersIndicator — soft social-proof pill
   ===============================================================
   AMAÇ:
     BookingSidebar çevresinde küçük, premium bir "şu anda X kişi
     inceliyor" göstergesi. Booking.com / Airbnb hissi.

   DAVRANIŞ:
     - Sayı: 3-18 arası rastgele (uniform), her sayfa yüklenmesinde
       fresh. Aynı sayfa yaşam döngüsünde STABIL kalır (useState lazy
       init pattern + tek setState).
     - Realtime YOK. Websocket YOK. DB YOK. Tamamen frontend pseudo-
       random.

   HYDRATION SAFETY:
     - SSR sırasında `viewers` state'i `null` → component `null`
       döner → DOM'a hiçbir şey eklenmez.
     - Client hydration: ilk render'da da `null` → SSR ile EŞLEŞIR
       → hydration mismatch YOK.
     - useEffect mount sonrası çalışır → Math.random() çağrılır →
       setState → component görünür (tek tick gecikme, görsel
       flicker minimal).

     Math.random()'u doğrudan render body'de KULLANAMAYIZ — SSR'da
     bir değer, client'ta başka bir değer üretirdi → hydration
     mismatch + console warning.

   PERFORMANCE:
     - useEffect deps `[]` → mount'ta tek seferlik
     - Sonraki render'lar tetiklenmez (sayı sabit kalır)
     - Hiçbir interval / setTimeout YOK; sayı kendi kendine değişmez

   UI:
     - Yeşil canlı pulse dot (animate-ping)
     - Subtle border + soft shadow
     - Mobile-safe (text-[11.5px], tek satır kısa)
     - Mevcut booking sidebar tasarımıyla uyumlu (sand/stone palette)

   ENGINE / BOOKING / PRICING'E DOKUNMAZ:
     - Tamamen bağımsız, salt-sunum component'i
     - useBookingEngine, availability, pricing, reservation flow —
       hiçbiri ile etkileşmez
   =============================================================== */

import { useEffect, useState } from "react";

/* Random aralık: 3-18 inclusive (16 olası değer). */
const VIEWERS_MIN = 3;
const VIEWERS_MAX = 18;

export default function VillaViewersIndicator() {
  /* Hydration-safe pattern:
       - Server render: viewers=null → return null → DOM yok
       - Client first render: viewers=null → DOM yok → SSR ile EŞIT
       - useEffect mount sonrası: viewers set → re-render → DOM eklenir
     Hiçbir hydration mismatch yok. */
  const [viewers, setViewers] = useState<number | null>(null);

  useEffect(() => {
    /* Tek setState — render-loop güvenli. Deps boş → mount'ta tek
       seferlik çalışır, sonraki render'larda Math.random tekrar
       çağrılmaz. Sayı sayfa yaşam döngüsü boyunca STABIL.

       React 19 `set-state-in-effect` rule bu pattern'i flag eder ama
       BURADA KESİNLİKLE GEREKLİ:
         - Math.random() render body'de SSR ≠ client → hydration mismatch
         - useMemo([]) da render-time çalışır → aynı sorun
         - Client-side-only random için CANONICAL pattern: mount sonrası
           setState. Tek tick gecikmesi kabul edilebilir.
       Cascading render trivial (tek setState, deps boş). */
    const range = VIEWERS_MAX - VIEWERS_MIN + 1;
    const next = VIEWERS_MIN + Math.floor(Math.random() * range);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViewers(next);
  }, []);

  /* Henüz mount olmadıysa hiçbir şey render etme — hydration eşitliği
     ve layout-shift'siz görünüm. */
  if (viewers === null) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="
        flex items-center gap-2.5
        rounded-full
        bg-white
        border border-[var(--color-stone-100)]
        px-3.5 py-2
        shadow-[0_2px_8px_-4px_rgb(27_26_23/0.06)]
      "
    >
      {/* Live pulse dot — Tailwind animate-ping (motion-reduce respekt) */}
      <span className="relative flex h-2 w-2 shrink-0">
        <span
          aria-hidden
          className="
            absolute inline-flex h-full w-full rounded-full
            bg-emerald-400 opacity-75
            animate-ping
            motion-reduce:animate-none
          "
        />
        <span
          aria-hidden
          className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"
        />
      </span>

      <p className="text-[11.5px] text-[var(--color-stone-600)] leading-snug truncate">
        Şu anda{" "}
        <span className="font-semibold text-[var(--color-stone-900)] tabular-nums">
          {viewers}
        </span>{" "}
        kişi bu villayı inceliyor
      </p>
    </div>
  );
}
