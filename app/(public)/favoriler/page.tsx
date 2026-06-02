import type { Metadata } from "next";
import PageHero from "@/app/components/ui/PageHero";
import FavoritesGrid from "./FavoritesGrid";

/* ===============================================================
   🛡️ FAZ 36 — /favoriler PUBLIC ROUTE
   ===============================================================
   Guest favorites koleksiyonu — localStorage'dan okunur, server'a
   yansımaz. Bu sayfa ince server skeleton; gerçek liste client
   island (`FavoritesGrid`) içinde render edilir.

   SEO:
     robots: noindex/nofollow → kişiye özel içerik; index'lenmemeli.
     canonical YOK (kullanıcı bazlı liste).

   DOKUNULMAYAN:
     reservation engine, pricing, BookingSidebar, review system,
     AggregateRating, cache architecture, search algorithms, private
     URL system, gallery, admin, sidebar permissions, auth middleware.
   =============================================================== */

export const metadata: Metadata = {
  title: "Favorilerim",
  description:
    "Akdeniz villaları arasında seçtiğiniz favori mülkler — kendi koleksiyonunuz.",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function Page() {
  return (
    <>
      <PageHero
        breadcrumb={[{ name: "Ana sayfa", href: "/" }, { name: "Favorilerim" }]}
        eyebrow="Koleksiyonum"
        title="Favorilerim"
        description="Seçtiğiniz villalar bu sayfada saklanır. Liste bu cihazda kalır; istediğiniz zaman ekleyebilir, çıkarabilir veya koleksiyonu sıfırlayabilirsiniz."
      />

      <section className="px-5 md:px-10 lg:px-16 pt-12 md:pt-16 pb-24 md:pb-32">
        <div className="max-w-[1280px] mx-auto">
          <FavoritesGrid />
        </div>
      </section>
    </>
  );
}
