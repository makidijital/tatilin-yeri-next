import Link from "next/link";

import { getCachedSettings } from "@/lib/cache.helpers";
import { resolveAssetUrlVersioned } from "@/lib/storage.helpers";

/* ===============================================================
   🛡️ PageHero — "YazVillam Signature" (from-scratch)
   ===============================================================
   Sitenin tüm iç sayfalarının ortak premium kimliği. Klasik hero
   veya sol-yazı/sağ-kart DEĞİL: ortalanmış editorial masthead.

   İMZA:
     - Başlık sayfanın gerçek odak noktası (büyük, zarif tipografi).
     - Breadcrumb üstte, çok zarif, ortalanmış.
     - Kutu yok; stat/badge tasarımın içine doğal meta olarak gömülü.
     - Büyük boşluklar; sıcak Akdeniz wash (görünmeyecek kadar hafif).
     - Premium page header hissi — devasa hero değil.

   KORUNAN (API — DEĞİŞMEZ): breadcrumb, eyebrow, title, description,
   pills, stat, badge. stat öncelikli; badge yalnız stat yokken.
   SEO/JSON-LD caller'da kalır — bu component yalnız görsel.
=============================================================== */

type Crumb = { name: string; href?: string };

type Props = {
  /** Breadcrumb zinciri. Son öğe genelde href'siz (aktif sayfa). */
  breadcrumb: Crumb[];
  /** Opsiyonel küçük eyebrow (coral). */
  eyebrow?: string;
  /** Başlık — iki satırlı stilli içerik geçebilir (ReactNode). */
  title: React.ReactNode;
  /** Opsiyonel açıklama. */
  description?: string;
  /** Premium pill etiketleri (kategori/bölge/koleksiyon, filtreler). */
  pills?: string[];
  /** Sağ istatistik (villa sayısı vb.) — listeleme/kategori/bölge. */
  stat?: { value: string | number; label: string };
  /** İçerik rozeti (kurumsal/iletişim/hakkımızda).
      stat varsa stat öncelikli; badge yalnız stat yoksa render edilir. */
  badge?: { eyebrow?: string; lines: string[] };
};

export default async function PageHero({
  breadcrumb,
  eyebrow,
  title,
  description,
  pills,
  stat,
  badge,
}: Props) {
  const hasBadge = !stat && !!badge && badge.lines.length > 0;
  const hasAside = !!stat || hasBadge;

  /* İç sayfa ortak arka plan görseli (settings singleton, mig 067).
     ASLA çıplak gösterilmez: her zaman güçlü beyaz/sand overlay + hafif
     blur + gradient altında DOKU olarak. Kolon/RPC yoksa null → yalnız
     mevcut whisper wash kalır. updated_at ile cache-bust. */
  const settings = await getCachedSettings().catch(() => null);
  const bgUrl = resolveAssetUrlVersioned(
    settings?.page_hero_background_image,
    settings?.updated_at
  );

  return (
    <section className="relative overflow-hidden px-5 md:px-10 lg:px-16 pt-12 md:pt-20 pb-6 md:pb-10">
      {/* SICAK AKDENİZ WASH — görünmeyecek kadar hafif; içerik öne çıkar */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        {/* DOKU KATMANI — arka plan görseli ASLA çıplak değil: blur'lu,
           opaklığı düşük görsel + üstünde güçlü beyaz/sand overlay.
           Amaç premium doku hissi; foto göstermek değil. */}
        {bgUrl && (
          <>
            {/* Dekoratif görsel — object-cover (hero yüksekliğine göre
               otomatik crop, mobil/desktop aynı), asla pointer/etkileşim
               almaz (parent + kendi guard'ları), absolute + w/h-full →
               layout shift YOK, decor -z-10 içinde → metnin önüne geçmez. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bgUrl}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover"
              style={{
                filter: "blur(7px)",
                transform: "scale(1.06)",
                opacity: 0.6,
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(250,247,242,0.8) 52%, rgba(255,255,255,0.92) 100%)",
              }}
            />
          </>
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(250,247,242,0.7) 0%, rgba(255,255,255,0) 62%)",
          }}
        />
        <div
          className="absolute -top-28 left-1/2 -translate-x-1/2 w-[720px] h-[420px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(212,180,140,0.10) 0%, rgba(212,180,140,0) 70%)",
            filter: "blur(70px)",
          }}
        />
        <div
          className="absolute top-8 right-[12%] w-[360px] h-[360px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,107,74,0.06) 0%, rgba(255,107,74,0) 70%)",
            filter: "blur(70px)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.02] mix-blend-multiply"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
          }}
        />
      </div>

      <div className="max-w-[900px] mx-auto text-center">
        {/* BREADCRUMB — zarif, ortalanmış */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center justify-center flex-wrap gap-x-3 gap-y-1 text-[12px] text-[var(--color-stone-400)]"
        >
          {breadcrumb.map((c, i) => (
            <span
              key={`${c.name}-${i}`}
              className="inline-flex items-center gap-x-3"
            >
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className="text-[var(--color-stone-300)]"
                >
                  ·
                </span>
              )}
              {c.href ? (
                <Link
                  href={c.href}
                  className="hover:text-[var(--color-stone-900)] transition-colors motion-reduce:transition-none"
                >
                  {c.name}
                </Link>
              ) : (
                <span className="text-[var(--color-stone-600)] font-medium">
                  {c.name}
                </span>
              )}
            </span>
          ))}
        </nav>

        {/* SIGNATURE EYEBROW — iki yandan ince coral hairline */}
        {eyebrow && (
          <div className="flex items-center justify-center gap-3 mt-9 md:mt-12">
            <span
              aria-hidden="true"
              className="w-7 h-px bg-[var(--brand-coral)]/40"
            />
            <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--brand-coral)]">
              {eyebrow}
            </p>
            <span
              aria-hidden="true"
              className="w-7 h-px bg-[var(--brand-coral)]/40"
            />
          </div>
        )}

        {/* BAŞLIK — sayfanın odak noktası */}
        <h1
          className={
            "font-display font-medium text-[var(--color-stone-900)] leading-[1.02] tracking-[-0.035em] text-[40px] md:text-[58px] lg:text-[66px] mx-auto max-w-3xl " +
            (eyebrow ? "mt-6" : "mt-9 md:mt-12")
          }
        >
          {title}
        </h1>

        {/* DESCRIPTION — sakin, dar kolon */}
        {description && (
          <p className="mt-6 md:mt-7 text-[15px] md:text-[16px] text-[var(--color-stone-500)] leading-[1.75] max-w-xl mx-auto">
            {description}
          </p>
        )}

        {/* PILLS — ortalanmış, minimal */}
        {pills && pills.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
            {pills.map((p, i) => (
              <span
                key={`${p}-${i}`}
                className="inline-flex items-center px-3 py-1 rounded-full bg-white/60 ring-1 ring-inset ring-black/[0.05] text-[var(--color-stone-600)] text-[11px] tracking-[0.04em] font-medium tabular-nums"
              >
                {p}
              </span>
            ))}
          </div>
        )}

        {/* STAT / BADGE — kutu yok; akışa gömülü doğal meta */}
        {hasAside && (
          <div className="mt-10 md:mt-14 flex justify-center">
            {stat && (
              <div className="inline-flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className="w-8 h-px bg-[var(--brand-coral)]/50 mb-5"
                />
                <span className="font-display font-medium text-[44px] md:text-[52px] leading-none tracking-[-0.035em] text-[var(--color-stone-900)] tabular-nums">
                  {stat.value}
                </span>
                <span className="mt-3 text-[11px] tracking-[0.22em] uppercase font-medium text-[var(--color-stone-500)]">
                  {stat.label}
                </span>
              </div>
            )}

            {hasBadge && badge && (
              <div className="inline-flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className="w-8 h-px bg-[var(--brand-coral)]/50 mb-5"
                />
                {badge.eyebrow && (
                  <p className="text-[11px] tracking-[0.24em] uppercase font-medium text-[var(--brand-coral)] mb-3.5">
                    {badge.eyebrow}
                  </p>
                )}
                <div className="flex items-center flex-wrap justify-center gap-x-3 gap-y-1.5">
                  {badge.lines.map((line, i) => (
                    <span
                      key={`${line}-${i}`}
                      className="inline-flex items-center gap-x-3"
                    >
                      {i > 0 && (
                        <span
                          aria-hidden="true"
                          className="text-[var(--color-stone-300)]"
                        >
                          ·
                        </span>
                      )}
                      <span className="font-display text-[15.5px] md:text-[16.5px] text-[var(--color-stone-800)] tracking-[-0.01em]">
                        {line}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
