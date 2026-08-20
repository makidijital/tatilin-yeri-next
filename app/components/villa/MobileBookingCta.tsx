"use client";

import Link from "next/link";

/* ===============================================================
   🛡️ MOBILE BOOKING CTA — sticky bottom bar (mobile/tablet only)
   ===============================================================
   AMAÇ:
     Villa detay sayfasında mobil kullanıcı uzun scroll yapmadan
     BookingSidebar'a hızlıca ulaşabilsin. Ekran altında sabit bir
     CTA bar ile fiyat + "Rezervasyon Yap" butonu görünür; tap →
     smooth scroll ile booking-sidebar anchor'una gider.

   DAVRANIŞ:
     - Mobile/tablet (<lg): fixed bottom-0 inset-x-0; daima görünür
     - Desktop (lg+): `lg:hidden` → render edilmez, mevcut
       `<aside lg:sticky lg:top-32>` sticky sidebar AYNEN çalışır
     - Tıklama: native `scrollIntoView({ behavior: "smooth", block:
       "start" })`; targetId DOM'da yoksa sessiz no-op
     - Fiyat: `priceAmount + priceCurrency` varsa "Gece Başına X TRY";
       null/sıfırsa "Müsaitlik Sorgula" fallback

   Z-INDEX (z-30) — landscape:
     z-1000+ modal (Booking/Gallery/Video) > z-50 CookieConsent +
     Header > z-40 FloatingSocial > **z-30 MobileBookingCta** >
     z-auto content. FloatingSocial bottom-right köşede üstte; cookie
     banner ilk ziyarette üstte; CTA banner kapanınca ortaya çıkar.

   SAFE-AREA:
     `pb-[env(safe-area-inset-bottom)]` iPhone notched cihazlarda
     home indicator zone'unu CTA içeriğinin altında bırakır.

   PRINT:
     `print:hidden` ile yazdırma çıktısında CTA görünmez.

   SSR-SAFE:
     "use client" component; SSR'da render olur (HTML var), client
     mount sonrası onClick handler bağlanır. Hidrasyon mismatch yok.

   DOKUNULMAYAN:
     - BookingSidebar.tsx (prop signature, iç mantığı)
     - BookingEngine state, rezervasyon akışı
     - Desktop sticky davranışı
=============================================================== */

export default function MobileBookingCta({
  priceAmount,
  priceCurrency,
  targetId,
}: {
  /** Gece başına en düşük fiyat. null/0 → "Müsaitlik Sorgula" fallback. */
  priceAmount: number | null;
  /** ISO currency kodu (TRY, USD, EUR, GBP). null → fallback. */
  priceCurrency: string | null;
  /** Smooth scroll hedefi anchor id'si (page.tsx'te `<aside id=...>`). */
  targetId: string;
}) {
  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    if (typeof document === "undefined") return;

    /* 🛡️ MOBİL SCROLL HİZASI — "ikinci ekran" hedefi:
       [Header] altında → [TARİH] → [MİSAFİR].
       Öncelik: Tarih kartı (#booking-date-field) sticky header'ın HEMEN
       ALTINA hizalanır. Bulunamazsa aside (targetId) fallback (eski
       davranış korunur). Header yüksekliği GERÇEK DOM ölçümüyle alınır
       (sabit px yok → responsive + adres-çubuğu değişimine dayanıklı).
       Rezervasyon/tarih/fiyat/backend mantığına DOKUNULMAZ — yalnız
       scroll hizası. Desktop'ta bu component `lg:hidden` → handler hiç
       çalışmaz, mevcut sticky sidebar aynen. */
    const el =
      document.getElementById("booking-date-field") ||
      document.getElementById(targetId);
    if (!el) return;

    const header = document.querySelector("header");
    const headerH = header ? header.getBoundingClientRect().height : 0;
    const GAP = 12; // Tarih kartının üstünde küçük, kontrollü boşluk

    const top =
      el.getBoundingClientRect().top + window.scrollY - headerH - GAP;

    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  const hasPrice =
    typeof priceAmount === "number" &&
    priceAmount > 0 &&
    typeof priceCurrency === "string" &&
    priceCurrency.trim().length > 0;

  return (
    <aside
      aria-label="Hızlı rezervasyon"
      className="
        lg:hidden
        fixed inset-x-0 bottom-0
        z-30
        bg-white border-t border-[var(--color-stone-100)]
        shadow-[0_-12px_32px_-12px_rgba(27,26,23,0.18)]
        pb-[env(safe-area-inset-bottom)]
        px-4 pt-3
        flex items-center justify-between gap-3
        print:hidden
      "
    >
      {/* Sol: fiyat (varsa) ya da fallback metin */}
      <div className="flex flex-col min-w-0">
        {hasPrice ? (
          <>
            <span className="text-[10.5px] tracking-[0.18em] uppercase text-[var(--color-stone-500)] font-medium">
              Gece başına
            </span>
            <span className="text-[15px] font-semibold text-[var(--color-stone-900)] tabular-nums truncate">
              {Math.round(priceAmount as number).toLocaleString("tr-TR")}{" "}
              {priceCurrency}
            </span>
          </>
        ) : (
          <span className="text-[13px] text-[var(--color-stone-700)] font-medium">
            Müsaitlik Sorgula
          </span>
        )}
      </div>

      {/* Sağ: CTA — luxury coral btn-primary */}
      <Link
        href={`#${targetId}`}
        onClick={handleClick}
        className="btn-primary shrink-0 !px-5 !py-3 text-[13.5px]"
      >
        Rezervasyon Yap
      </Link>
    </aside>
  );
}
