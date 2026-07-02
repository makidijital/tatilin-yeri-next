import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { adminUserServerRepository } from "@/lib/db/admin-user.repository.server";
import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  extractAdminContextFromRequest,
  insertAdminActivityLog,
} from "@/app/services/admin-activity-log.service";

/* ===============================================================
   🔥 DELETE /api/admin-users/[id]
   ===============================================================
   Authenticated admin → bir admin_users kaydını siler.

   FLOW:
     1. authorizeAdminCaller(req) → caller doğrula (active admin)
     2. Self-delete guard → caller.id !== target.id
     3. admin_users target row fetch (auth_user_id, email)
     4. auth.users delete (auth_user_id varsa)
        - "user not found" gibi orphan durum: tolerate edilir
     5. admin_users row delete
     6. Auth delete fail ise admin_users delete EDİLMEZ → consistency

   Yalnız sunucu — service role client (getSupabaseAdmin) burada,
   ASLA client component'lerde import edilmez.
   =============================================================== */

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await ctx.params;
  console.log("[admin-users.delete] DELETE", { id });

  try {
    /* ---------- CALLER AUTH ---------- */
    const auth = await authorizeAdminCaller(req);
    if (!auth.ok) {
      console.error("[admin-users.delete] UNAUTHORIZED", {
        status: auth.status,
        error: auth.error,
      });
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }
    const caller = auth.caller;

    /* ---------- INPUT ---------- */
    const targetId = (id || "").toString().trim();
    if (!targetId) {
      return NextResponse.json(
        { ok: false, error: "ID gerekli" },
        { status: 400 }
      );
    }

    /* ---------- SELF-DELETE GUARD ---------- */
    if (caller.id === targetId) {
      console.warn("[admin-users.delete] SELF_DELETE_BLOCKED", {
        callerId: caller.id,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "Kendi hesabınızı silemezsiniz",
        },
        { status: 403 }
      );
    }

    const admin = getSupabaseAdmin();

    /* ---------- TARGET FETCH ---------- */
    const { data: target, error: fetchErr } =
      await adminUserServerRepository.findByIdForDelete(targetId);
    if (fetchErr) {
      console.error("[admin-users.delete] FETCH_FAILED", {
        targetId,
        error: fetchErr.message,
      });
      return NextResponse.json(
        { ok: false, error: "Kullanıcı bulunamadı" },
        { status: 500 }
      );
    }
    if (!target) {
      return NextResponse.json(
        { ok: false, error: "Kullanıcı bulunamadı" },
        { status: 404 }
      );
    }

    const targetAuthUserId =
      typeof target.auth_user_id === "string"
        ? target.auth_user_id
        : null;

    /* ---------- AUTH USER DELETE ---------- */
    // auth_user_id null ise (eski kayıtlar): auth.users tarafında
    // karşılığı olmayabilir; admin_users delete'ine geçilir.
    if (targetAuthUserId) {
      const { error: authDelErr } =
        await admin.auth.admin.deleteUser(targetAuthUserId);

      if (authDelErr) {
        const msg = authDelErr.message || "";
        const alreadyGone =
          /not[_ ]?found|user.*not.*exist/i.test(msg);
        if (!alreadyGone) {
          // 🔥 Auth delete fail → admin_users korunur (consistency)
          console.error(
            "[admin-users.delete] AUTH_DELETE_FAILED",
            {
              targetId,
              authUserId: targetAuthUserId,
              error: msg,
            }
          );
          return NextResponse.json(
            {
              ok: false,
              error:
                "Auth kullanıcı silinemedi: " +
                (msg || "bilinmeyen hata"),
            },
            { status: 500 }
          );
        }
        console.warn(
          "[admin-users.delete] AUTH_USER_ALREADY_GONE",
          {
            targetId,
            authUserId: targetAuthUserId,
          }
        );
      }
    }

    /* ---------- ADMIN_USERS DELETE ---------- */
    const { error: rowDelErr } =
      await adminUserServerRepository.deleteById(targetId);
    if (rowDelErr) {
      console.error(
        "[admin-users.delete] ROW_DELETE_FAILED",
        {
          targetId,
          error: rowDelErr.message,
        }
      );
      // ⚠️ Bu noktada auth user silinmiş ama admin_users hala duruyor.
      // Manuel müdahale gerekebilir; caller'a bildiriyoruz.
      return NextResponse.json(
        {
          ok: false,
          error:
            "Auth silindi ancak admin_users kaydı silinemedi: " +
            rowDelErr.message,
        },
        { status: 500 }
      );
    }

    console.info("[admin-users.delete] DELETED", {
      callerId: caller.id,
      targetId,
      authUserIdRemoved: targetAuthUserId,
    });

    /* 🛡️ FAZ 55I — AUDIT LOG (additive, fail-safe). */
    const ctx = extractAdminContextFromRequest(req, caller);
    await insertAdminActivityLog(ctx, {
      action: "admin.deleted",
      entity_type: "admin_user",
      entity_id: targetId,
      entity_title: target.email || targetId,
      before_data: {
        id: targetId,
        email: target.email,
        auth_user_id: targetAuthUserId,
      },
    });

    return NextResponse.json({
      ok: true,
      id: targetId,
      authUserId: targetAuthUserId,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[admin-users.delete] EXCEPTION", {
      error: message,
    });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
