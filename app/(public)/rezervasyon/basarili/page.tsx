import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Home, MessageCircle, ArrowLeft } from "lucide-react";

import { getCachedSettings } from "@/lib/cache.helpers";

/* ===============================================================
   🛡️ REZERVASYON BAŞARILI — confirmation page
   ===============================================================
   ReservationForm başarılı submit sonrası `router.push` ile bu
   sayfaya yönlendirir. Modal yerine tam sayfa deneyim → kullanıcı
   "Geri" tuşu ile forma istemeden dönmez, paylaşılabilir URL.

   QUERY PARAMETRELERİ:
     - ref:    reservation.id (string) — referans numarası
     - villa:  villa.slug (string)     — "Villa Detayına Dön" butonu
                                         için fallback link hedefi

   VERİ KAYNAĞI:
     - getCachedSettings → whatsapp_link / phone (WhatsApp butonu için).
     Cache zaten public sayfalardan kullanılıyor; ek DB hit yok.

   SEO:
     robots noindex, nofollow — başarı sayfaları indexlenmez
     (duplicate + private content guard). Kullanıcı search engine
     üzerinden buraya inmemeli; yalnızca form submit yolu ile.
=============================================================== */

export const metadata: Metadata = {
  title: "Rezervasyon Talebiniz Alındı",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ ref?: string; villa?: string }>;

export default async function ReservationSuccessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = (await searchParams) || {};
  const refNumber =
    typeof sp.ref === "string" && sp.ref.trim().length > 0
      ? sp.ref.trim()
      : null;
  const villaSlug =
    typeof sp.villa === "string" && sp.villa.trim().length > 0
      ? sp.villa.trim()
      : null;

  /* 🛡️ WhatsApp link öncelik sırası (FloatingSocial paterni AYNEN):
       1) settings.whatsapp_link (admin'in girdiği tam URL)
       2) https://wa.me/<phoneDigits> (settings.phone'dan türetilir)
       3) null → WhatsApp butonu gizli */
  const settings = await getCachedSettings().catch(() => null);
  const phoneDigits = (settings?.phone || "").replace(/\D/g, "");
  const whatsappHref =
    settings?.whatsapp_link?.trim() ||
    (phoneDigits ? `https://wa.me/${phoneDigits}` : null);

  return (
    <section
      className="
        min-h-[70vh]
        flex items-center justify-center
        px-5 md:px-10 py-16 md:py-24
      "
    >
      <div className="max-w-2xl w-full text-center">
        {/* Yeşil check ikonu — luxury success badge */}
        <div className="flex justify-center mb-7 md:mb-9">
          <div
            className="
              w-24 h-24 md:w-28 md:h-28 rounded-full
              bg-emerald-50
              ring-2 ring-emerald-100
              flex items-center justify-center
              text-emerald-600
              shadow-[0_20px_44px_-16px_rgba(16,185,129,0.28)]
            "
            aria-hidden
          >
            <CheckCircle2 size={56} strokeWidth={1.5} />
          </div>
        </div>

        {/* Eyebrow */}
        <p className="text-[10.5px] tracking-[0.28em] uppercase font-medium text-[var(--brand-coral)]">
          Talep Alındı
        </p>

        {/* Başlık */}
        <h1
          className="
            font-display
            text-[32px] md:text-[44px]
            text-[var(--color-stone-900)]
            mt-4
            tracking-[-0.02em]
            leading-[1.05]
          "
        >
          Rezervasyon Talebiniz Alındı
        </h1>

        {/* Açıklama */}
        <p
          className="
            text-[15px] md:text-[16.5px]
            text-[var(--color-stone-600)]
            mt-5 md:mt-6
            max-w-xl mx-auto
            leading-[1.75]
          "
        >
          Talebiniz başarıyla tarafımıza ulaştı. Ekibimiz en kısa sürede
          sizinle iletişime geçerek rezervasyon detaylarınızı
          netleştirecektir. Acil bir konuda yardıma ihtiyacınız varsa
          WhatsApp üzerinden de ulaşabilirsiniz.
        </p>

        {/* Referans kartı — yalnız ref varsa render */}
        {refNumber && (
          <div
            className="
              mt-8 md:mt-10
              inline-flex flex-col items-center
              rounded-2xl
              border border-[var(--color-stone-100)]
              bg-[var(--color-sand-50)]
              px-6 py-4 md:px-8 md:py-5
            "
          >
            <p className="text-[10.5px] tracking-[0.22em] uppercase font-medium text-[var(--color-stone-500)]">
              Referans Numarası
            </p>
            <p
              className="
                font-display text-[18px] md:text-[20px]
                text-[var(--color-stone-900)]
                mt-2 tracking-[-0.01em]
                select-all break-all
              "
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {refNumber}
            </p>
            <p className="text-[11.5px] text-[var(--color-stone-500)] mt-2 max-w-xs">
              Görüşmelerde bu numarayı belirtmeniz işlemleri hızlandırır.
            </p>
          </div>
        )}

        {/* Aksiyon butonları */}
        <div
          className="
            mt-10 md:mt-12
            flex flex-col sm:flex-row items-stretch sm:items-center justify-center
            gap-3
          "
        >
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="
                inline-flex items-center justify-center gap-2
                px-6 py-3 rounded-full
                bg-emerald-600 text-white
                text-[13.5px] font-medium tracking-[0.02em]
                shadow-[0_18px_36px_-14px_rgba(16,185,129,0.55),0_4px_12px_-6px_rgba(16,185,129,0.35)]
                hover:bg-emerald-700
                hover:-translate-y-[1px]
                transition-[transform,box-shadow,background-color] duration-300
                motion-reduce:transition-none motion-reduce:hover:translate-y-0
                focus:outline-none focus-visible:ring-2
                focus-visible:ring-emerald-500/40
              "
            >
              <MessageCircle size={15} strokeWidth={1.75} />
              WhatsApp ile İletişim
            </a>
          )}

          <Link
            href="/"
            className="btn-primary !px-6 !py-3 text-[13.5px]"
          >
            <Home size={15} strokeWidth={1.75} />
            Ana Sayfaya Dön
          </Link>

          {villaSlug && (
            <Link
              href={`/kiralik-villa/${villaSlug}`}
              className="
                inline-flex items-center justify-center gap-2
                px-6 py-3 rounded-full
                border border-[var(--color-stone-200)]
                text-[var(--color-stone-700)]
                text-[13.5px] font-medium tracking-[0.02em]
                hover:border-[var(--brand-coral)]
                hover:text-[var(--color-stone-900)]
                hover:bg-[var(--brand-coral-tint)]
                hover:-translate-y-[1px]
                transition-[transform,border-color,color,background-color] duration-300
                motion-reduce:transition-none motion-reduce:hover:translate-y-0
                focus:outline-none focus-visible:ring-2
                focus-visible:ring-[var(--brand-coral)]/30
              "
            >
              <ArrowLeft size={15} strokeWidth={1.75} />
              Villa Detayına Dön
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
