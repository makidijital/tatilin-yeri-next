import type { Metadata } from "next";
import Link from "next/link";
import {
  Phone,
  Mail,
  MapPin,
  Clock,
  MessageCircle,
  AtSign,
  ArrowUpRight,
  Globe,
  Tv,
  Music2,
} from "lucide-react";

import { getCachedSettings } from "@/lib/cache.helpers";
import {
  JsonLd,
  buildBreadcrumb,
  buildOrganization,
} from "@/app/components/seo/StructuredData";
import PageHero from "@/app/components/ui/PageHero";
import ContactForm from "./ContactForm";

/* ===============================================================
   🛡️ /iletisim — settings-driven dynamic (no hardcoded data)
   ===============================================================
   Tüm iletişim, sosyal, çalışma saatleri verisi `getCachedSettings`
   source-of-truth'tan beslenir. Hardcoded fallback YOK:
     - phone / email / address / business_hours yoksa → satır gizli
     - instagram / facebook / youtube / tiktok yoksa → satır gizli
     - whatsapp_link yoksa → satır gizli
     - Hiçbir sosyal/iletişim yoksa → "Doğrudan ulaşın" başlığı
       altında boş kalır (defensive empty-state)

   Schema.org Organization sameAs[]: instagram/facebook/youtube/
   tiktok URL'lerinden derlenir (boşlar filter edilir).

   Premium editorial layout DOKUNULMADI (hero, map, FAQ, CTA strip).
   =============================================================== */

const PAGE_PATH = "/iletisim";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getCachedSettings().catch(() => null);
  const brand = settings?.site_name?.trim() || "Villa Kiralama";
  return {
    title: `İletişim · ${brand}`,
    description:
      "Akdeniz villalarımız hakkında bilgi almak, rezervasyon ve özel tekliflerimiz için bizimle iletişime geçin.",
    alternates: { canonical: PAGE_PATH },
    openGraph: {
      type: "website",
      url: PAGE_PATH,
      title: `İletişim · ${brand}`,
      description:
        "Akdeniz villalarımız hakkında bilgi almak ve rezervasyon için bizimle iletişime geçin.",
    },
    twitter: {
      card: "summary",
      title: `İletişim · ${brand}`,
    },
  };
}

/* InfoRow internal type — filter(Boolean) pattern için. */
type Row = {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
  external?: boolean;
};

export default async function ContactPage() {
  const settings = await getCachedSettings().catch(() => null);

  const phone = settings?.phone?.trim() || null;
  const email = settings?.email?.trim() || null;
  const address = settings?.address?.trim() || null;
  const businessHours = settings?.business_hours?.trim() || null;
  const whatsappLink = settings?.whatsapp_link?.trim() || null;
  const instagram = settings?.instagram?.trim() || null;
  const facebook = settings?.facebook?.trim() || null;
  const youtube = settings?.youtube?.trim() || null;
  const tiktok = settings?.tiktok?.trim() || null;
  const brand = settings?.site_name?.trim() || "Villa Kiralama";

  /* CONTACT ROWS — filter(Boolean), sadece dolu olanlar DOM'a. */
  const contactRows: Row[] = (
    [
      phone && {
        icon: <Phone size={16} />,
        label: "Telefon",
        value: phone,
        href: `tel:${phone.replace(/\s/g, "")}`,
      },
      whatsappLink && {
        icon: <MessageCircle size={16} />,
        label: "WhatsApp",
        value: phone || whatsappLink,
        href: whatsappLink,
        external: true,
      },
      email && {
        icon: <Mail size={16} />,
        label: "E-posta",
        value: email,
        href: `mailto:${email}`,
      },
      businessHours && {
        icon: <Clock size={16} />,
        label: "Çalışma Saatleri",
        value: businessHours,
      },
      address && {
        icon: <MapPin size={16} />,
        label: "Lokasyon",
        value: address,
      },
    ] as (Row | false | null)[]
  ).filter((r): r is Row => !!r);

  /* SOCIAL ROWS — sadece dolu olan platformlar. */
  const socialRows: Row[] = (
    [
      instagram && {
        icon: <AtSign size={16} />,
        label: "Instagram",
        value: extractHandle(instagram) || instagram,
        href: instagram,
        external: true,
      },
      facebook && {
        icon: <Globe size={16} />,
        label: "Facebook",
        value: extractHandle(facebook) || facebook,
        href: facebook,
        external: true,
      },
      youtube && {
        icon: <Tv size={16} />,
        label: "YouTube",
        value: extractHandle(youtube) || youtube,
        href: youtube,
        external: true,
      },
      tiktok && {
        icon: <Music2 size={16} />,
        label: "TikTok",
        value: extractHandle(tiktok) || tiktok,
        href: tiktok,
        external: true,
      },
    ] as (Row | false | null)[]
  ).filter((r): r is Row => !!r);

  const hasContactRows = contactRows.length > 0;
  const hasSocialRows = socialRows.length > 0;

  const breadcrumbLd = buildBreadcrumb([
    { name: "Ana sayfa", url: "/" },
    { name: "İletişim" },
  ]);

  /* 🛡️ Organization JSON-LD — same source-of-truth as homepage.
     sameAs sosyal URL'lerden, legalName company_legal_name'den. */
  const organizationLd = buildOrganization({
    name: brand,
    legalName: settings?.company_legal_name || null,
    logo: settings?.site_logo || null,
    phone,
    email,
    address,
    sameAs: [instagram, facebook, youtube, tiktok],
  });

  return (
    <>
      <JsonLd data={breadcrumbLd} />
      <JsonLd data={organizationLd} />

      {/* HERO — paylaşılan PageHero (kompakt editorial band) */}
      <PageHero
        breadcrumb={[{ name: "Ana sayfa", href: "/" }, { name: "İletişim" }]}
        eyebrow="İletişim"
        title={
          <>
            Bizimle{" "}
            <span className="text-[var(--color-stone-400)]">
              iletişime geçin.
            </span>
          </>
        }
        description="Akdeniz villalarımız, özel tarihler veya kişiye özel koleksiyon talepleriniz için bir mesaj bırakın — ekibimiz aynı gün içinde dönüş yapsın."
        badge={{
          eyebrow: "Destek",
          lines: ["Aynı Gün Geri Dönüş", "7/24 Destek"],
        }}
      />

      {/* CONTACT GRID */}
      <section className="px-5 md:px-10 lg:px-16 pt-12 md:pt-16 pb-24 md:pb-32">
        <div className="max-w-[1280px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
            <aside className="lg:col-span-5 space-y-2">
              {hasContactRows && (
                <>
                  <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)] mb-6">
                    <span className="inline-block w-6 h-px bg-[var(--color-stone-300)] align-middle mr-2" />
                    Doğrudan ulaşın
                  </p>
                  {contactRows.map((r, i) => (
                    <InfoRow key={`c-${i}`} {...r} />
                  ))}
                </>
              )}

              {/* SOSYAL MEDYA — sadece en az 1 link varsa */}
              {hasSocialRows && (
                <>
                  <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)] mt-10 mb-6">
                    <span className="inline-block w-6 h-px bg-[var(--color-stone-300)] align-middle mr-2" />
                    Sosyal Medya
                  </p>
                  {socialRows.map((r, i) => (
                    <InfoRow key={`s-${i}`} {...r} />
                  ))}
                </>
              )}
            </aside>

            {/* FORM */}
            <div className="lg:col-span-7">
              <div className="bg-white border border-[var(--color-stone-100)] rounded-3xl p-6 md:p-10 shadow-[0_8px_40px_-16px_rgb(27_26_23/0.12)]">
                <div className="mb-6 md:mb-8">
                  <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)]">
                    <span className="inline-block w-6 h-px bg-[var(--color-stone-300)] align-middle mr-2" />
                    Mesaj
                  </p>
                  <h2 className="font-display text-[28px] md:text-[36px] text-[var(--color-stone-900)] mt-4 leading-[1.1] tracking-[-0.025em]">
                    Bir not bırakın.
                  </h2>
                </div>
                <ContactForm />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MAP */}
      <section className="px-5 md:px-10 lg:px-16 pb-24 md:pb-32">
        <div className="max-w-[1280px] mx-auto">
          <div className="flex items-end justify-between gap-6 mb-8 md:mb-12">
            <div>
              <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)]">
                <span className="inline-block w-6 h-px bg-[var(--color-stone-300)] align-middle mr-2" />
                Harita
              </p>
              <h2 className="font-display text-[28px] md:text-[40px] lg:text-[48px] text-[var(--color-stone-900)] mt-4 leading-[1.05] tracking-[-0.02em]">
                Akdeniz koylarında.
              </h2>
            </div>
          </div>
          <div className="relative aspect-[16/10] md:aspect-[21/9] rounded-3xl overflow-hidden border border-[var(--color-stone-100)] bg-[var(--color-sand-50)]">
            <iframe
              title="Lokasyon haritası"
              src={
                address
                  ? `https://www.google.com/maps?q=${encodeURIComponent(address)}&z=11&output=embed`
                  : "https://www.google.com/maps?q=Kalkan%2C+Kas%2C+Antalya&z=11&output=embed"
              }
              className="absolute inset-0 w-full h-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      {/* MINI FAQ */}
      <section className="px-5 md:px-10 lg:px-16 pb-24 md:pb-32">
        <div className="max-w-[1280px] mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12 md:mb-16">
            <div>
              <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)]">
                <span className="inline-block w-6 h-px bg-[var(--color-stone-300)] align-middle mr-2" />
                Sık Sorulanlar
              </p>
              <h2 className="font-display text-[32px] md:text-[48px] lg:text-[56px] text-[var(--color-stone-900)] mt-6 leading-[1.02] tracking-[-0.025em] max-w-xl">
                Yanıtlar, sade.
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 md:gap-x-12 gap-y-12">
            <FaqBlock
              q="Dönüş süreniz nedir?"
              a="Talepleriniz aynı gün içinde, en geç bir iş günü içinde yanıtlanır. Acil rezervasyonlar için WhatsApp önerilir."
            />
            <FaqBlock
              q="Hangi tarihlerde gezebilirim?"
              a="Anasayfadaki villa kartlarından doğrudan tarih seçebilir; uygunluk takvimi ile boş dönemleri görebilirsiniz."
            />
            <FaqBlock
              q="Özel taleplerim için kişiye özel teklif alabilir miyim?"
              a="Evet. Tarih, kişi sayısı ve beklenti detaylarınızı mesaj olarak iletin; küratörlüğümüzle koleksiyon önerisi hazırlarız."
            />
          </div>
        </div>
      </section>

      {/* CTA STRIP */}
      <section className="px-5 md:px-10 lg:px-16 pb-32 md:pb-44">
        <div className="max-w-[1100px] mx-auto">
          <div className="rounded-3xl bg-gradient-to-br from-[var(--color-sand-100)] via-[var(--color-sand-50)] to-[var(--color-sand-100)] border border-[var(--color-stone-100)] px-8 md:px-14 py-14 md:py-20 text-center">
            <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)]">
              <span className="inline-block w-6 h-px bg-[var(--color-stone-300)] align-middle mr-2" />
              Koleksiyon
            </p>
            <h2 className="font-display text-[32px] md:text-[56px] lg:text-[64px] text-[var(--color-stone-900)] mt-6 leading-[1.02] tracking-[-0.03em]">
              Hayalinizdeki villayı
              <br />
              <span className="text-[var(--color-stone-400)]">
                birlikte bulalım.
              </span>
            </h2>
            <p className="text-[var(--color-stone-500)] mt-6 leading-relaxed max-w-xl mx-auto">
              Akdeniz&apos;in seçkin villalarını keşfetmeye buradan başlayın.
            </p>
            <div className="mt-10">
              <Link
                href="/arama"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--color-stone-900)] text-white text-[13.5px] font-medium tracking-[0.04em] hover:bg-[var(--color-stone-700)] transition-colors"
              >
                Tüm villaları gör <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* ===============================================================
   InfoRow — info panel item (icon + label + value + opt link)
=============================================================== */
function InfoRow({
  icon,
  label,
  value,
  href,
  external,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
  external?: boolean;
}) {
  const isLink = !!href;
  const Wrapper: React.ElementType = isLink ? "a" : "div";
  const linkProps = isLink
    ? {
        href,
        ...(external
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {}),
      }
    : {};
  return (
    <Wrapper
      {...linkProps}
      className={
        "flex items-start gap-4 py-5 border-t border-[var(--color-stone-100)] first:border-t-0 group " +
        (isLink
          ? "hover:bg-[var(--color-sand-50)]/50 -mx-2 px-2 rounded-xl transition-colors"
          : "")
      }
    >
      <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-[var(--color-sand-100)] text-[var(--color-champagne-700)] mt-0.5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] tracking-[0.22em] uppercase font-medium text-[var(--color-stone-500)]">
          {label}
        </p>
        <p className="text-[15px] md:text-[15.5px] text-[var(--color-stone-900)] mt-1.5 leading-[1.45] break-words whitespace-pre-line">
          {value}
        </p>
      </div>
      {isLink ? (
        <span
          aria-hidden="true"
          className="shrink-0 mt-1 inline-flex items-center justify-center w-7 h-7 rounded-full border border-[var(--color-stone-200)] text-[var(--color-stone-500)] group-hover:border-[var(--color-champagne-500)] group-hover:text-[var(--color-champagne-700)] transition-colors"
        >
          <ArrowUpRight size={13} />
        </span>
      ) : null}
    </Wrapper>
  );
}

function FaqBlock({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <p className="text-[11px] tracking-[0.18em] uppercase font-medium text-[var(--color-champagne-700)]">
        Soru
      </p>
      <h3 className="font-display text-[20px] md:text-[22px] text-[var(--color-stone-900)] mt-3 leading-[1.25] tracking-[-0.01em]">
        {q}
      </h3>
      <p className="text-[14.5px] md:text-[15px] leading-[1.7] text-[var(--color-stone-500)] mt-4">
        {a}
      </p>
    </div>
  );
}

/* Instagram/Facebook/YouTube/TikTok URL'inden display handle çıkar.
   instagram.com/handle → "@handle". URL pars edilemezse null. */
function extractHandle(url: string): string | null {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean)[0];
    if (!seg) return null;
    return seg.startsWith("@") ? seg : `@${seg.replace(/^@/, "")}`;
  } catch {
    return null;
  }
}
