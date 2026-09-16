import HeaderWrapper from "@/app/components/layout/HeaderWrapper";
/* 🛡️ PHASE 9B — Footer, HeaderWrapper/Header deseninin birebir aynısına
   taşındı: DB/service veri-çekimi artık FooterWrapper'da (async server),
   Footer.tsx artık "use client" (usePathname ile locale tespiti, bkz. o
   dosya). Bu satır DIŞINDA bu layout dosyasında HİÇBİR değişiklik YOK —
   maintenance-mode gate, getCachedSettings, phoneHref/whatsappHref
   türetimi BİREBİR aynı. headers()/cookies() KULLANILMADI; bu dosyanın
   static/ISR rendering uygunluğu ETKİLENMEDİ. */
import FooterWrapper from "@/app/components/layout/FooterWrapper";
import CookieConsent from "@/app/components/layout/CookieConsent";
import FloatingSocial from "@/app/components/layout/FloatingSocial";
import BottomNav from "@/app/components/layout/BottomNav";
import ScrollToTopButton from "@/app/components/layout/ScrollToTopButton";
import { getCachedSettings } from "@/lib/cache.helpers";
/* 🛡️ PHASE 10L — bakım ekranı, locale'i client tarafta çözebilmek için
   ayrı bir component'e taşındı (DOM AYNEN korundu — bkz. o dosya). */
import MaintenanceScreen from "@/app/components/layout/MaintenanceScreen";

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
    /* 🛡️ PHASE 10L §8 — bakım ekranı DOM'u DEĞİŞMEDİ; yalnız
       `MaintenanceScreen` (client) dosyasına taşındı. Neden: bu layout
       bir SERVER component ve (Phase 7E'de kanıtlandığı gibi) request
       locale'ini GÜVENLE OKUYAMAZ — sayfanın `setRequestLocale()`
       çağrısı bu gövde çalıştıktan SONRA yürür. Header/Footer ile AYNI
       çözüm kullanıldı: locale, client tarafında `usePathname()` ile
       bulunur; veri (canonical + çeviriler) locale'den BAĞIMSIZ olarak
       buradan geçirilir. `headers()`/`cookies()` KULLANILMADI →
       layout'un statik/ISR uygunluğu DEĞİŞMEDİ. */
    return (
      <MaintenanceScreen
        brand={brand}
        canonicalMessage={settings?.maintenance_message ?? null}
        translations={settings?.translations ?? null}
      />
    );
  }

  /* 🛡️ Mobil BottomNav için WhatsApp/Telefon href'leri — FloatingSocial
     ile BİREBİR aynı türetme (yeni business logic YOK). */
  const phoneHref = settings?.phone?.trim()
    ? `tel:${settings.phone.trim()}`
    : null;
  const phoneDigits = (settings?.phone || "").replace(/\D/g, "");
  const whatsappHref =
    settings?.whatsapp_link?.trim() ||
    (phoneDigits ? `https://wa.me/${phoneDigits}` : null);

  return (
    <div className="public-shell flex flex-col min-h-screen bg-[var(--color-ivory)]">
      {/* HEADER */}
      <HeaderWrapper />

      {/* CONTENT */}
      <main className="flex-1">
        <div className="w-full">{children}</div>
      </main>

      {/* FOOTER */}
      <FooterWrapper />

      {/* 🛡️ Floating Social — fixed bottom-right WhatsApp/Instagram/YouTube
         widget'i. Server component; settings'ten okur, üç href de boşsa
         null döner. z-40 → modaller (1000/1100) ve cookie banner (50)
         üstte kalır; Hero/Header/SearchPanel dokunulmadan additive
         entegrasyon. Bakım modunda render edilmez (early-return). */}
      <FloatingSocial />

      {/* 📱 Mobil Bottom Navigation — yalnız <md; villa detayında (kendi
         MobileBookingCta'sı var) otomatik gizlenir. Desktop'ta render
         edilir ama `md:hidden` ile görünmez → FloatingSocial desktop'ta
         aynen çalışır. Href'ler server'da türetilip prop geçilir. */}
      <BottomNav phoneHref={phoneHref} whatsappHref={whatsappHref} />

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
