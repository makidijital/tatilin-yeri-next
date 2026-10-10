/* ===============================================================
   📧 E-POSTA LOGO <img> — tüm e-posta şablonlarında ORTAK
   ===============================================================
   `email-shell` (rezervasyon talebi/onayı/iptali, ödeme bildirimleri,
   test) ve voucher e-postası logoyu bu helper ile basar.

   Logo `/api/public/email-logo` PNG'si ise URL'deki `w`/`h` (1x
   gösterim ölçüsü; PNG 2x üretilir) okunur ve şablonun kutusuna
   sığan boyut açıkça yazılır:
     • `width`/`height` ÖZNİTELİKLERİ → Outlook (Word motoru) logoyu
       doğru boyutta basar.
     • style `width:…px; max-width:100%; height:auto` → dar ekranda
       oranı koruyarak küçülür (Gmail / iPhone Mail).
   Başka bir URL (geri dönüş: orijinal logo) gelirse eski işaretleme
   aynen basılır.
   =============================================================== */

export const EMAIL_LOGO_PATH = "/api/public/email-logo";

function escapeAttr(text: string): string {
  return (text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** URL bizim PNG uç noktamızsa piksel ölçüsünü döndürür. */
export function readEmailLogoSize(
  src: string
): { width: number; height: number } | null {
  try {
    const u = new URL(src);
    if (u.pathname !== EMAIL_LOGO_PATH) return null;
    const w = Number(u.searchParams.get("w"));
    const h = Number(u.searchParams.get("h"));
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      return null;
    }
    return { width: w, height: h };
  } catch {
    return null;
  }
}

export function emailLogoImg(opts: {
  src: string;
  alt: string;
  maxWidth: number;
  maxHeight: number;
  /** Ek inline stil (örn. margin). */
  style?: string;
  /** Ölçü bilinmiyorsa basılacak eski stil (geri dönüş). */
  fallbackStyle: string;
}): string {
  const src = escapeAttr(opts.src);
  const alt = escapeAttr(opts.alt);
  const size = readEmailLogoSize(opts.src);
  if (!size) {
    return `<img src="${src}" alt="${alt}" style="${opts.fallbackStyle}" />`;
  }
  /* Gösterim ölçüsünü şablonun kutusuna sığdır (büyütme yok). */
  const scale = Math.min(
    opts.maxWidth / size.width,
    opts.maxHeight / size.height,
    1
  );
  const w = Math.max(1, Math.round(size.width * scale));
  const h = Math.max(1, Math.round(size.height * scale));
  return `<img src="${src}" alt="${alt}" width="${w}" height="${h}" style="display:block;border:0;outline:none;text-decoration:none;width:${w}px;max-width:100%;height:auto;${opts.style || ""}" />`;
}
