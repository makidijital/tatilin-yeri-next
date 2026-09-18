import type { Metadata } from "next";
import HeaderWrapper from "@/app/components/layout/HeaderWrapper";
/* 🛡️ PHASE 9B — Footer artık "use client" (usePathname ile locale
   tespiti, veri çekimi YOK). Bu sayfa (public)/layout.tsx'in DIŞINDA
   olduğu için kendi Footer'ını kendisi render eder — bu yüzden burada
   da (public)/layout.tsx'teki gibi self-contained FooterWrapper
   (async server, DB'den veri çeker) kullanılır. Davranış BİREBİR aynı;
   yalnızca veri-çekme sorumluluğu Footer'dan FooterWrapper'a taşındı. */
import FooterWrapper from "@/app/components/layout/FooterWrapper";
import VillaCard from "@/app/components/villa/VillaCard";
import { getCachedVillas } from "@/lib/cache.helpers";
/* 🛡️ PUBLIC ÇOKLU DİL — görünen 404 gövdesi client island'a taşındı
   (locale `usePathname` ile türetilir; Header/Footer ile AYNI desen).
   Veri akışı (`getCachedVillas`) ve DOM/CSS DEĞİŞMEDİ. */
import NotFoundContent from "@/app/components/not-found/NotFoundContent";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

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

/* 🛡️ `metadata` bir SERVER export'udur ve `not-found.tsx` eşleşmeyen TÜM
   URL'ler için render edildiğinden burada aktif locale (headers() olmadan)
   BİLİNEMEZ — bu yüzden meta TR canonical değerleriyle kalır. Sayfa zaten
   `noindex`; GÖRÜNEN metinler `NotFoundContent` içinde locale-aware. */
export const metadata: Metadata = {
  title: getDictionary(DEFAULT_LOCALE).notFound.metaTitle,
  description: getDictionary(DEFAULT_LOCALE).notFound.metaDescription,
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

      <NotFoundContent
        suggestions={
          featured.length > 0
            ? featured.map((villa) => (
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
              ))
            : null
        }
      />

      <FooterWrapper />
    </div>
  );
}
