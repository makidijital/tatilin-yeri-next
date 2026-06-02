import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactMessageRow } from "@/types/database";

/* ===============================================================
   🛡️ CONTACT MESSAGE SERVICE (migration 015)
   ===============================================================
   /iletisim form submit + /maki-admin/messages CRUD.
   Mevcut service pattern'lerine uyumlu (boolean return + error
   logging). RLS:
     - createContactMessage anon-friendly (anon INSERT policy)
     - listMessages / markAsRead / archiveMessage authenticated
       (admin Supabase Auth ile authenticate'lı)

   Pricing / reservation / availability'e SIFIR dokunuş.
   =============================================================== */

export type ContactMessageInput = {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  message: string;
  source_page?: string | null;
};

/* ----- CREATE (public form submit) -----
   🛡️ DI: opsiyonel `client` (createReservation pattern paritesi).
   Default anon `supabase` (geriye dönük byte-identical); public API
   route'u service-role client enjekte eder → RLS bypass + anon insert
   policy kaldırılsa bile çalışır. Validation/payload AYNEN. */
export async function createContactMessage(
  input: ContactMessageInput,
  deps?: { client?: SupabaseClient }
): Promise<{ ok: boolean; error?: string }> {
  const client = deps?.client ?? supabase;
  const payload = {
    full_name: input.full_name.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    message: input.message.trim(),
    source_page: input.source_page?.trim() || null,
    is_read: false,
  };
  const { error } = await client
    .from("contact_messages")
    .insert(payload);
  if (error) {
    console.error("❌ createContactMessage error:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/* ----- LIST (admin) — created_at DESC, archived hariç ----- */
export async function listMessages(opts?: {
  includeArchived?: boolean;
}): Promise<ContactMessageRow[]> {
  let q = supabase
    .from("contact_messages")
    .select("*")
    .order("created_at", { ascending: false });
  if (!opts?.includeArchived) {
    q = q.is("archived_at", null);
  }
  const { data, error } = await q;
  if (error) {
    console.error("❌ listMessages error:", error.message);
    return [];
  }
  return (data || []) as ContactMessageRow[];
}

/* ----- READ TOGGLE ----- */
export async function markAsRead(
  id: string,
  isRead: boolean
): Promise<boolean> {
  const { error } = await supabase
    .from("contact_messages")
    .update({ is_read: isRead })
    .eq("id", id);
  if (error) {
    console.error("❌ markAsRead error:", error.message);
    return false;
  }
  return true;
}

/* ----- ARCHIVE / UNARCHIVE ----- */
export async function archiveMessage(
  id: string,
  archived: boolean
): Promise<boolean> {
  const { error } = await supabase
    .from("contact_messages")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) {
    console.error("❌ archiveMessage error:", error.message);
    return false;
  }
  return true;
}
