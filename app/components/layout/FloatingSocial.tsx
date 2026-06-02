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

/* ---------------- INLINE SOCIAL ICONS (stroke=currentColor) ----------------
   Footer.tsx (L19-97) stilistik konvansiyonu AYNEN; lucide-react'te
   WhatsApp brand icon yok, brand kimliği için inline SVG tercih. */

const WhatsappIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
  </svg>
);

const InstagramIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const YoutubeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
  </svg>
);

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
        w-11 h-11 md:w-12 md:h-12
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
          <WhatsappIcon width={20} height={20} aria-hidden />
        </FloatingSocialButton>
      )}
      {instagramHref && (
        <FloatingSocialButton href={instagramHref} label="Instagram">
          <InstagramIcon width={20} height={20} aria-hidden />
        </FloatingSocialButton>
      )}
      {youtubeHref && (
        <FloatingSocialButton href={youtubeHref} label="YouTube">
          <YoutubeIcon width={20} height={20} aria-hidden />
        </FloatingSocialButton>
      )}
    </aside>
  );
}
