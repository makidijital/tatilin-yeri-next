import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { getPageBySlug } from "@/app/services/page.service";
import { getPageCoverPublicUrl } from "@/lib/storage.helpers";
import { parsePageSections } from "@/lib/page-sections";
import PageSectionRenderer from "@/app/components/cms/PageSectionRenderer";
import PageHero from "@/app/components/ui/PageHero";
import {
  JsonLd,
  buildBreadcrumb,
} from "@/app/components/seo/StructuredData";

/* ---------------------------------------------------------------
   CMS içerik rozeti — slug/başlık anahtar kelimesine göre sağ
   karttaki etiketi içerik tipine uyarlar (kod tekrarı yok, tek
   PageHero component'i; yalnız prop değişir).
   --------------------------------------------------------------- */
/* Hakkımızda + politika/şart CMS sayfaları (slug ASCII olduğundan
   Türkçe büyük-harf toLowerCase sorunu slug üzerinden bypass edilir). */
const CMS_ABOUT_RE = /hakk|about|biz kim|kurumsal kimlik/;
const CMS_POLICY_RE =
  /gizlilik|kvkk|cerez|çerez|mesafeli|sozlesme|sözleşme|sart|şart|politika|policy|iade|teslimat|kosul|koşul|iptal|kullanim|kullanım/;

function getCmsBadge(
  slug: string,
  title: string | null | undefined
): { eyebrow?: string; lines: string[] } {
  const key = `${slug} ${title ?? ""}`.toLowerCase();
  /* Hakkımızda: sağ badge render edilmez (lines boş). Üst eyebrow
     "Kurumsal" getCorporateEyebrow'dan gelir. */
  if (CMS_ABOUT_RE.test(key)) {
    return { lines: [] };
  }
  if (/sss|faq|sik sorul|sık sorul|yardim|yardım/.test(key)) {
    return { eyebrow: "Yardım", lines: ["Sık Sorulanlar"] };
  }
  /* Politika & şart sayfaları: badge yalnız "Politika & Şartlar";
     üst eyebrow "Kurumsal" getCorporateEyebrow'dan gelir. */
  if (CMS_POLICY_RE.test(key)) {
    return { lines: ["Politika & Şartlar"] };
  }
  /* Diğer kurumsal/CMS PageHero sayfaları: badge yok. "Bilgilendirme"
     artık kullanılmaz; üst eyebrow "Kurumsal" getCorporateEyebrow'dan. */
  return { lines: [] };
}

/* SSS hariç kurumsal CMS sayfalarının tümü. */
const CMS_SSS_RE = /sss|faq|sik sorul|sık sorul|yardim|yardım/;

/* Küçük mavi üst eyebrow — SSS dışındaki tüm kurumsal CMS sayfalarında
   her zaman "Kurumsal". Yalnız SSS mevcut hâliyle kalır (undefined). */
function getCorporateEyebrow(
  slug: string,
  title: string | null | undefined
): string | undefined {
  const key = `${slug} ${title ?? ""}`.toLowerCase();
  return CMS_SSS_RE.test(key) ? undefined : "Kurumsal";
}

/* Kurumsal/yasal/bilgilendirme sayfaları (Hakkımızda, SSS, KVKK,
   Gizlilik, Mesafeli, Sözleşme/Şartlar, Çerez/İade/Teslimat) —
   kapak görseli OLSA BİLE her zaman premium PageHero kullanır.
   Gerçek makale/içerik (cover'lı) sayfalar editorial cover hero'da
   kalır. */
function isCorporatePage(
  slug: string,
  title: string | null | undefined
): boolean {
  const key = `${slug} ${title ?? ""}`.toLowerCase();
  return /hakk|about|biz kim|kurumsal|sss|faq|sik sorul|sık sorul|yardim|yardım|gizlilik|kvkk|cerez|çerez|mesafeli|sozlesme|sözleşme|sart|şart|politika|policy|iade|teslimat|kosul|koşul/.test(
    key
  );
}

/* ===============================================================
   🛡️ /p/[slug] — PREMIUM EDITORIAL CMS PAGE
   ===============================================================
   Architecture:
     - SEO metadata (generateMetadata): title, description, canonical,
       og:image, noindex flag
     - Hero: breadcrumb + serif title + excerpt + optional cover
     - Content container: prose-sized typography (max-w-2xl/3xl)
     - Sections: typed section array → renderer map (richtext/image/
       quote; future expandable)
     - Fallback: sections boşsa body alanı tek prose block olarak

   Body/content drift fix:
     Önceki kod `page.content` okuyordu; DB schema `body` field'ı
     tutuyor. Defansif: `body ?? content` ile her iki kaynağı da
     accept eder.
   =============================================================== */

type Props = {
  params: Promise<{ slug: string }>;
};

/* ---------------- SEO METADATA ---------------- */
export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) {
    return {
      title: "Sayfa bulunamadı",
      robots: { index: false, follow: false },
    };
  }
  const title = page.seo_title || page.title || "Sayfa";
  const description =
    page.seo_description ||
    (typeof page.excerpt === "string" && page.excerpt.trim().length > 0
      ? page.excerpt
      : undefined);
  const cover = getPageCoverPublicUrl(
    (page as { cover_image?: string | null }).cover_image
  );
  const path = `/p/${slug}`;
  const robots = page.noindex
    ? { index: false, follow: false }
    : { index: true, follow: true };

  return {
    title,
    description,
    alternates: { canonical: path },
    robots,
    openGraph: {
      type: "article",
      title,
      description,
      url: path,
      ...(cover ? { images: [{ url: cover }] } : {}),
    },
    twitter: {
      card: cover ? "summary_large_image" : "summary",
      title,
      description,
      ...(cover ? { images: [cover] } : {}),
    },
  };
}

/* ---------------- PAGE RENDER ---------------- */
export default async function CmsPage({ params }: Props) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);

  if (!page) {
    return (
      <section className="px-5 md:px-10 lg:px-16 py-32 md:py-44">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)]">
            <span className="inline-block w-8 h-px bg-[var(--color-stone-300)] align-middle mr-3" />
            404
          </p>
          <h1 className="font-display text-[40px] md:text-[64px] text-[var(--color-stone-900)] mt-6 leading-[1.02] tracking-[-0.03em]">
            Sayfa bulunamadı.
          </h1>
          <p className="text-[var(--color-stone-500)] mt-6 leading-relaxed">
            Aradığın sayfa kaldırılmış veya taşınmış olabilir.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 mt-10 text-[13px] font-medium text-[var(--color-stone-700)] hover:text-[var(--color-champagne-700)] transition-colors"
          >
            Ana sayfaya dön <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    );
  }

  /* Body/content fallback (defansif type drift fix). */
  const body =
    (page.body as string | null | undefined) ??
    ((page as { content?: string | null }).content ?? null);

  const excerpt = (
    (page as { excerpt?: string | null }).excerpt ?? ""
  ).trim();

  const coverUrl = getPageCoverPublicUrl(
    (page as { cover_image?: string | null }).cover_image
  );

  /* HERO KARARI:
       - Kurumsal/yasal/bilgilendirme sayfaları → her zaman PageHero
         (cover_image olsa bile; talep gereği premium band).
       - Cover'lı gerçek içerik/makale sayfaları → editorial cover hero.
       - Cover'sız diğer sayfalar → PageHero. */
  const corporate = isCorporatePage(slug, page.title);
  const usePageHero = corporate || !coverUrl;

  /* Sections: JSONB defansif parse — geçersiz veriler düşer. */
  const sections = parsePageSections(
    (page as { sections?: unknown }).sections
  );
  const hasSections = sections.length > 0;
  const hasBody =
    typeof body === "string" && body.trim().length > 0;

  /* CMS içerik rozeti + eyebrow. lines boşsa (yalnız Hakkımızda) badge
     render edilmez ve eyebrow üstteki PageHero eyebrow'una taşınır. */
  const cmsBadge = getCmsBadge(slug, page.title);
  const heroEyebrow = getCorporateEyebrow(slug, page.title);

  /* SEO: BreadcrumbList JSON-LD */
  const breadcrumbLd = buildBreadcrumb([
    { name: "Ana sayfa", url: "/" },
    { name: page.title || "Sayfa" },
  ]);

  return (
    <article className="bg-white">
      <JsonLd data={breadcrumbLd} />

      {/* ============================================================
          HERO
          - usePageHero=false (cover'lı gerçek içerik sayfası):
            mevcut editorial hero + cover (DOKUNULMADI)
          - usePageHero=true (kurumsal/yasal VEYA cover'sız):
            paylaşılan premium PageHero (içerik rozeti)
          ============================================================ */}
      {!usePageHero ? (
        <section className="px-5 md:px-10 lg:px-16 pt-32 md:pt-44 pb-12 md:pb-20">
          <div className="max-w-3xl mx-auto">
            {/* Breadcrumb */}
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-2 text-[11px] tracking-[0.16em] uppercase font-medium text-[var(--color-stone-500)] mb-6"
            >
              <Link
                href="/"
                className="hover:text-[var(--color-champagne-700)] transition-colors"
              >
                Ana sayfa
              </Link>
              <span aria-hidden="true">·</span>
              <span className="text-[var(--color-stone-700)]">{page.title}</span>
            </nav>

            {/* Eyebrow */}
            <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)]">
              <span className="inline-block w-8 h-px bg-[var(--color-stone-300)] align-middle mr-3" />
              İçerik
            </p>

            {/* Title — premium serif */}
            <h1 className="font-display text-[40px] md:text-[64px] lg:text-[80px] text-[var(--color-stone-900)] mt-6 leading-[1.02] tracking-[-0.035em]">
              {page.title}
            </h1>

            {/* Excerpt */}
            {excerpt && (
              <p className="text-[17px] md:text-[20px] leading-[1.55] text-[var(--color-stone-500)] mt-8 max-w-2xl">
                {excerpt}
              </p>
            )}
          </div>

          {/* Cover image — full-width premium */}
          <div className="max-w-[1100px] mx-auto mt-12 md:mt-16">
            <div className="relative aspect-[16/9] overflow-hidden rounded-3xl bg-[var(--color-sand-50)]">
              <Image
                src={coverUrl as string}
                alt={page.title || ""}
                fill
                priority
                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 1100px"
                className="object-cover object-center"
              />
            </div>
          </div>
        </section>
      ) : (
        <PageHero
          breadcrumb={[
            { name: "Ana sayfa", href: "/" },
            { name: page.title || "Sayfa" },
          ]}
          eyebrow={heroEyebrow}
          title={page.title || "Sayfa"}
          description={excerpt || undefined}
          badge={cmsBadge}
        />
      )}

      {/* ============================================================
          CONTENT CONTAINER — prose typography
          ============================================================ */}
      <section
        className={
          "px-5 md:px-10 lg:px-16 pb-32 md:pb-44 " +
          (usePageHero ? "pt-12 md:pt-16" : "")
        }
      >
        {/* 🛡️ Content container — kurumsal/longform editorial genişlik.
           KVKK / sözleşme / hakkımızda gibi sayfalar dar "blog kolon"
           hissi vermesin diye 1100px'e çıkarıldı. Bu değer aynı
           sayfanın HERO cover'ı (`max-w-[1100px]`, yukarıda) ile
           BİREBİR aynı → desktop'ta cover ile body kenarları visual
           olarak hizalanır (modern premium kurumsal düzen).

           Responsive davranış:
             • mobil <768px      → viewport - px-5 (40px) padding aktif;
                                    1100px sınırı devre dışı (no-op)
             • tablet 768–1024   → md:px-10 (80px) padding aktif; 1100px
                                    yine devre dışı
             • laptop 1024–1280  → lg:px-16 (128px) padding kontrol;
                                    içerik ~896-1152px arasında
             • desktop >=1280px  → 1100px sınır aktif, mx-auto ile ortalı

           Hero (max-w-3xl), navbar, footer, typography, leading,
           font-size DOKUNULMADI. */}
        <div className="max-w-[1100px] mx-auto space-y-12 md:space-y-16">
          {/* Sections varsa render, yoksa body fallback */}
          {hasSections ? (
            sections.map((s, idx) => (
              <PageSectionRenderer key={idx} section={s} />
            ))
          ) : hasBody ? (
            <div className="space-y-5">
              {body!
                .split(/\n\s*\n/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((p, i) => (
                  <p
                    key={i}
                    className="text-[16px] md:text-[17px] leading-[1.8] text-[var(--color-stone-700)] whitespace-pre-line"
                  >
                    {p}
                  </p>
                ))}
            </div>
          ) : (
            <p className="text-[var(--color-stone-400)] italic text-center">
              İçerik yakında.
            </p>
          )}
        </div>
      </section>
    </article>
  );
}
