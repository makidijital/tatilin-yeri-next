import { NextResponse } from "next/server";
import { getPublicSettings } from "@/app/services/settings.service";
import { resolveAssetUrl } from "@/lib/storage.helpers";
import { renderEmailLogoPng } from "@/lib/email-logo.server";

/* ===============================================================
   📧 GET /api/public/email-logo — e-posta logosu (PNG)
   ===============================================================
   Herkese açık, oturum gerektirmez; doğrudan `image/png` döner
   (Gmail/Outlook/iPhone Mail görsel proxy'leri buradan çeker).

   Kaynak: settings.site_logo (sitedeki logo, WebP). Şeffaf alan beyaza
   oturtulur, 2x PNG üretilir — bkz. lib/email-logo.server.ts.
   Query (`v`, `w`, `h`) yalnız önbellek anahtarı / şablon ölçüsü
   içindir; içerik her zaman güncel site logosundan üretilir.
   Kullanıcı girdisiyle URL çekilmez (SSRF yok).

   Hata: PNG üretilemezse orijinal logoya 302; logo hiç yoksa 404.
   =============================================================== */
export const runtime = "nodejs";

export async function GET() {
  const settings = await getPublicSettings().catch(() => null);
  const source = resolveAssetUrl(settings?.site_logo);
  if (!source) {
    return new NextResponse("Logo bulunamadı", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const png = await renderEmailLogoPng(source);
  if (!png) {
    return NextResponse.redirect(source, {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return new NextResponse(new Uint8Array(png.buffer), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.buffer.length),
      /* URL `?v=settings.updated_at` taşır → logo değişince yeni URL. */
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
