import type { SupabaseClient } from "@supabase/supabase-js";

import { db } from "@/lib/db";

/* ===============================================================
   🛡️ CONTACT MESSAGES REPOSITORY (Phase 1 — repo consolidation)
   ===============================================================
   `contact-message.service.ts` içindeki inline `supabase.from(...)`
   çağrılarının BİREBİR taşınmış hali (single table: contact_messages).
   Davranış değişmez:
     - `db` = supabaseDbProvider (anon, RLS aktif); `db.from` ≡
       `supabase.from` (bind) → byte-identical.
     - Method'lar ham native sonucu (`{ data, error }`) döner;
       trim-validation / payload / return / log SERVICE'te.

   ⚠️ CLIENT INJECTION KORUNDU — `createContactMessage(input, { client })`
      public route service-role client geçer (RLS bypass). `create`
      client verilirse onu, yoksa `db` (eski `?? supabase` ile aynı).
   ⚠️ `findAll` koşullu `.is("archived_at", null)` chain'i AYNEN
      (includeArchived false → archived hariç).
=============================================================== */

export const contactMessageRepository = {
  /** Public insert; client opsiyonel (RLS context için enjekte edilebilir). */
  async create(
    payload: Record<string, unknown>,
    client?: Pick<SupabaseClient, "from">
  ) {
    return await (client ?? db).from("contact_messages").insert(payload);
  },

  /** Admin listing — created_at DESC; includeArchived değilse archived hariç. */
  async findAll(includeArchived?: boolean) {
    let q = db
      .from("contact_messages")
      .select("*")
      .order("created_at", { ascending: false });
    if (!includeArchived) {
      q = q.is("archived_at", null);
    }
    return await q;
  },

  /** markAsRead / archiveMessage — payload service'te kurulur. */
  async updateById(id: string, payload: Record<string, unknown>) {
    return await db.from("contact_messages").update(payload).eq("id", id);
  },
};
