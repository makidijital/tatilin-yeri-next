import type { Metadata } from "next";

import PageHero from "@/app/components/ui/PageHero";
import { JsonLd, buildBreadcrumb } from "@/app/components/seo/StructuredData";
import ReservationLookup from "./ReservationLookup";

/* ===============================================================
   🛡️ /rezervasyon-kontrol — PUBLIC REZERVASYON DURUM SORGULAMA
   ===============================================================
   Müşteri rezervasyon kodu (reservations.reservation_no) + e-posta
   ile rezervasyon durumunu görüntüler. Veri yalnız server-side
   service-role route'tan (admin-only RLS) gelir; eşleşme zorunlu.

   Giriş bandı: paylaşılan premium PageHero (badge variant).
   =============================================================== */

const PAGE_PATH = "/rezervasyon-kontrol";

export const metadata: Metadata = {
  title: "Rezervasyon Kontrol",
  description:
    "Rezervasyon kodunuz ve e-posta adresiniz ile rezervasyon durumunuzu anlık olarak görüntüleyin.",
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    type: "website",
    url: PAGE_PATH,
    title: "Rezervasyon Kontrol",
    description:
      "Rezervasyon kodunuz ve e-posta adresiniz ile rezervasyon durumunuzu görüntüleyin.",
  },
  twitter: {
    card: "summary",
    title: "Rezervasyon Kontrol",
  },
};

export default function ReservationCheckPage() {
  const breadcrumbLd = buildBreadcrumb([
    { name: "Ana sayfa", url: "/" },
    { name: "Rezervasyon Kontrol" },
  ]);

  return (
    <>
      <JsonLd data={breadcrumbLd} />

      <PageHero
        breadcrumb={[
          { name: "Ana Sayfa", href: "/" },
          { name: "Rezervasyon Kontrol" },
        ]}
        title="Rezervasyonunuzu Sorgulayın."
        description="Rezervasyon kodunuz ve e-posta adresiniz ile rezervasyon durumunuzu görüntüleyebilirsiniz."
        badge={{
          eyebrow: "Rezervasyon",
          lines: ["Güvenli Sorgulama", "Anlık Durum", "Kolay Erişim"],
        }}
      />

      <section className="px-5 md:px-10 lg:px-16 pt-12 md:pt-16 pb-24 md:pb-32">
        <div className="max-w-[1100px] mx-auto">
          <ReservationLookup />
        </div>
      </section>
    </>
  );
}
