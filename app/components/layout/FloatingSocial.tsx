import { Phone } from "lucide-react";

import { getCachedSettings } from "@/lib/cache.helpers";

/* ===============================================================
   🛡️ FLOATING CONTACT DOCK — fixed bottom-right conversion widget
   ===============================================================
   AMAÇ:
     Public site genelinde sağ alt köşede sabit (fixed) duran
     premium iletişim dock'u. 2 stacked CTA: "Hemen Ara" (tel:)
     ve "WhatsApp" (wa.me). Sosyal ikon stack'i (Instagram/YouTube)
     kaldırıldı — yalnız hızlı iletişim aksiyonları.

   VERİ KAYNAĞI (mevcut alanlar — YENİ ŞEMA / YENİ LİNK YOK):
     - settings.phone          → `tel:` linki (Footer paterni AYNEN)
                                  + WhatsApp wa.me fallback digits.
     - settings.whatsapp_link  → admin'in girdiği tam URL (tercih).
                                  Boşsa wa.me/<phoneDigits> fallback.

   GRACEFUL NO-SHOW:
     Phone ve WhatsApp href'i de boşsa component `null` döner —
     DOM'a bir şey eklenmez, layout etkilenmez.

   ARCHITECTURE:
     - Server component (zero client JS) — `getCachedSettings()`
       aynı render lifecycle'ında dedupe edilir (extra DB hit yok).
     - PublicLayout'tan render edilir; admin/maintenance scope DIŞI.
     - Print: `print:hidden` ile yazdırma çıktısında gizlenir.

   POSITIONING / Z-INDEX: AYNEN korundu (fixed bottom-right, z-40).
   =============================================================== */

export default async function FloatingSocial() {
  const settings = await getCachedSettings().catch(() => null);

  /* Phone → tel: linki (Footer L527 paterni: `tel:${settings.phone}`). */
  const phoneHref = settings?.phone?.trim()
    ? `tel:${settings.phone.trim()}`
    : null;

  /* Phone → WhatsApp wa.me fallback (Footer paterni). */
  const phoneDigits = (settings?.phone || "").replace(/\D/g, "");

  /* Tercih sırası:
     1) admin'in girdiği tam URL (settings.whatsapp_link)
     2) telefon numarasından türetilen wa.me URL
     3) null (buton gösterilmez) */
  const whatsappHref =
    settings?.whatsapp_link?.trim() ||
    (phoneDigits ? `https://wa.me/${phoneDigits}` : null);

  /* İkisi de boşsa hiç render etme — DOM'a temiz biçimde dokunma. */
  if (!phoneHref && !whatsappHref) {
    return null;
  }

  return (
    <aside
      aria-label="Hızlı iletişim"
      className="
        fixed right-3 md:right-5 bottom-24 md:bottom-16
        z-40
        flex flex-col gap-2.5
        print:hidden
      "
    >
      {/* HEMEN ARA — dark navy CTA (tel:) */}
      {phoneHref && (
        <a
          href={phoneHref}
          aria-label="Hemen Ara"
          className="
            group inline-flex items-center gap-2.5
            rounded-3xl pl-2.5 pr-2.5 sm:pr-4 py-2.5
            bg-[var(--color-stone-900)] text-white
            ring-1 ring-white/10
            shadow-[0_16px_34px_-12px_rgba(11,31,58,0.5)]
            hover:scale-[1.03] hover:shadow-[0_22px_42px_-12px_rgba(11,31,58,0.6)]
            transition-transform duration-200
            motion-reduce:transition-none motion-reduce:hover:scale-100
            focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-coral)]/50
          "
        >
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white text-[var(--color-stone-900)] shrink-0">
            <Phone size={15} strokeWidth={2} aria-hidden />
          </span>
          <span className="hidden sm:inline pr-1 text-[13px] font-semibold tracking-wide whitespace-nowrap">
            Hemen Ara
          </span>
        </a>
      )}

      {/* WHATSAPP — brand green CTA (wa.me) */}
      {whatsappHref && (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp'tan Yaz"
          className="
            group inline-flex items-center gap-2.5
            rounded-3xl pl-2.5 pr-2.5 sm:pr-4 py-2.5
            bg-[#25D366] text-white
            ring-1 ring-[#1da851]/40
            shadow-[0_18px_40px_-12px_rgba(37,211,102,0.75)]
            hover:scale-[1.03] hover:shadow-[0_24px_46px_-12px_rgba(37,211,102,0.85)]
            transition-transform duration-200
            motion-reduce:transition-none motion-reduce:hover:scale-100
            focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80
          "
        >
          <span className="inline-flex items-center justify-center w-8 h-8 shrink-0">
            {/* Solid WHITE WhatsApp glyph — yeşil zeminde net görünür. */}
            <svg
              viewBox="0 0 24 24"
              width={20}
              height={20}
              fill="#ffffff"
              aria-hidden
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.157 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.477-.985zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
            </svg>
          </span>
          <span className="hidden sm:inline pr-1 text-[13px] font-semibold tracking-wide whitespace-nowrap">
            {"WhatsApp'tan Yaz"}
          </span>
        </a>
      )}
    </aside>
  );
}
