import { paymentRepository } from "@/lib/db/payment.repository";
import type { PaymentMethodRow } from "@/types/database";

/* ===============================================================
   🛡️ FAZ 9 TS HARDENING — typed payloads
   ===============================================================
   `payload: any` → `Partial<PaymentMethodRow>` (insert için name
   zorunlu — caller'da var). DB tablo şeması types/database.ts'te
   hazır; runtime davranışı identical.

   FAZ 35 (repository extraction):
     Service artık Supabase'i doğrudan tüketmez; DB I/O
     `paymentRepository.*` üzerinden delege edilir. Davranış
     BYTE-IDENTICAL — throw-style asimetrisi (payment-account
     ile fark) AYNEN korunur.
   =============================================================== */

/** Insert için minimum gerekli alan: name. Diğerleri opsiyonel. */
export type PaymentMethodInsert = Partial<PaymentMethodRow> & {
  name: string;
};

/** Update payload — tüm alanlar opsiyonel. */
export type PaymentMethodUpdate = Partial<PaymentMethodRow>;

// GET
export async function getPaymentMethods() {
  const { data, error } = await paymentRepository.findPaymentMethods();

  if (error) throw error;
  return data;
}

// CREATE
export async function createPaymentMethod(
  payload: PaymentMethodInsert
): Promise<void> {
  const { error } = await paymentRepository.insertPaymentMethod(payload);

  if (error) throw error;
}

// UPDATE
export async function updatePaymentMethod(
  id: string,
  payload: PaymentMethodUpdate
): Promise<void> {
  const { error } = await paymentRepository.updatePaymentMethodById(
    id,
    payload
  );

  if (error) throw error;
}

// DELETE
export async function deletePaymentMethod(id: string) {
  const { error } = await paymentRepository.deletePaymentMethodById(id);

  if (error) throw error;
}