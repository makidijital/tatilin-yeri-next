import Link from "next/link";
import { CheckCircle2, CalendarDays, Users, CreditCard } from "lucide-react";

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

function formatDateTr(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "—";
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return dt.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
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
        <p className="mt-3 font-display text-[22px] text-[var(--color-stone-900)] tracking-[-0.01em]">
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
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-stone-400)] font-semibold">
              Çıkış
            </div>
            <div className="mt-1 font-medium text-[var(--color-stone-900)]">
              {formatDateTr(data.endDate)}
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
                Toplam Konaklama
              </dt>
              <dd className="text-[15px] font-semibold text-[var(--color-stone-900)] tabular-nums">
                {TL(data.total)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[14px] text-[var(--color-stone-600)]">
                Ödenen
              </dt>
              <dd className="text-[15px] font-semibold text-emerald-700 tabular-nums">
                {TL(data.paid)}
              </dd>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--color-stone-100)] pt-3">
              <dt className="text-[14px] font-medium text-[var(--color-stone-900)]">
                Kalan Ödeme
              </dt>
              <dd className="font-display text-[20px] font-semibold text-[var(--color-stone-900)] tabular-nums">
                {TL(data.remaining)}
              </dd>
            </div>
          </dl>

          {data.prepaymentPct !== null && (
            <div className="mt-4 rounded-xl bg-[var(--color-sand-50)] px-4 py-3 text-[13px] text-[var(--color-stone-700)]">
              <span className="font-semibold text-[var(--color-stone-900)]">
                %{data.prepaymentPct}
              </span>{" "}
              şimdi ödendi ·{" "}
              <span className="font-semibold text-[var(--color-stone-900)]">
                %{data.remainingPct}
              </span>{" "}
              girişte ödenecek
            </div>
          )}

          {/* ÖDEME PLANI */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
              <span className="text-[13px] text-[var(--color-stone-700)]">
                Rezervasyon sırasında ödenen
              </span>
              <span className="text-[13.5px] font-semibold text-emerald-700 tabular-nums">
                {TL(data.paid)} ✓
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-[var(--color-stone-100)] px-4 py-3">
              <span className="text-[13px] text-[var(--color-stone-700)]">
                Konaklama sırasında ödenecek
              </span>
              <span className="text-[13.5px] font-semibold text-[var(--color-stone-900)] tabular-nums">
                {TL(data.remaining)}
              </span>
            </div>
          </div>
        </section>
      )}

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
