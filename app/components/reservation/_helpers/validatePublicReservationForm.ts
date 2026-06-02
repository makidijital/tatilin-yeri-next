import type {
  PublicReservationFormData,
  PublicReservationFormErrors,
} from "../_types/reservation-form-data";

/* ===============================================================
   🛡️ FAZ 2 — validatePublicReservationForm (PURE)
   ===============================================================
   Eski `ReservationForm.tsx > handleSubmit` içinde inline tanımlı
   validation guard'ının BYTE-IDENTICAL kopyası (L260-273).

   ⚠️ KESIN KURAL — Validation kuralları + mesajları AYNEN:
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
  input: ValidatePublicReservationFormInput
): PublicReservationFormErrors {
  const { form, start, end } = input;
  const newErrors: PublicReservationFormErrors = {};

  if (!form.name) newErrors.name = "Ad zorunlu";
  if (!form.phone) newErrors.phone = "Telefon zorunlu";
  else if (!/^(\+90|0)?5\d{9}$/.test(form.phone))
    newErrors.phone = "Geçerli telefon gir";
  if (!form.email) newErrors.email = "Email zorunlu";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
    newErrors.email = "Geçerli email gir";
  if (!form.identity) newErrors.identity = "TC zorunlu";
  else if (!/^\d{11}$/.test(form.identity))
    newErrors.identity = "11 haneli TC gir";
  if (!form.payment_method_id)
    newErrors.payment_method_id = "Ödeme yöntemi seç";
  if (!start || !end) newErrors.date = "Tarih seçmelisin";

  return newErrors;
}
