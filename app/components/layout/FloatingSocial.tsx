import { getCachedSettings } from "@/lib/cache.helpers";

/* ===============================================================
   🛡️ FLOATING SOCIAL — fixed bottom-right sosyal medya widget'i
   ===============================================================
   AMAÇ:
     Public site genelinde sağ alt köşede sabit (fixed) duran
     dikey 3 buton (WhatsApp / Instagram / YouTube). Tüm
     linkler `target="_blank" rel="noopener noreferrer"` ile
     yeni sekmede açılır.

   VERİ KAYNAĞI (mevcut alanlar — YENİ ŞEMA EKLENMEDİ):
     - settings.whatsapp_link  → admin'in girdiği tam URL (tercih).
                                  Boşsa wa.me/<phoneDigits> fallback.
     - settings.instagram      → tam Instagram profil URL'i.
     - settings.youtube        → tam YouTube kanal URL'i.
     - settings.phone          → WhatsApp link yoksa wa.me türetimi
                                  için phoneDigits kaynağı (Footer.tsx
                                  paterni AYNEN: `replace(/\D/g, "")`).

   GRACEFUL NO-SHOW:
     Üç href de boşsa component `null` döner — DOM'a bir şey
     eklenmez, layout etkilenmez.

   Z-INDEX (analiz raporu özet):
     z-40 → modaller (1000/1100) ve cookie banner (z-50) üstte
     kalır; HeroSearchPanel container (z-30) altta. Header z-50,
     hero dropdown z-60 ile konum çakışması yok (top vs bottom-right).

   ARCHITECTURE:
     - Server component (zero client JS) — `getCachedSettings()`
       aynı render lifecycle'ında dedupe edilir (extra DB hit yok).
     - PublicLayout'tan render edilir; admin/maintenance scope DIŞI.
     - Print: `print:hidden` ile yazdırma çıktısında gizlenir.
   =============================================================== */

/* ---------------- SOCIAL ICONS — public/icons SVG kaynakları ----------------
   İkonlar public/icons altından servis edilir (marka renkli SVG):
     /icons/whatsapp.svg · /icons/instagram.svg · /icons/youtube.svg
   Eski inline currentColor SVG'lerin yerine geçti; buton shell, hover,
   pozisyon, boyut (20×20) ve linkler AYNEN korundu. */

/* ---------------- BUTTON SHELL (DRY) ---------------- */

function FloatingSocialButton({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="
        w-14 h-14 md:w-16 md:h-16
        rounded-full
        bg-white
        ring-1 ring-[var(--color-stone-100)]
        shadow-[0_8px_24px_-8px_rgba(27,26,23,0.18)]
        flex items-center justify-center
        text-[var(--color-stone-700)]
        hover:text-[var(--brand-coral)]
        hover:ring-[var(--brand-coral)]
        hover:-translate-y-[2px]
        hover:shadow-[0_12px_28px_-10px_rgba(27,26,23,0.22)]
        transition-[transform,box-shadow,color,border-color] duration-200
        motion-reduce:transition-none motion-reduce:hover:translate-y-0
        focus:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--brand-coral)]/40
      "
    >
      {children}
    </a>
  );
}

/* ---------------- COMPONENT ---------------- */

export default async function FloatingSocial() {
  const settings = await getCachedSettings().catch(() => null);

  /* Phone → WhatsApp wa.me fallback (Footer L374-380 paterni). */
  const phoneDigits = (settings?.phone || "").replace(/\D/g, "");

  /* Tercih sırası:
     1) admin'in girdiği tam URL (settings.whatsapp_link)
     2) telefon numarasından türetilen wa.me URL
     3) null (buton gösterilmez) */
  const whatsappHref =
    settings?.whatsapp_link?.trim() ||
    (phoneDigits ? `https://wa.me/${phoneDigits}` : null);
  const instagramHref = settings?.instagram?.trim() || null;
  const youtubeHref = settings?.youtube?.trim() || null;

  /* Üçü de boşsa hiç render etme — DOM'a temiz biçimde dokunma. */
  if (!whatsappHref && !instagramHref && !youtubeHref) {
    return null;
  }

  return (
    <aside
      aria-label="Sosyal medya"
      className="
        fixed right-3 md:right-5 bottom-5 md:bottom-8
        z-40
        flex flex-col gap-2.5
        print:hidden
      "
    >
      {whatsappHref && (
        <FloatingSocialButton href={whatsappHref} label="WhatsApp">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/whatsapp.svg" alt="" aria-hidden width={50} height={50} />
        </FloatingSocialButton>
      )}
      {instagramHref && (
        <FloatingSocialButton href={instagramHref} label="Instagram">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/instagram.svg" alt="" aria-hidden width={50} height={50} />
        </FloatingSocialButton>
      )}
      {youtubeHref && (
        <FloatingSocialButton href={youtubeHref} label="YouTube">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/youtube.svg" alt="" aria-hidden width={50} height={50} />
        </FloatingSocialButton>
      )}
    </aside>
  );
}
