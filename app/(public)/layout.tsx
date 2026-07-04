import HeaderWrapper from "@/app/components/layout/HeaderWrapper";
import Footer from "@/app/components/layout/Footer";
import CookieConsent from "@/app/components/layout/CookieConsent";
import FloatingSocial from "@/app/components/layout/FloatingSocial";
import ScrollToTopButton from "@/app/components/layout/ScrollToTopButton";
import { getCachedSettings } from "@/lib/cache.helpers";

/* ===============================================================
   🛡️ PUBLIC LAYOUT — MAINTENANCE MODE GATE
   ===============================================================
   settings.maintenance_mode === true ise public site bakım
   ekranıyla değiştirilir. /maki-admin/* bu layout altında DEĞİL
   (ayrı admin layout) → bakım sırasında admin çalışmaya devam
   eder, login erişilebilir, static assets etkilenmez.
   =============================================================== */
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getCachedSettings().catch(() => null);
  if (settings?.maintenance_mode === true) {
    const brand = settings?.site_name?.trim() || "Villa Kiralama";
    const message =
      settings?.maintenance_message?.trim() ||
      "Sitemizi yeniliyoruz. Kısa süre içinde tekrar buradayız.";
    return (
      <div className="flex flex-col min-h-screen bg-[var(--color-ivory)]">
        <section className="flex-1 flex items-center justify-center px-5 md:px-10 py-24">
          <div className="max-w-xl text-center">
            <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)]">
              <span className="inline-block w-8 h-px bg-[var(--color-stone-300)] align-middle mr-3" />
              Bakım
            </p>
            <h1 className="font-display text-[40px] md:text-[64px] text-[var(--color-stone-900)] mt-6 leading-[1.02] tracking-[-0.03em]">
              {brand}
            </h1>
            <p className="text-[var(--color-stone-500)] mt-6 leading-relaxed text-[15px] md:text-[16px]">
              {message}
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[var(--color-ivory)]">
      {/* HEADER */}
      <HeaderWrapper />

      {/* CONTENT */}
      <main className="flex-1">
        <div className="w-full">{children}</div>
      </main>

      {/* FOOTER */}
      <Footer />

      {/* 🛡️ Floating Social — fixed bottom-right WhatsApp/Instagram/YouTube
         widget'i. Server component; settings'ten okur, üç href de boşsa
         null döner. z-40 → modaller (1000/1100) ve cookie banner (50)
         üstte kalır; Hero/Header/SearchPanel dokunulmadan additive
         entegrasyon. Bakım modunda render edilmez (early-return). */}
      <FloatingSocial />

      {/* ⬆️ Scroll-to-top — sol alt floating client island; scrollY>400'de
         görünür. z-40 (cookie/modaller üstte kalır), bottom-20 md:bottom-8
         (mobil MobileBookingCta bar'ını temizler). Additive; layout
         yapısına dokunmaz. */}
      <ScrollToTopButton />

      {/* 🍪 Çerez onay banner'ı — client-only island, SSR-safe, additive.
         Bakım modunda render edilmez (yukarıdaki early-return). */}
      <CookieConsent />
    </div>
  );
}
