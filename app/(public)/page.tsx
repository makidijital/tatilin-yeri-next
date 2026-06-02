import type { Metadata } from "next";

import Hero from "@/app/components/ui/Hero";
import CategoryCollection from "@/app/components/villa/CategoryCollection";
import LocationCollection from "@/app/components/villa/LocationCollection";
import VillaList from "@/app/components/villa/VillaList";
import FaqSection from "@/app/components/ui/FaqSection";
/* 🛡️ FAZ 34 — Homepage testimonial section (approved reviews) */
import HomepageReviewsSection from "@/app/components/home/HomepageReviewsSection";
/* 🛡️ Statik güven + dönüşüm bandı (CMS/DB yok). brandName + phone
   homepage'in zaten elindeki settings'ten prop olarak geçer. */
import WhyUsSection from "@/app/components/home/WhyUsSection";

import {
  JsonLd,
  buildWebsite,
  buildOrganization,
  buildFaqJsonLd,
} from "@/app/components/seo/StructuredData";
import {
  getCachedSettings,
  getCachedFaqs,
  getCachedGlobalReviewStats,
} from "@/lib/cache.helpers";
import { resolveHeroContent } from "@/lib/hero.helpers";

/* 🛡️ CANONICAL — anasayfa "/". Title/description/OG root layout'tan
   miras alınır; burada yalnız self-canonical eklenir (metadataBase ile
   absolute'a çözülür). www/non-www, trailing-slash, query varyasyonları
   tek kanonik kök URL'de toplanır. */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Home() {
  /* 🛡️ SEO structured data — WebSite + Organization.
     getCachedSettings: tag "settings", TTL 1 saat. Admin settings
     save sonrası revalidateSettings() ile invalidate. Aynı render
     lifecycle'da farklı yerlerden çağrı dedupe edilir. */
  const settings = await getCachedSettings().catch(() => null);
  const brandName = settings?.site_name?.trim() || "Villa Kiralama";

  /* 🛡️ FAZ 25 — Global SSS cached fetch.
     Tag: "faqs", TTL 1 saat; admin replaceFaqs sonrası invalidate.
     Boş array dönerse section + JSON-LD render YOK (caller guard). */
  const faqs = await getCachedFaqs().catch(() => []);

  /* 🛡️ FAZ 39F — Hero floating review card real-data wiring.
     Tek query global aggregate (cached, tag villa-reviews); admin
     moderation invalidate eder. N+1 yok; client fetch yok. */
  const heroReviewStats = await getCachedGlobalReviewStats().catch(
    () => ({ count: 0, average: 0 })
  );

  /* 🛡️ HERO CACHE-KEY — settings.updated_at varsa onu kullan, yoksa
     stable bucket'a düş (12-saatlik). Önceki davranış Date.now() ile
     her render farklı ts üretiyordu → browser cache hero için
     pratik olarak kapalıydı. Şimdi:
       - settings save edilince → tag invalidate → settings re-fetch
         → updated_at güncel → hero image URL yeni ts ile render
         → browser cache miss → fresh fetch
       - mutation yokken → cacheKey stable → browser cache hit
     DB schema'sında updated_at varsa otomatik kullanılır; yoksa
     12-saatlik bucket fallback'i (kabul edilebilir refresh penceresi). */
  const settingsUpdatedAt = (
    settings as { updated_at?: string | null } | null
  )?.updated_at;
  /* 🛡️ React 19 react-hooks/purity rule `Date.now()` during render
     is impure — burada kasıtlı: 12-saatlik bucket fallback, settings
     `updated_at` yoksa hero cache key'in zaman-sabit kalmasını
     engelliyor. Render stability burada kabul edilen trade-off. */
  // eslint-disable-next-line react-hooks/purity
  const stableBucket = Math.floor(Date.now() / (12 * 3600 * 1000));
  const heroCacheKey = settingsUpdatedAt ?? stableBucket;
  const heroContent = resolveHeroContent(settings, {
    cacheKey: heroCacheKey,
  });

  const websiteLd = buildWebsite({
    name: brandName,
    description:
      "Akdeniz'in seçkin villalarında özel havuz, deniz manzarası ve butik konfor.",
  });

  const organizationLd = buildOrganization({
    name: brandName,
    legalName: settings?.company_legal_name || null,
    logo: settings?.site_logo || null,
    phone: settings?.phone || null,
    email: settings?.email || null,
    address: settings?.address || null,
    sameAs: [
      settings?.instagram,
      settings?.facebook,
      settings?.youtube,
      settings?.tiktok,
    ],
  });

  return (
    <>
      <JsonLd data={websiteLd} />
      <JsonLd data={organizationLd} />
      {/* 🛡️ FAZ 25 — FAQPage structured data (rich snippets için).
         FAQ varsa render edilir; boşsa hiç JSON-LD basılmaz. */}
      {faqs.length > 0 && <JsonLd data={buildFaqJsonLd(faqs)} />}
      <Hero content={heroContent} reviewStats={heroReviewStats} />
      <VillaList />
      {/* 🛡️ Statik güven + dönüşüm bölümü — Villa listesi'nin altında
         (Koleksiyonlar ↓ Villa listesi ↓ Neden biz). brandName + phone
         mevcut settings'ten geçer (yeni veri kaynağı YOK). */}
      <WhyUsSection
        brandName={brandName}
        phone={settings?.phone ?? null}
      />
      {/* 🛡️ "Kategori Keşfet" — Hero altı, VillaList üstü. Cached
         helpers ile zero N+1, server-only render. Empty type'larda
         null render → layout sessizce gizlenir. */}
      <CategoryCollection />
      {/* 🛡️ "Bölgeler" — VillaList altı, Footer üstü. CategoryCollection
         ile aynı chip pattern; sadece veri kaynağı (locations) ve
         URL param (`regions=`) farklı. Empty location'larda null
         render → layout sessizce gizlenir. */}
      <LocationCollection />
      {/* 🛡️ FAZ 34 — "Misafir Deneyimleri" testimonial section.
         LocationCollection ile FaqSection arasında doğal trust-building
         akışı: villa keşfi → sosyal kanıt → SSS. Approved review yoksa
         component kendi içinde null döner; CLS yok, layout etkilenmez.
         Cache tag "villa-reviews" — admin moderation invalidate eder. */}
      <HomepageReviewsSection />
      {/* 🛡️ FAZ 25 — Global SSS section, footer üstü.
         FAQ tablosu boşsa component kendi içinde null döner;
         homepage layout etkilenmez. */}
      <FaqSection faqs={faqs} />
    </>
  );
}