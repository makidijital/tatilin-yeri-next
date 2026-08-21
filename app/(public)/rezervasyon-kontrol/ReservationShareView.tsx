import Link from "next/link";
import {
  CheckCircle2,
  CalendarDays,
  Users,
  CreditCard,
  Clock,
  User,
  Phone,
  MessageCircle,
} from "lucide-react";

import { getCachedSettings } from "@/lib/cache.helpers";
import type { ReservationShareDTO } from "./share.resolve";

/* ===============================================================
   🛡️ RESERVATION SHARE VIEW — token ile gelen müşteri görünümü
   ===============================================================
   Server component (presentational). Yalnız SANITIZED DTO alır
   (PII/not/token YOK). Ödeme tutarları DTO'daki kayıtlı TRY
   snapshot'ından — kafadan hesap yok. İletişim settings'ten (varsa).

   NOT (bu tur kapsamı): villa görseli / bölge / giriş-çıkış saati /
   harita bu görünüme DAHİL EDİLMEDİ (kaynak alanları henüz teyitli
   değil; "veri yoksa gösterme" kuralı). Core + ödeme özeti + iletişim.
   =============================================================== */

const TL = (v: number | null): string =>
  v === null ? "—" : `${Math.round(v).toLocaleString("tr-TR")} TL`;

/** "21 Eylül 2026, Pazartesi" — gün adı tarihten dinamik türetilir (TR). */
function formatDateTr(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "—";
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const base = dt.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const weekday = dt.toLocaleDateString("tr-TR", {
    weekday: "long",
    timeZone: "UTC",
  });
  return `${base}, ${weekday}`;
}

/* 🛡️ wa.me numarası — pure/lokal. Boşluk/parantez/tire vb. temizlenir;
   TR yerel "0..." → "90..." (ülke kodu). Ülke kodlu numaralarda basamaklar
   korunur (TR'ye hard-code zorlama yok). `tel:` için kullanıcıya gösterilen
   gerçek numara kullanılır. */
function toWaNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "90" + digits.slice(1);
  return digits;
}

/* Küçük WhatsApp + telefon aksiyon ikonları (mevcut iletişim dili).
   Yalnız telefon varken caller render eder. */
function PhoneActions({ phone }: { phone: string }) {
  const wa = toWaNumber(phone);
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      {wa && (
        <a
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp ile ulaş"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366]/12 text-[#1da851] hover:bg-[#25D366] hover:text-white transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/40"
        >
          <MessageCircle size={15} aria-hidden />
        </a>
      )}
      <a
        href={`tel:${phone}`}
        aria-label="Telefonla ara"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-coral-tint)] text-[var(--brand-coral-deep)] hover:bg-[var(--brand-coral)] hover:text-white transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-coral)]/40"
      >
        <Phone size={15} aria-hidden />
      </a>
    </span>
  );
}

export default async function ReservationShareView({
  data,
}: {
  data: ReservationShareDTO;
}) {
  const settings = await getCachedSettings().catch(() => null);
  const phone = settings?.phone?.trim() || "";
  const phoneHref = phone ? `tel:${phone}` : null;
  const digits = phone.replace(/\D/g, "");
  const whatsappHref =
    settings?.whatsapp_link?.trim() ||
    (digits ? `https://wa.me/${digits}` : null);

  return (
    <div className="max-w-2xl mx-auto">
      {/* 🛡️ Kalan ödeme — yumuşak/sürekli glow (≈2.6s). Yanıp sönme/flash
          YOK; prefers-reduced-motion'da tamamen kapanır (statik accent kalır).
          Kartın shadow/radius/layout sistemi etkilenmez (yalnız box-shadow). */}
      <style>{`
        @keyframes rkRemainingGlow {
          0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--brand-coral) 0%, transparent); }
          50% { box-shadow: 0 0 20px -2px color-mix(in srgb, var(--brand-coral) 42%, transparent); }
        }
        .rk-remaining-glow { animation: rkRemainingGlow 2.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .rk-remaining-glow { animation: none; }
        }
      `}</style>

      {/* HEADER — Onay */}
      <div className="text-center">
        <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
          <CheckCircle2 size={26} strokeWidth={2} aria-hidden />
        </span>
        <h1 className="font-display text-[30px] md:text-[38px] text-[var(--color-stone-900)] mt-5 tracking-[-0.02em] leading-[1.05]">
          Rezervasyonunuz Onaylandı
        </h1>
        <p className="text-[var(--color-stone-500)] mt-3 text-[14.5px]">
          Rezervasyonunuz başarıyla oluşturulmuştur.
        </p>
        {data.reservationNo && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-sand-50)] border border-[var(--color-stone-100)] px-4 py-1.5 text-[13px] font-medium text-[var(--color-stone-700)]">
            Rezervasyon No:
            <span className="font-semibold text-[var(--color-stone-900)] tabular-nums">
              {data.reservationNo}
            </span>
          </p>
        )}
      </div>

      {/* KONAKLAMA */}
      <section className="mt-9 rounded-2xl border border-[var(--color-stone-100)] bg-white p-5 md:p-6">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--color-stone-500)]">
          <CalendarDays size={15} className="text-[var(--brand-coral)]" aria-hidden />
          Konaklama Bilgileri
        </h2>
        <div className="mt-4 flex flex-col sm:flex-row gap-4 md:gap-5">
          {/* Villa kapak görseli — sol; yoksa hiç render edilmez
              (layout bozulmaz). Mevcut resolveVillaImageUrl kaynağı. */}
          {data.villaImage && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={data.villaImage}
              alt={data.villaTitle}
              className="w-full h-44 rounded-xl object-cover shrink-0 sm:w-40 sm:h-auto sm:self-stretch md:w-44"
            />
          )}

          {/* Bilgiler — sağ */}
          <div className="flex-1 min-w-0">
            <p className="font-display text-[22px] text-[var(--color-stone-900)] tracking-[-0.01em]">
              {data.villaTitle}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4 text-[14px]">
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-stone-400)] font-semibold">
                  Giriş
                </div>
                <div className="mt-1 font-medium text-[var(--color-stone-900)]">
                  {formatDateTr(data.startDate)}
                </div>
                <div className="mt-1 inline-flex items-center gap-1 text-[13px] text-[var(--color-stone-500)] tabular-nums">
                  <Clock size={13} aria-hidden /> {data.checkInTime}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-stone-400)] font-semibold">
                  Çıkış
                </div>
                <div className="mt-1 font-medium text-[var(--color-stone-900)]">
                  {formatDateTr(data.endDate)}
                </div>
                <div className="mt-1 inline-flex items-center gap-1 text-[13px] text-[var(--color-stone-500)] tabular-nums">
                  <Clock size={13} aria-hidden /> {data.checkOutTime}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {data.nights !== null && (
                <span className="inline-flex items-center rounded-full bg-[var(--color-sand-50)] px-3 py-1 text-[12.5px] font-medium text-[var(--color-stone-700)]">
                  {data.nights} gece
                </span>
              )}
              {data.guests !== null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-sand-50)] px-3 py-1 text-[12.5px] font-medium text-[var(--color-stone-700)]">
                  <Users size={13} aria-hidden /> {data.guests} misafir
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ÖDEME ÖZETİ */}
      {data.total !== null && (
        <section className="mt-5 rounded-2xl border border-[var(--color-stone-100)] bg-white p-5 md:p-6">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--color-stone-500)]">
            <CreditCard size={15} className="text-[var(--brand-coral)]" aria-hidden />
            Ödeme Özeti
          </h2>
          <dl className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <dt className="text-[14px] text-[var(--color-stone-600)]">
                Toplam Konaklama Tutarı
              </dt>
              <dd className="text-[15px] font-semibold text-[var(--color-stone-900)] tabular-nums">
                {TL(data.total)}
              </dd>
            </div>

            <div className="flex items-center justify-between">
              <dt className="text-[14px] text-[var(--color-stone-600)]">
                Ödenen Tutar
                {data.paymentMethodLabel ? ` (${data.paymentMethodLabel})` : ""}
              </dt>
              <dd className="text-[15px] font-semibold text-emerald-700 tabular-nums">
                {TL(data.paid)}
              </dd>
            </div>

            {/* Temizlik Ücreti — bilgilendirme (cleaning_fee_try, hesaba KATILMAZ).
                "(Fiyata Dahildir.)" başlığın yanında parantez içinde. Değer varsa. */}
            {data.cleaningFee !== null && (
              <div className="flex items-center justify-between">
                <dt className="text-[14px] text-[var(--color-stone-600)]">
                  Temizlik Ücreti{" "}
                  <span className="text-[var(--color-stone-400)]">
                    (Fiyata Dahildir.)
                  </span>
                </dt>
                <dd className="text-[15px] font-semibold text-[var(--color-stone-900)] tabular-nums">
                  {TL(data.cleaningFee)}
                </dd>
              </div>
            )}
          </dl>

          {/* Kalan Ödeme — dikkat çekici marka accent + yumuşak glow/pulse.
              Animasyon prefers-reduced-motion'da kapanır (aşağıdaki style). */}
          <div className="mt-4 border-t border-[var(--color-stone-100)] pt-4">
            <div className="rk-remaining-glow flex items-center justify-between rounded-xl border border-[var(--brand-coral)]/35 bg-[var(--brand-coral-tint)] px-4 py-3.5">
              <span className="text-[13px] font-semibold text-[var(--brand-coral-deep)]">
                Kalan Ödeme (Girişte Alınacak)
              </span>
              <span className="text-[18px] font-bold leading-none tracking-tight text-[var(--brand-coral-deep)] tabular-nums">
                {TL(data.isFullPayment ? 0 : data.remaining)}
              </span>
            </div>
          </div>

          {/* BİLGİLENDİRME — Hasar Depozitosu (hesaba KATILMAZ; yalnız değer varsa). */}
          {data.damageDeposit !== null && (
            <div className="mt-4 space-y-3 border-t border-[var(--color-stone-100)] pt-4">
              <div>
                <div className="flex items-center justify-between">
                  <dt className="text-[14px] text-[var(--color-stone-600)]">
                    Hasar Depozitosu
                  </dt>
                  <dd className="text-[15px] font-semibold text-[var(--color-stone-900)] tabular-nums">
                    {TL(data.damageDeposit)}
                  </dd>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-stone-400)]">
                  Girişte hasar depozitosu ek olarak alınır. Villada herhangi bir
                  hasar oluşmaması durumunda çıkışta eksiksiz olarak iade edilir.
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* MÜLK SAHİBİ + MİSAFİR İLETİŞİM — tek kart, ince divider ile. */}
      <section className="mt-5 rounded-2xl border border-[var(--color-stone-100)] bg-white p-5 md:p-6">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--color-stone-500)]">
          <User size={15} className="text-[var(--brand-coral)]" aria-hidden />
          Mülk Sahibi İletişim Bilgileri
        </h2>
        {data.ownerName || data.ownerPhone ? (
          <div className="mt-3 space-y-1">
            {data.ownerName && (
              <p className="text-[15px] font-medium text-[var(--color-stone-900)]">
                {data.ownerName}
              </p>
            )}
            {data.ownerPhone && (
              <div className="flex items-center flex-wrap gap-x-3 gap-y-2 text-[14px] text-[var(--color-stone-600)]">
                <span className="tabular-nums">{data.ownerPhone}</span>
                <PhoneActions phone={data.ownerPhone} />
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-[13.5px] text-[var(--color-stone-500)]">
            Mülk sahibi iletişim bilgileri bulunmuyor.
          </p>
        )}

        <div className="my-5 border-t border-[var(--color-stone-100)]" />

        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--color-stone-500)]">
          <User size={15} className="text-[var(--brand-coral)]" aria-hidden />
          Misafir İletişim Bilgileri
        </h2>
        <dl className="mt-3 space-y-1.5 text-[14px]">
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-[var(--color-stone-500)]">
              Ad Soyad
            </dt>
            <dd className="min-w-0 font-medium text-[var(--color-stone-900)]">
              {data.guestName || "—"}
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-[var(--color-stone-500)]">
              Telefon
            </dt>
            <dd className="min-w-0 text-[var(--color-stone-900)]">
              {data.guestPhone ? (
                <span className="inline-flex items-center flex-wrap gap-x-3 gap-y-2">
                  <span className="tabular-nums">{data.guestPhone}</span>
                  <PhoneActions phone={data.guestPhone} />
                </span>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-[var(--color-stone-500)]">
              E-posta
            </dt>
            <dd className="min-w-0 break-all text-[var(--color-stone-900)]">
              {data.guestEmail || "—"}
            </dd>
          </div>
        </dl>
      </section>

      {/* İLETİŞİM */}
      {(whatsappHref || phoneHref) && (
        <section className="mt-5 rounded-2xl border border-[var(--color-stone-100)] bg-white p-5 md:p-6 text-center">
          <p className="text-[13.5px] text-[var(--color-stone-600)]">
            Rezervasyonunuzla ilgili herhangi bir sorunuz varsa bizimle
            iletişime geçebilirsiniz.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 text-[13px] font-medium text-white hover:bg-[#1da851] transition-colors"
              >
                WhatsApp&apos;tan Ulaşın
              </a>
            )}
            {phoneHref && (
              <a
                href={phoneHref}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-stone-200)] px-5 py-2.5 text-[13px] font-medium text-[var(--color-stone-700)] hover:border-[var(--brand-coral)] hover:text-[var(--color-stone-900)] transition-colors"
              >
                Bizi Arayın
              </a>
            )}
          </div>
        </section>
      )}

      <div className="mt-8 text-center">
        <Link
          href="/rezervasyon-kontrol"
          className="text-[13px] text-[var(--color-stone-500)] hover:text-[var(--color-stone-900)] underline underline-offset-4 transition-colors"
        >
          Farklı bir rezervasyon sorgula
        </Link>
      </div>
    </div>
  );
}
