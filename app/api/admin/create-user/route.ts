import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  extractAdminContextFromRequest,
  insertAdminActivityLog,
} from "@/app/services/admin-activity-log.service";

/* ===============================================================
   🔥 POST /api/admin/create-user
   ===============================================================
   Authenticated admin → yeni admin user oluşturur.

   Authentication:
   - Caller Authorization: Bearer <access_token> header'ı yollar.
   - Service role client ile getUser(token) → caller user'ı.
   - admin_users lookup → caller'ın is_active + admin olduğu doğrulanır.

   Flow:
     1. Caller validation
     2. Input validation
     3. Email duplicate check (admin_users + auth.users)
     4. supabase.auth.admin.createUser(email, password, email_confirm: true)
     5. admin_users insert (auth user id ile)
     6. Insert fail ise: rollback — auth user delete
     7. Structured logging — silent fail YOK

   ⚠️ Service role key ASLA browser'a sızmaz; sadece bu route
   sunucu tarafında getSupabaseAdmin() çağırır.
   =============================================================== */

type CreateUserBody = {
  email?: unknown;
  password?: unknown;
  full_name?: unknown;
  permissions?: unknown;
  is_active?: unknown;
};

const trim = (v: unknown): string => (v ?? "").toString().trim();

export async function POST(req: Request): Promise<NextResponse> {
  console.log("[admin.create_user] POST");

  try {
    /* ---------- CALLER AUTH ---------- */
    const auth = await authorizeAdminCaller(req);
    if (!auth.ok) {
      console.error("[admin.create_user] UNAUTHORIZED", {
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
    const body = (await req.json().catch(() => ({}))) as CreateUserBody;
    const email = trim(body.email).toLowerCase();
    const password = trim(body.password);
    const fullName = trim(body.full_name);
    const permissions: string[] = Array.isArray(body.permissions)
      ? body.permissions.filter(
          (p): p is string => typeof p === "string"
        )
      : [];
    const isActive =
      typeof body.is_active === "boolean" ? body.is_active : true;

    if (!email) {
      return NextResponse.json(
        { ok: false, error: "E-posta gerekli" },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { ok: false, error: "Geçerli e-posta gir" },
        { status: 400 }
      );
    }
    if (!password || password.length < 6) {
      return NextResponse.json(
        { ok: false, error: "Şifre en az 6 karakter olmalı" },
        { status: 400 }
      );
    }
    if (!fullName) {
      return NextResponse.json(
        { ok: false, error: "Ad soyad gerekli" },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    /* ---------- DUPLICATE CHECK (admin_users) ---------- */
    const { data: existing, error: existingErr } = await admin
      .from("admin_users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingErr) {
      console.error("[admin.create_user] DUP_LOOKUP_FAILED", {
        error: existingErr.message,
      });
      return NextResponse.json(
        { ok: false, error: "Doğrulama hatası" },
        { status: 500 }
      );
    }
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "Bu e-posta zaten kayıtlı" },
        { status: 409 }
      );
    }

    /* ---------- STEP 1: AUTH USER ---------- */
    const { data: authCreated, error: authCreateErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
    if (authCreateErr || !authCreated?.user) {
      const msg =
        authCreateErr?.message ||
        "Auth user oluşturulamadı";
      console.error("[admin.create_user] AUTH_CREATE_FAILED", {
        email,
        error: msg,
      });
      // Supabase'in döndürdüğü "User already registered" gibi
      // hataları hijack etmiyoruz; mesajı olduğu gibi geçiyoruz.
      const status =
        /already registered|exists/i.test(msg) ? 409 : 500;
      return NextResponse.json(
        { ok: false, error: msg },
        { status }
      );
    }
    const authUserId = authCreated.user.id;

    /* ---------- STEP 2: ADMIN_USERS INSERT ---------- */
    const { data: adminRow, error: insertErr } = await admin
      .from("admin_users")
      .insert({
        full_name: fullName,
        email,
        sidebar_permissions: permissions,
        is_active: isActive,
        // 🔥 auth.users.id ↔ admin_users.auth_user_id (UNIQUE) ilişkisi
        auth_user_id: authUserId,
        // password kolonu YOK — auth tarafında tutuluyor.
      })
      .select("id")
      .single();

    if (insertErr || !adminRow?.id) {
      // 🔥 ROLLBACK — admin_users insert fail ise auth user'ı sil
      console.error("[admin.create_user] ADMIN_INSERT_FAILED", {
        email,
        authUserId,
        error: insertErr?.message,
      });
      const { error: rollbackErr } =
        await admin.auth.admin.deleteUser(authUserId);
      if (rollbackErr) {
        console.error(
          "[admin.create_user] ROLLBACK_FAILED",
          {
            authUserId,
            error: rollbackErr.message,
          }
        );
        return NextResponse.json(
          {
            ok: false,
            error:
              "Admin kayıt başarısız ve rollback yapılamadı: " +
              (insertErr?.message || ""),
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        {
          ok: false,
          error:
            insertErr?.message ||
            "admin_users kaydı oluşturulamadı",
        },
        { status: 500 }
      );
    }

    console.info("[admin.create_user] CREATED", {
      callerEmail: caller.email,
      newAdminId: adminRow.id,
      newAdminEmail: email,
      authUserId,
    });

    /* 🛡️ FAZ 55I — AUDIT LOG (additive, fail-safe)
       password ASLA logged değil (admin_users tablosunda zaten yok;
       auth.users tarafında bcrypt hash; helper sanitizer ek koruma). */
    const ctx = extractAdminContextFromRequest(req, caller);
    await insertAdminActivityLog(ctx, {
      action: "admin.created",
      entity_type: "admin_user",
      entity_id: adminRow.id,
      entity_title: email,
      after_data: {
        id: adminRow.id,
        email,
        full_name: fullName,
        sidebar_permissions: permissions,
        is_active: isActive,
        auth_user_id: authUserId,
      },
    });

    return NextResponse.json({
      ok: true,
      id: adminRow.id,
      authUserId,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[admin.create_user] EXCEPTION", {
      error: message,
    });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
