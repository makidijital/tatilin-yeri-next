import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";

import { getBlogPostBySlug } from "@/app/services/blog.service";
import { sanitizeHtml, stripHtml } from "@/lib/html-sanitize";
import { resolveAssetUrl } from "@/lib/storage.helpers";
import PageHero from "@/app/components/ui/PageHero";
import {
  JsonLd,
  buildArticle,
  buildBreadcrumb,
} from "@/app/components/seo/StructuredData";

/* ===============================================================
   🛡️ BLOG DETAY — /blog/[slug] (public, FAZ 3)
   ===============================================================
   getBlogPostBySlug (anon db + RLS is_active=true → taslak otomatik
   404). body → sanitizeHtml (XSS) + .villa-description prose REUSE.
   Metadata/canonical/OG + Article & Breadcrumb JSON-LD.
   Villa/rezervasyon/fiyat sistemlerine dokunmaz.
   =============================================================== */

export const dynamic = "force-dynamic";

function excerptFrom(text: string, max = 160): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, "").trim() + "…";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) {
    return { title: "Yazı bulunamadı", robots: { index: false, follow: false } };
  }

  const title = post.seo_title?.trim() || post.title;
  const description =
    post.seo_description?.trim() ||
    (post.excerpt?.trim() ? post.excerpt.trim() : "") ||
    (post.body ? excerptFrom(stripHtml(post.body), 160) : "");
  const cover = resolveAssetUrl(post.og_image || post.cover_image) || undefined;
  const canonical = `/blog/${post.slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    robots: post.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: "article",
      title,
      description,
      url: canonical,
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

export default async function BlogDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) notFound();

  const cover = resolveAssetUrl(post.cover_image);

  const articleLd = buildArticle({
    slug: post.slug,
    title: post.title,
    description:
      post.seo_description?.trim() ||
      post.excerpt?.trim() ||
      (post.body ? excerptFrom(stripHtml(post.body), 160) : null),
    image: post.og_image || post.cover_image,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    author: post.author,
  });
  const breadcrumbLd = buildBreadcrumb([
    { name: "Ana Sayfa", url: "/" },
    { name: "Blog", url: "/blog" },
    { name: post.title },
  ]);

  /* 🛡️ TASARIM — CMS sayfa detayı (app/p/[slug]) ile BİREBİR hizalı:
     PageHero (breadcrumb + eyebrow + title + description) + aynı content
     container (px-5 md:px-10 lg:px-16 pb-32 md:pb-44 pt-12 md:pt-16 +
     max-w-[1100px] mx-auto). Yalnız görsel; data/SEO/JSON-LD aynen. */
  return (
    <article className="bg-white">
      <JsonLd data={articleLd} />
      <JsonLd data={breadcrumbLd} />

      <PageHero
        breadcrumb={[
          { name: "Ana sayfa", href: "/" },
          { name: "Blog", href: "/blog" },
          { name: post.title },
        ]}
        eyebrow={post.category || "Blog"}
        title={post.title}
        description={post.excerpt || undefined}
      />

      <section className="px-5 md:px-10 lg:px-16 pb-32 md:pb-44 pt-12 md:pt-16">
        <div className="max-w-[1100px] mx-auto space-y-12 md:space-y-16">
          {cover && (
            <div className="relative aspect-[16/9] overflow-hidden rounded-3xl bg-[var(--color-sand-50)]">
              <Image
                src={cover}
                alt={post.title}
                fill
                priority
                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 1100px"
                className="object-cover object-center"
                unoptimized
              />
            </div>
          )}

          {post.body && post.body.trim() ? (
            <div
              className="villa-description text-[16px] md:text-[17px] leading-[1.8] text-[var(--color-stone-700)]"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.body) }}
            />
          ) : post.excerpt ? (
            <p className="text-[16px] md:text-[17px] leading-[1.8] text-[var(--color-stone-700)]">
              {post.excerpt}
            </p>
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
