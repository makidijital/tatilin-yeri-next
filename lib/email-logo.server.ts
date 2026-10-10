import "server-only";
import { SITE_URL } from "@/lib/seo";
import {
  resolveAssetUrl,
  resolveAssetUrlVersioned,
} from "@/lib/storage.helpers";
import { EMAIL_LOGO_PATH } from "@/app/lib/mail/templates/email-logo";

/* ===============================================================
   📧 E-POSTA LOGOSU — sunucu tarafı (PNG üretimi + URL)
   ===============================================================
   SORUN: Site logosu admin panelinden yüklenirken HER ZAMAN WebP'ye
   çevrilip `site-assets/logo/logo.webp` olarak saklanıyor (şeffaf
   alan korunarak). E-postalar bu dosyayı doğrudan kullanıyordu:
     • Gmail görselleri kendi proxy'sinden geçirip yeniden kodlar;
       şeffaf alanlar bu süreçte siyaha döner → logo siyah
       dikdörtgen içinde, bozuk görünür.
     • Outlook (Windows) WebP'yi hiç göstermez.
     • <img>'de genişlik/yükseklik ÖZNİTELİĞİ yoktu → Outlook logoyu
       gerçek piksel boyutunda (dev) basar.

   ÇÖZÜM: E-postalar için aynı logodan, beyaz zemine oturtulmuş
   (e-posta başlığı zaten beyaz → görünüm aynı) ve 2x çözünürlükte
   bir PNG üretilir; herkese açık, doğrudan resim dönen
   `/api/public/email-logo` adresinden sunulur. URL'deki `w`/`h`
   logonun e-postadaki gösterim ölçüsüdür (1x) → şablon açık
   width/height basar; PNG'nin kendisi 2x (retina) üretilir.

   Sitedeki logo, Header/Footer ve PDF/yazdırma belgesi DEĞİŞMEZ
   (tarayıcılar WebP'yi sorunsuz gösterir).

   GÜVENLİ GERİ DÖNÜŞ: PNG üretilemezse (logo yok, ağ hatası, sharp
   yok) veya site adresi herkese açık bir https adresi değilse eski
   davranışa (orijinal logo URL'i) dönülür — e-posta asla bozulmaz.
   =============================================================== */

/** E-posta logo kutusu (email-shell ile aynı: en fazla 240×60 px). */
const BOX_WIDTH = 240;
const BOX_HEIGHT = 60;
const FETCH_TIMEOUT_MS = 5000;
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

export type EmailLogoPng = {
  buffer: Buffer;
  /** PNG piksel ölçüsü (≈2x, retina). */
  width: number;
  height: number;
  /** E-postada gösterim ölçüsü (1x; eski davranışla aynı: doğal
   *  boyut, 240×60 kutusuna sığdırılmış, büyütülmeden). */
  displayWidth: number;
  displayHeight: number;
};

/* Kaynak URL başına tek üretim (aynı sunucu örneğinde tekrar tekrar
   indirip dönüştürmemek için). Başarısız sonuç önbelleğe alınmaz. */
const cache = new Map<string, Promise<EmailLogoPng | null>>();

async function produce(sourceUrl: string): Promise<EmailLogoPng | null> {
  const res = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const type = (res.headers.get("content-type") || "").toLowerCase();
  if (!type.startsWith("image/")) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_SOURCE_BYTES) return null;

  const sharp = (await import("sharp")).default;
  const meta = await sharp(bytes, { animated: false }).metadata();
  const natW = meta.width || 0;
  const natH = meta.height || 0;
  if (!natW || !natH) return null;
  const s1 = Math.min(BOX_WIDTH / natW, BOX_HEIGHT / natH, 1);
  const displayWidth = Math.max(1, Math.round(natW * s1));
  const displayHeight = Math.max(1, Math.round(natH * s1));

  const { data, info } = await sharp(bytes, { animated: false })
    /* 2x gösterim ölçüsü; kaynaktan büyük üretilmez. */
    .resize({
      width: displayWidth * 2,
      height: displayHeight * 2,
      fit: "inside",
      withoutEnlargement: true,
    })
    /* Şeffaf alan → beyaz (e-posta başlık zemini). Logonun kendi
       renkleri AYNEN kalır; yalnız saydamlık beyaza oturtulur. */
    .flatten({ background: "#ffffff" })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    width: info.width,
    height: info.height,
    displayWidth,
    displayHeight,
  };
}

/** Site logosunu e-posta için PNG'ye çevirir; hata → null. */
export async function renderEmailLogoPng(
  sourceUrl: string
): Promise<EmailLogoPng | null> {
  let p = cache.get(sourceUrl);
  if (!p) {
    p = produce(sourceUrl).catch((err) => {
      console.error("[email-logo] PNG üretilemedi", {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    });
    cache.set(sourceUrl, p);
  }
  const result = await p;
  if (!result) cache.delete(sourceUrl);
  return result;
}

/**
 * E-postalarda kullanılacak logo adresi.
 * - Başarılı: `${SITE_URL}/api/public/email-logo?v=…&w=…&h=…` (PNG)
 * - Aksi halde: eski davranış (orijinal logo URL'i, `?v=` ile).
 * - Logo yoksa: null (şablon logo bloğunu hiç basmaz — mevcut kural).
 */
export async function resolveEmailLogoUrl(
  siteLogo: string | null | undefined,
  updatedAt?: string | number | null
): Promise<string | null> {
  const fallback = resolveAssetUrlVersioned(siteLogo, updatedAt) || null;
  const source = resolveAssetUrl(siteLogo);
  if (!source) return null;

  /* E-posta istemcisi (ör. Gmail proxy'si) bu adrese internetten
     ulaşabilmeli → yalnız https site adresi. localhost/boş → eski URL. */
  if (!/^https:\/\//i.test(SITE_URL)) return fallback;

  const png = await renderEmailLogoPng(source);
  if (!png) return fallback;

  const q = new URLSearchParams();
  if (updatedAt !== undefined && updatedAt !== null && updatedAt !== "") {
    q.set("v", String(updatedAt));
  }
  q.set("w", String(png.displayWidth));
  q.set("h", String(png.displayHeight));
  return `${SITE_URL}${EMAIL_LOGO_PATH}?${q.toString()}`;
}
