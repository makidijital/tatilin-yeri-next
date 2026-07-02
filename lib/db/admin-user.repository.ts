import { db } from "@/lib/db";

/* ===============================================================
   🛡️ ADMIN USERS — REPOSITORY (anon / RLS-authenticated)
   ===============================================================
   `admin_users` tablosu READ + basit field UPDATE I/O (admin browser
   context). `app/services/admin-user.service.ts` bu repo üzerinden
   anon `db` client ile okur/yazar — RLS authenticated admin policy
   admin session JWT ile açık; service-role GEREKMEZ.

   ⚠️ AUTH PATH KORUNUR:
     `db` = supabaseDbProvider (anon, RLS aktif) → service'in kullandığı
     `@/lib/supabase` ile aynı PostgrestQueryBuilder → BYTE-IDENTICAL.
     Bu repo, API route'ların (create/delete + auth.admin) kullandığı
     service-role `.server` repo'nun KARŞITIDIR (up/downgrade YOK).
     create/delete akışları service'te `fetch()` ile route'a gider —
     onlar DB DEĞİL, bu repo'ya dahil edilmez.

   DAVRANIŞ:
     - Native Supabase `{ data, error }` döner; repo sessiz (throw/log
       YOK). Validation / payload build / normalize / return-shape /
       log caller'da (service) KALIR.
   =============================================================== */

/** Liste + detail için ortak slim projeksiyon (password HARİÇ). */
const LIST_SELECT =
  "id, full_name, email, sidebar_permissions, is_active, last_login_at, created_at";

export const adminUserRepository = {
  /** LIST — password hariç kolonlar, created_at DESC. */
  async findAllForList() {
    return await db
      .from("admin_users")
      .select(LIST_SELECT)
      .order("created_at", { ascending: false });
  },

  /** BY ID — password hariç kolonlar, .maybeSingle(). */
  async findById(id: string) {
    return await db
      .from("admin_users")
      .select(LIST_SELECT)
      .eq("id", id)
      .maybeSingle();
  },

  /** UPDATE by id — generic patch. `.select()` YOK. updateAdminUser
   *  (full_name/email/password/sidebar_permissions/is_active) VE
   *  setAdminUserActive ({ is_active }) İKİSİ de bu tek method (aynı
   *  query shape); payload build caller'da. */
  async updateById(id: string, payload: Record<string, unknown>) {
    return await db.from("admin_users").update(payload).eq("id", id);
  },
};
