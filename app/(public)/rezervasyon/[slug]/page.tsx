import { getVillaBySlug } from "@/app/services/villa.service";
import { getVillaPrices } from "@/app/services/villa-price.service";
import { getVillaImages } from "@/app/services/villa-image/villa-image.read";
import { resolveVillaImageUrl } from "@/lib/storage.helpers";

import ReservationForm from "@/app/components/reservation/ReservationForm";
import PageHero from "@/app/components/ui/PageHero";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    start?: string | string[];
    end?: string | string[];
    adults?: string | string[];
    children?: string | string[];
  }>;
};

export default async function ReservationPage({
  params,
  searchParams,
}: Props) {
  const { slug } = await params;
  const sp = await searchParams;

  if (!slug) {
    return (
      <section className="section-narrow py-32 text-center">
        <h2 className="font-display text-3xl text-[var(--color-stone-900)]">
          Geçersiz URL
        </h2>
      </section>
    );
  }

  const villa = await getVillaBySlug(slug);

  if (!villa) {
    return (
      <section className="section-narrow py-32 text-center">
        <p className="eyebrow !text-[var(--color-stone-400)]">404</p>
        <h2 className="font-display text-3xl text-[var(--color-stone-900)] mt-3">
          Villa bulunamadı
        </h2>
      </section>
    );
  }

  const prices = await getVillaPrices(villa.id);
  const images = await getVillaImages(villa.id);
  /* 🛡️ Bucket-fix — resolveVillaImageUrl: villa-images bucket'ından URL
     üretir. Legacy FULL URL pass-through, Phase B path → URL. */
  const coverImage = resolveVillaImageUrl(images?.[0]?.image_url);

  const getParam = (param?: string | string[]) => {
    if (!param) return undefined;
    return Array.isArray(param) ? param[0] : param;
  };

  const start = getParam(sp.start);
  const end = getParam(sp.end);
  const adults = getParam(sp.adults);
  const children = getParam(sp.children);

  return (
    <>
      {/* HERO — paylaşılan premium PageHero (kompakt editorial band) */}
      <PageHero
        breadcrumb={[
          { name: "Ana sayfa", href: "/" },
          { name: "Kiralık Villalar", href: "/kiralik-villalar" },
          { name: "Rezervasyon" },
        ]}
        title="Kişisel Bilgilerinizi Girin"
        description="Rezervasyon talebini aldıktan sonra ekibimiz seninle iletişime geçecek."
        badge={{
          eyebrow: "Rezervasyon",
          lines: ["Güvenli Ödeme", "Hızlı Onay", "Destek Ekibi"],
        }}
      />

      <div className="section-narrow pt-12 md:pt-16 pb-20">
        <ReservationForm
          villa={villa}
          prices={prices}
          start={start}
          end={end}
          image={coverImage}
          adults={adults}
          /* 🛡️ false-positive: `children` burada misafir sayısı
             (rezervasyon domain prop'u), React.children DEĞİL. */
          // eslint-disable-next-line react/no-children-prop
          children={children}
        />
      </div>
    </>
  );
}
