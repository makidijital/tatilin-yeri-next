import "server-only";

import { DEFAULT_LOCALE, toLocale, type Locale } from "@/lib/i18n/config";
import {
  getTranslation,
  resolveTranslatedField,
} from "@/lib/i18n/get-translation.server";

/* ===============================================================
   🛡️ PHASE 12D — CMS SAYFA (pages) ÇEVİRİ OKUMA KATMANI
   ===============================================================
   `lib/i18n/get-faq-translations.server.ts` (Phase 11) ile AYNI
   desen: MEVCUT generic okuma katmanının (`getTranslation` +
   `resolveTranslatedField`, Phase 5) üzerine, tek bir entity için
   ince bir "çöz ve fallback'le" sarmalayıcısı. Yeni repository,
   yeni tablo, yeni cache YOK.

   TR KISAYOLU: `locale === "tr"` (veya geçersiz bir değer →
   `toLocale` ile TR'ye düşer) ise `page_translations` tablosuna
   HİÇ SORGU ATILMAZ; canonical değerler aynen döner. Mevcut TR
   `/p/[slug]` davranışına SIFIR ek DB maliyeti.

   FALLBACK: Alan bazında. Çeviri satırı olsa bile boş/NULL bir
   kolon canonical TR değerine düşer (`resolveTranslatedField`
   semantiği, migration 082'de tüm çevrilebilir kolonlar nullable).
   Çeviri satırı hiç yoksa TÜM alanlar TR'ye düşer — ancak URL
   (`/en/p/...`) korunur.

   KAPSAM: migration 082 `page_translations` kolonlarıyla BİREBİR —
   title · excerpt · body · seo_title · seo_description.
   `slug` ve `sections` ÇEVRİLMEZ (tabloda kolonları YOK).
   =============================================================== */

/** `pages` satırından okunan canonical (TR) alanlar. Alan adları DB
 *  kolonlarıyla birebir; `content` mevcut defansif body/content
 *  drift fix'i için (bkz. app/p/[slug]/page.tsx). */
export type PageCanonicalContent = {
  id?: string | null;
  title?: string | null;
  excerpt?: string | null;
  body?: string | null;
  content?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
};

export type ResolvedPageContent = {
  title: string | null;
  excerpt: string | null;
  body: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

function canonicalBody(page: PageCanonicalContent): string | null {
  return page.body ?? page.content ?? null;
}

function canonicalContent(page: PageCanonicalContent): ResolvedPageContent {
  return {
    title: page.title ?? null,
    excerpt: page.excerpt ?? null,
    body: canonicalBody(page),
    seoTitle: page.seo_title ?? null,
    seoDescription: page.seo_description ?? null,
  };
}

/**
 * Bir `pages` satırını + hedef locale'i alır, public tarafta
 * gösterilecek NİHAİ metinleri döner.
 *
 * - TR (veya geçersiz locale) → canonical değerler, sorgu YOK.
 * - `page.id` yoksa → canonical değerler, sorgu YOK (savunmacı).
 * - Çeviri okunamazsa (`getTranslation` hata halinde `null` döner,
 *   asla throw etmez) → canonical değerler. Public render bir
 *   çeviri okuma sorunuyla ASLA çökmez.
 */
export async function resolvePageContent(
  page: PageCanonicalContent | null | undefined,
  locale: Locale
): Promise<ResolvedPageContent> {
  if (!page) {
    return {
      title: null,
      excerpt: null,
      body: null,
      seoTitle: null,
      seoDescription: null,
    };
  }

  const resolvedLocale = toLocale(locale);
  const canonical = canonicalContent(page);

  if (resolvedLocale === DEFAULT_LOCALE) return canonical;

  const pageId = (page.id ?? "").toString().trim();
  if (!pageId) return canonical;

  const row = await getTranslation("page", pageId, resolvedLocale);
  if (!row) return canonical;

  return {
    title: resolveTranslatedField(row.title, canonical.title),
    excerpt: resolveTranslatedField(row.excerpt, canonical.excerpt),
    body: resolveTranslatedField(row.body, canonical.body),
    seoTitle: resolveTranslatedField(row.seo_title, canonical.seoTitle),
    seoDescription: resolveTranslatedField(
      row.seo_description,
      canonical.seoDescription
    ),
  };
}
