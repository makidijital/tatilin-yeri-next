import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { CalendarDays, ArrowUpRight } from "lucide-react";

import { getBlogPosts } from "@/app/services/blog.service";
import { resolveAssetUrl } from "@/lib/storage.helpers";
import PageHero from "@/app/components/ui/PageHero";

/* ===============================================================
   🛡️ BLOG INDEX — /blog (public, FAZ 3)
   ===============================================================
   Yayında (is_active=true) blog yazıları, published_at DESC. CMS
   pages public deseni; (public) grubu → header/footer otomatik.
   Villa/rezervasyon/fiyat sistemlerine dokunmaz.
   =============================================================== */

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Villa tatili rehberleri, bölge önerileri ve seyahat ipuçları. Akdeniz'in seçkin köşelerinden güncel blog yazıları.",
  alternates: { canonical: "/blog" },
  openGraph: {
    type: "website",
    title: "Blog",
    description:
      "Villa tatili rehberleri, bölge önerileri ve seyahat ipuçları.",
    url: "/blog",
  },
};

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

export default async function BlogIndexPage() {
  const posts = await getBlogPosts();

  return (
    <>
      <PageHero
        breadcrumb={[
          { name: "Ana sayfa", href: "/" },
          { name: "Blog" },
        ]}
        eyebrow="Blog"
        title="Blog & Rehber"
        description="Villa kiralama, Kaş, Kalkan ve bölge rehberleri, seyahat ipuçları ve tatil önerilerini keşfedin."
      />
    <main className="px-5 md:px-10 lg:px-16 pt-8 md:pt-12 pb-12 md:pb-20">
      <div className="max-w-[1280px] mx-auto">

        {posts.length === 0 ? (
          <div className="rounded-2xl border border-[var(--color-stone-200)] bg-white p-10 text-center text-[var(--color-stone-500)]">
            Henüz blog yazısı yayınlanmadı.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
            {posts.map((post) => {
              const cover = resolveAssetUrl(post.cover_image);
              return (
                <Link
                  key={post.id}
                  href={`/blog/${post.slug}`}
                  className="group flex flex-col rounded-2xl border border-[var(--color-stone-100)] bg-white overflow-hidden hover:border-[var(--color-stone-200)] hover:shadow-[0_12px_30px_-18px_rgb(27_26_23/0.18)] transition-all motion-reduce:transition-none"
                >
                  <div className="relative aspect-[16/10] bg-[var(--color-sand-50)] overflow-hidden">
                    {cover ? (
                      <Image
                        src={cover}
                        alt={post.title}
                        fill
                        sizes="(max-width:768px) 100vw, 33vw"
                        className="object-cover group-hover:scale-[1.03] transition-transform duration-500 motion-reduce:transition-none"
                        unoptimized
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-[var(--color-stone-300)] font-display text-3xl">
                        {post.title?.[0]?.toUpperCase() || "·"}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col flex-1 p-5">
                    {post.category && (
                      <span className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--brand-coral)] mb-2">
                        {post.category}
                      </span>
                    )}
                    <h2 className="font-display font-medium text-[18px] text-[var(--color-stone-900)] leading-snug tracking-[-0.01em]">
                      {post.title}
                    </h2>
                    {post.excerpt && (
                      <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-stone-500)] line-clamp-3">
                        {post.excerpt}
                      </p>
                    )}
                    <div className="mt-4 pt-3 border-t border-[var(--color-stone-100)] flex items-center justify-between text-[12px] text-[var(--color-stone-400)]">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays size={13} />
                        {formatDate(post.published_at)}
                      </span>
                      <ArrowUpRight
                        size={15}
                        className="text-[var(--color-stone-300)] group-hover:text-[var(--brand-coral)] transition-colors"
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
    </>
  );
}
