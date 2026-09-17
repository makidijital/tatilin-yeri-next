import type {
  PublicReservationFormData,
  PublicReservationFormErrors,
} from "../_types/reservation-form-data";

/* 🛡️ REZERVASYON ÇOKLU DİL — mesajlar MEVCUT public dictionary'den
   (`reservation.validation`). VALIDATION KURALLARI (alan zorunlulukları,
   regex'ler, kontrol sırası) DEĞİŞMEDİ; yalnız mesaj metni locale-aware
   oldu. Helper PURE kalır (DB/IO yok — `getDictionary` saf statik
   lookup). */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ FAZ 2 — validatePublicReservationForm (PURE)
   ===============================================================
   Eski `ReservationForm.tsx > handleSubmit` içinde inline tanımlı
   validation guard'ının BYTE-IDENTICAL kopyası (L260-273).

   ⚠️ KESIN KURAL — Validation KURALLARI AYNEN (mesajlar artık
   dictionary'den; TR değerleri aşağıdakilerle BİREBİR):
     - name              → "Ad zorunlu"
     - phone (required)  → "Telefon zorunlu"
     - phone (regex)     → "Geçerli telefon gir"
                           regex: /^(\+90|0)?5\d{9}$/
     - email (required)  → "Email zorunlu"
     - email (regex)     → "Geçerli email gir"
                           regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
     - identity (req)    → "TC zorunlu"
     - identity (regex)  → "11 haneli TC gir"
                           regex: /^\d{11}$/
     - payment_method_id → "Ödeme yöntemi seç"
     - !start || !end    → date: "Tarih seçmelisin"

   ⚠️ FARK admin/validateCreateForm ile:
     Public form STRICTER — phone + TC regex'leri admin'de yok.
     Public country/city/guests/total VALIDATE EDİLMEZ (mevcut davranış).

   PURE: input alır, error map döner. Toast/setErrors caller'da.
=============================================================== */

export type ValidatePublicReservationFormInput = {
  form: PublicReservationFormData;
  start: string | null | undefined;
  end: string | null | undefined;
};

export function validatePublicReservationForm(
  input: ValidatePublicReservationFormInput,
  /** Opsiyonel — verilmezse "tr" → mesajlar BİREBİR eskisi gibi. */
  locale: Locale = DEFAULT_LOCALE
): PublicReservationFormErrors {
  const { form, start, end } = input;
  const v = getDictionary(locale).reservation.validation;
  const newErrors: PublicReservationFormErrors = {};

  if (!form.name) newErrors.name = v.nameRequired;
  if (!form.phone) newErrors.phone = v.phoneRequired;
  else if (!/^(\+90|0)?5\d{9}$/.test(form.phone))
    newErrors.phone = v.phoneInvalid;
  if (!form.email) newErrors.email = v.emailRequired;
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
    newErrors.email = v.emailInvalid;
  if (!form.identity) newErrors.identity = v.identityRequired;
  else if (!/^\d{11}$/.test(form.identity))
    newErrors.identity = v.identityInvalid;
  if (!form.payment_method_id)
    newErrors.payment_method_id = v.paymentMethodRequired;
  if (!start || !end) newErrors.date = v.dateRequired;

  return newErrors;
}
