import type { Metadata } from "next";
import Link from "next/link";
import { Home, Search, Compass } from "lucide-react";

import HeaderWrapper from "@/app/components/layout/HeaderWrapper";
import Footer from "@/app/components/layout/Footer";
import VillaCard from "@/app/components/villa/VillaCard";
import { getCachedVillas } from "@/lib/cache.helpers";

/* ===============================================================
   🛡️ ÖZEL 404 — VillaYaGel (app/not-found.tsx)
   ===============================================================
   Global eşleşmeyen URL'ler için. Root layout içinde render olur
   (header/footer (public) layout'ta olduğundan burada KENDİMİZ
   render ederiz — HeaderWrapper/Footer self-contained async server
   component'ler, prop gerektirmez).

   - Premium, mevcut tasarım diliyle uyumlu (CSS değişkenleri, font-display).
   - Mobil uyumlu.
   - noindex (404 HTTP statüsü + robots metadata).
   - Mevcut route'lara DOKUNULMAZ; yalnız bu dosya eklenir.
   =============================================================== */

export const metadata: Metadata = {
  title: "Aradığınız sayfayı bulamadık — 404",
  description:
    "Sayfa kaldırılmış, taşınmış veya bağlantı hatalı olabilir. Villa aramaya devam edin.",
  robots: { index: false, follow: true },
};

export default async function NotFound() {
  /* Öne çıkan villalar — getCachedVillas (aktif + sort_order/created_at
     sıralı). İlk 3 = öne çıkan/son eklenen. Hata olursa bölüm gizlenir. */
  const allVillas = await getCachedVillas().catch(() => []);
  const featured = (allVillas || []).slice(0, 3);

  return (
    <div className="flex flex-col min-h-screen bg-[var(--color-ivory)]">
      <HeaderWrapper />

      <main className="flex-1">
        {/* HERO */}
        <section className="px-5 md:px-10 lg:px-16 pt-16 md:pt-24 pb-10 md:pb-14">
          <div className="max-w-[760px] mx-auto text-center">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--brand-coral)]">
              <Compass className="w-4 h-4" />
              404
            </span>
            <h1 className="font-display font-medium text-[30px] md:text-[44px] leading-tight tracking-[-0.02em] text-[var(--color-stone-900)] mt-4">
              Aradığınız sayfayı bulamadık
            </h1>
            <p className="mt-4 text-[15px] md:text-[16px] leading-relaxed text-[var(--color-stone-500)] max-w-xl mx-auto">
              Sayfa kaldırılmış, taşınmış veya bağlantı hatalı olabilir.
              Dilerseniz aşağıdan villa aramaya kaldığınız yerden devam
              edebilirsiniz.
            </p>

            {/* BUTONLAR */}
            <div className="mt-9 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[var(--color-stone-900)] text-white text-[14px] font-medium tracking-[0.02em] hover:bg-[var(--color-stone-700)] transition-colors motion-reduce:transition-none"
              >
                <Home className="w-4 h-4" />
                Ana Sayfaya Dön
              </Link>
              <Link
                href="/kiralik-villalar"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-[var(--color-stone-200)] text-[14px] font-medium text-[var(--color-stone-800)] hover:border-[var(--color-stone-300)] hover:bg-white transition-colors motion-reduce:transition-none"
              >
                <Search className="w-4 h-4" />
                Kiralık Villaları Gör
              </Link>
            </div>
          </div>
        </section>

        {/* ÖNE ÇIKAN VİLLALAR */}
        {featured.length > 0 && (
          <section className="px-5 md:px-10 lg:px-16 pb-16 md:pb-24">
            <div className="max-w-[1280px] mx-auto">
              <div className="text-center mb-8 md:mb-10">
                <p className="text-[10.5px] tracking-[0.28em] uppercase font-medium text-[var(--brand-coral)]">
                  Belki bunlar ilginizi çeker
                </p>
                <h2 className="font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
                  Öne çıkan villalar
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {featured.map((villa) => (
                  <VillaCard
                    key={villa.slug || villa.id}
                    id={villa.id}
                    slug={villa.slug ?? ""}
                    title={villa.title}
                    location={villa.location}
                    price={villa.price}
                    currency={villa.currency || "TRY"}
                    images={villa.images}
                    bedrooms={villa.bedrooms || 1}
                    bathrooms={villa.bathrooms || 1}
                    guests={villa.guests || 2}
                  />
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
