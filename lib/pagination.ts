/* ===============================================================
   🛡️ PAGINATION HELPERS — public + admin paylaşılabilir
   ===============================================================
   Public sayfalar (/arama, /kiralik-villalar) için constants +
   parse + window helper'ları. Admin tarafı (VillaOperationsList)
   şu an kendi inline `computePageWindow` ve allowed list'ini
   tutuyor — değişmez. Bu modül public için yeni; admin ileride
   migrate edilirse mevcut sözleşmeyi koruyarak buraya geçebilir.

   ⚠️ KESIN KURAL:
     - Admin pagination dosyalarına dokunma.
     - Repository / service / cache katmanına çıkma.
     - Yalnız pure helper'lar; side-effect yok.
=============================================================== */

/** Public pagination için izin verilen sayfa boyutları.
 *  Default 12 (URL'de yazılmaz; clean URL). 30/50/100 seçilirse
 *  URL'de `?pageSize=N` olarak görünür. */
export const ALLOWED_PUBLIC_PAGE_SIZES = [12, 30, 50, 100] as const;
export const DEFAULT_PUBLIC_PAGE_SIZE = 12;

/** Allow-list check + defansif clamp. Geçersiz değer (raw string
 *  parse hatası, allow-list dışı sayı) → default. */
export function parsePublicPageSize(raw: unknown): number {
  if (Array.isArray(raw)) raw = raw[0];
  const n = typeof raw === "string" ? Number(raw) : Number(raw);
  if (
    !Number.isFinite(n) ||
    !ALLOWED_PUBLIC_PAGE_SIZES.includes(
      n as (typeof ALLOWED_PUBLIC_PAGE_SIZES)[number]
    )
  ) {
    return DEFAULT_PUBLIC_PAGE_SIZE;
  }
  return n;
}

/** 1-based page parse — Number.parseInt + clamp(>=1).
 *  totalPages caller tarafında ayrıca clamp edilir (totalPages
 *  henüz hesaplanmamış olabilir burada). */
export function parsePublicPage(raw: unknown): number {
  if (Array.isArray(raw)) raw = raw[0];
  const n =
    typeof raw === "string"
      ? Number.parseInt(raw, 10)
      : Number.parseInt(String(raw ?? "1"), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/* ===============================================================
   🛡️ PAGE WINDOW — "1 ... 8 9 10 11 12 ... 42" pattern
   ===============================================================
   Admin'in `VillaOperationsList.computePageWindow` ile aynı
   algoritma; pure function olarak burada.
   Algoritma:
     - totalPages <= 7 → tüm sayfalar görünür
     - aksi halde: 1, last, page±1, ve uçlara yakınsa 2/3 veya
       last-1/last-2; aralarda "…" ellipsis.
=============================================================== */
export function computePageWindow(
  page: number,
  totalPages: number
): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const set = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  if (page <= 3) {
    set.add(2);
    set.add(3);
  }
  if (page >= totalPages - 2) {
    set.add(totalPages - 1);
    set.add(totalPages - 2);
  }
  const sorted = Array.from(set)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  const out: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("…");
    out.push(sorted[i]);
  }
  return out;
}
