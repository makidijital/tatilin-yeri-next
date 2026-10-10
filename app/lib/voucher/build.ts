import { buildVoucherData } from "./data";
import { renderVoucherDocument, renderVoucherEmail } from "./template";

/* ===============================================================
   🔥 VOUCHER BUILD — facade
   ===============================================================
   data.ts  → reservation snapshot + helper-driven props
   template.ts → premium document HTML (email-shell'den BAĞIMSIZ)

   Bu modül iki tarafı birleştirir; route'lar buradan tüketir.
   ReservationApprovedEmail flow'u tek satır dokunulmaz; voucher
   kendine ait UI render'ına sahiptir, sadece data builder'da
   helper'lar paylaşılır.
   =============================================================== */

export type VoucherBuildResult =
  | {
      ok: true;
      subject: string;
      /** Belge (yazdırma/PDF) HTML'i — `/api/voucher/[id]`. */
      html: string;
      /** E-posta gövdesi (inline-style, istemci uyumlu) — `/api/mail/voucher`.
       *  İçerik belgeyle ortak; yalnız işaretleme farklı. */
      emailHtml: string;
      recipient: string | null;
      villaTitle: string;
    }
  | { ok: false; error: string; status: number };

export async function buildVoucherContent(
  reservationId: string
): Promise<VoucherBuildResult> {
  const dataResult = await buildVoucherData(reservationId);
  if (!dataResult.ok) {
    return dataResult;
  }

  const { subject, html } = renderVoucherDocument(dataResult.props);
  const { html: emailHtml } = renderVoucherEmail(dataResult.props);
  return {
    ok: true,
    subject,
    html,
    emailHtml,
    recipient: dataResult.recipient,
    villaTitle: dataResult.villaTitle,
  };
}
