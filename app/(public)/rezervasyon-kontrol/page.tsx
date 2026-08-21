import type { Metadata } from "next";

import PageHero from "@/app/components/ui/PageHero";
import { JsonLd, buildBreadcrumb } from "@/app/components/seo/StructuredData";
import ReservationLookup from "./ReservationLookup";
import ReservationShareView from "./ReservationShareView";
import { resolveReservationShare } from "./share.resolve";

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

/* 🛡️ ADDITIVE — `?token=` ile gelen güvenli paylaşım linki. Token YOKSA
   mevcut Rezervasyon No + E-posta akışı BİREBİR çalışır (aşağıdaki
   ReservationLookup). Token varsa server-side doğrulanır. */
const firstString = (v: unknown): string | null =>
  typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : null;

export default async function ReservationCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const breadcrumbLd = buildBreadcrumb([
    { name: "Ana sayfa", url: "/" },
    { name: "Rezervasyon Kontrol" },
  ]);

  const sp = await searchParams;
  const token = firstString(sp?.token);
  const share = token ? await resolveReservationShare(token) : null;
  const isShareOk = share?.kind === "ok";

  return (
    <>
      <JsonLd data={breadcrumbLd} />

      <PageHero
        breadcrumb={[
          { name: "Ana Sayfa", href: "/" },
          { name: "Rezervasyon Kontrol" },
        ]}
        eyebrow="Rezervasyon"
        title={
          isShareOk ? "Rezervasyon Bilgileriniz." : "Rezervasyonunuzu Sorgulayın."
        }
        description={
          isShareOk
            ? "Rezervasyonunuzun onay ve ödeme özeti aşağıdadır."
            : "Rezervasyon kodunuz ve e-posta adresiniz ile rezervasyon durumunuzu görüntüleyebilirsiniz."
        }
      />

      <section className="px-5 md:px-10 lg:px-16 pt-12 md:pt-16 pb-24 md:pb-32">
        <div className="max-w-[1100px] mx-auto">
          {share?.kind === "ok" ? (
            <ReservationShareView data={share.data} />
          ) : share?.kind === "cancelled" ? (
            <div className="max-w-xl mx-auto rounded-2xl border border-[var(--color-stone-100)] bg-white px-6 py-14 text-center">
              <h2 className="font-display text-[26px] md:text-[32px] text-[var(--color-stone-900)] tracking-[-0.02em]">
                Bu rezervasyon artık aktif değil.
              </h2>
              <p className="text-[var(--color-stone-500)] mt-3 text-[14.5px]">
                Rezervasyonunuzla ilgili sorularınız için bizimle iletişime
                geçebilirsiniz.
              </p>
            </div>
          ) : share?.kind === "invalid" ? (
            <>
              <div className="max-w-xl mx-auto rounded-2xl border border-[var(--color-stone-100)] bg-white px-6 py-10 text-center mb-10">
                <h2 className="font-display text-[24px] md:text-[30px] text-[var(--color-stone-900)] tracking-[-0.02em]">
                  Bu rezervasyon bağlantısı geçersiz veya süresi dolmuş.
                </h2>
                <p className="text-[var(--color-stone-500)] mt-3 text-[14.5px]">
                  Aşağıdan rezervasyon kodunuz ve e-postanız ile
                  sorgulayabilirsiniz.
                </p>
              </div>
              <ReservationLookup />
            </>
          ) : (
            <ReservationLookup />
          )}
        </div>
      </section>
    </>
  );
}
