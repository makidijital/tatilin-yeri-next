import { translationRepository } from "@/lib/db/translation.repository.server";
import { pagesServerRepository } from "@/lib/db/pages.repository.server";
import type { PageTranslationRow } from "@/lib/i18n/translations.types";

/**
 * 🛡️ PHASE 12C — Admin Sayfa (pages) Çeviri Servisi
 *
 * `app/services/villa-translation.service.ts` (Phase 10A) ile BİREBİR
 * AYNI desen — aynı gerekçeler:
 *   - çok alanlı entity (villa: description/badge/seo_*, page:
 *     title/excerpt/body/seo_*),
 *   - parent existence pre-check VAR (`pagesServerRepository.findById`,
 *     villa'daki `findSlugById` muadili),
 *   - TÜM iş kuralı doğrulaması BURADA (repository yalnız DB
 *     primitive'i — bkz. translation.repository.server.ts `upsertOne`).
 *
 * Çevrilen kolonlar migration 082'deki `page_translations` tablosuyla
 * BİREBİR: title, body, excerpt, seo_title, seo_description.
 * ⚠️ `sections` (JSONB) ve `slug` ÇEVRİLMEZ — `page_translations`
 * tablosunda böyle kolon YOKTUR; yeni kolon/migration İCAT EDİLMEDİ.
 *
 * TR bu servisten YAZILAMAZ (locale whitelist "en" | "de"). Boş
 * bırakılan alanlar `null` yazılır → public tarafta TR'ye fallback.
 */

export type WritableTranslationLocale = "en" | "de";

function isWritableLocale(value: unknown): value is WritableTranslationLocale {
  return value === "en" || value === "de";
}

/* Limitler: SEO alanları proje genelindeki değerlerle AYNI
   (villa-translation.service.ts / SeoStep.tsx: 120 / 300).
   title 200 → TypeTranslationsPanel `maxLength={200}` ile aynı.
   excerpt 300, body 20000 → CMS sayfa gövdesi villa açıklamasından
   (5000) uzun olabildiği için daha geniş, ancak sınırsız DEĞİL. */
const MAX_TITLE_LEN = 200;
const MAX_EXCERPT_LEN = 300;
const MAX_BODY_LEN = 20000;
const MAX_SEO_TITLE_LEN = 120;
const MAX_SEO_DESCRIPTION_LEN = 300;

export const PAGE_TRANSLATION_MAX_LEN = {
  title: MAX_TITLE_LEN,
  excerpt: MAX_EXCERPT_LEN,
  body: MAX_BODY_LEN,
  seoTitle: MAX_SEO_TITLE_LEN,
  seoDescription: MAX_SEO_DESCRIPTION_LEN,
} as const;

export type PageTranslationInput = {
  pageId: string;
  locale: string;
  title?: string | null;
  excerpt?: string | null;
  body?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
};

export type PageTranslationResult =
  | { ok: true; row: PageTranslationRow }
  | { ok: false; error: string };

export type PageTranslationsListResult =
  | { ok: true; rows: PageTranslationRow[] }
  | { ok: false; error: string };

function normalize(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").toString().trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getPageTranslations(
  pageId: string
): Promise<PageTranslationsListResult> {
  const id = (pageId ?? "").toString().trim();
  if (!id) return { ok: false, error: "Geçersiz sayfa" };

  const { data, error } = await translationRepository.findAllForParent(
    "page",
    id
  );
  if (error) return { ok: false, error: "Çeviriler okunamadı" };

  const rows = (data || []).filter((row) => isWritableLocale(row.locale));
  return { ok: true, rows };
}

export async function upsertPageTranslation(
  input: PageTranslationInput
): Promise<PageTranslationResult> {
  const pageId = (input.pageId ?? "").toString().trim();
  if (!pageId) return { ok: false, error: "Geçersiz sayfa" };

  if (!isWritableLocale(input.locale)) {
    return {
      ok: false,
      error: "Geçersiz dil — yalnız 'en' veya 'de' desteklenir",
    };
  }
  const locale = input.locale;

  const title = normalize(input.title);
  if (title && title.length > MAX_TITLE_LEN) {
    return { ok: false, error: `Başlık ${MAX_TITLE_LEN} karakteri geçemez` };
  }

  const excerpt = normalize(input.excerpt);
  if (excerpt && excerpt.length > MAX_EXCERPT_LEN) {
    return {
      ok: false,
      error: `Kısa açıklama ${MAX_EXCERPT_LEN} karakteri geçemez`,
    };
  }

  const body = normalize(input.body);
  if (body && body.length > MAX_BODY_LEN) {
    return { ok: false, error: `İçerik ${MAX_BODY_LEN} karakteri geçemez` };
  }

  const seoTitle = normalize(input.seoTitle);
  if (seoTitle && seoTitle.length > MAX_SEO_TITLE_LEN) {
    return {
      ok: false,
      error: `SEO başlık ${MAX_SEO_TITLE_LEN} karakteri geçemez`,
    };
  }

  const seoDescription = normalize(input.seoDescription);
  if (seoDescription && seoDescription.length > MAX_SEO_DESCRIPTION_LEN) {
    return {
      ok: false,
      error: `SEO açıklama ${MAX_SEO_DESCRIPTION_LEN} karakteri geçemez`,
    };
  }

  /* Parent existence pre-check — villa servisindeki `findSlugById`
     ile AYNI rol: FK hatasını generic mesaja çevirmek yerine erken,
     anlaşılır hata döner. Mevcut repository fonksiyonu REUSE edildi. */
  const { data: pageRow, error: pageError } =
    await pagesServerRepository.findById(pageId);
  if (pageError) return { ok: false, error: "Sayfa doğrulanamadı" };
  if (!pageRow) return { ok: false, error: "Sayfa bulunamadı" };

  const { data, error } = await translationRepository.upsertOne(
    "page",
    pageId,
    locale,
    {
      title,
      excerpt,
      body,
      seo_title: seoTitle,
      seo_description: seoDescription,
    }
  );

  if (error || !data) return { ok: false, error: "Çeviri kaydedilemedi" };
  return { ok: true, row: data };
}
