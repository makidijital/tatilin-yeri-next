import { Award, BadgePercent, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ===============================================================
   🛡️ HeroAdvantageCards — Hero'nun HEMEN altında, "güven / avantaj"
   kartları bölümü.
   ===============================================================
   AMAÇ:
     Hero'nun sinematik koyu alt tonundan başlayıp sayfanın açık
     zeminine yumuşakça geçen bir "köprü" section'ı. Hero'nun
     kendisine (arama paneli, tarih/guest seçimi, CTA'lar, veri akışı,
     state/handler) SIFIR dokunuş — bu component tamamen ayrı, saf
     presentational bir bölüm. Homepage'de <Hero /> ile
     <DiscountCollection /> arasına eklenir (bkz. app/(public)/page.tsx).

   İÇERİK:
     3 kart, sabit — başlık/açıklama metinleri kullanıcı tarafından
     verilen BİREBİR metinler. Yeni istatistik/sertifika/şirket bilgisi
     UYDURULMADI.

   MARKA RENKLERİ:
     Yalnızca #ED7926 (turuncu) / #0973BA (mavi) — başka ana tema
     rengi kullanılmadı. Her kart, ikisi arasında farklı bir ağırlıkla
     (turuncu-ağırlıklı / mavi-ağırlıklı / ikisi birden gradient)
     küçük bir karakter farkı taşır — kartlar birbirinin aynısı değil.

   GÖRSEL/ANİMASYON:
     - Kart yüzeyi: koyu glass (Hero'nun koyu tonuyla süreklilik +
       metin okunabilirliği HER ZAMAN garanti — section'ın kendi
       arka plan gradyanından bağımsız, kartın kendi arka planı
       yeterince koyu).
     - Yavaş ambient glow nabzı + çok ince diagonal shimmer geçişi
       (bu dosyaya scoped <style>, globals.css'e DOKUNULMADI).
       `prefers-reduced-motion: reduce` → sürekli animasyonlar
       tamamen kapanır.
     - Hover: kart hafif yükselir, glow güçlenir, ikon hafif
       büyür/döner — motion-reduce'da bu geçişler de iptal edilir.
     - Görsel oluşturma / image generation YOK; ikonlar mevcut
       projede zaten kullanılan lucide-react kütüphanesinden.

   RESPONSIVE:
     Mobilde tek sütun (alt alta, sıfır overflow riski), md+ ekranda
     3 sütun yan yana. Masaüstünde dengeli genişlik için mevcut
     homepage section konteyner deseni (max-w-[1280px] + px-5 md:px-10
     lg:px-16) reuse edildi (VillaTypeCarousel / LocationCollection
     ile AYNI konteyner deseni).
   =============================================================== */

type AdvantageTone = "orange" | "blue" | "duo";

type Advantage = {
  key: string;
  icon: LucideIcon;
  title: string;
  description: string;
  tone: AdvantageTone;
};

const ADVANTAGES: Advantage[] = [
  {
    key: "experience",
    icon: Award,
    title: "14 Yıllık Tecrübe",
    description:
      "14 yıllık sektör deneyimiyle tatilinizi güvenle planlayın.",
    tone: "orange",
  },
  {
    key: "price",
    icon: BadgePercent,
    title: "En Uygun Fiyat Garantisi",
    description:
      "En doğru villa, en avantajlı fiyat. Tatiliniz için en iyi seçimi yapın.",
    tone: "blue",
  },
  {
    key: "trust",
    icon: ShieldCheck,
    title: "Tecrübe ve Güven",
    description:
      "Tecrübemiz ve güvenilir hizmet anlayışımızla tatilinizi gönül rahatlığıyla planlayın.",
    tone: "duo",
  },
];

const TONE_STYLES: Record<
  AdvantageTone,
  {
    border: string;
    iconBg: string;
    iconText: string;
    glow: string;
    topBar: string;
  }
> = {
  orange: {
    border: "group-hover:border-[#ED7926]/45",
    iconBg: "bg-[#ED7926]/15",
    iconText: "text-[#ED7926]",
    glow: "bg-[#ED7926]/30",
    topBar: "bg-gradient-to-r from-[#ED7926] to-[#ED7926]/10",
  },
  blue: {
    border: "group-hover:border-[#0973BA]/45",
    iconBg: "bg-[#0973BA]/15",
    iconText: "text-[#0973BA]",
    glow: "bg-[#0973BA]/30",
    topBar: "bg-gradient-to-r from-[#0973BA] to-[#0973BA]/10",
  },
  duo: {
    border: "group-hover:border-[#ED7926]/40",
    iconBg: "bg-gradient-to-br from-[#ED7926]/20 to-[#0973BA]/20",
    iconText: "text-[#ED7926]",
    glow: "bg-gradient-to-br from-[#ED7926]/30 to-[#0973BA]/30",
    topBar: "bg-gradient-to-r from-[#ED7926] to-[#0973BA]",
  },
};

export default function HeroAdvantageCards() {
  return (
    <section
      aria-label="Neden bizi tercih etmelisiniz"
      className="relative bg-gradient-to-b from-[var(--color-stone-900)] to-white pt-10 pb-14 md:pt-14 md:pb-20"
    >
      {/* 🛡️ Component-scoped animasyonlar — globals.css'e DOKUNULMADI.
         Yalnız bu section render olduğunda basılır. Sürekli
         animasyonlar (glow/shimmer) prefers-reduced-motion: reduce
         altında tamamen kapanır; hover geçişleri motion-reduce:
         varyantlarıyla ayrıca iptal edilir. */}
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .hac-card { animation: hac-fade-in 600ms ease-out both; }
          .hac-glow { animation: hac-glow-pulse 5s ease-in-out infinite; }
          .hac-shimmer { animation: hac-shimmer-sweep 7s ease-in-out infinite; }
        }
        @keyframes hac-fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes hac-glow-pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.65; }
        }
        @keyframes hac-shimmer-sweep {
          0% { transform: translateX(-120%) skewX(-12deg); opacity: 0; }
          8% { opacity: 0.45; }
          35% { opacity: 0; }
          100% { transform: translateX(220%) skewX(-12deg); opacity: 0; }
        }
      `}</style>

      <div className="px-5 md:px-10 lg:px-16">
        <div className="max-w-[1280px] mx-auto">
          <ul
            role="list"
            className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-7"
          >
            {ADVANTAGES.map((item, i) => {
              const tone = TONE_STYLES[item.tone];
              const Icon = item.icon;
              return (
                <li
                  key={item.key}
                  className={
                    "hac-card group relative overflow-hidden rounded-3xl " +
                    "border border-white/10 " +
                    tone.border +
                    " bg-[var(--color-stone-900)]/85 backdrop-blur-xl " +
                    "px-6 py-7 md:px-7 md:py-8 " +
                    "shadow-[0_20px_50px_-24px_rgba(0,0,0,0.55)] " +
                    "transition-[transform,box-shadow,border-color] duration-300 " +
                    "motion-reduce:transition-none " +
                    "hover:-translate-y-1 hover:shadow-[0_28px_64px_-24px_rgba(0,0,0,0.6)] " +
                    "motion-reduce:hover:translate-y-0"
                  }
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  {/* Üst ince accent çizgisi — kart karakterine göre */}
                  <span
                    aria-hidden="true"
                    className={"absolute inset-x-0 top-0 h-[2.5px] " + tone.topBar}
                  />

                  {/* Ambient glow blob — yavaş nabız, hover'da güçlenir */}
                  <span
                    aria-hidden="true"
                    className={
                      "hac-glow pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl " +
                      tone.glow +
                      " group-hover:opacity-90 transition-opacity duration-300 motion-reduce:transition-none"
                    }
                  />

                  {/* İnce diagonal shimmer geçişi — düşük opasiteli, yavaş */}
                  <span
                    aria-hidden="true"
                    className="hac-shimmer pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                  />

                  <span
                    className={
                      "relative flex h-12 w-12 items-center justify-center rounded-2xl " +
                      tone.iconBg +
                      " " +
                      tone.iconText +
                      " transition-transform duration-300 motion-reduce:transition-none " +
                      "group-hover:scale-110 group-hover:-rotate-3"
                    }
                >
                    <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
                  </span>

                  <h3 className="relative mt-5 font-display text-[19px] md:text-[20px] text-white tracking-[-0.01em]">
                    {item.title}
                  </h3>
                  <p className="relative mt-2.5 text-[13.5px] leading-[1.6] text-white/70">
                    {item.description}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
