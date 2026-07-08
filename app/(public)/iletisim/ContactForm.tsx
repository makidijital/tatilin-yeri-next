"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Check, AlertCircle } from "lucide-react";

/* 🛡️ Submit artık doğrudan anon Supabase insert yerine sunucu
   route'una (/api/public/contact) gider: applyRateLimit + honeypot/
   time-trap + service-role insert. UX/validation davranışı aynen. */

/* ===============================================================
   🛡️ ContactForm — production submit (migration 015)
   ===============================================================
   /iletisim public form. Supabase RLS: anon INSERT allowed
   policy ile contact_messages tablosuna doğrudan yazılır.
   Reservation/pricing/availability bu akışla bağlantısız.

   VALIDATION (FE):
     - full_name required (non-empty trim)
     - message min 10 char
     - phone OR email zorunlu (en az biri)
   SPAM:
     - hidden honeypot input ("website") — bot doldurursa reject
     - submit süresi < 2sn → reject (insan formu en az 2sn'de
       doldurur; bot anında submit eder)
   UI STATE:
     - idle / pending / success / error
   =============================================================== */

const MIN_SUBMIT_MS = 2000;
const MIN_MESSAGE_LEN = 10;

type UiState = "idle" | "pending" | "success" | "error";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // HONEYPOT
  const [status, setStatus] = useState<UiState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /* Form mount zamanı — bot detection için. */
  const mountedAt = useRef<number>(0);
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "pending" || status === "success") return;

    /* Honeypot: bot doldurdu → sessiz reject (gerçekmiş gibi davran,
       success state göster ama insert YOK → bot'un anlamasını
       zorlaştırır). */
    if (website.trim().length > 0) {
      setStatus("success");
      return;
    }

    /* Submit süresi check */
    const elapsed = Date.now() - mountedAt.current;
    if (elapsed < MIN_SUBMIT_MS) {
      /* Sessiz reject — botun anlamaması için success'mış gibi. */
      setStatus("success");
      return;
    }

    /* Validation */
    const nameTrim = name.trim();
    const phoneTrim = phone.trim();
    const emailTrim = email.trim();
    const messageTrim = message.trim();

    if (nameTrim.length === 0) {
      setErrorMsg("Lütfen adınızı yazın.");
      setStatus("error");
      return;
    }
    if (messageTrim.length < MIN_MESSAGE_LEN) {
      setErrorMsg(
        `Mesajınız en az ${MIN_MESSAGE_LEN} karakter olmalı.`
      );
      setStatus("error");
      return;
    }
    if (phoneTrim.length === 0 && emailTrim.length === 0) {
      setErrorMsg(
        "Telefon veya e-posta — en az biri gerekli."
      );
      setStatus("error");
      return;
    }

    setErrorMsg(null);
    setStatus("pending");

    try {
      const res = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: nameTrim,
          phone: phoneTrim || null,
          email: emailTrim || null,
          message: messageTrim,
          source_page:
            typeof window !== "undefined" ? window.location.pathname : null,
          /* honeypot + time-trap → sunucu da doğrular */
          website,
          elapsedMs: elapsed,
        }),
      });
      const result = await res.json().catch(() => null);

      if (!res.ok || !result?.ok) {
        setErrorMsg(result?.error || "Mesaj iletilemedi.");
        setStatus("error");
        return;
      }
      setStatus("success");
    } catch {
      setErrorMsg("Mesaj iletilemedi.");
      setStatus("error");
    }
  }

  const disabled = status === "pending" || status === "success";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* HONEYPOT — gerçek kullanıcı görmez (tabindex=-1 + aria-hidden) */}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] top-auto w-px h-px overflow-hidden"
      >
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            type="text"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="Ad Soyad"
          name="name"
          placeholder="Adınız"
          value={name}
          onChange={setName}
          disabled={disabled}
        />
        <Field
          label="Telefon"
          name="phone"
          type="tel"
          placeholder="+90 5xx xxx xx xx"
          value={phone}
          onChange={setPhone}
          disabled={disabled}
        />
      </div>
      <Field
        label="E-posta"
        name="email"
        type="email"
        placeholder="ornek@email.com"
        value={email}
        onChange={setEmail}
        disabled={disabled}
      />
      <div className="space-y-2">
        <label className="text-[11px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] block">
          Mesajınız
        </label>
        <textarea
          name="message"
          placeholder="Tarihler, kişi sayısı, beklentileriniz…"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={disabled}
          className="w-full px-4 py-3.5 rounded-2xl border border-[var(--color-stone-200)] bg-white/70 backdrop-blur-sm text-[15px] text-[var(--color-stone-900)] placeholder:text-[var(--color-stone-400)] focus:outline-none focus:border-[var(--color-champagne-500)] focus:ring-4 focus:ring-[var(--color-champagne-500)]/15 focus:bg-white transition leading-relaxed resize-none disabled:opacity-60"
        />
      </div>

      {/* ERROR / SUCCESS bar (subtle, premium) */}
      {status === "error" && errorMsg && (
        <div className="flex items-start gap-2.5 text-[13px] text-red-700 bg-red-50/70 border border-red-100 rounded-2xl px-4 py-3.5">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {status === "success" && (
        <div className="flex items-start gap-2.5 text-[13px] text-[var(--color-stone-700)] bg-[var(--color-sand-50)]/80 border border-[var(--color-stone-100)] rounded-2xl px-4 py-3.5">
          <Check
            size={15}
            className="mt-0.5 shrink-0 text-[var(--color-champagne-700)]"
          />
          <span>
            Mesajınız iletildi. Ekibimiz en kısa sürede dönüş yapacak.
          </span>
        </div>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex w-full sm:w-auto justify-center items-center gap-2 px-7 py-3.5 rounded-full bg-[var(--color-stone-900)] text-white text-[13.5px] font-medium tracking-[0.04em] hover:bg-[var(--color-stone-700)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-18px_rgba(27,26,23,0.5)] disabled:opacity-70 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none"
        >
          {status === "success" ? (
            <>
              <Check size={15} /> Gönderildi
            </>
          ) : status === "pending" ? (
            <>Gönderiliyor…</>
          ) : (
            <>
              <Send size={14} /> Gönder
            </>
          )}
        </button>
        <p className="text-[11.5px] text-[var(--color-stone-400)] mt-4 leading-relaxed">
          Genellikle 1 iş günü içinde dönüş yapıyoruz. Gizlilik
          politikası kapsamında bilgilerinizi koruyoruz.
        </p>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  value,
  onChange,
  disabled,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] block">
        {label}
      </label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-4 py-3.5 rounded-2xl border border-[var(--color-stone-200)] bg-white/70 backdrop-blur-sm text-[15px] text-[var(--color-stone-900)] placeholder:text-[var(--color-stone-400)] focus:outline-none focus:border-[var(--color-champagne-500)] focus:ring-4 focus:ring-[var(--color-champagne-500)]/15 focus:bg-white transition disabled:opacity-60"
      />
    </div>
  );
}
