import { authProvider } from "@/lib/auth";

/* ===============================================================
   🔥 ADMIN USERS — multi-user foundation
   ===============================================================
   Tablo: admin_users
   - id
   - full_name
   - email
   - password (TODO: bcrypt + salt — şimdilik foundation)
   - sidebar_permissions (jsonb) — string[] (permission keys)
   - is_active (bool)
   - last_login_at (timestamp, nullable)
   - created_at
   =============================================================== */

export type AdminUser = {
  id: string;
  full_name: string;
  email: string;
  password?: string | null;
  sidebar_permissions?: string[] | null;
  is_active?: boolean | null;
  last_login_at?: string | null;
  created_at?: string | null;
};

export type AdminUserInput = {
  full_name: string;
  email: string;
  password?: string;
  sidebar_permissions?: string[];
  is_active?: boolean;
};

/* ----- CREATE -----
   ===============================================================
   🔥 SUPABASE AUTH ENTEGRASYONU
   ===============================================================
   Eskiden: admin_users tablosuna doğrudan insert (password plaintext)
   Şimdi:   /api/admin/create-user route'una POST
            - Server: auth.admin.createUser → admin_users insert
            - Rollback: insert fail → auth user delete

   Caller'ın access token'ı Authorization header'a eklenir;
   route service role ile auth + admin doğrulamasını yapar.
   Password admin_users tablosunda TUTULMAZ — yalnız auth.users'da.
================================================================= */
export async function createAdminUser(
  input: AdminUserInput
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const fullName = (input.full_name || "").trim();
  const email = (input.email || "").trim().toLowerCase();
  const password = (input.password || "").trim();
  const perms = Array.isArray(input.sidebar_permissions)
    ? input.sidebar_permissions
    : [];

  if (!fullName) return { ok: false, error: "Ad soyad gerekli" };
  if (!email) return { ok: false, error: "E-posta gerekli" };
  if (!password)
    return { ok: false, error: "Şifre gerekli (en az 6 karakter)" };
  if (password.length < 6)
    return {
      ok: false,
      error: "Şifre en az 6 karakter olmalı",
    };

  // Caller'ın access token'ını auth provider'dan al
  /* FAZ 39: authProvider.getSession delege. */
  const session = await authProvider.getSession();
  if (!session?.accessToken) {
    return {
      ok: false,
      error: "Oturum bulunamadı. Yeniden giriş yapın.",
    };
  }
  const accessToken = session.accessToken;

  try {
    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        full_name: fullName,
        email,
        password,
        permissions: perms,
        is_active: input.is_active !== false,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      id?: string;
      error?: string;
    };

    if (!res.ok || !json?.ok) {
      const errMsg =
        (json && typeof json.error === "string" && json.error) ||
        res.statusText ||
        "Oluşturulamadı";
      console.error("[admin_user.create] FAILED", {
        status: res.status,
        error: errMsg,
      });
      return { ok: false, error: errMsg };
    }

    return { ok: true, id: json.id };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[admin_user.create] DISPATCH ERROR", {
      error: msg,
    });
    return { ok: false, error: msg };
  }
}

/* ----- DELETE ----- */
/* ===============================================================
   🔥 DELETE — auth.users + admin_users senkron silme
   ===============================================================
   Eskiden: yalnız admin_users row delete (auth.users'da orphan)
   Şimdi:   /api/admin-users/[id] route'una DELETE
            - Server: auth.admin.deleteUser → admin_users delete
            - Self-delete koruması route içinde
            - auth_user_id null ise (eski kayıtlar) admin_users
              direkt silinir (auth karşılığı yok)
   Caller'ın access token'ı Authorization header'a eklenir.
================================================================= */
export async function deleteAdminUser(id: string): Promise<boolean> {
  if (!id) return false;

  /* FAZ 39: authProvider.getSession delege; console tag aynen. */
  const session = await authProvider.getSession();
  if (!session?.accessToken) {
    console.error("[admin_user.delete] NO_SESSION");
    return false;
  }
  const accessToken = session.accessToken;

  try {
    const res = await fetch(
      `/api/admin-users/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok || !json?.ok) {
      const errMsg =
        (json && typeof json.error === "string" && json.error) ||
        res.statusText ||
        "Silinemedi";
      console.error("[admin_user.delete] FAILED", {
        status: res.status,
        error: errMsg,
      });
      return false;
    }
    return true;
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[admin_user.delete] DISPATCH ERROR", {
      error: msg,
    });
    return false;
  }
}

/* ===============================================================
   🔥 SIDEBAR PERMISSION CATALOG
   ===============================================================
   Her sidebar menu item'ına permission key bağlanır.
   Bu liste:
   - admin/users sayfasındaki checkbox grid'inde
   - layout sidebar filtresinde
   ortak kullanılır.
   =============================================================== */
export type PermissionItem = {
  key: string;
  label: string;
  group: string;
};

export const SIDEBAR_PERMISSIONS: PermissionItem[] = [
  // Genel
  { key: "dashboard", label: "Dashboard", group: "Genel" },

  // Villalar
  { key: "villas", label: "Mülkler", group: "Villalar" },
  { key: "villa_types", label: "Mülk Tipleri", group: "Villalar" },
  { key: "features", label: "Olanaklar", group: "Villalar" },
  { key: "rules", label: "Kurallar", group: "Villalar" },
  { key: "price_includes", label: "Fiyata Dahil", group: "Villalar" },
  { key: "locations", label: "Bölgeler", group: "Villalar" },
  { key: "villa_lists", label: "Villa Listesi", group: "Villalar" },
  { key: "property_owners", label: "Mülk Sahipleri", group: "Villalar" },

  // Rezervasyon
  {
    key: "reservations",
    label: "Rezervasyonlar",
    group: "Rezervasyon",
  },
  {
    key: "manual_reservations",
    label: "Harici Rezervasyonlar",
    group: "Rezervasyon",
  },
  /* 🛡️ FAZ 56G — iCal external calendar sync (Airbnb/Booking/VRBO).
     Migration 029 (FAZ 56A) bu key'i aktif adminlere idempotent grant
     etti. Burada modal checkbox grid için label tanımı. */
  {
    key: "external_calendars",
    label: "iCal Rezervasyonları",
    group: "Rezervasyon",
  },
  /* 🛡️ FAZ 40 — Concierge offer requests (/teklif-al submissions). */
  {
    key: "offer_requests",
    label: "Teklif Talepleri",
    group: "Rezervasyon",
  },
  {
    key: "payment_methods",
    label: "Ödeme Yöntemleri",
    group: "Rezervasyon",
  },

  /* 🛡️ Maki Finans foundation — Rezervasyon ile İçerik arasında
     yeni grup. Eski admin'lere otomatik grant migration YOK; admin
     ekranından elle eklenmesi gerekir (kullanıcı talebi: migration
     üretme). Super-admin ekleyince diğer admin'lere yetki verebilir. */
  { key: "finance", label: "Maki Finans", group: "Finans" },

  // İçerik
  { key: "pages", label: "Sayfalar", group: "İçerik" },
  { key: "menu", label: "Menü", group: "İçerik" },
  {
    key: "homepage_collection",
    label: "Anasayfa Koleksiyon",
    group: "İçerik",
  },
  {
    /* 🛡️ migration 062/064 — İndirimli Koleksiyon. homepage_collection
       paterni; ayrı/bağımsız grant edilebilir key (Users page grid'inde
       görünür). Mevcut admin'lere migration 064 backfill eder. */
    key: "discount_collection",
    label: "İndirimli Koleksiyon",
    group: "İçerik",
  },
  { key: "messages", label: "Mesajlar", group: "İçerik" },
  /* 🛡️ FAZ 25B — Global SSS (Faz 25 register fix).
     Sidebar item ve admin_users.sidebar_permissions DB değeri
     eklendi ama registry'de eksikti → hasPermission filtresi
     `false` dönüyordu. Mevcut "messages" pattern'i ile birebir
     parity. */
  { key: "faqs", label: "Sık Sorulan Sorular", group: "İçerik" },
  /* 🛡️ FAZ 33 — Villa Reviews moderation.
     migration 020 sidebar_permissions'a "reviews" key'i eklemiş aktif
     admin'lere yetkiyi grant eder. Bu registry ise UI-side filtre
     için single source-of-truth — "messages" / "faqs" pattern'iyle
     birebir parity. */
  { key: "reviews", label: "Yorumlar", group: "İçerik" },

  // Sistem
  { key: "settings", label: "Ayarlar", group: "Sistem" },
  { key: "webmaster", label: "Webmaster", group: "Sistem" },
  { key: "system_logs", label: "Mail Merkezi", group: "Sistem" },
  /* 🛡️ FAZ 55C — Admin activity log moderation.
     Migration 028 admin_users.sidebar_permissions JSONB array'ine
     "activity_logs" key'ini aktif adminlere idempotent grant etti
     (DB tarafı). Bu registry ise modal checkbox grid'i için single
     source-of-truth — "system_logs" / "reviews" pattern'iyle birebir
     parity. layout.tsx menü item'ı permissionKey "activity_logs" ile
     filtre eder; aynı string registry'de label'lanır. */
  {
    key: "activity_logs",
    label: "Aktivite Logları",
    group: "Sistem",
  },
  { key: "users", label: "Kullanıcılar", group: "Sistem" },
];
