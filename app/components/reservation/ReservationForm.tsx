"use client";

import { convertPrice, formatCurrency } from "@/lib/currency";
import { useCurrency } from "@/app/context/CurrencyContext";

import { useState, useEffect } from "react";
/* 🛡️ FAZ 2 frontend purge — `import { supabase }` KALDIRILDI.
   payment_methods fetch artık /api/public/payment-methods route'u
   üzerinden (aynı anon RLS bağlamı, aynı select shape). */
import { getPublicSettings } from "@/app/services/settings.service";
import { Country, State } from "country-state-city";
import { getCountryLabel } from "@/lib/country.helper";
import { Calendar, Users, CreditCard, CheckCircle2 } from "lucide-react";

import {
  calculateGrandTotal,
  calculatePrepayment,
  accommodationBase,
} from "@/lib/price.engine";

import type { PaymentPreference } from "@/lib/payment.helper";

/* 🛡️ FAZ 1+2 — typed public reservation form pipeline.
   useState<any> drift'i kapatıldı. handleSubmit helper-driven:
     - validatePublicReservationForm
     - buildPublicReservationPayload (snapshot-based)
     - dispatchPublicReservationRequestMail (fire-forget; outer try) */
import {
  initialPublicReservationFormData,
  type PublicReservationFormData,
  type PublicReservationFormErrors,
  type CountryOption,
  type CityOption,
  type PublicPaymentMethodOption,
} from "./_types/reservation-form-data";
import { validatePublicReservationForm } from "./_helpers/validatePublicReservationForm";
import { buildPublicReservationPayload } from "./_helpers/buildPublicReservationPayload";
import { dispatchPublicReservationRequestMail } from "./_helpers/dispatchPublicReservationRequestMail";

/* 🛡️ Başarı sayfası — modal yerine tam sayfa redirect.
   `/rezervasyon/basarili?ref=<id>&villa=<slug>` rotasına yönlendirir.
   API/mail/form mantığı AYNEN; yalnız success feedback UX değişti.
   useRouter client-side navigation için.
   SuccessModal componenti silinmedi (gelecekte kullanılabilir). */
import { useRouter } from "next/navigation";

export default function ReservationForm({
  villa,
  prices,
  start,
  end,
  image,
  adults,
  children,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}: any) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [prepaymentRate, setPrepaymentRate] = useState(20);
  /* 🛡️ Modern feedback layer — alert() yerine state-driven UI.
     submitError: form üstünde inline error banner mesajı (null → gizli).
     Başarı durumu artık tam sayfa redirect ile gösterilir
     (`/rezervasyon/basarili?ref=...&villa=...`); modal state YOK. */
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PublicPaymentMethodOption[]>([]);
  const [errors, setErrors] = useState<PublicReservationFormErrors>({});

  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);

  const [guestNames, setGuestNames] = useState<string[]>([]);

  const { currency, rates } = useCurrency();

  /* 🛡️ FAZ 1 — typed state shape + initial factory.
     Eski `useState({ ... })` ile birebir aynı initial object (alan sırası
     + default değerler byte-identical). Initial factory:
     `_types/reservation-form-data > initialPublicReservationFormData()`. */
  const [form, setForm] = useState<PublicReservationFormData>(() =>
    initialPublicReservationFormData()
  );

  useEffect(() => {
    const allCountries = Country.getAllCountries();
    setCountries(allCountries);
  }, []);

  useEffect(() => {
    const all = Country.getAllCountries();
    const sorted = [
      ...all.filter((c) => c.isoCode === "TR"),
      ...all.filter((c) => c.isoCode !== "TR"),
    ];
    setCountries(sorted);
    setForm((prev) => ({ ...prev, country: "TR" }));
    const trCities = State.getStatesOfCountry("TR");
    setCities(trCities);
  }, []);

  useEffect(() => {
    const total = Number(form.guests || 1);
    const extraCount = total - 1;
    if (extraCount <= 0) {
      setGuestNames([]);
      return;
    }
    setGuestNames((prev) => {
      const updated = [...prev];
      while (updated.length < extraCount) updated.push("");
      return updated.slice(0, extraCount);
    });
  }, [form.guests]);

  const handleCountryChange = (countryCode: string) => {
    setForm((prev) => ({
      ...prev,
      country: countryCode,
      city: "",
    }));
    const stateList = State.getStatesOfCountry(countryCode);
    setCities(stateList);
  };

  useEffect(() => {
    if (!adults && !children) return;
    const total = Number(adults || 0) + Number(children || 0);
    setForm((prev) => ({
      ...prev,
      guests: total > 0 ? total.toString() : "1",
    }));
  }, [adults, children]);

  /* ---------------------------------------------
     🔥 EFFECTIVE PREPAYMENT RATE
     - villa.custom_prepayment_rate varsa → onu kullan
     - yoksa global settings.prepayment_rate
     - yoksa 20 (default)
  ---------------------------------------------- */
  useEffect(() => {
    const villaOverride = (villa as any)?.custom_prepayment_rate;
    if (
      villaOverride !== null &&
      villaOverride !== undefined &&
      villaOverride !== ""
    ) {
      setPrepaymentRate(Number(villaOverride));
      return;
    }

    // 🛡️ MEMORY-LEAK HARDENING (Faz 2A):
    //   getSettings async; rezervasyon formu hızlı unmount olursa
    //   stale setState yarış koşulu önlenir.  Davranış: aynı global
    //   prepayment_rate yüklemesi, aynı fallback (=20).
    let cancelled = false;
    getPublicSettings().then((data) => {
      if (cancelled) return;
      if (data?.prepayment_rate) setPrepaymentRate(data.prepayment_rate);
    });
    return () => {
      cancelled = true;
    };
  }, [villa]);

  useEffect(() => {
    /* 🛡️ FAZ 2 frontend purge — public fetch /api/public/payment-methods.
       Eski anon supabase `select("*")` aynı select shape ile route içinde
       (anon db; RLS bağlamı aynı). Fail-soft: hata → boş state (eski
       davranış da öyle, `data || []`). */
    const fetchPaymentMethods = async () => {
      try {
        const res = await fetch("/api/public/payment-methods");
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payment_methods?: any[];
        };
        setPaymentMethods(
          res.ok && json.ok ? json.payment_methods || [] : []
        );
      } catch {
        setPaymentMethods([]);
      }
    };
    fetchPaymentMethods();
  }, []);

  const getNights = () => {
    if (!start || !end) return 0;
    const s = new Date(start);
    const e = new Date(end);
    return Math.ceil(
      (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)
    );
  };

  /* ===============================================================
     🔥 DISPLAY ONLY — kullanıcının gördüğü tutarlar
     ===============================================================
     Site currency switcher (TRY/USD/EUR/GBP) sadece BU result'ı
     etkiler. Reservation snapshot'a yazılan değerler ASLA bu
     result'tan üretilmez.
     =============================================================== */
  const result =
    start && end
      ? calculateGrandTotal({
        start,
        end,
        prices,
        currency,
        rates,

        cleaning_fee:
          villa.cleaning_fee || 0,

        cleaning_currency:
          villa.cleaning_currency || "TRY",

        cleaning_limit:
          villa.cleaning_limit || 0,
      })
      : null;

  /* ===============================================================
     🔥 SNAPSHOT — ASLA display currency'den etkilenmez
     ===============================================================
     calculateGrandTotal'u currency="TRY" ile yeniden çağırır.
     - total / stay / cleaning  → TRY (snapshot için)
     - original_*               → villanın gerçek currency'si
     Site USD seçili olsa bile bu değer TRY olarak kaydedilir.
     =============================================================== */
  const snapshot =
    start && end
      ? calculateGrandTotal({
        start,
        end,
        prices,
        currency: "TRY",
        rates,

        cleaning_fee:
          villa.cleaning_fee || 0,

        cleaning_currency:
          villa.cleaning_currency || "TRY",

        cleaning_limit:
          villa.cleaning_limit || 0,
      })
      : null;

  const totalPrice = result?.total || 0;

  const villaCurrency =
    result?.original_currency || "TRY";

  const exchangeRate =
    villaCurrency === "TRY"
      ? 1
      : Number(rates?.[villaCurrency] || 1);

  const hasForeignCurrency =
    result?.original_currency !== "TRY" ||
    result?.original_cleaning_currency !== "TRY";

  const prepayment = result
    ? calculatePrepayment(
      accommodationBase(result.total, result.cleaning),
      prepaymentRate
    )
    : 0;

  // 🔥 FINANCIAL SNAPSHOT — display ile karıştırma
  // Snapshot'a yazılan prepayment ASLA TRY değerinden üretilir.
  const snapshotTotalTRY = snapshot?.total || 0;
  const snapshotCleaningTRY = snapshot?.cleaning || 0;

  const snapshotPrepayment = calculatePrepayment(
    accommodationBase(snapshotTotalTRY, snapshotCleaningTRY),
    prepaymentRate
  );

  const snapshotRemaining = Math.max(
    snapshotTotalTRY - snapshotPrepayment,
    0
  );

  // Display-side hesap — UI'da görünen değerler (eski davranış)
  const remainingPayment =
    totalPrice - prepayment;

  const isFormValid =
    form.name &&
    form.phone &&
    form.email &&
    form.identity &&
    form.payment_method_id &&
    start &&
    end;

  const handleSubmit = async () => {
    /* 🛡️ FAZ 2 — validation helper-driven; mesaj + regex'ler birebir. */
    const newErrors = validatePublicReservationForm({ form, start, end });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);

    try {
      /* 🛡️ FAZ 2 — ORCHESTRATION SIRASI BYTE-IDENTICAL:
         1. payload build (snapshot-based, sync helper)
         2. AWAITED createReservation
         3. FIRE-FORGET mail dispatch (outer try + inner .catch)
         4. alert success
         5. setForm reset
         6. setErrors clear
         Catch + finally pattern aynen. */
      /* 🛡️ PII-SAFE CREATE (PHASE 3): client-side anon `createReservation`
         yerine SERVER route'a POST. Insert server'da service_role ile
         yapılır (040 admin-only RLS sonrası anon INSERT reddedilir);
         response yalnız { id, reservation_no } döner — PII client'a
         gelmez. Hata mesajı ("Bu tarihler dolu" vb.) server'dan
         BYTE-IDENTICAL gelir; catch bloğu aynen gösterir. */
      const res = await fetch("/api/public/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPublicReservationPayload({
            villa,
            start,
            end,
            form,
            guestNames,
            snapshot: snapshot!,
            snapshotTotalTRY,
            snapshotCleaningTRY,
            snapshotPrepayment,
            snapshotRemaining,
            exchangeRate,
            hasForeignCurrency,
          })
        ),
      });

      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; reservation?: { id?: string | null } }
        | null;

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Rezervasyon oluşturulamadı");
      }

      /* 🛡️ RESERVATION REQUEST MAIL — fire-and-forget (helper-driven).
         Helper tag + outer try/catch pattern BYTE-IDENTICAL. */
      const reservationId = json.reservation?.id || null;
      if (reservationId) {
        dispatchPublicReservationRequestMail(reservationId);
      }

      /* 🛡️ Modern success — modal yerine tam sayfa redirect.
         API/mail/form mantığı AYNEN; sadece feedback UX değişti.
         Referans + villa slug query param ile success sayfasına geçilir. */
      setSubmitError(null);

      setForm(initialPublicReservationFormData());

      setErrors({});

      const villaSlug =
        typeof villa?.slug === "string" && villa.slug.trim().length > 0
          ? villa.slug.trim()
          : "";
      const refParam = reservationId ? encodeURIComponent(reservationId) : "";
      const villaParam = villaSlug ? encodeURIComponent(villaSlug) : "";
      const qs: string[] = [];
      if (refParam) qs.push(`ref=${refParam}`);
      if (villaParam) qs.push(`villa=${villaParam}`);
      const url = `/rezervasyon/basarili${qs.length ? `?${qs.join("&")}` : ""}`;
      router.push(url);

    } catch (err: unknown) {

      console.error(err);

      const msg =
        err instanceof Error
          ? err.message
          : "İşlem sırasında bir hata oluştu. Lütfen daha sonra tekrar deneyiniz.";
      /* 🛡️ Modern error — alert() yerine inline banner state. */
      setSubmitError(msg);

    } finally {

      setLoading(false);

    }
  };

  const inputBase =
    "w-full !border rounded-xl px-4 py-3 text-sm bg-white text-[var(--color-stone-900)] transition";
  const inputOk =
    "!border-[var(--color-stone-100)] focus:!border-[var(--color-champagne-500)]";
  const inputErr = "!border-red-500";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
      {/* LEFT — FORM */}
      <div className="lg:col-span-2 card-premium p-6 md:p-8 space-y-9">
        {/* 🛡️ INLINE ERROR BANNER — submitError null değilse görünür.
           alert() yerine modern inline feedback. */}
        {submitError && (
          <div
            role="alert"
            className="
              rounded-2xl border border-red-200 bg-red-50
              px-4 py-3 text-[13.5px] text-red-700
              flex items-start gap-3
            "
          >
            <span aria-hidden className="mt-0.5">⚠️</span>
            <span className="flex-1 leading-relaxed">{submitError}</span>
            <button
              type="button"
              onClick={() => setSubmitError(null)}
              aria-label="Hata mesajını kapat"
              className="text-red-500 hover:text-red-700 transition-colors shrink-0"
            >
              ✕
            </button>
          </div>
        )}
        {/* CONTACT SECTION */}
        <Section
          eyebrow="Adım 1"
          title="İletişim bilgileri"
          subtitle="Rezervasyon için ulaşılabileceğimiz bilgileri paylaş."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: "name", placeholder: "İsim Soyisim" },
              { key: "email", placeholder: "E-posta" },
              { key: "phone", placeholder: "Telefon" },
              { key: "identity", placeholder: "TC / Pasaport" },
            ].map((field) => (
              <div key={field.key}>
                <input
                  value={(form as any)[field.key]}
                  placeholder={field.placeholder}
                  onChange={(e) => {
                    setForm({ ...form, [field.key]: e.target.value });
                    setErrors((prev: any) => ({
                      ...prev,
                      [field.key]: "",
                    }));
                  }}
                  className={`${inputBase} ${errors[field.key] ? inputErr : inputOk
                    }`}
                />
                {errors[field.key] && (
                  <p className="text-xs text-red-500 mt-1.5">
                    {errors[field.key]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* ADDRESS SECTION */}
        <Section
          eyebrow="Adım 2"
          title="Adres bilgisi"
          subtitle="Fatura ve doğrulama için kullanılacak."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <select
              value={form.country || ""}
              onChange={(e) => handleCountryChange(e.target.value)}
              className={`${inputBase} ${inputOk}`}
            >
              <option value="">Ülke seç</option>
              {countries.map((c) => (
                <option key={c.isoCode} value={c.isoCode}>
                  {/* 🌍 Display override: TR → "Türkiye". Option value
                      hâlâ ISO code (`c.isoCode`); form payload ve
                      validation aynen ISO code akar. */}
                  {getCountryLabel(c.isoCode)}
                </option>
              ))}
            </select>

            <select
              value={form.city ?? ""}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              disabled={!form.country}
              className={`${inputBase} ${inputOk} disabled:opacity-60`}
            >
              <option value="">
                {form.country ? "Şehir seç" : "Önce ülke seç"}
              </option>
              {cities.map((c) => (
                <option key={c.isoCode} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>

            <input
              value={form.address}
              placeholder="Adres"
              className={`md:col-span-2 ${inputBase} ${inputOk}`}
              onChange={(e) =>
                setForm({ ...form, address: e.target.value })
              }
            />

            <input
              value={form.note}
              placeholder="Not (isteğe bağlı)"
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className={`md:col-span-2 ${inputBase} ${inputOk}`}
            />
          </div>
        </Section>

        {/* GUESTS SECTION */}
        <Section
          eyebrow="Adım 3"
          title="Misafirler"
          subtitle="Bu konaklamada kimler olacak?"
        >
          <div className="bg-[var(--color-sand-50)] border border-[var(--color-sand-100)] rounded-xl px-4 py-3 text-sm flex justify-between items-center mb-4">
            <span className="font-medium text-[var(--color-stone-700)]">
              Toplam misafir
            </span>
            <span className="text-[var(--color-stone-900)] font-semibold">
              {form.guests || 1} kişi
              {(adults || children) && (
                <span className="text-[var(--color-stone-500)] ml-2 font-normal">
                  ({adults || 0} yetişkin · {children || 0} çocuk)
                </span>
              )}
            </span>
          </div>

          {guestNames.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)]">
                Diğer misafirler
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {guestNames.map((g, i) => (
                  <input
                    key={i}
                    value={g}
                    placeholder={`Misafir ${i + 2} Ad Soyad`}
                    onChange={(e) => {
                      const updated = [...guestNames];
                      updated[i] = e.target.value;
                      setGuestNames(updated);
                    }}
                    className={`${inputBase} ${inputOk}`}
                  />
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* PAYMENT */}
        <Section
          eyebrow="Adım 4"
          title="Ödeme yöntemi"
          subtitle="Tercih ettiğin ödeme yöntemini seç."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {paymentMethods.length === 0 && (
              <p className="text-sm text-[var(--color-stone-400)] italic">
                Ödeme yöntemi bulunamadı
              </p>
            )}
            {paymentMethods.map((p) => {
              const checked = form.payment_method_id === p.id;
              return (
                <label
                  key={p.id}
                  className={`
                    flex items-center gap-3 px-4 py-3.5 rounded-xl
                    border cursor-pointer transition
                    ${checked
                      ? "border-[var(--color-champagne-500)] bg-[var(--color-sand-50)]"
                      : "border-[var(--color-stone-100)] hover:border-[var(--color-stone-200)]"
                    }
                  `}
                >
                  <input
                    type="radio"
                    checked={checked}
                    onChange={() =>
                      setForm({ ...form, payment_method_id: p.id })
                    }
                    className="!w-4 !h-4 accent-[var(--color-champagne-500)]"
                  />
                  <CreditCard
                    size={16}
                    className="text-[var(--color-stone-500)]"
                  />
                  <span className="text-sm font-medium text-[var(--color-stone-900)]">
                    {p.name}
                  </span>
                </label>
              );
            })}
          </div>
          {errors.payment_method_id && (
            <p className="text-xs text-red-500 mt-2">
              {errors.payment_method_id}
            </p>
          )}
        </Section>

        {/* PAYMENT PREFERENCE */}
        <Section
          eyebrow="Adım 5"
          title="Ödeme Tercihi"
          subtitle="Şimdi sadece ön ödeme mi yapacaksın, yoksa tamamını mı ödemek istersin?"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                value: "prepayment" as PaymentPreference,
                label: "Ön Ödeme",
                hint: `%${prepaymentRate} ön ödeme`,
              },
              {
                value: "full_payment" as PaymentPreference,
                label: "Tamamını Ödemek İstiyorum",
                hint: "Toplam tutarın tamamı",
              },
            ].map((opt) => {
              const checked = form.payment_preference === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`
                    flex items-start gap-3 px-4 py-3.5 rounded-xl
                    border cursor-pointer transition
                    ${checked
                      ? "border-[var(--color-champagne-500)] bg-[var(--color-sand-50)]"
                      : "border-[var(--color-stone-100)] hover:border-[var(--color-stone-200)]"
                    }
                  `}
                >
                  <input
                    type="radio"
                    name="payment_preference"
                    checked={checked}
                    onChange={() =>
                      setForm({ ...form, payment_preference: opt.value })
                    }
                    className="!w-4 !h-4 mt-0.5 accent-[var(--color-champagne-500)]"
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-[var(--color-stone-900)]">
                      {opt.label}
                    </span>
                    <span className="block text-[11px] text-[var(--color-stone-500)] mt-0.5">
                      {opt.hint}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </Section>

        {/* SUBMIT */}
        <button
          onClick={handleSubmit}
          disabled={!isFormValid || loading}
          className={`
            w-full inline-flex items-center justify-center gap-2
            py-4 rounded-xl font-semibold text-base transition
            ${isFormValid && !loading
              ? "btn-primary"
              : "bg-[var(--color-stone-100)] text-[var(--color-stone-400)] cursor-not-allowed"
            }
          `}
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Gönderiliyor…
            </>
          ) : (
            <>
              <CheckCircle2 size={17} />
              Rezervasyon Gönder
            </>
          )}
        </button>
      </div>

      {/* RIGHT — SUMMARY */}
      <aside className="lg:col-span-1">
        <div className="lg:sticky lg:top-32 card-premium overflow-hidden">
          <img
            src={image || "/placeholder.jpg"}
            className="w-full h-56 object-cover"
            alt={villa.title}
          />

          <div className="p-6 space-y-5">
            <div>
              <p className="eyebrow">Konaklama</p>
              <h3 className="font-display text-xl text-[var(--color-stone-900)] mt-1.5 leading-snug">
                {villa.title}
              </h3>
            </div>

            {start && end && (
              <div className="flex items-center gap-3 text-sm text-[var(--color-stone-700)] border-y border-[var(--color-stone-100)] py-4">
                <Calendar
                  size={16}
                  className="text-[var(--color-champagne-500)]"
                />
                <span>
                  {/* 🛡️ Europe/Istanbul explicit — server SSR / client
                       hidrasyon aynı çıktı (UTC server'da day kayması yok). */}
                  {new Date(start).toLocaleDateString("tr-TR", {
                    day: "numeric",
                    month: "long",
                    timeZone: "Europe/Istanbul",
                  })}{" "}
                  –{" "}
                  {new Date(end).toLocaleDateString("tr-TR", {
                    day: "numeric",
                    month: "long",
                    timeZone: "Europe/Istanbul",
                  })}
                  <span className="text-[var(--color-stone-400)] ml-2">
                    {getNights()} gece
                  </span>
                </span>
              </div>
            )}

            {form.guests && (
              <div className="flex items-center gap-3 text-sm text-[var(--color-stone-700)] -mt-1">
                <Users
                  size={16}
                  className="text-[var(--color-champagne-500)]"
                />
                <span>{form.guests} misafir</span>
              </div>
            )}

            <div className="bg-[var(--color-sand-50)] border border-[var(--color-sand-100)] rounded-2xl p-4 space-y-2.5 text-sm">

              {/* Konaklama Tutarı — gece sayısı dinamik (mevcut result.stay) */}
              <div className="flex justify-between text-[var(--color-stone-600)]">
                <span>Konaklama Tutarı ({getNights()} Gece)</span>
                <span className="text-[var(--color-stone-900)] font-medium">
                  {formatCurrency(result?.stay || 0, currency)}
                </span>
              </div>

              {(result?.cleaning || 0) > 0 && (
                <div className="flex justify-between text-[var(--color-stone-600)]">
                  <span>Temizlik Ücreti</span>
                  <span className="text-[var(--color-stone-900)] font-medium">
                    {formatCurrency((result as any).cleaning || 0, currency)}
                  </span>
                </div>
              )}

              {/* TOPLAM TUTAR — yeşil */}
              <div className="border-t border-[var(--color-sand-100)] pt-3 flex justify-between font-semibold text-base text-green-700">
                <span>Toplam Tutar</span>
                <span className="font-display text-lg">
                  {formatCurrency(totalPrice, currency)}
                </span>
              </div>

              {/* 🔥 ŞİMDİ ÖDENECEK — payment_preference'a göre (dal DEĞİŞMEZ) */}
              {form.payment_preference === "full_payment" ? (
                <>
                  {/* Şimdi ödenecek — mor */}
                  <div className="flex justify-between text-purple-700 font-semibold">
                    <span>Şimdi ödenecek (Tüm tutar)</span>
                    <span>{formatCurrency(totalPrice, currency)}</span>
                  </div>

                  {/* Girişte ödenecek — turuncu */}
                  <div className="flex justify-between text-orange-600 text-xs">
                    <span>Girişte ödenecek</span>
                    <span>{formatCurrency(0, currency)}</span>
                  </div>
                </>
              ) : (
                <>
                  {/* Ön ödeme — mor */}
                  <div className="flex justify-between text-purple-700 font-semibold">
                    <span>Ön ödeme (%{prepaymentRate})</span>
                    <span>{formatCurrency(prepayment, currency)}</span>
                  </div>

                  {/* Girişte ödenecek — turuncu */}
                  <div className="flex justify-between text-orange-600 text-xs">
                    <span>Girişte ödenecek</span>
                    <span>
                      {formatCurrency(totalPrice - prepayment, currency)}
                    </span>
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      </aside>
    </div>
  );
}

/* ── Helpers ── */

function Section({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="font-display text-2xl text-[var(--color-stone-900)] mt-1.5 tracking-[-0.015em]">
        {title}
      </h2>
      <p className="text-sm text-[var(--color-stone-500)] mt-1.5 mb-5">
        {subtitle}
      </p>
      {children}
    </section>
  );
}
