/* ===============================================================
   🛡️ SITE POPUP — ortak tipler + SAF doğrulama/karar yardımcıları
   ===============================================================
   Açılış/kampanya popup'ı (migration 095 `site_popup`). Bu dosya
   SAF'tır (DB/fetch/side-effect YOK) → hem server (service, layout)
   hem client (popup loader) tarafından kullanılabilir.

   GÜVENLİK KURALLARI (tek kaynak):
     • Metinler düz metindir: HTML etiketleri ve kontrol karakterleri
       kaydetmeden önce temizlenir; render React text node'u ile
       (dangerouslySetInnerHTML YOK).
     • Buton URL'i yalnız site-içi "/yol" veya http(s) mutlak URL
       olabilir; `javascript:`, `data:`, `//host` vb. REDDEDİLİR.
   =============================================================== */

export const POPUP_DISMISS_DURATIONS = ["session", "1h", "1d", "7d", "30d"] as const;
export type PopupDismissDuration = (typeof POPUP_DISMISS_DURATIONS)[number];

export const POPUP_DISPLAY_SCOPES = ["home", "all"] as const;
export type PopupDisplayScope = (typeof POPUP_DISPLAY_SCOPES)[number];

export const POPUP_DISMISS_LABELS: Record<PopupDismissDuration, string> = {
  session: "Her ziyarette bir kez (tarayıcı oturumu)",
  "1h": "1 saat sonra tekrar göster",
  "1d": "1 gün sonra tekrar göster",
  "7d": "7 gün sonra tekrar göster",
  "30d": "30 gün sonra tekrar göster",
};

export const POPUP_LIMITS = {
  title: 200,
  description: 600,
  highlight: 24,
  stat: 60,
  statsCount: 4,
  buttonText: 60,
  buttonUrl: 500,
} as const;

/** Görsel storage anahtarı (site-assets bucket). Tek sabit dosya;
 *  public URL `?v=<updated_at>` ile cache-bust edilir. */
export const POPUP_IMAGE_FOLDER = "popup";
export const POPUP_IMAGE_SLUG = "popup";
export const POPUP_IMAGE_PATH = `${POPUP_IMAGE_FOLDER}/${POPUP_IMAGE_SLUG}.webp`;

/** DB satırı (migration 095). */
export type SitePopupRow = {
  id: number;
  is_enabled: boolean;
  image_path: string | null;
  title: string | null;
  description: string | null;
  highlight_text: string | null;
  stats: unknown;
  button_text: string | null;
  button_url: string | null;
  show_button: boolean;
  display_scope: string;
  dismiss_duration: string;
  starts_at: string | null;
  ends_at: string | null;
  updated_at: string;
};

/** Public client'a giden DAR projeksiyon — yalnız render için gereken
 *  alanlar. Admin/iç alanlar (id, ham path) YOK. */
export type PublicSitePopup = {
  version: string;
  imageUrl: string | null;
  title: string | null;
  description: string | null;
  highlight: string | null;
  stats: string[];
  button: { text: string; url: string; external: boolean } | null;
  scope: PopupDisplayScope;
  dismiss: PopupDismissDuration;
  startsAt: string | null;
  endsAt: string | null;
};

/** Düz metin temizliği: HTML etiketleri + kontrol karakterleri atılır,
 *  baş/son boşluk kırpılır, uzunluk sınırlanır. Boş → null. */
export function cleanPopupText(
  value: unknown,
  max: number,
  { multiline = false }: { multiline?: boolean } = {}
): string | null {
  if (typeof value !== "string") return null;
  let s = value.replace(/<[^>]*>/g, "");
  // Kontrol karakterleri (multiline'da \n korunur).
  s = multiline
    ? s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")
    : s.replace(/[\u0000-\u001F\u007F]/g, " ");
  s = multiline ? s.replace(/\n{3,}/g, "\n\n").trim() : s.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.slice(0, max);
}

/** Buton URL'i güvenli mi? İzinli: "/yol" (site-içi) veya http(s)://… */
export function isSafePopupUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const url = value.trim();
  if (!url || url.length > POPUP_LIMITS.buttonUrl) return false;
  if (/[\u0000-\u001F\u007F\s\\]/.test(url)) return false;
  if (url.startsWith("/")) return !url.startsWith("//");
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && !!parsed.hostname;
  } catch {
    return false;
  }
}

export function isPopupDismissDuration(v: unknown): v is PopupDismissDuration {
  return typeof v === "string" && (POPUP_DISMISS_DURATIONS as readonly string[]).includes(v);
}

export function isPopupDisplayScope(v: unknown): v is PopupDisplayScope {
  return typeof v === "string" && (POPUP_DISPLAY_SCOPES as readonly string[]).includes(v);
}

/** Kapatıldıktan sonra kaç ms gizli kalır. session → null (sessionStorage). */
export function popupDismissMs(d: PopupDismissDuration): number | null {
  switch (d) {
    case "1h":
      return 60 * 60 * 1000;
    case "1d":
      return 24 * 60 * 60 * 1000;
    case "7d":
      return 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return 30 * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

/** Tarih penceresi içinde mi? (sınırlar boşsa açık uç). */
export function isWithinPopupWindow(
  nowMs: number,
  startsAt: string | null,
  endsAt: string | null
): boolean {
  const s = startsAt ? Date.parse(startsAt) : NaN;
  const e = endsAt ? Date.parse(endsAt) : NaN;
  if (Number.isFinite(s) && nowMs < s) return false;
  if (Number.isFinite(e) && nowMs >= e) return false;
  return true;
}

/** Ana sayfa yolu mu? TR "/" (+ varsayılan-dil modunda "/tr") ve
 *  EN/DE ana sayfaları. */
export function isPopupHomePath(pathname: string | null | undefined): boolean {
  const p = (pathname || "").replace(/\/+$/, "") || "/";
  return p === "/" || p === "/tr" || p === "/en" || p === "/de";
}

/** Admin tarih input'u ("YYYY-MM-DD", Europe/Istanbul günü) →
 *  timestamptz ISO. start → günün başı, end → ertesi günün başı
 *  (bitiş günü DAHİL). Geçersiz → null. */
export function popupDateToIso(
  value: unknown,
  edge: "start" | "end"
): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const base = Date.parse(`${value}T00:00:00+03:00`);
  if (!Number.isFinite(base)) return null;
  // Round-trip: takvimde olmayan günleri reddet (2027-02-30).
  const check = new Date(base + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (check !== value) return null;
  const ms = edge === "start" ? base : base + 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

/** timestamptz → admin tarih input'u ("YYYY-MM-DD", Europe/Istanbul). */
export function popupIsoToDate(
  iso: string | null | undefined,
  edge: "start" | "end"
): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const shifted = ms + 3 * 60 * 60 * 1000 - (edge === "end" ? 1 : 0);
  return new Date(shifted).toISOString().slice(0, 10);
}

/** Stats jsonb → temiz string dizisi (en fazla 4). */
export function normalizePopupStats(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    const t = cleanPopupText(v, POPUP_LIMITS.stat);
    if (t) out.push(t);
    if (out.length >= POPUP_LIMITS.statsCount) break;
  }
  return out;
}

/** DB satırı → public projeksiyon. Popup gösterilemeyecekse null:
 *  kapalı, hiç içerik yok veya bitiş tarihi geçmiş. (Başlangıç henüz
 *  gelmediyse payload döner; client pencereyi kendisi kontrol eder —
 *  ISR/cache'li sayfalarda da doğru anda açılabilsin diye.) */
export function toPublicSitePopup(
  row: SitePopupRow | null | undefined,
  resolveImageUrl: (path: string, version: string) => string | null,
  nowMs: number = Date.now()
): PublicSitePopup | null {
  if (!row || row.is_enabled !== true) return null;
  if (row.ends_at && Number.isFinite(Date.parse(row.ends_at)) && nowMs >= Date.parse(row.ends_at)) {
    return null;
  }
  const version = String(row.updated_at || "");
  const imageUrl = row.image_path ? resolveImageUrl(row.image_path, version) : null;
  const title = cleanPopupText(row.title, POPUP_LIMITS.title);
  const description = cleanPopupText(row.description, POPUP_LIMITS.description, { multiline: true });
  const highlight = cleanPopupText(row.highlight_text, POPUP_LIMITS.highlight);
  const stats = normalizePopupStats(row.stats);
  const buttonText = cleanPopupText(row.button_text, POPUP_LIMITS.buttonText);
  const buttonUrl = (row.button_url || "").trim();
  const button =
    row.show_button !== false && buttonText && isSafePopupUrl(buttonUrl)
      ? { text: buttonText, url: buttonUrl, external: !buttonUrl.startsWith("/") }
      : null;

  if (!imageUrl && !title && !description && !highlight && stats.length === 0 && !button) {
    return null;
  }

  return {
    version,
    imageUrl,
    title,
    description,
    highlight,
    stats,
    button,
    scope: isPopupDisplayScope(row.display_scope) ? row.display_scope : "home",
    dismiss: isPopupDismissDuration(row.dismiss_duration) ? row.dismiss_duration : "session",
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}
