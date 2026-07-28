import { NextResponse } from "next/server";

/* 🛡️ Payment Migration P17 — anon `payment.repository` (supabaseDbProvider)
   yerine native `payment.repository.server` (P16.5 twin: findPaymentMethodsPublic,
   order'sız `SELECT *`). Route server-only API handler (`"use client"` yok) →
   server-only native repo güvenli. RLS: payment_methods read policy `using(true)`
   (migration 037) koşulsuz → native RLS-free okuma anon ile aynı satır/kolon
   döndürür → veri paritesi korunur. Call-site aynı (alias). HTTP contract AYNEN. */
import { paymentServerRepository as paymentRepository } from "@/lib/db/payment.repository.server";

/* ===============================================================
   🛡️ /api/public/payment-methods — PUBLIC PAYMENT METHODS
   ===============================================================
   GET → payment_methods rows (select="*") public booking form'u için.

   AUTH: PUBLIC. Anon db client kullanılır — RLS bu tabloda anon
   read'i hangi alanlar için açtıysa AYNI semantic'le filtrelenir
   (eski client-side `supabase.from("payment_methods").select("*")`
   ile birebir). service_role KULLANILMAZ; aksi halde RLS bypass
   olur ve admin-only alanlar sızabilir.

   FAZ 2 frontend purge — public ReservationForm bu route'u
   kullanır. Davranış BYTE-IDENTICAL: aynı select shape, aynı RLS
   bağlamı, aynı tablo erişimi.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { data, error } = await paymentRepository.findPaymentMethodsPublic();

  if (error) {
    /* Eski client davranışı: hata fırlatılmaz, sadece state boş kalır
       (`setPaymentMethods(data || [])`). Route da aynı davranışı
       koruyor — 200 + empty array (caller hata göstermez). */
    console.error("[public.payment-methods] FAILED", error.message);
    return NextResponse.json({ ok: true, payment_methods: [] });
  }

  return NextResponse.json({ ok: true, payment_methods: data || [] });
}
