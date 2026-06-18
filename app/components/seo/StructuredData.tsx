/* ===============================================================
   🛡️ STRUCTURED DATA — JSON-LD HELPERS
   ===============================================================
   Server-rendered JSON-LD script blokları. Schema.org tipleri:
     - VacationRental (villa detay)
     - BreadcrumbList (her sayfa için)
     - ItemList (listing)
     - WebSite (homepage)
     - Organization (homepage)
     - FAQPage (opsiyonel, mevcutsa)
   ÖNEMLİ: Fake rating/aggregateRating ÜRETİLMEZ — yalnız var
   olan veri JSON-LD'ye gömülür. URL'ler absolute; site URL
   env'den (NEXT_PUBLIC_SITE_URL) okunur, yoksa boş kalır.

   Pure server component; client bundle'a yük etmez.
   =============================================================== */

import "server-only";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_VERCEL_URL ||
  ""
).replace(/\/+$/, "");

function abs(path: string): string {
  if (!SITE_URL) return path;
  if (path.startsWith("http")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/* ---------------------------------------------
   🔥 Generic JSON-LD <script> renderer
---------------------------------------------- */
export function JsonLd({ data }: { data: unknown }) {
  // <script> SSR'de inline JSON; client'ta re-parse edilmez.
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data),
      }}
    />
  );
}

/* ---------------------------------------------
   🔥 BreadcrumbList
---------------------------------------------- */
export function buildBreadcrumb(
  items: { name: string; url?: string }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      ...(it.url ? { item: abs(it.url) } : {}),
    })),
  };
}

/* ---------------------------------------------
   🔥 WebSite (homepage)
---------------------------------------------- */
export function buildWebsite(opts: {
  name: string;
  description?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: opts.name,
    url: abs("/"),
    ...(opts.description ? { description: opts.description } : {}),
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: abs("/arama?q={search_term_string}"),
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/* ---------------------------------------------
   🔥 Organization
---------------------------------------------- */
export function buildOrganization(opts: {
  name: string;
  logo?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  /** Şirket yasal adı — schema.org Organization.legalName. */
  legalName?: string | null;
  /** Sosyal medya profilleri — schema.org Organization.sameAs.
   *  Boş/null değerler filtrelenir. */
  sameAs?: Array<string | null | undefined>;
}) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: opts.name,
    url: abs("/"),
  };
  if (opts.legalName) data.legalName = opts.legalName;
  if (opts.logo) data.logo = opts.logo;
  const contact: Record<string, string> = {};
  if (opts.phone) contact.telephone = opts.phone;
  if (opts.email) contact.email = opts.email;
  if (Object.keys(contact).length) {
    data.contactPoint = {
      "@type": "ContactPoint",
      contactType: "customer service",
      ...contact,
    };
  }
  if (opts.address) {
    data.address = {
      "@type": "PostalAddress",
      streetAddress: opts.address,
      addressCountry: "TR",
    };
  }
  if (Array.isArray(opts.sameAs)) {
    const filtered = opts.sameAs.filter(
      (u): u is string => typeof u === "string" && u.trim().length > 0
    );
    if (filtered.length > 0) data.sameAs = filtered;
  }
  return data;
}

/* ---------------------------------------------
   🔥 VacationRental — villa detay
---------------------------------------------- */
export type VacationRentalInput = {
  slug: string;
  title: string;
  description?: string | null;
  images: string[];
  locationName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  guests?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  features?: string[];
  /** Minimum gecelik fiyat (varsa). Currency: "TRY"/"USD"/"EUR"/"GBP" */
  priceFrom?: { amount: number; currency: string } | null;
  /* 🛡️ FAZ 33 — AggregateRating (SEO).
     YALNIZ approved review varsa caller doldurur (count > 0).
     Fake / placeholder data ÜRETİLMEZ; absent → JSON-LD'ye gömülmez. */
  aggregateRating?: {
    /** 1..5 ortalama (1 ondalık) */
    ratingValue: number;
    /** Gerçek count */
    reviewCount: number;
  } | null;
};

export function buildVacationRental(v: VacationRentalInput) {
  const url = abs(`/kiralik-villa/${v.slug}`);
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VacationRental",
    "@id": url,
    name: v.title,
    url,
  };

  if (v.description) {
    // HTML stripped excerpt
    const clean = v.description
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (clean) data.description = clean.slice(0, 500);
  }

  if (v.images?.length) {
    data.image = v.images.map((src) => abs(src));
  }

  if (v.locationName) {
    data.address = {
      "@type": "PostalAddress",
      addressCountry: "TR",
      addressLocality: v.locationName,
    };
  }

  if (
    typeof v.latitude === "number" &&
    typeof v.longitude === "number" &&
    !Number.isNaN(v.latitude) &&
    !Number.isNaN(v.longitude)
  ) {
    data.geo = {
      "@type": "GeoCoordinates",
      latitude: v.latitude,
      longitude: v.longitude,
    };
  }

  if (typeof v.bedrooms === "number" && v.bedrooms > 0) {
    data.numberOfRooms = v.bedrooms;
  }
  if (typeof v.bathrooms === "number" && v.bathrooms > 0) {
    data.numberOfBathroomsTotal = v.bathrooms;
  }
  if (typeof v.guests === "number" && v.guests > 0) {
    data.occupancy = {
      "@type": "QuantitativeValue",
      maxValue: v.guests,
      unitCode: "C62",
    };
  }

  if (v.features?.length) {
    data.amenityFeature = v.features.map((name) => ({
      "@type": "LocationFeatureSpecification",
      name,
      value: true,
    }));
  }

  if (v.priceFrom && v.priceFrom.amount > 0) {
    data.offers = {
      "@type": "Offer",
      priceCurrency: v.priceFrom.currency,
      price: v.priceFrom.amount,
      availability: "https://schema.org/InStock",
      url,
    };
  }

  /* 🛡️ FAZ 33 — AggregateRating.
     YALNIZ gerçek approved review varsa eklenir.
     ratingValue + reviewCount + bestRating/worstRating (1..5 sabit).
     Google rich snippets için: schema.org/AggregateRating geçerli
     format. Caller fake data göndermez (faz 33 review service zaten
     yalnız approved review'lardan hesaplıyor). */
  if (
    v.aggregateRating &&
    typeof v.aggregateRating.reviewCount === "number" &&
    v.aggregateRating.reviewCount > 0 &&
    typeof v.aggregateRating.ratingValue === "number" &&
    v.aggregateRating.ratingValue > 0
  ) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: v.aggregateRating.ratingValue,
      reviewCount: v.aggregateRating.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return data;
}

/* ---------------------------------------------
   🛡️ FAQPage — Faz 25
   ---------------------------------------------
   Homepage FAQ accordion için schema.org structured data.
   Google rich snippets ("People also ask") için zorunlu format.
   Caller'da: if (faqs.length > 0) <JsonLd data={buildFaqJsonLd(faqs)} />
---------------------------------------------- */
export function buildFaqJsonLd(
  faqs: { question: string; answer: string }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };
}

/* ---------------------------------------------
   🔥 ItemList — listing sayfası
---------------------------------------------- */
export function buildItemList(
  items: { slug: string; title: string; image?: string }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: abs(`/kiralik-villa/${it.slug}`),
      name: it.title,
      ...(it.image ? { image: abs(it.image) } : {}),
    })),
  };
}

/* ---------------------------------------------
   🔥 Article / BlogPosting — blog detay
---------------------------------------------- */
export function buildArticle(opts: {
  slug: string;
  title: string;
  description?: string | null;
  image?: string | null;
  datePublished?: string | null;
  dateModified?: string | null;
  author?: string | null;
}) {
  const canonical = abs(`/blog/${opts.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: opts.title,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    url: canonical,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.image ? { image: abs(opts.image) } : {}),
    ...(opts.datePublished ? { datePublished: opts.datePublished } : {}),
    ...(opts.dateModified || opts.datePublished
      ? { dateModified: opts.dateModified || opts.datePublished }
      : {}),
    ...(opts.author
      ? { author: { "@type": "Person", name: opts.author } }
      : {}),
  };
}
