import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { CalendarDays } from "lucide-react";

import { getBlogPostBySlug } from "@/app/services/blog.service";
import { sanitizeHtml, stripHtml } from "@/lib/html-sanitize";
import { resolveAssetUrl } from "@/lib/storage.helpers";
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

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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
  const dateLabel = formatDate(post.published_at);

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

  return (
    <main className="px-5 md:px-10 lg:px-16 py-12 md:py-20">
      <JsonLd data={articleLd} />
      <JsonLd data={breadcrumbLd} />
      <article className="max-w-[760px] mx-auto">
        {/* Breadcrumb */}
        <nav className="text-[12px] text-[var(--color-stone-400)] mb-6 flex items-center gap-1.5">
          <Link href="/" className="hover:text-[var(--color-stone-700)]">
            Ana Sayfa
          </Link>
          <span>/</span>
          <Link href="/blog" className="hover:text-[var(--color-stone-700)]">
            Blog
          </Link>
        </nav>

        {post.category && (
          <span className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--brand-coral)]">
            {post.category}
          </span>
        )}
        <h1 className="font-display font-medium text-[28px] md:text-[40px] leading-tight tracking-[-0.02em] text-[var(--color-stone-900)] mt-2">
          {post.title}
        </h1>
        <div className="mt-3 flex items-center gap-3 text-[13px] text-[var(--color-stone-400)]">
          {dateLabel && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={14} />
              {dateLabel}
            </span>
          )}
          {post.author && <span>· {post.author}</span>}
        </div>

        {cover && (
          <div className="relative aspect-[16/9] mt-7 rounded-2xl overflow-hidden bg-[var(--color-sand-50)]">
            <Image
              src={cover}
              alt={post.title}
              fill
              sizes="(max-width:768px) 100vw, 760px"
              className="object-cover"
              priority
              unoptimized
            />
          </div>
        )}

        {post.body && post.body.trim() ? (
          <div
            className="villa-description mt-8 text-[var(--color-stone-700)] leading-[1.85] text-[16px]"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.body) }}
          />
        ) : (
          post.excerpt && (
            <p className="mt-8 text-[16px] leading-relaxed text-[var(--color-stone-600)]">
              {post.excerpt}
            </p>
          )
        )}
      </article>
    </main>
  );
}
