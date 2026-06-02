import Link from "next/link";

/* ===============================================================
   🛡️ PageHero — kompakt editorial liste/koleksiyon giriş bandı
   ===============================================================
   Kategori / Bölge / Koleksiyon / Listeleme ve diğer public liste
   sayfalarının üst alanı. Premium, içerik odaklı, 2-kolonlu kompakt
   band (Villanovo / Airbnb Luxe tonu).

   KORUNAN (caller'dan prop): breadcrumb, başlık, açıklama, SEO
   (JSON-LD caller'da kalır — bu component yalnız görsel).

   FAZ 2 POLISH:
     - Sağ stat artık kompakt, premium "kart" (ince beyaz yüzey,
       layered border, küçük coral aksan çizgi, güçlü tipografi).
     - Pills daha küçük/premium, daha fazla nefes alanı.
     - Başlık ↔ açıklama hiyerarşisi güçlendirildi (başlık daha
       kuvvetli, açıklama daha sakin/açık ton).
     - Çok ince grain texture (SVG feTurbulence, düşük opaklık) —
       gradient show / neon / glassmorphism YOK.
     - Hero → içerik geçişi yumuşatıldı (alt kenarda nazik fade).
     - max-width editorial seviyeye çekildi (1400px).
     - Yükseklik ARTIRILMADI — kompakt yapı korundu.

   Mobilde dikey akış (breadcrumb → pills → başlık → açıklama →
   stat). CTA/arama/form YOK.
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
  /** Sağ üst istatistik rozeti (villa sayısı vb.) — listeleme/kategori/bölge. */
  stat?: { value: string | number; label: string };
  /** Sağ üst içerik rozeti (kurumsal/iletişim/hakkımızda marka kartı).
      stat varsa stat öncelikli; badge yalnız stat yoksa render edilir. */
  badge?: { eyebrow?: string; lines: string[] };
};

export default function PageHero({
  breadcrumb,
  eyebrow,
  title,
  description,
  pills,
  stat,
  badge,
}: Props) {
  const hasBadge = !stat && !!badge && badge.lines.length > 0;
  return (
    <section className="px-5 md:px-10 lg:px-16 pt-6 md:pt-8">
      <div className="max-w-[1400px] mx-auto">
        <div
          className="
            relative overflow-hidden isolate
            rounded-3xl
            ring-1 ring-inset ring-[#E7DDD2]
            shadow-[0_1px_0_0_rgba(255,255,255,0.7)_inset,0_20px_60px_rgba(120,90,60,0.06)]
            px-6 py-8 md:px-12 md:py-10
            min-h-[180px] md:min-h-[200px]
            flex flex-col md:flex-row md:items-center md:justify-between gap-8 md:gap-10
          "
          style={{
            backgroundImage:
              "linear-gradient(135deg, #FAF8F5 0%, #F7F2EC 52%, #F3ECE4 100%)",
          }}
        >
          {/* WARM GLOWS — fark edilmeyen sıcak derinlik (coral + beige) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -left-24 w-80 h-80 -z-10 rounded-full"
            style={{
              background: "rgba(255,107,74,0.06)",
              filter: "blur(120px)",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 -z-10 rounded-full"
            style={{
              background: "rgba(212,180,140,0.08)",
              filter: "blur(130px)",
            }}
          />

          {/* GRAIN TEXTURE — malzeme hissi; görünür doku değil (opaklık düşük) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35] mix-blend-multiply"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E\")",
            }}
          />

          {/* SOL — breadcrumb + pills + başlık + açıklama */}
          <div className="min-w-0 max-w-2xl">
            <nav
              aria-label="Breadcrumb"
              className="flex items-center flex-wrap gap-2 text-[11px] tracking-[0.14em] uppercase font-medium text-[var(--color-stone-500)]"
            >
              {breadcrumb.map((c, i) => (
                <span key={`${c.name}-${i}`} className="inline-flex items-center gap-2">
                  {i > 0 && (
                    <span aria-hidden="true" className="text-[var(--color-stone-300)]">
                      /
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
                    <span className="text-[var(--color-stone-900)]">{c.name}</span>
                  )}
                </span>
              ))}
            </nav>

            {/* PILLS — kategori/bölge/koleksiyon etiketleri (küçük, premium) */}
            {pills && pills.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-5">
                {pills.map((p, i) => (
                  <span
                    key={`${p}-${i}`}
                    className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/80 ring-1 ring-inset ring-black/[0.06] text-[var(--color-stone-600)] text-[10.5px] tracking-[0.08em] uppercase font-medium tabular-nums shadow-[0_1px_2px_-1px_rgba(27,26,23,0.12)]"
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}

            {eyebrow && (
              <p className="text-[10.5px] tracking-[0.24em] uppercase font-medium text-[var(--brand-coral)] mt-5">
                {eyebrow}
              </p>
            )}

            <h1 className="font-display font-medium text-[32px] md:text-[40px] lg:text-[44px] text-[var(--color-stone-900)] leading-[1.04] tracking-[-0.03em] mt-2.5">
              {title}
            </h1>

            {description && (
              <p className="mt-4 text-[13.5px] md:text-[14.5px] text-[var(--color-stone-400)] leading-[1.7] max-w-lg">
                {description}
              </p>
            )}
          </div>

          {/* SAĞ — kompakt premium kart (stat ya da içerik rozeti) */}
          {(stat || hasBadge) && (
            <div className="relative shrink-0">
              {/* KART ARKASI GLOW — kart havada duruyor hissi (fark edilmez) */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 scale-125 rounded-full"
                style={{
                  background: "rgba(255,107,74,0.05)",
                  filter: "blur(60px)",
                }}
              />

              {/* STAT KARTI — listeleme/kategori/bölge (sayı) */}
              {stat && (
                <div
                  className="
                    relative inline-flex flex-col items-start md:items-end
                    rounded-2xl bg-white/70
                    ring-1 ring-inset ring-black/[0.06]
                    shadow-[0_1px_0_0_rgba(255,255,255,0.7)_inset,0_12px_28px_-22px_rgba(27,26,23,0.28)]
                    px-6 py-5 md:px-7 md:py-6
                  "
                >
                  <span
                    aria-hidden="true"
                    className="absolute top-5 left-0 md:left-auto md:right-0 w-6 h-px bg-[var(--brand-coral)]/70"
                  />
                  <p className="font-display font-medium text-[40px] md:text-[48px] text-[var(--color-stone-900)] leading-none tracking-[-0.03em] tabular-nums">
                    {stat.value}
                  </p>
                  <p className="mt-2.5 text-[11px] tracking-[0.14em] uppercase font-medium text-[var(--color-stone-500)]">
                    {stat.label}
                  </p>
                </div>
              )}

              {/* İÇERİK ROZETİ — kurumsal/iletişim/hakkımızda (etiket + satırlar) */}
              {hasBadge && badge && (
                <div
                  className="
                    relative flex flex-col items-start md:items-end
                    rounded-2xl bg-white/70
                    ring-1 ring-inset ring-black/[0.06]
                    shadow-[0_1px_0_0_rgba(255,255,255,0.7)_inset,0_12px_28px_-22px_rgba(27,26,23,0.28)]
                    px-6 py-5 md:px-7 md:py-6
                    min-w-[180px]
                  "
                >
                  <span
                    aria-hidden="true"
                    className="absolute top-5 left-0 md:left-auto md:right-0 w-6 h-px bg-[var(--brand-coral)]/70"
                  />
                  {badge.eyebrow && (
                    <p className="text-[10.5px] tracking-[0.22em] uppercase font-medium text-[var(--brand-coral)]">
                      {badge.eyebrow}
                    </p>
                  )}
                  <div className="mt-3 flex flex-col gap-2 md:items-end">
                    {badge.lines.map((line, i) => (
                      <span
                        key={`${line}-${i}`}
                        className="font-display text-[15.5px] md:text-[16px] text-[var(--color-stone-900)] leading-none tracking-[-0.01em]"
                      >
                        {line}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ALT FADE — banttan içeriğe yumuşak geçiş */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 -z-10 bg-gradient-to-b from-transparent to-black/[0.015]"
          />
        </div>
      </div>
    </section>
  );
}
