import type { MetadataRoute } from "next";

/* 🛡️ EXIT HARDENING — sitemap'in inline `supabase.from()` çağrıları
   repository'ye taşındı (Katman A). Davranış AYNEN: villa
   (is_active=true & deleted_at IS NULL, slug+created_at) ve pages
   (is_active=true) aynı filtre + fail-soft. createSupabaseServerClient
   artık gerekmez (RLS anon context repository `db` üzerinden aynen). */
import { villaRepository } from "@/lib/db/villa.repository";
import { pagesRepository } from "@/lib/db/pages.repository";
/* 🛡️ Blog (FAZ 3) — yayında olan blog yazıları sitemap'e dahil. */
import { blogRepository } from "@/lib/db/blog.repository";

/* ===============================================================
   🛡️ SITEMAP — Next.js App Router (production-grade, dynamic)
   ===============================================================
   GERÇEK PUBLIC URL MİMARİSİ (analiz sonucu):
     INDEXLENEN:
       /                       (anasayfa)
       /kiralik-villalar       (villa listesi)
       /iletisim               (statik)
       /teklif-al              (lead-gen landing)
       /kiralik-villa/[slug]   (DYNAMIC — aktif villalar)
       /p/[slug]               (DYNAMIC — aktif CMS sayfaları)
     HARİÇ (sitemap'e ASLA girmez):
       /arama                  (query-based, force-dynamic, duplicate)
       /favoriler              (kullanıcı state)
       /favoriler/paylas/[token], /liste/[token], /v/[token]  (token, per-user)
       /rezervasyon/[slug]     (transactional, villa detay duplicate'i)
       /maki-admin/*, /api/*   ((public) dışı — zaten kapsam dışı)

   VERİ KAYNAKLARI (public-read, anon server-side OK — sitemap public
   görünürlüğü yansıtmalı; RLS ile gizli satır sitemap'e GİRMEZ):
     - villa  : slug + created_at, is_active=true & deleted_at IS NULL
     - pages  : slug + created_at, is_active=true
   Minimal projeksiyon (slug, created_at) → 1000+ villa'da hafif sorgu.

   ⚠️ NOT — `updated_at` schema'da YOK (sadece `created_at` mevcut).
   Eski sitemap implementasyonu `updated_at` istiyordu, runtime error
   veriyordu ("column ... does not exist"). `created_at` ile
   değiştirildi — lastModified semantiği "kayıt yaratıldığı an" oldu
   (Google bunu yine kabul eder; gerçek update timestamp ileride
   trigger ile eklenebilir).

   ⚠️ ÖN KOŞUL — ABSOLUTE URL:
     Sitemap spec absolute URL ister. SITE_URL boşsa URL'ler relative
     kalır → geçersiz sitemap. NEXT_PUBLIC_SITE_URL (veya
     NEXT_PUBLIC_VERCEL_URL) prod'da SET EDİLMELİ. StructuredData ile
     aynı kaynak/öncelik.

   SCALING:
     - Tek sitemap.ts → 50.000 URL / 50MB limitine kadar (1000+ villa
       rahatça kapsanır). 50k+ için Next `generateSitemaps()` ile
       sitemap-index'e geçilir (gelecek; yorum altta).

   CACHE: ISR — `revalidate = 3600` (saatlik). Villa/sayfa CRUD sonrası
     en geç 1 saatte yansır; istenirse `revalidatePath("/sitemap.xml")`
     ile anında invalidate edilebilir (gelecek hook).
   =============================================================== */

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_VERCEL_URL ||
  ""
).replace(/\/+$/, "");

/* ISR: saatlik yeniden üretim. Sitemap her istekte DB'ye gitmez;
   pencere içinde cache'ten servis edilir → cache-friendly + ölçeklenir. */
export const revalidate = 3600;

function url(path: string): string {
  if (!SITE_URL) {
    /* Prod'da olmamalı; build/preview'de relative kalmasın diye uyarı. */
    console.warn(
      "[sitemap] NEXT_PUBLIC_SITE_URL tanımsız — sitemap URL'leri relative; prod'da SET EDİLMELİ."
    );
  }
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${p}`;
}

function toDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

type SlugRow = { slug: string | null; created_at: string | null };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /* 🛡️ EXIT HARDENING — villa + pages query'leri repository'den.
     SSR client init kaldırıldı (artık kullanılmıyor). */

  /* ---------- STATIK INDEXLENEN ROUTE'LAR ---------- */
  const now = new Date();
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: url("/"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: url("/kiralik-villalar"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: url("/iletisim"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: url("/teklif-al"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  /* ---------- DİNAMİK: AKTİF VİLLALAR ---------- */
  let villaEntries: MetadataRoute.Sitemap = [];
  try {
    /* 🛡️ EXIT HARDENING — repository slim read. Fail-soft repo
       içinde ([] on error); davranış AYNEN. */
    const data = await villaRepository.listPublicSlugs();
    villaEntries = ((data as SlugRow[] | null) || [])
      .filter((v) => !!v.slug)
      .map((v) => ({
        url: url(`/kiralik-villa/${v.slug}`),
        lastModified: toDate(v.created_at),
        changeFrequency: "weekly",
        priority: 0.8,
      }));
  } catch (err) {
    /* Fail-soft: villa fetch patlarsa statik + sayfa entry'leri yine döner. */
    console.error(
      "[sitemap] villa fetch EXCEPTION:",
      err instanceof Error ? err.message : err
    );
  }

  /* ---------- DİNAMİK: AKTİF CMS SAYFALARI (/p/[slug]) ---------- */
  let pageEntries: MetadataRoute.Sitemap = [];
  try {
    /* 🛡️ EXIT HARDENING — mevcut `pagesRepository.findActivePages()`
       (is_active=true). Superset SELECT (slug+created_at dahil);
       sitemap yalnız slug+created_at okur → davranış AYNEN. */
    const { data, error } = await pagesRepository.findActivePages();

    if (error) {
      console.error("[sitemap] pages fetch error:", error.message);
    } else {
      pageEntries = ((data as SlugRow[] | null) || [])
        .filter((p) => !!p.slug)
        .map((p) => ({
          url: url(`/p/${p.slug}`),
          lastModified: toDate(p.created_at),
          changeFrequency: "monthly",
          priority: 0.6,
        }));
    }
  } catch (err) {
    console.error(
      "[sitemap] pages fetch EXCEPTION:",
      err instanceof Error ? err.message : err
    );
  }

  /* ---------- DİNAMİK: YAYINDA BLOG YAZILARI (/blog/[slug]) ---------- */
  let blogEntries: MetadataRoute.Sitemap = [];
  try {
    const { data, error } = await blogRepository.findActiveSlugs();
    if (error) {
      console.error("[sitemap] blog fetch error:", error.message);
    } else {
      blogEntries = (
        (data as
          | { slug: string | null; published_at: string | null; updated_at: string | null }[]
          | null) || []
      )
        .filter((b) => !!b.slug)
        .map((b) => ({
          url: url(`/blog/${b.slug}`),
          lastModified: toDate(b.updated_at || b.published_at),
          changeFrequency: "weekly",
          priority: 0.7,
        }));
    }
  } catch (err) {
    console.error(
      "[sitemap] blog fetch EXCEPTION:",
      err instanceof Error ? err.message : err
    );
  }

  /* Blog index sayfası (statik route). */
  const blogIndexEntry: MetadataRoute.Sitemap = [
    {
      url: url("/blog"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
    },
  ];

  return [
    ...staticEntries,
    ...villaEntries,
    ...pageEntries,
    ...blogIndexEntry,
    ...blogEntries,
  ];
}

/* ===============================================================
   🔭 GELECEK — 50.000+ URL (sitemap index)
   ===============================================================
   Villa sayısı 50k'yı aşarsa Next.js `generateSitemaps()` ile
   chunk'lara böl (her chunk ≤ 50k URL); Next otomatik sitemap-index
   üretir:
     export async function generateSitemaps() {
       // toplam villa / 45000 → [{id:0},{id:1},...]
     }
     export default async function sitemap({ id }: { id: number }) {
       // id*45000 .. (id+1)*45000 arası villa slice
     }
   Şu anki tek-dosya yaklaşımı 1000+ villa için fazlasıyla yeterli.
   =============================================================== */
