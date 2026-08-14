-- ===============================================================
-- 🛡️ FAZ 2 (NATIVE AUTH) — 069 · BCRYPT PASSWORD IMPORT
-- ===============================================================
-- AMAÇ:
--   Supabase/GoTrue `auth.users.encrypted_password` (bcrypt $2a$…)
--   hash'lerini `admin_users.password_hash`'e kopyalar. Böylece native
--   login, kullanıcılara ŞİFRE SIFIRLATMADAN çalışabilir (bcryptjs ile
--   doğrulanır; başarılı girişte Argon2id'e upgrade-on-login edilir).
--
-- ⚠️ NEDEN GÜVENLİ (canlıyı bozmaz):
--   • Yalnız `password_hash IS NULL` satırları doldurur → idempotent,
--     tekrar çalıştırılabilir, mevcut native hash'leri EZMEZ.
--   • Native yol flag arkasında (AUTH_PROVIDER=native) → bu kolonu yalnız
--     native login okur; Supabase Auth yolu password_hash'i KULLANMAZ →
--     canlı davranış değişmez.
--   • `auth.users` YOKSA (ör. Hetzner public-only cutover sonrası) blok
--     atlanır (guard) → migration ERROR üretmez.
--
-- ⚠️ EŞLEŞTİRME: admin_users.auth_user_id = auth.users.id (mevcut kolon).
--
-- ROLLBACK:
--   update public.admin_users set password_hash = null
--   where password_hash like '$2%';   -- yalnız import edilen bcrypt'ler
-- ===============================================================

do $$
begin
  -- auth.users mevcut mu? (Supabase'de var; Hetzner public-only'de yok)
  if to_regclass('auth.users') is not null then
    update public.admin_users au
    set password_hash = u.encrypted_password
    from auth.users u
    where au.auth_user_id = u.id
      and au.password_hash is null
      and u.encrypted_password is not null
      and u.encrypted_password <> '';
    raise notice 'Native auth: bcrypt password import tamamlandı (auth.users → admin_users.password_hash).';
  else
    raise notice 'Native auth: auth.users bulunamadı → password import ATLANDI (public-only DB).';
  end if;
end $$;
