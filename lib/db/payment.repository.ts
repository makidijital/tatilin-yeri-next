import { db } from "@/lib/db";

/* ===============================================================
   🛡️ FAZ 35 — PAYMENT REPOSITORY (Data Access Layer)
   ===============================================================
   AMAÇ (FAZ 0 mapping raporu):
     Payment domain'in own tables (payment_methods + payment_accounts)
     üzerinde Supabase'i tek katman aşağı it. Service artık
     Supabase client'ı doğrudan tüketmez; bu repository üzerinden
     delege eder.

     bugün : service → supabase
     hedef : service → repository → supabase

   PRODUCTION-SAFE YAKLAŞIM (reservation + manual repo paralel):
     - Query'ler BİREBİR aynı (filter chain, order chain, .single()
       chain, .neq() predicate).
     - Return shape: Supabase native `{ data, error }`. Repository
       sessiz; throw / console.error / Result envelope YOK.
     - Single-active toggle ORCHESTRATION (post-insert/update
       deactivateOtherPaymentAccounts conditional) service tarafında
       kalır; repository sadece query'leri yapar.
     - Atomicity (2-step toggle race window) DEĞİŞTİRİLMEZ;
       orijinal davranış aynen — refactor mimari, behavior değil.

   AGGREGATE BOUNDARY (FAZ 0 §3):
     - `payment_methods` (own)
     - `payment_accounts` (own)

     Diğer tablolar (`reservations.payment_link*`, `paid_amount`,
     `payment_method_id`, `payment_preference`) reservation
     domain'in sahipliğinde — bu repository DOKUNMAZ.

   SCOPE (FAZ 0 §0):
     - `lib/payment-account.server.ts` (service-role,
       `getSupabaseAdmin`) DOKUNULMAZ — out-of-scope.
     - Mail API route'ları (payment-link, payment-confirmed,
       bank-transfer-payment) DOKUNULMAZ — reservation domain'in
       genişlemesi.

   FAZ KAPSAMI (tek cycle):
     - FAZ 1: READ metodları (findPaymentMethods, findPaymentAccounts)
     - FAZ 3: UPDATE/DELETE + SET-ACTIVE metodları
       (updatePaymentMethodById, deletePaymentMethodById,
        updatePaymentAccountById, deletePaymentAccountById,
        setPaymentAccountActive, deactivateOtherPaymentAccounts)
     - FAZ 4: INSERT metodları (insertPaymentMethod,
       insertPaymentAccount)
     - FAZ 2 (conflict) + FAZ 5 (webhook) bu domain'de YOK.
   =============================================================== */

export const paymentRepository = {
  /* ===============================================================
     PAYMENT METHODS — READ
     ===============================================================
     Orijinal (payment-method.service.ts > getPaymentMethods):
       db.from("payment_methods").select("*")
         .order("created_at", { ascending: false });

     ⚠️ KESIN KURAL:
       - SELECT projection `"*"` aynen.
       - Order pattern aynen.
       - Repository sessiz; service `throw-style` (if error throw).
  =============================================================== */
  async findPaymentMethods() {
    return await db
      .from("payment_methods")
      .select("*")
      .order("created_at", { ascending: false });
  },

  /* ===============================================================
     PAYMENT METHODS — PUBLIC READ (order-suz)
     ===============================================================
     Orijinal (/api/public/payment-methods GET):
       db.from("payment_methods").select("*")

     ⚠️ `findPaymentMethods`'ten FARKLI: `.order("created_at", desc)`
        YOK — public route order uygulamaz (row sırası byte-identical
        korunur). Anon `db` (public RLS; service-role KULLANILMAZ →
        admin-only alanlar sızmasın). Fail-soft mapping caller'da. */
  async findPaymentMethodsPublic() {
    return await db.from("payment_methods").select("*");
  },

  /* ===============================================================
     PAYMENT METHODS — INSERT
     ===============================================================
     Orijinal (payment-method.service.ts > createPaymentMethod):
       db.from("payment_methods").insert(payload);

     ⚠️ KESIN KURAL:
       - `.insert(payload)` aynen (single-row object; `[payload]`
         ARRAY wrapper KULLANILMAZ — orijinal davranış).
       - `.select()` / `.single()` chain YOK (orijinal davranış:
         return Promise<void>; data dönmez).
       - Repository sessiz; service throw-style.
  =============================================================== */
  async insertPaymentMethod(payload: Record<string, unknown>) {
    return await db.from("payment_methods").insert(payload);
  },

  /* ===============================================================
     PAYMENT METHODS — UPDATE BY ID
     ===============================================================
     Orijinal (payment-method.service.ts > updatePaymentMethod):
       db.from("payment_methods").update(payload).eq("id", id);

     ⚠️ KESIN KURAL:
       - Predicate `.eq("id", id)` aynen.
       - `.select()` chain YOK; service void döner.
  =============================================================== */
  async updatePaymentMethodById(
    id: string,
    payload: Record<string, unknown>
  ) {
    return await db
      .from("payment_methods")
      .update(payload)
      .eq("id", id);
  },

  /* ===============================================================
     PAYMENT METHODS — DELETE BY ID
     ===============================================================
     Orijinal (payment-method.service.ts > deletePaymentMethod):
       db.from("payment_methods").delete().eq("id", id);

     ⚠️ KESIN KURAL:
       - Predicate aynen.
       - Cascade YOK (DB FK behavior'una bağlı).
       - Service throw-style.
  =============================================================== */
  async deletePaymentMethodById(id: string) {
    return await db
      .from("payment_methods")
      .delete()
      .eq("id", id);
  },

  /* ===============================================================
     PAYMENT ACCOUNTS — READ
     ===============================================================
     Orijinal (payment-account.service.ts > getPaymentAccounts):
       db.from("payment_accounts").select("*")
         .order("is_active", { ascending: false })
         .order("created_at", { ascending: false });

     ⚠️ KESIN KURAL:
       - SELECT `"*"` aynen.
       - Order CHAIN aynen — primary `is_active` desc + secondary
         `created_at` desc.
       - Repository sessiz; service tarafında **RLS silent-fail
         detection** (count=0 → console.warn with hint), `status`
         field okuma, structured tag emission aynen.
  =============================================================== */
  async findPaymentAccounts() {
    return await db
      .from("payment_accounts")
      .select("*")
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });
  },

  /* ===============================================================
     PAYMENT ACCOUNTS — INSERT
     ===============================================================
     Orijinal (payment-account.service.ts > createPaymentAccount):
       db.from("payment_accounts").insert(payload)
         .select().single();

     ⚠️ KESIN KURAL — BYTE-IDENTICAL CHAIN:
       - `.insert(payload)` aynen (single-row object).
       - `.select()` chain KORUNDU — inserted row caller'a
         dönmesi gerek (`createPaymentAccount` `id` return).
       - `.single()` resolver KORUNDU.
       - Payload shape orchestrator/service'te belirlenir
         (IBAN/swift normalize, trim, currency uppercase);
         repository payload'a müdahil olmaz.
       - Service Result envelope (`{ ok, id?, error? }`)
         repository return shape'ten türetilir.
  =============================================================== */
  async insertPaymentAccount(payload: Record<string, unknown>) {
    return await db
      .from("payment_accounts")
      .insert(payload)
      .select()
      .single();
  },

  /* ===============================================================
     PAYMENT ACCOUNTS — UPDATE BY ID
     ===============================================================
     Orijinal (payment-account.service.ts > updatePaymentAccount):
       db.from("payment_accounts").update(payload).eq("id", id);

     ⚠️ KESIN KURAL:
       - Predicate aynen.
       - `.select()` chain YOK (orijinal davranış; service updated
         row beklemiyor — sadece error/success).
       - Conditional payload build (`if (input.X !== undefined)`)
         service'te kalır.
       - Single-active toggle (post-update `deactivateOthers`
         conditional) service ORCHESTRATION; repository
         müdahil olmaz.
  =============================================================== */
  async updatePaymentAccountById(
    id: string,
    payload: Record<string, unknown>
  ) {
    return await db
      .from("payment_accounts")
      .update(payload)
      .eq("id", id);
  },

  /* ===============================================================
     PAYMENT ACCOUNTS — DELETE BY ID
     ===============================================================
     Orijinal (payment-account.service.ts > deletePaymentAccount):
       db.from("payment_accounts").delete().eq("id", id);

     ⚠️ KESIN KURAL:
       - Predicate aynen.
       - Hard delete; soft-delete eklenmedi.
       - Cascade YOK.
  =============================================================== */
  async deletePaymentAccountById(id: string) {
    return await db
      .from("payment_accounts")
      .delete()
      .eq("id", id);
  },

  /* ===============================================================
     PAYMENT ACCOUNTS — SET ACTIVE (single-active toggle step 1)
     ===============================================================
     Orijinal (payment-account.service.ts > setActivePaymentAccount):
       db.from("payment_accounts").update({ is_active: true })
         .eq("id", id);

     ⚠️ KESIN KURAL:
       - INLINE payload `{ is_active: true }` aynen (orchestrator
         tarafı inline geçer; service repo'ya inline geçirir).
       - Predicate `.eq("id", id)` aynen.
       - Single-active orchestration step 1 — step 2
         (`deactivateOtherPaymentAccounts(id)`) ayrı bir DB call
         olarak çağrılır. Atomicity DEĞIŞTİRİLMEZ (race window
         kabul edilmiş — orijinal davranış).
  =============================================================== */
  async setPaymentAccountActive(id: string) {
    return await db
      .from("payment_accounts")
      .update({ is_active: true })
      .eq("id", id);
  },

  /* ===============================================================
     PAYMENT ACCOUNTS — DEACTIVATE OTHERS (single-active toggle step 2)
     ===============================================================
     Orijinal (payment-account.service.ts > deactivateOthers internal):
       db.from("payment_accounts").update({ is_active: false })
         .neq("id", keepId);

     ⚠️ KESIN KURAL:
       - `.neq("id", keepId)` predicate AYNEN — "kendisi hariç
         tüm satırlar"ı pasifleştir.
       - INLINE payload `{ is_active: false }` aynen.
       - Single-active orchestration step 2. Atomicity yok
         (intentional; race window orijinal davranış).
       - AYRI QUERY olarak kalır (merge/transaction yapılmaz —
         kullanıcı kuralı).

     CALLER (service):
       - createPaymentAccount post-insert (if input.is_active)
       - updatePaymentAccount post-update (if input.is_active === true)
       - setActivePaymentAccount post-update (her zaman)
       - Result envelope `{ error? }` service tarafında.
  =============================================================== */
  async deactivateOtherPaymentAccounts(keepId: string) {
    return await db
      .from("payment_accounts")
      .update({ is_active: false })
      .neq("id", keepId);
  },

  /* ===============================================================
     WESTERN UNION ACCOUNTS — CRUD + single-active (migration 060)
     ===============================================================
     payment_accounts metodlarının BİREBİR aynası; ayrı tablo
     `western_union_accounts`. EFT akışına SIFIR temas — additive.
  =============================================================== */
  async findWesternUnionAccounts() {
    return await db
      .from("western_union_accounts")
      .select("*")
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });
  },
  async insertWesternUnionAccount(payload: Record<string, unknown>) {
    return await db
      .from("western_union_accounts")
      .insert(payload)
      .select()
      .single();
  },
  async updateWesternUnionAccountById(
    id: string,
    payload: Record<string, unknown>
  ) {
    return await db
      .from("western_union_accounts")
      .update(payload)
      .eq("id", id);
  },
  async deleteWesternUnionAccountById(id: string) {
    return await db
      .from("western_union_accounts")
      .delete()
      .eq("id", id);
  },
  async setWesternUnionAccountActive(id: string) {
    return await db
      .from("western_union_accounts")
      .update({ is_active: true })
      .eq("id", id);
  },
  async deactivateOtherWesternUnionAccounts(keepId: string) {
    return await db
      .from("western_union_accounts")
      .update({ is_active: false })
      .neq("id", keepId);
  },
};

/* ---------------------------------------------------------------
   🛡️ DEFAULT EXPORT YOK
   ---------------------------------------------------------------
   Reservation + Manual + Villa repository pattern ile uyumlu:
   named export tercih; accidental type-import drift'i önler.
=============================================================== */
